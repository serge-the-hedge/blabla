import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
	internalMutation,
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { requireUser } from "./auth";
import { summarizeItems } from "./diffs";
import { buildReviewUrl, makeSearchText, now, slugify, toArbKey } from "./lib";
import { requireEditor, requireViewer } from "./permissions";
import { upsertTranslationValue } from "./values";

const itemKind = v.union(
	v.literal("translation_value"),
	v.literal("key_metadata"),
	v.literal("locale_create"),
	v.literal("locale_archive"),
	v.literal("key_create"),
	v.literal("key_archive"),
);
const reviewableChangeSetStatuses = new Set(["draft", "open"]);
const terminalChangeSetStatuses = new Set(["rejected", "applied"]);
const changeSetStatus = v.union(
	v.literal("draft"),
	v.literal("open"),
	v.literal("approved"),
	v.literal("rejected"),
	v.literal("applied"),
);
type ReviewCtx = QueryCtx | MutationCtx;
type SourceMissingReason =
	| "no_key"
	| "no_project_source_locale"
	| "source_locale_missing"
	| "source_value_missing";

function isApplicableItem(item: { status: string }) {
	return item.status === "pending" || item.status === "accepted";
}

function isSupportedApplyKind(item: { kind: string }) {
	return item.kind === "translation_value" || item.kind === "key_metadata";
}

function assertCanReview(changeSet: { status: string }) {
	if (!reviewableChangeSetStatuses.has(changeSet.status)) {
		throw new ConvexError({
			code: "BAD_STATE",
			message: "Change set is not open for review.",
		});
	}
}

function assertNotTerminal(changeSet: { status: string }) {
	if (terminalChangeSetStatuses.has(changeSet.status)) {
		throw new ConvexError({
			code: "BAD_STATE",
			message: "Change set is already closed.",
		});
	}
}

async function getLiveValue(
	ctx: ReviewCtx,
	keyId?: Id<"translationKeys">,
	localeId?: Id<"locales">,
) {
	if (!keyId || !localeId) return null;
	const key = await ctx.db.get(keyId);
	if (!key) return null;
	return await ctx.db
		.query("translationValues")
		.withIndex("by_project_key_locale", (q) =>
			q
				.eq("projectId", key.projectId)
				.eq("keyId", keyId)
				.eq("localeId", localeId),
		)
		.unique();
}

async function getSourceContext(ctx: ReviewCtx, key: Doc<"translationKeys">) {
	const project = await ctx.db.get(key.projectId);
	const sourceLocaleId = project?.sourceLocaleId;
	if (!sourceLocaleId) {
		return {
			sourceLocale: null,
			sourceValue: null,
			sourceMissingReason: "no_project_source_locale" as const,
		};
	}
	const sourceLocale = await ctx.db.get(sourceLocaleId);
	if (!sourceLocale || sourceLocale.archivedAt !== undefined) {
		return {
			sourceLocale: null,
			sourceValue: null,
			sourceMissingReason: "source_locale_missing" as const,
		};
	}
	const sourceValue = await ctx.db
		.query("translationValues")
		.withIndex("by_project_key_locale", (q) =>
			q
				.eq("projectId", key.projectId)
				.eq("keyId", key._id)
				.eq("localeId", sourceLocaleId),
		)
		.unique();
	return {
		sourceLocale,
		sourceValue,
		sourceMissingReason:
			!sourceValue || sourceValue.status === "missing"
				? ("source_value_missing" as const)
				: null,
	};
}

async function hydrateReviewItem(ctx: ReviewCtx, item: Doc<"changeSetItems">) {
	const key = item.keyId ? await ctx.db.get(item.keyId) : null;
	const locale = item.localeId ? await ctx.db.get(item.localeId) : null;
	const sourceContext = key
		? await getSourceContext(ctx, key)
		: {
				sourceLocale: null,
				sourceValue: null,
				sourceMissingReason: "no_key" as SourceMissingReason,
			};
	return {
		...item,
		key: key
			? {
					id: key._id,
					key: key.key,
					description: key.description,
					placeholders: key.placeholders,
				}
			: null,
		locale: locale
			? { id: locale._id, code: locale.code, label: locale.label }
			: null,
		sourceLocale: sourceContext.sourceLocale
			? {
					id: sourceContext.sourceLocale._id,
					code: sourceContext.sourceLocale.code,
					label: sourceContext.sourceLocale.label,
				}
			: null,
		sourceValue: sourceContext.sourceValue?.value ?? null,
		sourceMissingReason: sourceContext.sourceMissingReason,
	};
}

async function refreshSummary(ctx: MutationCtx, changeSetId: Id<"changeSets">) {
	const items = await ctx.db
		.query("changeSetItems")
		.withIndex("by_changeSet", (q) => q.eq("changeSetId", changeSetId))
		.collect();
	await ctx.db.patch(changeSetId, {
		summary: summarizeItems(items),
		updatedAt: now(),
	});
}

async function findOrCreateTags(
	ctx: MutationCtx,
	projectId: Id<"projects">,
	tagSlugs: string[],
) {
	const tagIds: Id<"tags">[] = [];
	for (const rawSlug of tagSlugs) {
		const slug = slugify(rawSlug);
		if (!slug) continue;
		const existing = await ctx.db
			.query("tags")
			.withIndex("by_project_slug", (q) =>
				q.eq("projectId", projectId).eq("slug", slug),
			)
			.unique();
		if (existing) {
			if (existing.archivedAt !== undefined) {
				await ctx.db.patch(existing._id, { archivedAt: undefined });
			}
			tagIds.push(existing._id);
			continue;
		}
		tagIds.push(
			await ctx.db.insert("tags", {
				projectId,
				name: rawSlug,
				slug,
				createdAt: now(),
			}),
		);
	}
	return Array.from(new Set(tagIds));
}

async function applyTagMetadataChange(
	ctx: MutationCtx,
	item: Doc<"changeSetItems">,
) {
	if (!item.keyId || item.nextValue === null) return;
	const key = await ctx.db.get(item.keyId);
	if (!key || key.archivedAt !== undefined) return;
	const payload = JSON.parse(item.nextValue) as { tagSlugs?: string[] };
	const tagIdsToAdd = await findOrCreateTags(
		ctx,
		key.projectId,
		payload.tagSlugs ?? [],
	);
	const tagIds = Array.from(new Set([...key.tagIds, ...tagIdsToAdd]));
	const tags = await Promise.all(tagIds.map((tagId) => ctx.db.get(tagId)));
	await ctx.db.patch(item.keyId, {
		tagIds,
		updatedAt: now(),
		searchText: makeSearchText({
			key: key.key,
			description: key.description,
			screen: key.screenId ? await ctx.db.get(key.screenId) : null,
			tags: tags.filter((tag): tag is NonNullable<typeof tag> => tag !== null),
		}),
	});
}

export const list = query({
	args: { projectId: v.id("projects"), status: v.optional(changeSetStatus) },
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		if (args.status) {
			const status = args.status;
			return await ctx.db
				.query("changeSets")
				.withIndex("by_project_status", (q) =>
					q.eq("projectId", args.projectId).eq("status", status),
				)
				.order("desc")
				.collect();
		}
		return await ctx.db
			.query("changeSets")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.order("desc")
			.collect();
	},
});

export const get = query({
	args: { changeSetId: v.id("changeSets") },
	handler: async (ctx, args) => {
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireViewer(ctx, changeSet.projectId);
		const items = await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();
		const hydratedItems = await Promise.all(
			items.map((item) => hydrateReviewItem(ctx, item)),
		);
		return {
			...changeSet,
			items: hydratedItems,
			reviewUrl: buildReviewUrl(changeSet.projectId, args.changeSetId),
		};
	},
});

export const items = query({
	args: { changeSetId: v.id("changeSets") },
	handler: async (ctx, args) => {
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireViewer(ctx, changeSet.projectId);
		return await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();
	},
});

export const createDraft = mutation({
	args: {
		projectId: v.id("projects"),
		title: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireEditor(ctx, args.projectId);
		return await ctx.db.insert("changeSets", {
			projectId: args.projectId,
			title: args.title.trim(),
			description: args.description,
			author: { kind: "user", id: user.id },
			authorKind: "user",
			authorId: user.id,
			status: "draft",
			baseSnapshotVersion: now(),
			createdAt: now(),
			updatedAt: now(),
			summary: {
				filesChanged: 0,
				fieldsChanged: 0,
				additions: 0,
				deletions: 0,
			},
		});
	},
});

export const addItem = mutation({
	args: {
		changeSetId: v.id("changeSets"),
		kind: itemKind,
		keyId: v.optional(v.id("translationKeys")),
		localeId: v.optional(v.id("locales")),
		fieldPath: v.string(),
		nextValue: v.union(v.string(), v.null()),
		baseVersion: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireEditor(ctx, changeSet.projectId);
		assertCanReview(changeSet);
		if (!args.fieldPath.trim()) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "Change item field path is required.",
			});
		}
		if (args.kind === "translation_value") {
			if (
				args.keyId === undefined ||
				args.localeId === undefined ||
				args.nextValue === null
			) {
				throw new ConvexError({
					code: "VALIDATION",
					message:
						"Translation value items require keyId, localeId, and nextValue.",
				});
			}
			const [key, locale] = await Promise.all([
				ctx.db.get(args.keyId),
				ctx.db.get(args.localeId),
			]);
			if (
				!key ||
				key.projectId !== changeSet.projectId ||
				!locale ||
				locale.projectId !== changeSet.projectId
			) {
				throw new ConvexError({
					code: "VALIDATION",
					message: "Change item references must belong to this project.",
				});
			}
		}
		const liveValue = await getLiveValue(ctx, args.keyId, args.localeId);
		const conflicted =
			args.baseVersion !== undefined &&
			liveValue !== null &&
			liveValue.version !== args.baseVersion;
		const itemId = await ctx.db.insert("changeSetItems", {
			projectId: changeSet.projectId,
			changeSetId: args.changeSetId,
			kind: args.kind,
			keyId: args.keyId,
			localeId: args.localeId,
			fieldPath: args.fieldPath,
			previousValue: liveValue?.value ?? null,
			nextValue: args.nextValue,
			originalNextValue:
				args.kind === "translation_value" && args.nextValue !== null
					? args.nextValue
					: undefined,
			baseVersion: args.baseVersion,
			status: conflicted ? "conflicted" : "pending",
			createdAt: now(),
		});
		await refreshSummary(ctx, args.changeSetId);
		return itemId;
	},
});

export const open = mutation({
	args: { changeSetId: v.id("changeSets") },
	handler: async (ctx, args) => {
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireEditor(ctx, changeSet.projectId);
		assertCanReview(changeSet);
		await ctx.db.patch(args.changeSetId, {
			status: "open",
			openedAt: now(),
			updatedAt: now(),
		});
		return null;
	},
});

export const acceptItem = mutation({
	args: { itemId: v.id("changeSetItems") },
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.itemId);
		if (!item)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change item not found.",
			});
		await requireEditor(ctx, item.projectId);
		const changeSet = await ctx.db.get(item.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		assertCanReview(changeSet);
		if (item.status !== "conflicted") {
			await ctx.db.patch(args.itemId, { status: "accepted" });
		}
		return null;
	},
});

export const rejectItem = mutation({
	args: { itemId: v.id("changeSetItems") },
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.itemId);
		if (!item)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change item not found.",
			});
		await requireEditor(ctx, item.projectId);
		const changeSet = await ctx.db.get(item.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		assertCanReview(changeSet);
		await ctx.db.patch(args.itemId, { status: "rejected" });
		return null;
	},
});

export const acceptUnmarkedItems = mutation({
	args: { changeSetId: v.id("changeSets") },
	handler: async (ctx, args) => {
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireEditor(ctx, changeSet.projectId);
		assertCanReview(changeSet);
		const items = await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();
		const pendingItems = items.filter((item) => item.status === "pending");
		await Promise.all(
			pendingItems.map((item) =>
				ctx.db.patch(item._id, { status: "accepted" }),
			),
		);
		return { updated: pendingItems.length };
	},
});

export const rejectUnmarkedItems = mutation({
	args: { changeSetId: v.id("changeSets") },
	handler: async (ctx, args) => {
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireEditor(ctx, changeSet.projectId);
		assertCanReview(changeSet);
		const items = await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();
		const pendingItems = items.filter((item) => item.status === "pending");
		await Promise.all(
			pendingItems.map((item) =>
				ctx.db.patch(item._id, { status: "rejected" }),
			),
		);
		return { updated: pendingItems.length };
	},
});

export const exportAcceptedByLocale = mutation({
	args: {
		changeSetId: v.id("changeSets"),
		format: v.union(v.literal("json"), v.literal("arb")),
	},
	handler: async (ctx, args) => {
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireViewer(ctx, changeSet.projectId);
		const project = await ctx.db.get(changeSet.projectId);
		const items = await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();
		const acceptedItems = items.filter(
			(item) =>
				item.status === "accepted" &&
				item.kind === "translation_value" &&
				item.keyId !== undefined &&
				item.localeId !== undefined &&
				item.nextValue !== null,
		);
		const grouped: Record<string, Record<string, unknown>> = {};
		for (const item of acceptedItems) {
			const key = await ctx.db.get(item.keyId as Id<"translationKeys">);
			const locale = await ctx.db.get(item.localeId as Id<"locales">);
			if (!key || !locale) continue;
			grouped[locale.code] ??=
				args.format === "arb" ? { "@@locale": locale.code } : {};
			if (args.format === "arb") {
				const arbKey = toArbKey(key.key);
				grouped[locale.code][arbKey] = item.nextValue;
				grouped[locale.code][`@${arbKey}`] = {
					description: key.description,
					placeholders: Object.fromEntries(
						key.placeholders.map((placeholder) => [
							placeholder.name,
							placeholder,
						]),
					),
					"x-source-key": key.key,
				};
			} else {
				grouped[locale.code][key.key] = item.nextValue;
			}
		}
		return {
			content: JSON.stringify(grouped, null, 2),
			count: acceptedItems.length,
			projectSlug: project?.slug,
		};
	},
});

export const approve = mutation({
	args: { changeSetId: v.id("changeSets") },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireEditor(ctx, changeSet.projectId);
		assertCanReview(changeSet);
		await ctx.db.patch(args.changeSetId, {
			status: "approved",
			reviewedAt: now(),
			reviewedByUserId: user.id,
			updatedAt: now(),
		});
		return null;
	},
});

export const reject = mutation({
	args: { changeSetId: v.id("changeSets") },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireEditor(ctx, changeSet.projectId);
		assertNotTerminal(changeSet);
		await ctx.db.patch(args.changeSetId, {
			status: "rejected",
			reviewedAt: now(),
			reviewedByUserId: user.id,
			updatedAt: now(),
		});
		return null;
	},
});

export const apply = mutation({
	args: { changeSetId: v.id("changeSets") },
	handler: async (ctx, args) => {
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireEditor(ctx, changeSet.projectId);
		assertNotTerminal(changeSet);
		const items = await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();

		const existingConflicted = items.filter(
			(item) => item.status === "conflicted",
		).length;
		if (existingConflicted > 0) {
			return { conflicted: existingConflicted };
		}

		const applicableItems = items.filter(isApplicableItem);
		if (applicableItems.length === 0) {
			return { conflicted: 0 };
		}
		const unsupportedItem = applicableItems.find(
			(item) => !isSupportedApplyKind(item),
		);
		if (unsupportedItem) {
			throw new ConvexError({
				code: "BAD_STATE",
				message: `Cannot apply ${unsupportedItem.kind} review items yet.`,
			});
		}

		const newlyConflicted = [];
		for (const item of applicableItems) {
			const liveValue = await getLiveValue(ctx, item.keyId, item.localeId);
			if (
				item.baseVersion !== undefined &&
				liveValue !== null &&
				liveValue.version !== item.baseVersion
			) {
				newlyConflicted.push(item);
			}
		}

		if (newlyConflicted.length > 0) {
			await Promise.all(
				newlyConflicted.map((item) =>
					ctx.db.patch(item._id, { status: "conflicted" }),
				),
			);
			await ctx.db.patch(args.changeSetId, {
				status: "open",
				updatedAt: now(),
			});
			return { conflicted: newlyConflicted.length };
		}

		for (const item of applicableItems) {
			if (
				item.kind === "translation_value" &&
				item.keyId !== undefined &&
				item.localeId !== undefined &&
				item.nextValue !== null
			) {
				await upsertTranslationValue(ctx, {
					projectId: changeSet.projectId,
					keyId: item.keyId,
					localeId: item.localeId,
					value: item.nextValue,
					actor: changeSet.author,
					changeSetId: args.changeSetId,
				});
				await ctx.db.patch(item._id, { status: "accepted" });
			}
			if (item.kind === "key_metadata") {
				await applyTagMetadataChange(ctx, item);
				await ctx.db.patch(item._id, { status: "accepted" });
			}
		}
		await ctx.db.patch(args.changeSetId, {
			status: "applied",
			appliedAt: now(),
			updatedAt: now(),
		});
		return { conflicted: 0 };
	},
});

export const reviewAndApply = mutation({
	args: { changeSetId: v.id("changeSets") },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireEditor(ctx, changeSet.projectId);
		assertCanReview(changeSet);

		const items = await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();
		const rejected = items.filter((item) => item.status === "rejected").length;
		const existingConflicted = items.filter(
			(item) => item.status === "conflicted",
		).length;
		if (existingConflicted > 0) {
			return {
				status: "blocked" as const,
				applied: 0,
				conflicted: existingConflicted,
				rejected,
			};
		}

		const applicableItems = items.filter(isApplicableItem);
		if (applicableItems.length === 0) {
			return {
				status: "blocked" as const,
				applied: 0,
				conflicted: 0,
				rejected,
			};
		}

		const unsupportedItem = applicableItems.find(
			(item) => !isSupportedApplyKind(item),
		);
		if (unsupportedItem) {
			throw new ConvexError({
				code: "BAD_STATE",
				message: `Cannot apply ${unsupportedItem.kind} review items yet.`,
			});
		}

		const newlyConflicted = [];
		for (const item of applicableItems) {
			const liveValue = await getLiveValue(ctx, item.keyId, item.localeId);
			if (
				item.baseVersion !== undefined &&
				liveValue !== null &&
				liveValue.version !== item.baseVersion
			) {
				newlyConflicted.push(item);
			}
		}

		if (newlyConflicted.length > 0) {
			await Promise.all(
				newlyConflicted.map((item) =>
					ctx.db.patch(item._id, { status: "conflicted" }),
				),
			);
			await ctx.db.patch(args.changeSetId, {
				status: "open",
				updatedAt: now(),
			});
			return {
				status: "blocked" as const,
				applied: 0,
				conflicted: newlyConflicted.length,
				rejected,
			};
		}

		for (const item of applicableItems) {
			if (
				item.kind === "translation_value" &&
				item.keyId !== undefined &&
				item.localeId !== undefined &&
				item.nextValue !== null
			) {
				await upsertTranslationValue(ctx, {
					projectId: changeSet.projectId,
					keyId: item.keyId,
					localeId: item.localeId,
					value: item.nextValue,
					actor: changeSet.author,
					changeSetId: args.changeSetId,
				});
				await ctx.db.patch(item._id, { status: "accepted" });
			}
			if (item.kind === "key_metadata") {
				await applyTagMetadataChange(ctx, item);
				await ctx.db.patch(item._id, { status: "accepted" });
			}
		}

		const timestamp = now();
		await ctx.db.patch(args.changeSetId, {
			status: "applied",
			reviewedAt: timestamp,
			reviewedByUserId: user.id,
			appliedAt: timestamp,
			updatedAt: timestamp,
		});
		return {
			status: "applied" as const,
			applied: applicableItems.length,
			conflicted: 0,
			rejected,
		};
	},
});

export const createAgentChangeSet = internalMutation({
	args: {
		projectId: v.id("projects"),
		tokenId: v.id("apiTokens"),
		title: v.string(),
		description: v.optional(v.string()),
		items: v.array(
			v.object({
				keyId: v.id("translationKeys"),
				localeId: v.id("locales"),
				fieldPath: v.string(),
				nextValue: v.string(),
				baseVersion: v.optional(v.number()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const changeSetId = await ctx.db.insert("changeSets", {
			projectId: args.projectId,
			title: args.title,
			description: args.description,
			author: { kind: "agent", id: args.tokenId },
			authorKind: "agent",
			authorId: args.tokenId,
			status: "open",
			baseSnapshotVersion: now(),
			createdAt: now(),
			updatedAt: now(),
			openedAt: now(),
			summary: {
				filesChanged: 0,
				fieldsChanged: 0,
				additions: 0,
				deletions: 0,
			},
		});
		let conflicts = 0;
		for (const item of args.items) {
			const liveValue = await getLiveValue(ctx, item.keyId, item.localeId);
			const status =
				item.baseVersion !== undefined &&
				liveValue !== null &&
				liveValue.version !== item.baseVersion
					? "conflicted"
					: "pending";
			if (status === "conflicted") conflicts += 1;
			await ctx.db.insert("changeSetItems", {
				projectId: args.projectId,
				changeSetId,
				kind: "translation_value",
				keyId: item.keyId,
				localeId: item.localeId,
				fieldPath: item.fieldPath,
				previousValue: liveValue?.value ?? null,
				nextValue: item.nextValue,
				originalNextValue: item.nextValue,
				baseVersion: item.baseVersion,
				status,
				createdAt: now(),
			});
		}
		await refreshSummary(ctx, changeSetId);
		return { changeSetId, conflicts };
	},
});

export const updateItem = mutation({
	args: {
		itemId: v.id("changeSetItems"),
		nextValue: v.string(),
	},
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.itemId);
		if (!item)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change item not found.",
			});
		await requireEditor(ctx, item.projectId);
		const changeSet = await ctx.db.get(item.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		assertCanReview(changeSet);
		if (item.kind !== "translation_value") {
			throw new ConvexError({
				code: "BAD_STATE",
				message: "Only translation values are editable in review.",
			});
		}
		if (args.nextValue.trim().length === 0) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "Translation cannot be empty.",
			});
		}
		const nextStatus = item.status === "rejected" ? "pending" : item.status;
		await ctx.db.patch(args.itemId, {
			nextValue: args.nextValue,
			originalNextValue:
				item.originalNextValue ?? item.nextValue ?? args.nextValue,
			status: nextStatus,
		});
		await refreshSummary(ctx, item.changeSetId);
		return null;
	},
});

export const revertItem = mutation({
	args: { itemId: v.id("changeSetItems") },
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.itemId);
		if (!item)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change item not found.",
			});
		await requireEditor(ctx, item.projectId);
		const changeSet = await ctx.db.get(item.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		assertCanReview(changeSet);
		if (item.originalNextValue === undefined) {
			return null;
		}
		await ctx.db.patch(args.itemId, {
			nextValue: item.originalNextValue,
		});
		await refreshSummary(ctx, item.changeSetId);
		return null;
	},
});

export const acceptItemsInGroup = mutation({
	args: {
		changeSetId: v.id("changeSets"),
		keyId: v.id("translationKeys"),
	},
	handler: async (ctx, args) => {
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireEditor(ctx, changeSet.projectId);
		assertCanReview(changeSet);
		const items = await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();
		const targets = items.filter(
			(item) =>
				item.keyId === args.keyId &&
				item.status !== "accepted" &&
				item.status !== "conflicted",
		);
		await Promise.all(
			targets.map((item) => ctx.db.patch(item._id, { status: "accepted" })),
		);
		return { updated: targets.length };
	},
});

export const rejectItemsInGroup = mutation({
	args: {
		changeSetId: v.id("changeSets"),
		keyId: v.id("translationKeys"),
	},
	handler: async (ctx, args) => {
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		await requireEditor(ctx, changeSet.projectId);
		assertCanReview(changeSet);
		const items = await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();
		const targets = items.filter(
			(item) => item.keyId === args.keyId && item.status !== "rejected",
		);
		await Promise.all(
			targets.map((item) => ctx.db.patch(item._id, { status: "rejected" })),
		);
		return { updated: targets.length };
	},
});
