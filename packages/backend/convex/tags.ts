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
		const tags = await ctx.db
			.query("tags")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		return args.includeArchived
			? tags
			: tags.filter((tag) => tag.archivedAt === undefined);
	},
});

export const upsert = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		slug: v.optional(v.string()),
		color: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireEditor(ctx, args.projectId);
		const slug = slugify(args.slug ?? args.name);
		if (!slug)
			throw new ConvexError({
				code: "VALIDATION",
				message: "Tag slug is required.",
			});
		const existing = await ctx.db
			.query("tags")
			.withIndex("by_project_slug", (q) =>
				q.eq("projectId", args.projectId).eq("slug", slug),
			)
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				name: args.name.trim(),
				color: args.color,
				archivedAt: undefined,
			});
			return existing._id;
		}
		return await ctx.db.insert("tags", {
			projectId: args.projectId,
			name: args.name.trim(),
			slug,
			color: args.color,
			createdAt: now(),
		});
	},
});

export const archive = mutation({
	args: { tagId: v.id("tags") },
	handler: async (ctx, args) => {
		const tag = await ctx.db.get(args.tagId);
		if (!tag)
			throw new ConvexError({ code: "NOT_FOUND", message: "Tag not found." });
		await requireEditor(ctx, tag.projectId);
		await ctx.db.patch(args.tagId, { archivedAt: now() });
		return null;
	},
});
