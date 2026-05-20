import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";
import { makeSearchText, normalizeLocaleCode, now, slugify } from "./lib";
import { requireEditor, requireViewer } from "./permissions";
import { upsertTranslationValue } from "./values";

type FlatMessages = Record<string, string>;

function flattenJson(value: unknown, prefix = ""): FlatMessages {
	if (typeof value === "string") return { [prefix]: value };
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.entries(value as Record<string, unknown>).reduce<FlatMessages>(
		(acc, [key, child]) => {
			const nextPrefix = prefix ? `${prefix}.${key}` : key;
			return { ...acc, ...flattenJson(child, nextPrefix) };
		},
		{},
	);
}

function parseArb(content: string) {
	const parsed = JSON.parse(content) as Record<string, unknown>;
	const messages: FlatMessages = {};
	const metadata = new Map<
		string,
		{ description?: string; placeholders?: unknown }
	>();
	for (const [key, value] of Object.entries(parsed)) {
		if (key.startsWith("@@")) continue;
		if (key.startsWith("@")) {
			const messageKey = key.slice(1);
			const meta = value as { description?: string; placeholders?: unknown };
			metadata.set(messageKey, {
				description: meta.description,
				placeholders: meta.placeholders,
			});
		} else if (typeof value === "string") {
			messages[key] = value;
		}
	}
	return { messages, metadata };
}

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

async function findOrCreateScreen(
	ctx: any,
	projectId: Id<"projects">,
	screenSlug?: string,
) {
	if (!screenSlug) return undefined;
	const slug = slugify(screenSlug);
	if (!slug) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "Screen slug is required.",
		});
	}
	const existing = await ctx.db
		.query("screens")
		.withIndex("by_project_slug", (q: any) =>
			q.eq("projectId", projectId).eq("slug", slug),
		)
		.unique();
	if (existing) return existing._id;
	return await ctx.db.insert("screens", {
		projectId,
		name: screenSlug,
		slug,
		createdAt: now(),
	});
}

async function findOrCreateTags(
	ctx: any,
	projectId: Id<"projects">,
	tagSlugs?: string[],
) {
	const tagIds: Id<"tags">[] = [];
	for (const rawSlug of tagSlugs ?? []) {
		const slug = slugify(rawSlug);
		if (!slug) continue;
		const existing = await ctx.db
			.query("tags")
			.withIndex("by_project_slug", (q: any) =>
				q.eq("projectId", projectId).eq("slug", slug),
			)
			.unique();
		if (existing) {
			tagIds.push(existing._id);
		} else {
			tagIds.push(
				await ctx.db.insert("tags", {
					projectId,
					name: rawSlug,
					slug,
					createdAt: now(),
				}),
			);
		}
	}
	return tagIds;
}

async function importMessages(
	ctx: any,
	args: {
		projectId: Id<"projects">;
		localeCode: string;
		messages: FlatMessages;
		metadata?: Map<string, { description?: string; placeholders?: unknown }>;
		screenSlug?: string;
		tagSlugs?: string[];
		mode: "create_missing" | "upsert";
		actorId: string;
	},
) {
	const localeCode = normalizeLocaleCode(args.localeCode);
	const locale = await findLocale(ctx, args.projectId, localeCode);
	const screenId = await findOrCreateScreen(
		ctx,
		args.projectId,
		args.screenSlug,
	);
	const tagIds = await findOrCreateTags(ctx, args.projectId, args.tagSlugs);
	let imported = 0;
	for (const [messageKey, value] of Object.entries(args.messages)) {
		const existing = await ctx.db
			.query("translationKeys")
			.withIndex("by_project_key", (q: any) =>
				q.eq("projectId", args.projectId).eq("key", messageKey),
			)
			.unique();
		const meta = args.metadata?.get(messageKey);
		const placeholders =
			meta?.placeholders && typeof meta.placeholders === "object"
				? Object.keys(meta.placeholders as Record<string, unknown>).map(
						(name) => ({ name }),
					)
				: [];
		const keyId =
			existing?._id ??
			(await ctx.db.insert("translationKeys", {
				projectId: args.projectId,
				key: messageKey,
				description: meta?.description,
				screenId,
				tagIds,
				icuType: value.includes("{") && value.includes("}") ? "icu" : "plain",
				placeholders,
				createdAt: now(),
				updatedAt: now(),
				searchText: makeSearchText({
					key: messageKey,
					description: meta?.description,
					tags: await Promise.all(
						tagIds.map((tagId) => ctx.db.get(tagId)),
					).then((tags) =>
						tags.filter((tag): tag is NonNullable<typeof tag> => tag !== null),
					),
				}),
			}));
		if (existing && tagIds.length > 0) {
			const nextTagIds = Array.from(new Set([...existing.tagIds, ...tagIds]));
			await ctx.db.patch(existing._id, {
				tagIds: nextTagIds,
				updatedAt: now(),
				searchText: makeSearchText({
					key: existing.key,
					description: existing.description,
					tags: await Promise.all(
						nextTagIds.map((tagId) => ctx.db.get(tagId)),
					).then((tags) => tags.filter(Boolean)),
				}),
			});
		}
		if (existing && args.mode === "create_missing") {
			const liveValue = await ctx.db
				.query("translationValues")
				.withIndex("by_project_key_locale", (q: any) =>
					q
						.eq("projectId", args.projectId)
						.eq("keyId", keyId)
						.eq("localeId", locale._id),
				)
				.unique();
			if (liveValue) continue;
		}
		await upsertTranslationValue(ctx, {
			projectId: args.projectId,
			keyId,
			localeId: locale._id,
			value,
			actor: { kind: "user", id: args.actorId },
		});
		imported += 1;
	}
	return imported;
}

export const getJob = query({
	args: { jobId: v.id("importJobs") },
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Import job not found.",
			});
		await requireViewer(ctx, job.projectId);
		return job;
	},
});

export const startJsonImport = mutation({
	args: {
		projectId: v.id("projects"),
		localeCode: v.string(),
		content: v.string(),
		screenSlug: v.optional(v.string()),
		tagSlugs: v.optional(v.array(v.string())),
		mode: v.optional(v.union(v.literal("create_missing"), v.literal("upsert"))),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireEditor(ctx, args.projectId);
		const jobId = await ctx.db.insert("importJobs", {
			projectId: args.projectId,
			kind: "json",
			status: "running",
			input: {
				localeCode: args.localeCode,
				screenSlug: args.screenSlug,
				tagSlugs: args.tagSlugs,
			},
			createdBy: { kind: "user", id: user.id },
			createdAt: now(),
			updatedAt: now(),
		});
		try {
			const imported = await importMessages(ctx, {
				projectId: args.projectId,
				localeCode: args.localeCode,
				messages: flattenJson(JSON.parse(args.content)),
				screenSlug: args.screenSlug,
				tagSlugs: args.tagSlugs,
				mode: args.mode ?? "upsert",
				actorId: user.id,
			});
			await ctx.db.patch(jobId, {
				status: "completed",
				result: { imported },
				updatedAt: now(),
			});
		} catch (error) {
			await ctx.db.patch(jobId, {
				status: "failed",
				result: {
					error: error instanceof Error ? error.message : "Import failed.",
				},
				updatedAt: now(),
			});
		}
		return jobId;
	},
});

export const startArbImport = mutation({
	args: {
		projectId: v.id("projects"),
		localeCode: v.string(),
		content: v.string(),
		screenSlug: v.optional(v.string()),
		tagSlugs: v.optional(v.array(v.string())),
		mode: v.optional(v.union(v.literal("create_missing"), v.literal("upsert"))),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireEditor(ctx, args.projectId);
		const jobId = await ctx.db.insert("importJobs", {
			projectId: args.projectId,
			kind: "arb",
			status: "running",
			input: {
				localeCode: args.localeCode,
				screenSlug: args.screenSlug,
				tagSlugs: args.tagSlugs,
			},
			createdBy: { kind: "user", id: user.id },
			createdAt: now(),
			updatedAt: now(),
		});
		try {
			const parsed = parseArb(args.content);
			const imported = await importMessages(ctx, {
				projectId: args.projectId,
				localeCode: args.localeCode,
				messages: parsed.messages,
				metadata: parsed.metadata,
				screenSlug: args.screenSlug,
				tagSlugs: args.tagSlugs,
				mode: args.mode ?? "upsert",
				actorId: user.id,
			});
			await ctx.db.patch(jobId, {
				status: "completed",
				result: { imported },
				updatedAt: now(),
			});
		} catch (error) {
			await ctx.db.patch(jobId, {
				status: "failed",
				result: {
					error: error instanceof Error ? error.message : "Import failed.",
				},
				updatedAt: now(),
			});
		}
		return jobId;
	},
});
