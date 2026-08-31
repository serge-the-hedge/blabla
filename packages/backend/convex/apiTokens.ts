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
	v.literal("snapshot-submission"),
);

const sha256K = [
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotateRight(value: number, bits: number) {
	return (value >>> bits) | (value << (32 - bits));
}

function sha256Hex(input: string): string {
	const bytes = Array.from(new TextEncoder().encode(input));
	const bitLength = bytes.length * 8;
	bytes.push(0x80);
	while (bytes.length % 64 !== 56) bytes.push(0);
	for (let index = 7; index >= 0; index -= 1) {
		bytes.push(Math.floor(bitLength / 2 ** (index * 8)) & 0xff);
	}
	const hash = [
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
		0x1f83d9ab, 0x5be0cd19,
	];
	const words = Array(64).fill(0);
	for (let offset = 0; offset < bytes.length; offset += 64) {
		for (let index = 0; index < 16; index += 1) {
			const byteIndex = offset + index * 4;
			words[index] =
				((bytes[byteIndex] ?? 0) << 24) |
				((bytes[byteIndex + 1] ?? 0) << 16) |
				((bytes[byteIndex + 2] ?? 0) << 8) |
				(bytes[byteIndex + 3] ?? 0);
		}
		for (let index = 16; index < 64; index += 1) {
			const s0 =
				rotateRight(words[index - 15], 7) ^
				rotateRight(words[index - 15], 18) ^
				(words[index - 15] >>> 3);
			const s1 =
				rotateRight(words[index - 2], 17) ^
				rotateRight(words[index - 2], 19) ^
				(words[index - 2] >>> 10);
			words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
		}
		let [a, b, c, d, e, f, g, h] = hash;
		for (let index = 0; index < 64; index += 1) {
			const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
			const ch = (e & f) ^ (~e & g);
			const temp1 = (h + s1 + ch + sha256K[index] + words[index]) >>> 0;
			const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const temp2 = (s0 + maj) >>> 0;
			h = g;
			g = f;
			f = e;
			e = (d + temp1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) >>> 0;
		}
		hash[0] = (hash[0] + a) >>> 0;
		hash[1] = (hash[1] + b) >>> 0;
		hash[2] = (hash[2] + c) >>> 0;
		hash[3] = (hash[3] + d) >>> 0;
		hash[4] = (hash[4] + e) >>> 0;
		hash[5] = (hash[5] + f) >>> 0;
		hash[6] = (hash[6] + g) >>> 0;
		hash[7] = (hash[7] + h) >>> 0;
	}
	return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function hashToken(rawToken: string): string {
	return `sha256:${sha256Hex(rawToken)}`;
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
