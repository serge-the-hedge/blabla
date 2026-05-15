import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";
import { now, toArbKey } from "./lib";
import { requireViewer } from "./permissions";

const selectionValidator = v.object({
	type: v.union(
		v.literal("all"),
		v.literal("keys"),
		v.literal("tag"),
		v.literal("screen"),
	),
	keys: v.optional(v.array(v.string())),
	tag: v.optional(v.string()),
	screen: v.optional(v.string()),
});

async function findLocale(ctx: any, projectId: Id<"projects">, code: string) {
	const locale = await ctx.db
		.query("locales")
		.withIndex("by_project_code", (q: any) =>
			q.eq("projectId", projectId).eq("code", code),
		)
		.unique();
	if (!locale || locale.archivedAt !== undefined) {
		throw new ConvexError({ code: "NOT_FOUND", message: "Locale not found." });
	}
	return locale;
}

async function selectedKeys(
	ctx: any,
	projectId: Id<"projects">,
	selection: { type: string; keys?: string[]; tag?: string; screen?: string },
) {
	const keys = await ctx.db
		.query("translationKeys")
		.withIndex("by_project", (q: any) => q.eq("projectId", projectId))
		.collect();
	const activeKeys = keys.filter(
		(key: Doc<"translationKeys">) => key.archivedAt === undefined,
	);
	if (selection.type === "keys" && selection.keys) {
		const selected = new Set(selection.keys);
		return activeKeys.filter((key: Doc<"translationKeys">) =>
			selected.has(key.key),
		);
	}
	if (selection.type === "tag" && selection.tag) {
		const tag = await ctx.db
			.query("tags")
			.withIndex("by_project_slug", (q: any) =>
				q.eq("projectId", projectId).eq("slug", selection.tag),
			)
			.unique();
		return tag
			? activeKeys.filter((key: Doc<"translationKeys">) =>
					key.tagIds.includes(tag._id),
				)
			: [];
	}
	if (selection.type === "screen" && selection.screen) {
		const screen = await ctx.db
			.query("screens")
			.withIndex("by_project_slug", (q: any) =>
				q.eq("projectId", projectId).eq("slug", selection.screen),
			)
			.unique();
		return screen
			? activeKeys.filter(
					(key: Doc<"translationKeys">) => key.screenId === screen._id,
				)
			: [];
	}
	return activeKeys;
}

async function valuesForKeys(
	ctx: any,
	localeId: Id<"locales">,
	keys: Doc<"translationKeys">[],
) {
	const values = await ctx.db
		.query("translationValues")
		.withIndex("by_locale", (q: any) => q.eq("localeId", localeId))
		.collect();
	const byKey = new Map<Id<"translationKeys">, Doc<"translationValues">>(
		values.map((value: Doc<"translationValues">) => [value.keyId, value]),
	);
	return keys.map((key) => ({ key, value: byKey.get(key._id)?.value ?? "" }));
}

export async function buildExportContent(
	ctx: any,
	args: {
		projectId: Id<"projects">;
		localeCode: string;
		format: "json" | "arb";
		selection: { type: string; keys?: string[]; tag?: string; screen?: string };
	},
) {
	const locale = await findLocale(ctx, args.projectId, args.localeCode);
	const keys = await selectedKeys(ctx, args.projectId, args.selection);
	const rows = await valuesForKeys(ctx, locale._id, keys);
	if (args.format === "json") {
		return JSON.stringify(
			Object.fromEntries(rows.map((row) => [row.key.key, row.value])),
			null,
			2,
		);
	}
	const arb: Record<string, unknown> = { "@@locale": locale.code };
	for (const row of rows) {
		const arbKey = toArbKey(row.key.key);
		arb[arbKey] = row.value;
		arb[`@${arbKey}`] = {
			description: row.key.description,
			placeholders: Object.fromEntries(
				row.key.placeholders.map((placeholder) => [
					placeholder.name,
					placeholder,
				]),
			),
			"x-source-key": row.key.key,
		};
	}
	return JSON.stringify(arb, null, 2);
}

export const getJob = query({
	args: { jobId: v.id("exportJobs") },
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Export job not found.",
			});
		await requireViewer(ctx, job.projectId);
		return job;
	},
});

export const startJsonExport = mutation({
	args: {
		projectId: v.id("projects"),
		localeCode: v.string(),
		selection: selectionValidator,
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireViewer(ctx, args.projectId);
		const content = await buildExportContent(ctx, { ...args, format: "json" });
		const jobId = await ctx.db.insert("exportJobs", {
			projectId: args.projectId,
			kind: "json",
			status: "completed",
			input: { localeCode: args.localeCode, selection: args.selection },
			result: { content },
			createdBy: { kind: "user", id: user.id },
			createdAt: now(),
			updatedAt: now(),
		});
		return { jobId, content };
	},
});

export const startArbExport = mutation({
	args: {
		projectId: v.id("projects"),
		localeCode: v.string(),
		selection: selectionValidator,
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireViewer(ctx, args.projectId);
		const content = await buildExportContent(ctx, { ...args, format: "arb" });
		const jobId = await ctx.db.insert("exportJobs", {
			projectId: args.projectId,
			kind: "arb",
			status: "completed",
			input: { localeCode: args.localeCode, selection: args.selection },
			result: { content },
			createdBy: { kind: "user", id: user.id },
			createdAt: now(),
			updatedAt: now(),
		});
		return { jobId, content };
	},
});
