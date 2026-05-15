import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";
import { makeSearchText, now } from "./lib";
import { requireEditor, requireViewer } from "./permissions";
import { upsertTranslationValue } from "./values";

const placeholderValidator = v.object({
	name: v.string(),
	type: v.optional(v.string()),
	example: v.optional(v.string()),
});

async function buildSearchText(
	ctx: any,
	args: {
		key: string;
		description?: string;
		screenId?: Id<"screens">;
		tagIds: Id<"tags">[];
	},
) {
	const screen = args.screenId ? await ctx.db.get(args.screenId) : null;
	const tags = await Promise.all(args.tagIds.map((tagId) => ctx.db.get(tagId)));
	return makeSearchText({
		key: args.key,
		description: args.description,
		screen,
		tags: tags.filter((tag): tag is NonNullable<typeof tag> => tag !== null),
	});
}

export const list = query({
	args: {
		projectId: v.id("projects"),
		localeId: v.optional(v.id("locales")),
		screenId: v.optional(v.id("screens")),
		tagId: v.optional(v.id("tags")),
		status: v.optional(
			v.union(
				v.literal("missing"),
				v.literal("translated"),
				v.literal("needs_review"),
				v.literal("stale"),
			),
		),
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		const keys =
			args.screenId !== undefined
				? await ctx.db
						.query("translationKeys")
						.withIndex("by_project_screen", (q) =>
							q.eq("projectId", args.projectId).eq("screenId", args.screenId),
						)
						.collect()
				: await ctx.db
						.query("translationKeys")
						.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
						.collect();
		const filteredKeys = keys.filter((key) => {
			if (!args.includeArchived && key.archivedAt !== undefined) return false;
			if (args.tagId && !key.tagIds.includes(args.tagId)) return false;
			return true;
		});
		const values =
			args.localeId === undefined
				? []
				: await ctx.db
						.query("translationValues")
						.withIndex("by_locale", (q) =>
							q.eq("localeId", args.localeId as Id<"locales">),
						)
						.collect();
		const valuesByKey = new Map(values.map((value) => [value.keyId, value]));
		return filteredKeys
			.map((key) => ({
				...key,
				selectedValue: valuesByKey.get(key._id) ?? null,
			}))
			.filter((item) =>
				args.status ? item.selectedValue?.status === args.status : true,
			);
	},
});

export const search = query({
	args: {
		projectId: v.id("projects"),
		q: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		if (args.q.trim().length === 0) {
			return await ctx.db
				.query("translationKeys")
				.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
				.take(args.limit ?? 25);
		}
		return await ctx.db
			.query("translationKeys")
			.withSearchIndex("searchText", (q) =>
				q.search("searchText", args.q).eq("projectId", args.projectId),
			)
			.take(args.limit ?? 25);
	},
});

export const create = mutation({
	args: {
		projectId: v.id("projects"),
		key: v.string(),
		description: v.optional(v.string()),
		screenId: v.optional(v.id("screens")),
		tagIds: v.optional(v.array(v.id("tags"))),
		icuType: v.optional(v.union(v.literal("plain"), v.literal("icu"))),
		placeholders: v.optional(v.array(placeholderValidator)),
		initialValues: v.optional(
			v.array(v.object({ localeId: v.id("locales"), value: v.string() })),
		),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireEditor(ctx, args.projectId);
		const key = args.key.trim();
		if (!key)
			throw new ConvexError({
				code: "VALIDATION",
				message: "Translation key is required.",
			});
		const existing = await ctx.db
			.query("translationKeys")
			.withIndex("by_project_key", (q) =>
				q.eq("projectId", args.projectId).eq("key", key),
			)
			.unique();
		if (existing && existing.archivedAt === undefined) {
			throw new ConvexError({
				code: "CONFLICT",
				message: "Translation key already exists.",
			});
		}
		const tagIds = args.tagIds ?? [];
		const timestamp = now();
		const keyId = await ctx.db.insert("translationKeys", {
			projectId: args.projectId,
			key,
			description: args.description,
			screenId: args.screenId,
			tagIds,
			icuType: args.icuType ?? "plain",
			placeholders: args.placeholders ?? [],
			createdAt: timestamp,
			updatedAt: timestamp,
			searchText: await buildSearchText(ctx, {
				key,
				description: args.description,
				screenId: args.screenId,
				tagIds,
			}),
		});
		for (const initialValue of args.initialValues ?? []) {
			await upsertTranslationValue(ctx, {
				projectId: args.projectId,
				keyId,
				localeId: initialValue.localeId,
				value: initialValue.value,
				actor: { kind: "user", id: user.id },
			});
		}
		return keyId;
	},
});

export const updateMetadata = mutation({
	args: {
		keyId: v.id("translationKeys"),
		key: v.optional(v.string()),
		description: v.optional(v.string()),
		screenId: v.optional(v.union(v.id("screens"), v.null())),
		tagIds: v.optional(v.array(v.id("tags"))),
		icuType: v.optional(v.union(v.literal("plain"), v.literal("icu"))),
		placeholders: v.optional(v.array(placeholderValidator)),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.keyId);
		if (!existing)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Translation key not found.",
			});
		await requireEditor(ctx, existing.projectId);
		const nextKey = args.key?.trim() ?? existing.key;
		if (!nextKey)
			throw new ConvexError({
				code: "VALIDATION",
				message: "Translation key is required.",
			});
		if (nextKey !== existing.key) {
			const duplicate = await ctx.db
				.query("translationKeys")
				.withIndex("by_project_key", (q) =>
					q.eq("projectId", existing.projectId).eq("key", nextKey),
				)
				.unique();
			if (duplicate && duplicate._id !== args.keyId) {
				throw new ConvexError({
					code: "CONFLICT",
					message: "Translation key already exists.",
				});
			}
		}
		const screenId =
			args.screenId === null ? undefined : (args.screenId ?? existing.screenId);
		const tagIds = args.tagIds ?? existing.tagIds;
		await ctx.db.patch(args.keyId, {
			key: nextKey,
			description: args.description ?? existing.description,
			screenId,
			tagIds,
			icuType: args.icuType ?? existing.icuType,
			placeholders: args.placeholders ?? existing.placeholders,
			updatedAt: now(),
			searchText: await buildSearchText(ctx, {
				key: nextKey,
				description: args.description ?? existing.description,
				screenId,
				tagIds,
			}),
		});
		return null;
	},
});

export const archive = mutation({
	args: { keyId: v.id("translationKeys") },
	handler: async (ctx, args) => {
		const key = await ctx.db.get(args.keyId);
		if (!key)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Translation key not found.",
			});
		await requireEditor(ctx, key.projectId);
		await ctx.db.patch(args.keyId, { archivedAt: now(), updatedAt: now() });
		return null;
	},
});
