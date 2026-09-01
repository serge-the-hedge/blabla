import { beforeEach, describe, expect, test } from "vitest";
import {
	authenticatedBackend,
	type Backend,
	createBackend,
	createProject,
} from "../test/support";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

describe("change set transaction boundaries", () => {
	let t: Backend;

	beforeEach(() => {
		t = createBackend();
	});

	test("rejects a cross-project metadata target before inserting an item", async () => {
		const user = await authenticatedBackend(t, "owner-a");
		const projectId = await createProject(user);
		const changeSetId = await user.mutation(api.changeSets.createDraft, {
			projectId,
			title: "Tag checkout strings",
		});
		const foreignKeyId = await t.run(async (ctx) => {
			const timestamp = Date.now();
			const foreignProjectId = await ctx.db.insert("projects", {
				name: "Foreign project",
				slug: "foreign-project",
				createdByUserId: "owner-b",
				createdAt: timestamp,
				updatedAt: timestamp,
			});
			return await ctx.db.insert("translationKeys", {
				projectId: foreignProjectId,
				key: "checkout.pay",
				tagIds: [],
				icuType: "plain",
				placeholders: [],
				createdAt: timestamp,
				updatedAt: timestamp,
				searchText: "checkout pay",
			});
		});

		await expect(
			user.mutation(api.changeSets.addItem, {
				changeSetId,
				kind: "key_metadata",
				keyId: foreignKeyId,
				fieldPath: "tags",
				nextValue: JSON.stringify({ tagSlugs: ["checkout"] }),
			}),
		).rejects.toThrow("references must belong to this project");

		const items = await t.run(async (ctx) =>
			ctx.db
				.query("changeSetItems")
				.withIndex("by_changeSet", (q) => q.eq("changeSetId", changeSetId))
				.collect(),
		);
		expect(items).toHaveLength(0);
	});

	test("does not apply pending translations and applies an accepted item atomically", async () => {
		const user = await authenticatedBackend(t, "owner-review");
		const projectId = await createProject(user);
		const { keyId, localeId } = await t.run(async (ctx) => {
			const project = await ctx.db.get(projectId);
			const timestamp = Date.now();
			const keyId = await ctx.db.insert("translationKeys", {
				projectId,
				key: "greeting",
				tagIds: [],
				icuType: "plain",
				placeholders: [],
				createdAt: timestamp,
				updatedAt: timestamp,
				searchText: "greeting",
			});
			return {
				keyId,
				localeId: project?.sourceLocaleId as Id<"locales">,
			};
		});
		const changeSetId = await user.mutation(api.changeSets.createDraft, {
			projectId,
			title: "Update greeting",
		});
		const itemId = await user.mutation(api.changeSets.addItem, {
			changeSetId,
			kind: "translation_value",
			keyId,
			localeId,
			fieldPath: "value",
			nextValue: "Hello",
		});

		await expect(
			user.mutation(api.changeSets.apply, { changeSetId }),
		).rejects.toThrow("Accept or reject every pending item");
		expect(
			await t.run(async (ctx) =>
				ctx.db
					.query("translationValues")
					.withIndex("by_project_key_locale", (q) =>
						q
							.eq("projectId", projectId)
							.eq("keyId", keyId)
							.eq("localeId", localeId),
					)
					.unique(),
			),
		).toBeNull();

		await user.mutation(api.changeSets.acceptItem, { itemId });
		await expect(
			user.mutation(api.changeSets.apply, { changeSetId }),
		).resolves.toEqual({ conflicted: 0 });
		const state = await t.run(async (ctx) => ({
			changeSet: await ctx.db.get(changeSetId),
			value: await ctx.db
				.query("translationValues")
				.withIndex("by_project_key_locale", (q) =>
					q
						.eq("projectId", projectId)
						.eq("keyId", keyId)
						.eq("localeId", localeId),
				)
				.unique(),
		}));
		expect(state.changeSet?.status).toBe("applied");
		expect(state.value).toMatchObject({
			projectId,
			keyId,
			localeId,
			value: "Hello",
			status: "translated",
			version: 1,
		});
	});

	test("keeps existing translations when an import omits overwrite mode", async () => {
		const user = await authenticatedBackend(t, "owner-import");
		const projectId = await createProject(user);
		const { keyId, localeId } = await t.run(async (ctx) => {
			const project = await ctx.db.get(projectId);
			const localeId = project?.sourceLocaleId as Id<"locales">;
			const timestamp = Date.now();
			const keyId = await ctx.db.insert("translationKeys", {
				projectId,
				key: "greeting",
				tagIds: [],
				icuType: "plain",
				placeholders: [],
				createdAt: timestamp,
				updatedAt: timestamp,
				searchText: "greeting",
			});
			await ctx.db.insert("translationValues", {
				projectId,
				keyId,
				localeId,
				value: "Original",
				status: "translated",
				sourceVersion: 1,
				version: 1,
				updatedBy: { kind: "user", id: "owner-import" },
				updatedAt: timestamp,
			});
			return { keyId, localeId };
		});

		const jobId = await user.mutation(api.imports.startJsonImport, {
			projectId,
			localeCode: "en",
			content: JSON.stringify({ greeting: "Replacement" }),
		});
		const state = await t.run(async (ctx) => ({
			job: await ctx.db.get(jobId),
			value: await ctx.db
				.query("translationValues")
				.withIndex("by_project_key_locale", (q) =>
					q
						.eq("projectId", projectId)
						.eq("keyId", keyId)
						.eq("localeId", localeId),
				)
				.unique(),
		}));

		expect(state.job).toMatchObject({
			status: "completed",
			input: { mode: "create_missing" },
			result: { imported: 0 },
		});
		expect(state.value).toMatchObject({ value: "Original", version: 1 });
	});
});
