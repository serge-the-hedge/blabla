import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(
	v.literal("owner"),
	v.literal("editor"),
	v.literal("viewer"),
);
const stringStatus = v.union(
	v.literal("missing"),
	v.literal("translated"),
	v.literal("needs_review"),
	v.literal("stale"),
);
const actor = v.object({
	kind: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
	id: v.string(),
});
const placeholder = v.object({
	name: v.string(),
	type: v.optional(v.string()),
	example: v.optional(v.string()),
});
const changeSetAuthor = v.object({
	kind: v.union(v.literal("user"), v.literal("agent")),
	id: v.string(),
});
const importJobInput = v.object({
	localeCode: v.string(),
	screenSlug: v.optional(v.string()),
	tagSlugs: v.optional(v.array(v.string())),
});
const importJobResult = v.union(
	v.object({ imported: v.number() }),
	v.object({ error: v.string() }),
);
const exportSelection = v.object({
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
const exportJobInput = v.object({
	localeCode: v.string(),
	selection: exportSelection,
});
const exportJobResult = v.object({ content: v.string() });

export default defineSchema({
	projects: defineTable({
		name: v.string(),
		slug: v.string(),
		sourceLocaleId: v.optional(v.id("locales")),
		createdByUserId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
		archivedAt: v.optional(v.number()),
	})
		.index("by_slug", ["slug"])
		.index("by_createdByUserId", ["createdByUserId"])
		.index("by_archivedAt", ["archivedAt"]),

	projectMembers: defineTable({
		projectId: v.id("projects"),
		userId: v.string(),
		role,
		createdAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_user", ["userId"])
		.index("by_project_user", ["projectId", "userId"]),

	locales: defineTable({
		projectId: v.id("projects"),
		code: v.string(),
		label: v.string(),
		isSource: v.boolean(),
		createdAt: v.number(),
		archivedAt: v.optional(v.number()),
	})
		.index("by_project", ["projectId"])
		.index("by_project_code", ["projectId", "code"])
		.index("by_project_source", ["projectId", "isSource"]),

	screens: defineTable({
		projectId: v.id("projects"),
		name: v.string(),
		slug: v.string(),
		description: v.optional(v.string()),
		createdAt: v.number(),
		archivedAt: v.optional(v.number()),
	})
		.index("by_project", ["projectId"])
		.index("by_project_slug", ["projectId", "slug"]),

	tags: defineTable({
		projectId: v.id("projects"),
		name: v.string(),
		slug: v.string(),
		color: v.optional(v.string()),
		createdAt: v.number(),
		archivedAt: v.optional(v.number()),
	})
		.index("by_project", ["projectId"])
		.index("by_project_slug", ["projectId", "slug"]),

	translationKeys: defineTable({
		projectId: v.id("projects"),
		key: v.string(),
		description: v.optional(v.string()),
		screenId: v.optional(v.id("screens")),
		tagIds: v.array(v.id("tags")),
		icuType: v.union(v.literal("plain"), v.literal("icu")),
		placeholders: v.array(placeholder),
		createdAt: v.number(),
		updatedAt: v.number(),
		archivedAt: v.optional(v.number()),
		searchText: v.string(),
	})
		.index("by_project", ["projectId"])
		.index("by_project_key", ["projectId", "key"])
		.index("by_project_screen", ["projectId", "screenId"])
		.index("by_project_archivedAt", ["projectId", "archivedAt"])
		.searchIndex("searchText", {
			searchField: "searchText",
			filterFields: ["projectId"],
		}),

	translationValues: defineTable({
		projectId: v.id("projects"),
		keyId: v.id("translationKeys"),
		localeId: v.id("locales"),
		value: v.string(),
		status: stringStatus,
		sourceVersion: v.number(),
		version: v.number(),
		updatedBy: actor,
		updatedAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_key", ["keyId"])
		.index("by_locale", ["localeId"])
		.index("by_project_locale", ["projectId", "localeId"])
		.index("by_project_locale_status", ["projectId", "localeId", "status"])
		.index("by_project_key_locale", ["projectId", "keyId", "localeId"]),

	translationHistory: defineTable({
		projectId: v.id("projects"),
		keyId: v.id("translationKeys"),
		localeId: v.id("locales"),
		previousValue: v.union(v.string(), v.null()),
		nextValue: v.string(),
		previousStatus: v.union(stringStatus, v.null()),
		nextStatus: stringStatus,
		previousVersion: v.union(v.number(), v.null()),
		nextVersion: v.number(),
		changedBy: actor,
		changeSetId: v.optional(v.id("changeSets")),
		createdAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_key_locale", ["keyId", "localeId"])
		.index("by_changeSet", ["changeSetId"])
		.index("by_createdAt", ["createdAt"]),

	apiTokens: defineTable({
		projectId: v.id("projects"),
		name: v.string(),
		tokenHash: v.string(),
		scopes: v.array(
			v.union(
				v.literal("read"),
				v.literal("search"),
				v.literal("propose"),
				v.literal("export"),
			),
		),
		createdByUserId: v.string(),
		createdAt: v.number(),
		lastUsedAt: v.optional(v.number()),
		revokedAt: v.optional(v.number()),
	})
		.index("by_project", ["projectId"])
		.index("by_tokenHash", ["tokenHash"])
		.index("by_revokedAt", ["revokedAt"]),

	changeSets: defineTable({
		projectId: v.id("projects"),
		title: v.string(),
		description: v.optional(v.string()),
		author: changeSetAuthor,
		authorKind: v.union(v.literal("user"), v.literal("agent")),
		authorId: v.string(),
		status: v.union(
			v.literal("draft"),
			v.literal("open"),
			v.literal("approved"),
			v.literal("rejected"),
			v.literal("applied"),
		),
		baseSnapshotVersion: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
		openedAt: v.optional(v.number()),
		reviewedAt: v.optional(v.number()),
		appliedAt: v.optional(v.number()),
		reviewedByUserId: v.optional(v.string()),
		summary: v.object({
			filesChanged: v.number(),
			fieldsChanged: v.number(),
			additions: v.number(),
			deletions: v.number(),
		}),
	})
		.index("by_project", ["projectId"])
		.index("by_project_status", ["projectId", "status"])
		.index("by_author", ["authorKind", "authorId"])
		.index("by_updatedAt", ["updatedAt"]),

	changeSetItems: defineTable({
		projectId: v.id("projects"),
		changeSetId: v.id("changeSets"),
		kind: v.union(
			v.literal("translation_value"),
			v.literal("key_metadata"),
			v.literal("locale_create"),
			v.literal("locale_archive"),
			v.literal("key_create"),
			v.literal("key_archive"),
		),
		keyId: v.optional(v.id("translationKeys")),
		localeId: v.optional(v.id("locales")),
		fieldPath: v.string(),
		previousValue: v.union(v.string(), v.null()),
		nextValue: v.union(v.string(), v.null()),
		originalNextValue: v.optional(v.string()),
		baseVersion: v.optional(v.number()),
		status: v.union(
			v.literal("pending"),
			v.literal("accepted"),
			v.literal("rejected"),
			v.literal("conflicted"),
		),
		createdAt: v.number(),
	})
		.index("by_changeSet", ["changeSetId"])
		.index("by_key", ["keyId"])
		.index("by_locale", ["localeId"])
		.index("by_status", ["status"]),

	importJobs: defineTable({
		projectId: v.id("projects"),
		workflowId: v.optional(v.string()),
		kind: v.union(v.literal("json"), v.literal("arb")),
		status: v.union(
			v.literal("queued"),
			v.literal("running"),
			v.literal("completed"),
			v.literal("failed"),
		),
		input: importJobInput,
		result: v.optional(importJobResult),
		createdBy: actor,
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_status", ["status"]),

	exportJobs: defineTable({
		projectId: v.id("projects"),
		workflowId: v.optional(v.string()),
		kind: v.union(v.literal("json"), v.literal("arb")),
		status: v.union(
			v.literal("queued"),
			v.literal("running"),
			v.literal("completed"),
			v.literal("failed"),
		),
		input: exportJobInput,
		result: v.optional(exportJobResult),
		createdBy: actor,
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_status", ["status"]),
});
