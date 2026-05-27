import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { normalizeLocaleCode, now } from "./lib";
import {
	assertProjectExists,
	requireEditor,
	requireViewer,
} from "./permissions";

export const list = query({
	args: {
		projectId: v.id("projects"),
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		const locales = await ctx.db
			.query("locales")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		return args.includeArchived
			? locales
			: locales.filter((locale) => locale.archivedAt === undefined);
	},
});

export const create = mutation({
	args: {
		projectId: v.id("projects"),
		code: v.string(),
		label: v.optional(v.string()),
		isSource: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		await requireEditor(ctx, args.projectId);
		const project = await assertProjectExists(ctx, args.projectId);
		const code = normalizeLocaleCode(args.code);
		const existing = await ctx.db
			.query("locales")
			.withIndex("by_project_code", (q) =>
				q.eq("projectId", args.projectId).eq("code", code),
			)
			.unique();
		if (existing && existing.archivedAt === undefined) {
			throw new ConvexError({
				code: "CONFLICT",
				message: "Locale already exists.",
			});
		}
		if (args.isSource && project.sourceLocaleId !== undefined) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "Project already has a source locale.",
			});
		}
		const isSource =
			args.isSource === true || project.sourceLocaleId === undefined;
		const timestamp = now();
		const localeId =
			existing && existing.archivedAt !== undefined
				? existing._id
				: await ctx.db.insert("locales", {
						projectId: args.projectId,
						code,
						label: args.label?.trim() || code,
						isSource,
						createdAt: timestamp,
					});
		if (existing && existing.archivedAt !== undefined) {
			await ctx.db.patch(existing._id, {
				label: args.label?.trim() || code,
				isSource,
				archivedAt: undefined,
			});
		}
		if (isSource) {
			await ctx.db.patch(args.projectId, {
				sourceLocaleId: localeId,
				updatedAt: timestamp,
			});
		}
		return localeId;
	},
});

export const archive = mutation({
	args: { localeId: v.id("locales") },
	handler: async (ctx, args) => {
		const locale = await ctx.db.get(args.localeId);
		if (!locale)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Locale not found.",
			});
		await requireEditor(ctx, locale.projectId);
		if (locale.isSource) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "Source locale cannot be archived.",
			});
		}
		await ctx.db.patch(args.localeId, { archivedAt: now() });
		return null;
	},
});
