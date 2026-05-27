import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";
import { normalizeLocaleCode, now, slugify } from "./lib";
import {
	assertProjectExists,
	requireOwner,
	requireViewer,
} from "./permissions";

const roleValidator = v.union(
	v.literal("owner"),
	v.literal("editor"),
	v.literal("viewer"),
);
type Role = "owner" | "editor" | "viewer";

async function ensureUniqueProjectSlug(
	ctx: any,
	slug: string,
	exceptId?: Id<"projects">,
) {
	const existing = await ctx.db
		.query("projects")
		.withIndex("by_slug", (q: any) => q.eq("slug", slug))
		.unique();
	if (existing && existing._id !== exceptId) {
		throw new ConvexError({
			code: "CONFLICT",
			message: "Project slug already exists.",
		});
	}
}

async function assertCanChangeMemberRole(
	ctx: QueryCtx | MutationCtx,
	member: { projectId: Id<"projects">; role: Role },
	nextRole: Role,
) {
	if (member.role !== "owner" || nextRole === "owner") {
		return;
	}
	const owners = await ctx.db
		.query("projectMembers")
		.withIndex("by_project", (q) => q.eq("projectId", member.projectId))
		.filter((q) => q.eq(q.field("role"), "owner"))
		.collect();
	if (owners.length <= 1) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "A project needs at least one owner.",
		});
	}
}

export const listMine = query({
	args: {},
	handler: async (ctx) => {
		const user = await requireUser(ctx);
		const memberships = await ctx.db
			.query("projectMembers")
			.withIndex("by_user", (q) => q.eq("userId", user.id))
			.collect();
		const projects = await Promise.all(
			memberships.map(async (member) => {
				const project = await ctx.db.get(member.projectId);
				return project && project.archivedAt === undefined
					? { ...project, role: member.role }
					: null;
			}),
		);
		return projects.filter((project) => project !== null);
	},
});

export const get = query({
	args: { projectId: v.id("projects") },
	handler: async (ctx, args) => {
		const { member } = await requireViewer(ctx, args.projectId);
		const project = await assertProjectExists(ctx, args.projectId);
		const sourceLocale =
			project.sourceLocaleId === undefined
				? null
				: await ctx.db.get(project.sourceLocaleId);
		return { ...project, role: member.role, sourceLocale };
	},
});

export const listMembers = query({
	args: { projectId: v.id("projects") },
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		return await ctx.db
			.query("projectMembers")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		slug: v.optional(v.string()),
		sourceLocaleCode: v.string(),
		sourceLocaleLabel: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const timestamp = now();
		const slug = slugify(args.slug ?? args.name);
		if (!slug) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "Project slug is required.",
			});
		}
		await ensureUniqueProjectSlug(ctx, slug);

		const projectId = await ctx.db.insert("projects", {
			name: args.name.trim(),
			slug,
			createdByUserId: user.id,
			createdAt: timestamp,
			updatedAt: timestamp,
		});
		await ctx.db.insert("projectMembers", {
			projectId,
			userId: user.id,
			role: "owner",
			createdAt: timestamp,
		});
		const localeCode = normalizeLocaleCode(args.sourceLocaleCode);
		const localeId = await ctx.db.insert("locales", {
			projectId,
			code: localeCode,
			label: args.sourceLocaleLabel?.trim() || localeCode,
			isSource: true,
			createdAt: timestamp,
		});
		await ctx.db.patch(projectId, {
			sourceLocaleId: localeId,
			updatedAt: timestamp,
		});
		return projectId;
	},
});

export const update = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		slug: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireOwner(ctx, args.projectId);
		await assertProjectExists(ctx, args.projectId);
		const patch: { name: string; slug?: string; updatedAt: number } = {
			name: args.name.trim(),
			updatedAt: now(),
		};
		if (args.slug !== undefined) {
			const slug = slugify(args.slug);
			if (!slug) {
				throw new ConvexError({
					code: "VALIDATION",
					message: "Project slug is required.",
				});
			}
			await ensureUniqueProjectSlug(ctx, slug, args.projectId);
			patch.slug = slug;
		}
		await ctx.db.patch(args.projectId, patch);
		return null;
	},
});

export const archive = mutation({
	args: { projectId: v.id("projects") },
	handler: async (ctx, args) => {
		await requireOwner(ctx, args.projectId);
		await assertProjectExists(ctx, args.projectId);
		await ctx.db.patch(args.projectId, { archivedAt: now(), updatedAt: now() });
		return null;
	},
});

export const addMember = mutation({
	args: {
		projectId: v.id("projects"),
		userId: v.string(),
		role: roleValidator,
	},
	handler: async (ctx, args) => {
		await requireOwner(ctx, args.projectId);
		await assertProjectExists(ctx, args.projectId);
		const existing = await ctx.db
			.query("projectMembers")
			.withIndex("by_project_user", (q) =>
				q.eq("projectId", args.projectId).eq("userId", args.userId),
			)
			.unique();
		if (existing) {
			await assertCanChangeMemberRole(ctx, existing, args.role);
			await ctx.db.patch(existing._id, { role: args.role });
			return existing._id;
		}
		return await ctx.db.insert("projectMembers", {
			projectId: args.projectId,
			userId: args.userId,
			role: args.role,
			createdAt: now(),
		});
	},
});

export const updateMemberRole = mutation({
	args: { memberId: v.id("projectMembers"), role: roleValidator },
	handler: async (ctx, args) => {
		const member = await ctx.db.get(args.memberId);
		if (!member)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Member not found.",
			});
		await requireOwner(ctx, member.projectId);
		await assertCanChangeMemberRole(ctx, member, args.role);
		await ctx.db.patch(args.memberId, { role: args.role });
		return null;
	},
});

export const removeMember = mutation({
	args: { memberId: v.id("projectMembers") },
	handler: async (ctx, args) => {
		const member = await ctx.db.get(args.memberId);
		if (!member)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Member not found.",
			});
		await requireOwner(ctx, member.projectId);
		if (member.role === "owner") {
			const owners = await ctx.db
				.query("projectMembers")
				.withIndex("by_project", (q) => q.eq("projectId", member.projectId))
				.filter((q) => q.eq(q.field("role"), "owner"))
				.collect();
			if (owners.length <= 1) {
				throw new ConvexError({
					code: "VALIDATION",
					message: "A project needs at least one owner.",
				});
			}
		}
		await ctx.db.delete(args.memberId);
		return null;
	},
});
