import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { now, slugify } from "./lib";
import { requireEditor, requireViewer } from "./permissions";

export const list = query({
	args: {
		projectId: v.id("projects"),
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		const screens = await ctx.db
			.query("screens")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		return args.includeArchived
			? screens
			: screens.filter((screen) => screen.archivedAt === undefined);
	},
});

export const upsert = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		slug: v.optional(v.string()),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireEditor(ctx, args.projectId);
		const slug = slugify(args.slug ?? args.name);
		if (!slug)
			throw new ConvexError({
				code: "VALIDATION",
				message: "Screen slug is required.",
			});
		const existing = await ctx.db
			.query("screens")
			.withIndex("by_project_slug", (q) =>
				q.eq("projectId", args.projectId).eq("slug", slug),
			)
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				name: args.name.trim(),
				description: args.description,
				archivedAt: undefined,
			});
			return existing._id;
		}
		return await ctx.db.insert("screens", {
			projectId: args.projectId,
			name: args.name.trim(),
			slug,
			description: args.description,
			createdAt: now(),
		});
	},
});

export const archive = mutation({
	args: { screenId: v.id("screens") },
	handler: async (ctx, args) => {
		const screen = await ctx.db.get(args.screenId);
		if (!screen)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Screen not found.",
			});
		await requireEditor(ctx, screen.projectId);
		await ctx.db.patch(args.screenId, { archivedAt: now() });
		return null;
	},
});
