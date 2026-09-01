import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";
import {
	type FlatMessages,
	parseArbMessages,
	parseJsonMessages,
	validateImportTags,
} from "./importValidation";
import { makeSearchText, normalizeLocaleCode, now, slugify } from "./lib";
import { requireEditor, requireViewer } from "./permissions";
import { agentRateLimiter } from "./rateLimits";
import { upsertTranslationValue } from "./values";

async function findLocale(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
	code: string,
) {
	const locale = await ctx.db
		.query("locales")
		.withIndex("by_project_code", (q) =>
			q.eq("projectId", projectId).eq("code", code),
		)
		.unique();
	if (!locale || locale.archivedAt !== undefined) {
		throw new ConvexError({ code: "NOT_FOUND", message: "Locale not found." });
	}
	return locale;
}

function validateOptionalSlug(value: string | undefined, label: string) {
	if (value === undefined) return;
	if (!slugify(value) || value.length > 64) {
		throw new ConvexError({
			code: "VALIDATION",
			message: `${label} must be between 1 and 64 characters.`,
		});
	}
}

async function findOrCreateScreen(
	ctx: MutationCtx,
	projectId: Id<"projects">,
	screenSlug?: string,
) {
	if (!screenSlug) return undefined;
	const slug = slugify(screenSlug);
	const existing = await ctx.db
		.query("screens")
		.withIndex("by_project_slug", (q) =>
			q.eq("projectId", projectId).eq("slug", slug),
		)
		.unique();
	if (existing) {
		if (existing.archivedAt !== undefined) {
			await ctx.db.patch(existing._id, { archivedAt: undefined });
		}
		return existing._id;
	}
	return await ctx.db.insert("screens", {
		projectId,
		name: screenSlug,
		slug,
		createdAt: now(),
	});
}

async function findOrCreateTags(
	ctx: MutationCtx,
	projectId: Id<"projects">,
	tagSlugs?: string[],
) {
	const tagIds: Id<"tags">[] = [];
	for (const rawSlug of Array.from(new Set(tagSlugs ?? []))) {
		const slug = slugify(rawSlug);
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
		} else {
			tagIds.push(
				await ctx.db.insert("tags", {
					projectId,
					name: rawSlug,
					slug,
					createdAt: now(),
				}),
			);
		}
	}
	return tagIds;
}

type ImportArgs = {
	projectId: Id<"projects">;
	locale: Doc<"locales">;
	messages: FlatMessages;
	metadata?: Map<string, { description?: string; placeholders?: unknown }>;
	screenSlug?: string;
	tagSlugs?: string[];
	mode: "create_missing" | "upsert";
	actorId: string;
};

async function importMessages(ctx: MutationCtx, args: ImportArgs) {
	const screenId = await findOrCreateScreen(
		ctx,
		args.projectId,
		args.screenSlug,
	);
	const screen = screenId ? await ctx.db.get(screenId) : null;
	const tagIds = await findOrCreateTags(ctx, args.projectId, args.tagSlugs);
	const hydratedTags = await Promise.all(
		tagIds.map((tagId) => ctx.db.get(tagId)),
	);
	let imported = 0;
	for (const [messageKey, value] of Object.entries(args.messages)) {
		const existing = await ctx.db
			.query("translationKeys")
			.withIndex("by_project_key", (q) =>
				q.eq("projectId", args.projectId).eq("key", messageKey),
			)
			.unique();
		const meta = args.metadata?.get(messageKey);
		const placeholders =
			meta?.placeholders &&
			typeof meta.placeholders === "object" &&
			!Array.isArray(meta.placeholders)
				? Object.keys(meta.placeholders as Record<string, unknown>).map(
						(name) => ({ name }),
					)
				: [];
		const keyId =
			existing?._id ??
			(await ctx.db.insert("translationKeys", {
				projectId: args.projectId,
				key: messageKey,
				description: meta?.description,
				screenId,
				tagIds,
				icuType: value.includes("{") && value.includes("}") ? "icu" : "plain",
				placeholders,
				createdAt: now(),
				updatedAt: now(),
				searchText: makeSearchText({
					key: messageKey,
					description: meta?.description,
					screen,
					tags: hydratedTags.filter(
						(tag): tag is NonNullable<typeof tag> => tag !== null,
					),
				}),
			}));
		if (existing && tagIds.length > 0) {
			const nextTagIds = Array.from(new Set([...existing.tagIds, ...tagIds]));
			const nextTags = await Promise.all(
				nextTagIds.map((tagId) => ctx.db.get(tagId)),
			);
			await ctx.db.patch(existing._id, {
				tagIds: nextTagIds,
				updatedAt: now(),
				searchText: makeSearchText({
					key: existing.key,
					description: existing.description,
					screen: existing.screenId
						? await ctx.db.get(existing.screenId)
						: null,
					tags: nextTags.filter(
						(tag): tag is NonNullable<typeof tag> => tag !== null,
					),
				}),
			});
		}
		if (existing && args.mode === "create_missing") {
			const liveValue = await ctx.db
				.query("translationValues")
				.withIndex("by_project_key_locale", (q) =>
					q
						.eq("projectId", args.projectId)
						.eq("keyId", keyId)
						.eq("localeId", args.locale._id),
				)
				.unique();
			if (liveValue) continue;
		}
		await upsertTranslationValue(ctx, {
			projectId: args.projectId,
			keyId,
			localeId: args.locale._id,
			value,
			actor: { kind: "user", id: args.actorId },
		});
		imported += 1;
	}
	return imported;
}

export const getJob = query({
	args: { jobId: v.id("importJobs") },
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Import job not found.",
			});
		await requireViewer(ctx, job.projectId);
		return job;
	},
});

async function executeImport(
	ctx: MutationCtx,
	args: {
		projectId: Id<"projects">;
		localeCode: string;
		screenSlug?: string;
		tagSlugs?: string[];
		mode?: "create_missing" | "upsert";
		kind: "json" | "arb";
		messages: FlatMessages;
		metadata?: Map<string, { description?: string; placeholders?: unknown }>;
	},
) {
	const user = await requireUser(ctx);
	await requireEditor(ctx, args.projectId);
	validateOptionalSlug(args.screenSlug, "Screen slug");
	validateImportTags(args.tagSlugs);
	const localeCode = normalizeLocaleCode(args.localeCode);
	const locale = await findLocale(ctx, args.projectId, localeCode);
	const limit = await agentRateLimiter.limit(ctx, "importUpload", {
		key: `${args.projectId}:${user.id}`,
	});
	if (!limit.ok) {
		throw new ConvexError({
			code: "RATE_LIMITED",
			message: "Import rate limit exceeded.",
			retryAfter: limit.retryAfter,
		});
	}
	const mode = args.mode ?? "create_missing";
	const jobId = await ctx.db.insert("importJobs", {
		projectId: args.projectId,
		kind: args.kind,
		status: "running",
		input: {
			localeCode,
			screenSlug: args.screenSlug,
			tagSlugs: args.tagSlugs,
			mode,
		},
		createdBy: { kind: "user", id: user.id },
		createdAt: now(),
		updatedAt: now(),
	});
	const imported = await importMessages(ctx, {
		projectId: args.projectId,
		locale,
		messages: args.messages,
		metadata: args.metadata,
		screenSlug: args.screenSlug,
		tagSlugs: args.tagSlugs,
		mode,
		actorId: user.id,
	});
	await ctx.db.patch(jobId, {
		status: "completed",
		result: { imported },
		updatedAt: now(),
	});
	return jobId;
}

export const startJsonImport = mutation({
	args: {
		projectId: v.id("projects"),
		localeCode: v.string(),
		content: v.string(),
		screenSlug: v.optional(v.string()),
		tagSlugs: v.optional(v.array(v.string())),
		mode: v.optional(v.union(v.literal("create_missing"), v.literal("upsert"))),
	},
	handler: async (ctx, args) =>
		await executeImport(ctx, {
			...args,
			kind: "json",
			messages: parseJsonMessages(args.content),
		}),
});

export const startArbImport = mutation({
	args: {
		projectId: v.id("projects"),
		localeCode: v.string(),
		content: v.string(),
		screenSlug: v.optional(v.string()),
		tagSlugs: v.optional(v.array(v.string())),
		mode: v.optional(v.union(v.literal("create_missing"), v.literal("upsert"))),
	},
	handler: async (ctx, args) => {
		const parsed = parseArbMessages(args.content);
		return await executeImport(ctx, {
			...args,
			kind: "arb",
			messages: parsed.messages,
			metadata: parsed.metadata,
		});
	},
});
