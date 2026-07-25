import { ConvexError } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { hasMinimumRole } from "./accessControl";
import { requireUser } from "./auth";
import type { Role } from "./lib";

export async function getMembership(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
	userId: string,
): Promise<Doc<"projectMembers"> | null> {
	return await ctx.db
		.query("projectMembers")
		.withIndex("by_project_user", (q) =>
			q.eq("projectId", projectId).eq("userId", userId),
		)
		.unique();
}

export async function requireProjectRole(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
	minimumRole: Role,
): Promise<{ userId: string; member: Doc<"projectMembers"> }> {
	const user = await requireUser(ctx);
	await assertProjectExists(ctx, projectId);
	const member = await getMembership(ctx, projectId, user.id);
	if (!member || !hasMinimumRole(member.role, minimumRole)) {
		throw new ConvexError({
			code: "FORBIDDEN",
			message: "Insufficient project permissions.",
		});
	}
	return { userId: user.id, member };
}

export async function requireViewer(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
) {
	return await requireProjectRole(ctx, projectId, "viewer");
}

export async function requireEditor(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
) {
	return await requireProjectRole(ctx, projectId, "editor");
}

export async function requireOwner(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
) {
	return await requireProjectRole(ctx, projectId, "owner");
}

export async function assertProjectExists(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
): Promise<Doc<"projects">> {
	const project = await ctx.db.get(projectId);
	if (!project || project.archivedAt !== undefined) {
		throw new ConvexError({ code: "NOT_FOUND", message: "Project not found." });
	}
	return project;
}
