import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUser } from "./auth";
import { buildUnifiedPatch, summarizeItems } from "./diffs";
import { buildReviewUrl, now } from "./lib";
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
const itemStatus = v.union(
	v.literal("pending"),
	v.literal("accepted"),
	v.literal("rejected"),
	v.literal("conflicted"),
);

async function getLiveValue(
	ctx: any,
	keyId?: Id<"translationKeys">,
	localeId?: Id<"locales">,
) {
	if (!keyId || !localeId) return null;
	const key = await ctx.db.get(keyId);
	if (!key) return null;
	return await ctx.db
		.query("translationValues")
		.withIndex("by_project_key_locale", (q: any) =>
			q
				.eq("projectId", key.projectId)
				.eq("keyId", keyId)
				.eq("localeId", localeId),
		)
		.unique();
}

async function refreshSummary(ctx: any, changeSetId: Id<"changeSets">) {
	const items = await ctx.db
		.query("changeSetItems")
		.withIndex("by_changeSet", (q: any) => q.eq("changeSetId", changeSetId))
		.collect();
	await ctx.db.patch(changeSetId, {
		summary: summarizeItems(items),
		updatedAt: now(),
	});
}

export const list = query({
	args: { projectId: v.id("projects"), status: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		const sets = args.status
			? await ctx.db
					.query("changeSets")
					.withIndex("by_project_status", (q) =>
						q.eq("projectId", args.projectId).eq("status", args.status as any),
					)
					.order("desc")
					.collect()
			: await ctx.db
					.query("changeSets")
					.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
					.order("desc")
					.collect();
		return sets;
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
		return {
			...changeSet,
			items,
			patch: buildUnifiedPatch(items),
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
		if (item.status !== "conflicted")
			await ctx.db.patch(args.itemId, { status: "accepted" });
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
		await ctx.db.patch(args.itemId, { status: "rejected" });
		return null;
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
		const items = await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();
		let conflicted = 0;
		for (const item of items) {
			if (item.status === "rejected" || item.status === "conflicted") continue;
			const liveValue = await getLiveValue(ctx, item.keyId, item.localeId);
			if (
				item.baseVersion !== undefined &&
				liveValue !== null &&
				liveValue.version !== item.baseVersion
			) {
				conflicted += 1;
				await ctx.db.patch(item._id, { status: "conflicted" });
				continue;
			}
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
		}
		await ctx.db.patch(args.changeSetId, {
			status: conflicted > 0 ? "open" : "applied",
			appliedAt: conflicted > 0 ? undefined : now(),
			updatedAt: now(),
		});
		return { conflicted };
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
				baseVersion: item.baseVersion,
				status,
				createdAt: now(),
			});
		}
		await refreshSummary(ctx, changeSetId);
		return { changeSetId, conflicts };
	},
});
