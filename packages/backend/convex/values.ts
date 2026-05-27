import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";
import { now, statusForValue } from "./lib";
import { requireEditor, requireViewer } from "./permissions";

async function getValue(
	ctx: any,
	keyId: Id<"translationKeys">,
	localeId: Id<"locales">,
) {
	const key = await ctx.db.get(keyId);
	if (!key)
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Translation key not found.",
		});
	return await ctx.db
		.query("translationValues")
		.withIndex("by_project_key_locale", (q: any) =>
			q
				.eq("projectId", key.projectId)
				.eq("keyId", keyId)
				.eq("localeId", localeId),
		)
		.unique();
}

async function getSourceValue(ctx: any, keyId: Id<"translationKeys">) {
	const key = await ctx.db.get(keyId);
	if (!key)
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Translation key not found.",
		});
	const project = await ctx.db.get(key.projectId);
	if (!project?.sourceLocaleId) return null;
	return await getValue(ctx, keyId, project.sourceLocaleId);
}

export async function upsertTranslationValue(
	ctx: any,
	args: {
		projectId: Id<"projects">;
		keyId: Id<"translationKeys">;
		localeId: Id<"locales">;
		value: string;
		actor: { kind: "user" | "agent" | "system"; id: string };
		changeSetId?: Id<"changeSets">;
	},
) {
	const timestamp = now();
	const key = await ctx.db.get(args.keyId);
	const locale = await ctx.db.get(args.localeId);
	const project = await ctx.db.get(args.projectId);
	if (!key || key.projectId !== args.projectId) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Translation key not found.",
		});
	}
	if (!locale || locale.projectId !== args.projectId) {
		throw new ConvexError({ code: "NOT_FOUND", message: "Locale not found." });
	}
	const previous = await getValue(ctx, args.keyId, args.localeId);
	const sourceValue = locale.isSource
		? previous
		: await getSourceValue(ctx, args.keyId);
	const nextVersion = (previous?.version ?? 0) + 1;
	const sourceVersion = locale.isSource
		? nextVersion
		: (sourceValue?.version ?? 0);
	const nextStatus = statusForValue(args.value);
	if (previous) {
		await ctx.db.patch(previous._id, {
			value: args.value,
			status: nextStatus,
			sourceVersion,
			version: nextVersion,
			updatedBy: args.actor,
			updatedAt: timestamp,
		});
	} else {
		await ctx.db.insert("translationValues", {
			projectId: args.projectId,
			keyId: args.keyId,
			localeId: args.localeId,
			value: args.value,
			status: nextStatus,
			sourceVersion,
			version: nextVersion,
			updatedBy: args.actor,
			updatedAt: timestamp,
		});
	}
	await ctx.db.insert("translationHistory", {
		projectId: args.projectId,
		keyId: args.keyId,
		localeId: args.localeId,
		previousValue: previous?.value ?? null,
		nextValue: args.value,
		previousStatus: previous?.status ?? null,
		nextStatus,
		previousVersion: previous?.version ?? null,
		nextVersion,
		changedBy: args.actor,
		changeSetId: args.changeSetId,
		createdAt: timestamp,
	});

	if (project?.sourceLocaleId === args.localeId) {
		const values = await ctx.db
			.query("translationValues")
			.withIndex("by_key", (q: any) => q.eq("keyId", args.keyId))
			.collect();
		await Promise.all(
			values
				.filter(
					(value: any) =>
						value.localeId !== args.localeId && value.status !== "missing",
				)
				.map((value: any) =>
					ctx.db.patch(value._id, {
						status: "stale",
						sourceVersion: nextVersion,
						updatedAt: timestamp,
					}),
				),
		);
	}

	return { version: nextVersion, status: nextStatus };
}

export const listForKey = query({
	args: { keyId: v.id("translationKeys") },
	handler: async (ctx, args) => {
		const key = await ctx.db.get(args.keyId);
		if (!key)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Translation key not found.",
			});
		await requireViewer(ctx, key.projectId);
		return await ctx.db
			.query("translationValues")
			.withIndex("by_key", (q) => q.eq("keyId", args.keyId))
			.collect();
	},
});

export const listForKeys = query({
	args: { keyIds: v.array(v.id("translationKeys")) },
	handler: async (ctx, args) => {
		if (args.keyIds.length === 0) return [];
		const keys = await Promise.all(
			args.keyIds.map((keyId) => ctx.db.get(keyId)),
		);
		const projectId = keys.find((key) => key !== null)?.projectId;
		if (!projectId)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Translation keys not found.",
			});
		if (keys.some((key) => !key || key.projectId !== projectId)) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "All translation keys must belong to the same project.",
			});
		}
		await requireViewer(ctx, projectId);
		const values = await ctx.db
			.query("translationValues")
			.withIndex("by_project", (q) => q.eq("projectId", projectId))
			.collect();
		const keyIds = new Set(args.keyIds);
		return values.filter((value) => keyIds.has(value.keyId));
	},
});

export const listForLocale = query({
	args: {
		projectId: v.id("projects"),
		localeId: v.id("locales"),
		status: v.optional(
			v.union(
				v.literal("missing"),
				v.literal("translated"),
				v.literal("needs_review"),
				v.literal("stale"),
			),
		),
	},
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		if (args.status) {
			const status = args.status;
			return await ctx.db
				.query("translationValues")
				.withIndex("by_project_locale_status", (q) =>
					q
						.eq("projectId", args.projectId)
						.eq("localeId", args.localeId)
						.eq("status", status),
				)
				.collect();
		}
		return await ctx.db
			.query("translationValues")
			.withIndex("by_project_locale", (q) =>
				q.eq("projectId", args.projectId).eq("localeId", args.localeId),
			)
			.collect();
	},
});

export const historyForField = query({
	args: {
		keyId: v.id("translationKeys"),
		localeId: v.id("locales"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const key = await ctx.db.get(args.keyId);
		if (!key)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Translation key not found.",
			});
		await requireViewer(ctx, key.projectId);
		const history = await ctx.db
			.query("translationHistory")
			.withIndex("by_key_locale", (q) =>
				q.eq("keyId", args.keyId).eq("localeId", args.localeId),
			)
			.order("desc")
			.take(args.limit ?? 50);
		return history;
	},
});

export const updateManual = mutation({
	args: {
		keyId: v.id("translationKeys"),
		localeId: v.id("locales"),
		value: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const key = await ctx.db.get(args.keyId);
		if (!key)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Translation key not found.",
			});
		await requireEditor(ctx, key.projectId);
		return await upsertTranslationValue(ctx, {
			projectId: key.projectId,
			keyId: args.keyId,
			localeId: args.localeId,
			value: args.value,
			actor: { kind: "user", id: user.id },
		});
	},
});
