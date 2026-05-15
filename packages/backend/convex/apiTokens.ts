import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";
import type { TokenScope } from "./lib";
import { now } from "./lib";
import { requireOwner, requireViewer } from "./permissions";

const scopeValidator = v.union(
	v.literal("read"),
	v.literal("search"),
	v.literal("propose"),
	v.literal("export"),
);

export function hashToken(rawToken: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < rawToken.length; index += 1) {
		hash ^= rawToken.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `fnv1a:${hash.toString(36)}:${rawToken.length}`;
}

function randomToken(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return `loc_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export const list = query({
	args: { projectId: v.id("projects") },
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		const tokens = await ctx.db
			.query("apiTokens")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		return tokens.map(({ tokenHash: _tokenHash, ...token }) => token);
	},
});

export const create = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		scopes: v.array(scopeValidator),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireOwner(ctx, args.projectId);
		const rawToken = randomToken();
		const tokenId = await ctx.db.insert("apiTokens", {
			projectId: args.projectId,
			name: args.name.trim(),
			tokenHash: hashToken(rawToken),
			scopes: args.scopes as TokenScope[],
			createdByUserId: user.id,
			createdAt: now(),
		});
		return { tokenId, token: rawToken };
	},
});

export const revoke = mutation({
	args: { tokenId: v.id("apiTokens") },
	handler: async (ctx, args) => {
		const token = await ctx.db.get(args.tokenId);
		if (!token)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "API token not found.",
			});
		await requireOwner(ctx, token.projectId);
		await ctx.db.patch(args.tokenId, { revokedAt: now() });
		return null;
	},
});
