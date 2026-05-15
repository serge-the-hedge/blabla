import { ConvexError, v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { hashToken } from "./apiTokens";
import { summarizeItems } from "./diffs";
import { buildExportContent } from "./exports";
import { buildReviewUrl } from "./lib";

const scopeValidator = v.union(
	v.literal("read"),
	v.literal("search"),
	v.literal("propose"),
	v.literal("export"),
);

async function authenticate(
	ctx: any,
	rawToken: string,
	scope: "read" | "search" | "propose" | "export",
) {
	const token = await ctx.db
		.query("apiTokens")
		.withIndex("by_tokenHash", (q: any) =>
			q.eq("tokenHash", hashToken(rawToken)),
		)
		.unique();
	if (
		!token ||
		token.revokedAt !== undefined ||
		!token.scopes.includes(scope)
	) {
		throw new ConvexError({
			code: "UNAUTHORIZED",
			message: "Invalid or insufficient API token.",
		});
	}
	return token;
}

export const authenticateToken = internalQuery({
	args: { token: v.string(), scope: scopeValidator },
	handler: async (ctx, args) => await authenticate(ctx, args.token, args.scope),
});

export const touchToken = internalMutation({
	args: { tokenId: v.id("apiTokens") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.tokenId, { lastUsedAt: Date.now() });
		return null;
	},
});

export const currentProject = internalQuery({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "read");
		const project = (await ctx.db.get(token.projectId)) as any;
		if (!project)
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Project not found.",
			});
		const sourceLocale = project.sourceLocaleId
			? ((await ctx.db.get(project.sourceLocaleId)) as any)
			: null;
		const locales = await ctx.db
			.query("locales")
			.withIndex("by_project", (q) => q.eq("projectId", token.projectId))
			.collect();
		const screens = await ctx.db
			.query("screens")
			.withIndex("by_project", (q) => q.eq("projectId", token.projectId))
			.collect();
		const tags = await ctx.db
			.query("tags")
			.withIndex("by_project", (q) => q.eq("projectId", token.projectId))
			.collect();
		return {
			projectId: token.projectId,
			name: project.name,
			sourceLocale: sourceLocale?.code ?? null,
			locales: locales
				.filter((locale) => locale.archivedAt === undefined)
				.map((locale) => locale.code),
			screens: screens
				.filter((screen) => screen.archivedAt === undefined)
				.map((screen) => ({ id: screen._id, slug: screen.slug })),
			tags: tags
				.filter((tag) => tag.archivedAt === undefined)
				.map((tag) => ({ id: tag._id, slug: tag.slug })),
		};
	},
});

export const searchStrings = internalQuery({
	args: {
		token: v.string(),
		q: v.optional(v.string()),
		locale: v.optional(v.string()),
		screen: v.optional(v.string()),
		tag: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("missing"),
				v.literal("translated"),
				v.literal("needs_review"),
				v.literal("stale"),
			),
		),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "search");
		const locale = args.locale
			? await ctx.db
					.query("locales")
					.withIndex("by_project_code", (q) =>
						q.eq("projectId", token.projectId).eq("code", args.locale!),
					)
					.unique()
			: null;
		const screen = args.screen
			? await ctx.db
					.query("screens")
					.withIndex("by_project_slug", (q) =>
						q.eq("projectId", token.projectId).eq("slug", args.screen!),
					)
					.unique()
			: null;
		const tag = args.tag
			? await ctx.db
					.query("tags")
					.withIndex("by_project_slug", (q) =>
						q.eq("projectId", token.projectId).eq("slug", args.tag!),
					)
					.unique()
			: null;
		const keys =
			args.q && args.q.trim().length > 0
				? await ctx.db
						.query("translationKeys")
						.withSearchIndex("searchText", (q) =>
							q.search("searchText", args.q!).eq("projectId", token.projectId),
						)
						.take(args.limit ?? 25)
				: await ctx.db
						.query("translationKeys")
						.withIndex("by_project", (q) => q.eq("projectId", token.projectId))
						.take(args.limit ?? 25);
		const values = locale
			? await ctx.db
					.query("translationValues")
					.withIndex("by_locale", (q) => q.eq("localeId", locale._id))
					.collect()
			: [];
		const sourceValues = await ctx.db
			.query("translationValues")
			.withIndex("by_project", (q) => q.eq("projectId", token.projectId))
			.collect();
		const project = (await ctx.db.get(token.projectId)) as any;
		const valuesByKey = new Map(values.map((value) => [value.keyId, value]));
		const sourceByKey = new Map(
			sourceValues
				.filter((value) => value.localeId === project?.sourceLocaleId)
				.map((value) => [value.keyId, value]),
		);
		return keys
			.filter((key) => key.archivedAt === undefined)
			.filter((key) => (screen ? key.screenId === screen._id : true))
			.filter((key) => (tag ? key.tagIds.includes(tag._id) : true))
			.map((key) => {
				const target = valuesByKey.get(key._id);
				return {
					key: key.key,
					screen: screen?.slug ?? null,
					tags: tag ? [tag.slug] : [],
					source: sourceByKey.get(key._id)?.value ?? "",
					target: target?.value ?? "",
					locale: locale?.code ?? null,
					status: target?.status ?? "missing",
					version: target?.version ?? 0,
				};
			})
			.filter((row) => (args.status ? row.status === args.status : true));
	},
});

export const getContext = internalQuery({
	args: {
		token: v.string(),
		keys: v.array(v.string()),
		locales: v.array(v.string()),
		includeHistory: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "read");
		const keys = await Promise.all(
			args.keys.map((key) =>
				ctx.db
					.query("translationKeys")
					.withIndex("by_project_key", (q: any) =>
						q.eq("projectId", token.projectId).eq("key", key),
					)
					.unique(),
			),
		);
		const locales = await Promise.all(
			args.locales.map((code) =>
				ctx.db
					.query("locales")
					.withIndex("by_project_code", (q: any) =>
						q.eq("projectId", token.projectId).eq("code", code),
					)
					.unique(),
			),
		);
		const rows = [];
		for (const key of keys.filter(Boolean) as any[]) {
			for (const locale of locales.filter(Boolean) as any[]) {
				const value = await ctx.db
					.query("translationValues")
					.withIndex("by_project_key_locale", (q: any) =>
						q
							.eq("projectId", token.projectId)
							.eq("keyId", key._id)
							.eq("localeId", locale._id),
					)
					.unique();
				const history = args.includeHistory
					? await ctx.db
							.query("translationHistory")
							.withIndex("by_key_locale", (q: any) =>
								q.eq("keyId", key._id).eq("localeId", locale._id),
							)
							.order("desc")
							.take(3)
					: [];
				rows.push({ key, locale, value, history });
			}
		}
		return { rows };
	},
});

export const createChangeSetFromKeys = internalMutation({
	args: {
		token: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		items: v.array(
			v.object({
				key: v.string(),
				locale: v.string(),
				baseVersion: v.optional(v.number()),
				nextValue: v.string(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "propose");
		const resolvedItems = [];
		for (const item of args.items) {
			const key = await ctx.db
				.query("translationKeys")
				.withIndex("by_project_key", (q) =>
					q.eq("projectId", token.projectId).eq("key", item.key),
				)
				.unique();
			const locale = await ctx.db
				.query("locales")
				.withIndex("by_project_code", (q) =>
					q.eq("projectId", token.projectId).eq("code", item.locale),
				)
				.unique();
			if (!key || !locale) continue;
			resolvedItems.push({
				keyId: key._id,
				localeId: locale._id,
				fieldPath: `locales/${locale.code}/${key.key}.json`,
				nextValue: item.nextValue,
				baseVersion: item.baseVersion,
			});
		}
		const changeSetId = await ctx.db.insert("changeSets", {
			projectId: token.projectId,
			title: args.title,
			description: args.description,
			author: { kind: "agent", id: token._id },
			authorKind: "agent",
			authorId: token._id,
			status: "open",
			baseSnapshotVersion: Date.now(),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			openedAt: Date.now(),
			summary: {
				filesChanged: 0,
				fieldsChanged: 0,
				additions: 0,
				deletions: 0,
			},
		});
		const createdItems = [];
		let conflicts = 0;
		for (const item of resolvedItems) {
			const liveValue = await ctx.db
				.query("translationValues")
				.withIndex("by_project_key_locale", (q: any) =>
					q
						.eq("projectId", token.projectId)
						.eq("keyId", item.keyId)
						.eq("localeId", item.localeId),
				)
				.unique();
			const status: "pending" | "conflicted" =
				item.baseVersion !== undefined &&
				liveValue !== null &&
				liveValue.version !== item.baseVersion
					? "conflicted"
					: "pending";
			if (status === "conflicted") conflicts += 1;
			const created = {
				projectId: token.projectId,
				changeSetId,
				kind: "translation_value" as const,
				keyId: item.keyId,
				localeId: item.localeId,
				fieldPath: item.fieldPath,
				previousValue: liveValue?.value ?? null,
				nextValue: item.nextValue,
				baseVersion: item.baseVersion,
				status,
				createdAt: Date.now(),
			};
			await ctx.db.insert("changeSetItems", created);
			createdItems.push(created);
		}
		await ctx.db.patch(changeSetId, {
			summary: summarizeItems(createdItems),
			updatedAt: Date.now(),
		});
		return { changeSetId, conflicts };
	},
});

export const getChangeSet = internalQuery({
	args: { token: v.string(), changeSetId: v.id("changeSets") },
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "read");
		const changeSet = await ctx.db.get(args.changeSetId);
		if (!changeSet || changeSet.projectId !== token.projectId) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Change set not found.",
			});
		}
		const items = await ctx.db
			.query("changeSetItems")
			.withIndex("by_changeSet", (q) => q.eq("changeSetId", args.changeSetId))
			.collect();
		return {
			...changeSet,
			items,
			reviewUrl: buildReviewUrl(token.projectId, args.changeSetId),
		};
	},
});

export const exportContent = internalQuery({
	args: {
		token: v.string(),
		format: v.union(v.literal("json"), v.literal("arb")),
		locale: v.string(),
		selection: v.object({
			type: v.union(
				v.literal("all"),
				v.literal("keys"),
				v.literal("tag"),
				v.literal("screen"),
			),
			keys: v.optional(v.array(v.string())),
			tag: v.optional(v.string()),
			screen: v.optional(v.string()),
		}),
	},
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "export");
		const content = await buildExportContent(ctx, {
			projectId: token.projectId,
			localeCode: args.locale,
			format: args.format,
			selection: args.selection,
		});
		return { content };
	},
});
