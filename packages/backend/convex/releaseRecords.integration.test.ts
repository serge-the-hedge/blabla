import { beforeEach, describe, expect, test } from "vitest";

import {
	authenticatedBackend,
	type Backend,
	createBackend,
	createProject,
	readWorkspaceKeyCards,
} from "../test/support";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

let t: Backend;

beforeEach(() => {
	t = createBackend();
});

async function createCatalog(
	user: Awaited<ReturnType<typeof authenticatedBackend>>,
	slug = "primary-project",
) {
	const projectId = await createProject(user, { slug });
	const locales = await user.query(api.locales.list, { projectId });
	const source = locales.find((locale) => locale.code === "en");
	if (!source) throw new Error("Expected the Source Locale.");
	const targetId = await user.mutation(api.locales.create, {
		projectId,
		code: "de",
	});
	await user.mutation(api.locales.bind, {
		localeId: source._id,
		catalogPath: "en.arb",
	});
	await user.mutation(api.locales.bind, {
		localeId: targetId,
		catalogPath: "de.arb",
	});
	await user.action(api.snapshots.ingest, {
		projectId,
		repository: "repo",
		commit: "baseline",
		files: [
			{
				catalogPath: "en.arb",
				content: '{"@@locale":"en","greeting":"Hello"}',
			},
			{
				catalogPath: "de.arb",
				content: '{"@@locale":"de","greeting":"Hallo"}',
			},
		],
	});
	return { projectId, targetId };
}

async function createThreeLocaleCatalog(
	user: Awaited<ReturnType<typeof authenticatedBackend>>,
	germanValue: string | null,
) {
	const projectId = await createProject(user);
	const locales = await user.query(api.locales.list, { projectId });
	const source = locales.find((locale) => locale.code === "en");
	if (!source) throw new Error("Expected the Source Locale.");
	const targetIds = await Promise.all(
		["de", "fr"].map((code) =>
			user.mutation(api.locales.create, { projectId, code }),
		),
	);
	const [germanId, frenchId] = targetIds;
	if (!germanId || !frenchId) throw new Error("Expected target Locales.");
	await Promise.all([
		user.mutation(api.locales.bind, {
			localeId: source._id,
			catalogPath: "en.arb",
		}),
		user.mutation(api.locales.bind, {
			localeId: germanId,
			catalogPath: "de.arb",
		}),
		user.mutation(api.locales.bind, {
			localeId: frenchId,
			catalogPath: "fr.arb",
		}),
	]);
	const germanEntry =
		germanValue === null ? "" : `,"greeting":${JSON.stringify(germanValue)}`;
	await user.action(api.snapshots.ingest, {
		projectId,
		repository: "repo",
		commit: "baseline",
		files: [
			{
				catalogPath: "en.arb",
				content:
					'{"@@locale":"en","greeting":"Hello {name}","@greeting":{"placeholders":{"name":{"type":"String"}}}}',
			},
			{
				catalogPath: "de.arb",
				content: `{"@@locale":"de"${germanEntry}}`,
			},
			{
				catalogPath: "fr.arb",
				content: '{"@@locale":"fr","greeting":"Bonjour {name}"}',
			},
		],
	});
	return { projectId, germanId, frenchId };
}

async function targetTokens(
	user: Awaited<ReturnType<typeof authenticatedBackend>>,
	projectId: Id<"projects">,
	targetId: Id<"locales">,
) {
	const workspace = await readWorkspaceKeyCards(user, projectId);
	const target = workspace.keys[0]?.values.find(
		(value) => !value.isSource && value.localeId === targetId,
	);
	if (!target) throw new Error("Expected the target value.");
	return target as typeof target & {
		gitValueFingerprint: string;
		gitValueRevision: number;
		workspaceRevision: number;
		expectedSourceFingerprint: string;
	};
}

async function save(
	user: Awaited<ReturnType<typeof authenticatedBackend>>,
	projectId: Id<"projects">,
	targetId: Id<"locales">,
	value: string,
) {
	const target = await targetTokens(user, projectId, targetId);
	await user.mutation(api.catalogWorkspace.commit, {
		projectId,
		messageId: "greeting",
		localeId: targetId,
		intent: { kind: "save", value },
		expectedGitValueFingerprint: target.gitValueFingerprint,
		expectedGitValueRevision: target.gitValueRevision,
		expectedWorkspaceRevision: target.workspaceRevision,
		expectedSourceFingerprint: target.expectedSourceFingerprint,
	});
}

async function prepareAndFinish(
	user: Awaited<ReturnType<typeof authenticatedBackend>>,
	projectId: Id<"projects">,
) {
	const started = await user.mutation(api.releaseRecords.prepare, {
		projectId,
	});
	let result = started;
	for (let step = 0; result.status === "preparing" && step < 10; step++) {
		const next = await t.mutation(internal.releaseRecords.processStep, {
			recordId: started.recordId,
		});
		if (!next)
			throw new Error("Expected the Release Record to remain readable.");
		result = next;
	}
	if (result.status === "preparing") {
		throw new Error("Release Record did not reach a terminal state.");
	}
	return result;
}

describe("Release Records", () => {
	test("requires a Baseline and a complete Navigation Index", async () => {
		const user = await authenticatedBackend(t, "release-basis");
		const projectId = await createProject(user);

		await expect(
			user.query(api.releaseRecords.current, { projectId }),
		).resolves.toEqual({ kind: "noBaseline" });
		await expect(
			user.mutation(api.releaseRecords.prepare, { projectId }),
		).rejects.toThrow("accepted Baseline Catalog");

		const navigationUser = await authenticatedBackend(
			t,
			"release-navigation-basis",
		);
		const catalog = await createCatalog(
			navigationUser,
			"release-navigation-project",
		);
		await t.run(async (ctx) => {
			const state = await ctx.db
				.query("catalogWorkspaceNavigationStates")
				.withIndex("by_project", (q) => q.eq("projectId", catalog.projectId))
				.unique();
			if (!state) throw new Error("Expected the Navigation Index state.");
			await ctx.db.patch(state._id, { status: "staging" });
		});

		await expect(
			navigationUser.query(api.releaseRecords.current, {
				projectId: catalog.projectId,
			}),
		).resolves.toMatchObject({ kind: "available", canPrepare: false });
		await expect(
			navigationUser.mutation(api.releaseRecords.prepare, {
				projectId: catalog.projectId,
			}),
		).rejects.toThrow("Navigation Index backfill completes");
	});

	test("prepares one reusable durable Ready record with deliberate evidence", async () => {
		const user = await authenticatedBackend(t, "release-ready");
		const { projectId, targetId } = await createCatalog(user);
		await save(user, projectId, targetId, "Hello");

		const started = await user.mutation(api.releaseRecords.prepare, {
			projectId,
		});
		expect(started.status).toBe("preparing");
		await t.mutation(internal.releaseRecords.processStep, {
			recordId: started.recordId,
		});
		await t.run(async (ctx) => {
			const durable = await ctx.db.get(started.recordId);
			const preparation = await ctx.db
				.query("releaseRecordPreparations")
				.withIndex("by_recordId", (q) => q.eq("recordId", started.recordId))
				.unique();
			expect(durable).toMatchObject({
				status: "preparing",
				deltaKeyCount: 0,
				scopeValueCount: 0,
			});
			expect(durable).not.toHaveProperty("cursor");
			expect(durable).not.toHaveProperty("stepPending");
			expect(preparation).toMatchObject({
				cursor: 0,
				deltaKeyCount: 1,
				scopeValueCount: 1,
			});
		});
		const stagingHandoff = await user.query(api.releaseRecords.handoff, {
			recordId: started.recordId,
		});
		expect(stagingHandoff).toEqual({
			recordId: started.recordId,
			status: "staging",
			keys: [],
		});
		const completed = await t.mutation(internal.releaseRecords.processStep, {
			recordId: started.recordId,
		});

		expect(completed).toMatchObject({
			status: "ready",
			posture: "ready",
			deltaKeyCount: 1,
			scopeValueCount: 1,
			sourceIdenticalCount: 1,
		});
		await t.run(async (ctx) => {
			const durable = await ctx.db.get(started.recordId);
			const preparation = await ctx.db
				.query("releaseRecordPreparations")
				.withIndex("by_recordId", (q) => q.eq("recordId", started.recordId))
				.unique();
			expect(durable).toMatchObject({
				status: "ready",
				deltaKeyCount: 1,
				scopeValueCount: 1,
			});
			expect(preparation).toBeNull();
		});
		const details = await user.query(api.releaseRecords.details, {
			recordId: started.recordId,
			findingCursor: -1,
			evidenceCursor: -1,
			limit: 10,
		});
		expect(details.findings).toEqual([]);
		expect(details.evidence).toMatchObject([
			{ messageId: "greeting", localeCode: "de", kind: "source_identical" },
		]);
		const handoff = await user.query(api.releaseRecords.handoff, {
			recordId: started.recordId,
		});
		expect(handoff).toMatchObject({ status: "published", keys: [] });
		const reused = await user.mutation(api.releaseRecords.prepare, {
			projectId,
		});
		expect(reused.recordId).toBe(started.recordId);
	});

	test("supersedes preparation when the Workspace revision advances", async () => {
		const user = await authenticatedBackend(t, "release-race");
		const { projectId, targetId } = await createCatalog(user);
		await save(user, projectId, targetId, "Hello");
		const started = await user.mutation(api.releaseRecords.prepare, {
			projectId,
		});
		await t.mutation(internal.releaseRecords.processStep, {
			recordId: started.recordId,
		});
		await t.run(async (ctx) => {
			const stagedEvidence = await ctx.db
				.query("releaseEvidence")
				.withIndex("by_record", (q) => q.eq("recordId", started.recordId))
				.collect();
			expect(stagedEvidence).toHaveLength(1);
		});
		await expect(
			user.query(api.releaseRecords.evidence, {
				recordId: started.recordId,
				paginationOpts: { cursor: null, numItems: 10 },
			}),
		).rejects.toThrow("has not been published");

		await save(user, projectId, targetId, "Hallo wieder");
		const result = await t.mutation(internal.releaseRecords.processStep, {
			recordId: started.recordId,
		});

		expect(result?.status).toBe("superseded");
		await expect(
			user.query(api.releaseRecords.details, {
				recordId: started.recordId,
				findingCursor: -1,
				evidenceCursor: -1,
				limit: 10,
			}),
		).rejects.toThrow("has not been published");
	});

	test("blocks a delta key whose current target still violates the Source Contract", async () => {
		const user = await authenticatedBackend(t, "release-blocked");
		const { projectId, frenchId } = await createThreeLocaleCatalog(
			user,
			"Hallo {other}",
		);
		await save(user, projectId, frenchId, "Salut {name}");
		const started = await user.mutation(api.releaseRecords.prepare, {
			projectId,
		});
		await t.mutation(internal.releaseRecords.processStep, {
			recordId: started.recordId,
		});
		const stagingHandoff = await user.query(api.releaseRecords.handoff, {
			recordId: started.recordId,
		});
		expect(stagingHandoff.keys).toEqual([]);
		const completed = await t.mutation(internal.releaseRecords.processStep, {
			recordId: started.recordId,
		});

		expect(completed).toMatchObject({
			status: "ready",
			posture: "blocked",
			blockedCount: 1,
		});
		const handoff = await user.query(api.releaseRecords.handoff, {
			recordId: started.recordId,
		});
		expect(handoff.keys).toEqual([{ catalogIndex: 0, messageId: "greeting" }]);
	});

	test("needs a decision for a missing scoped target while unconfirmed imports stay non-gating", async () => {
		const user = await authenticatedBackend(t, "release-decisions");
		const { projectId, frenchId } = await createThreeLocaleCatalog(user, null);
		await save(user, projectId, frenchId, "Salut {name}");
		const started = await user.mutation(api.releaseRecords.prepare, {
			projectId,
		});
		await t.mutation(internal.releaseRecords.processStep, {
			recordId: started.recordId,
		});
		const completed = await t.mutation(internal.releaseRecords.processStep, {
			recordId: started.recordId,
		});

		expect(completed).toMatchObject({
			status: "ready",
			posture: "needsDecisions",
			needsDecisionCount: 1,
		});
	});

	test("pages complete finding and evidence key groups", async () => {
		const user = await authenticatedBackend(t, "release-details");
		const { projectId, targetId } = await createCatalog(user);
		await save(user, projectId, targetId, "Hello");
		const record = await prepareAndFinish(user, projectId);

		await t.run(async (ctx) => {
			const oldEvidence = await ctx.db
				.query("releaseEvidence")
				.withIndex("by_record", (q) => q.eq("recordId", record.recordId))
				.collect();
			for (const evidence of oldEvidence) await ctx.db.delete(evidence._id);
			for (const [catalogIndex, suffix] of [
				[1, "a"],
				[1, "b"],
				[2, "c"],
			] as const) {
				await ctx.db.insert("releaseFindings", {
					projectId,
					recordId: record.recordId,
					catalogIndex,
					messageId: `finding_${suffix}`,
					localeId: targetId,
					localeCode: "de",
					kind: "missing_value",
				});
				await ctx.db.insert("releaseEvidence", {
					projectId,
					recordId: record.recordId,
					catalogIndex,
					messageId: `evidence_${suffix}`,
					localeId: targetId,
					localeCode: "de",
					kind: "source_identical",
				});
			}
		});

		const first = await user.query(api.releaseRecords.details, {
			recordId: record.recordId,
			findingCursor: -1,
			evidenceCursor: -1,
			limit: 1,
		});
		expect(first.findings.map((item) => item.catalogIndex)).toEqual([1, 1]);
		expect(first.evidence.map((item) => item.catalogIndex)).toEqual([1, 1]);
		expect(first.nextFindingCursor).toBe(1);
		expect(first.nextEvidenceCursor).toBe(1);

		const second = await user.query(api.releaseRecords.details, {
			recordId: record.recordId,
			findingCursor: first.nextFindingCursor ?? -1,
			evidenceCursor: first.nextEvidenceCursor ?? -1,
			limit: 1,
		});
		expect(second.findings.map((item) => item.catalogIndex)).toEqual([2]);
		expect(second.evidence.map((item) => item.catalogIndex)).toEqual([2]);
		expect(second.nextFindingCursor).toBeNull();
		expect(second.nextEvidenceCursor).toBeNull();

		const firstEvidence = await user.query(api.releaseRecords.evidence, {
			recordId: record.recordId,
			paginationOpts: { cursor: null, numItems: 2 },
		});
		expect(firstEvidence.page.map((item) => item.messageId)).toEqual([
			"evidence_a",
			"evidence_b",
		]);
		expect(firstEvidence.isDone).toBe(false);
		const remainingEvidence = await user.query(api.releaseRecords.evidence, {
			recordId: record.recordId,
			paginationOpts: {
				cursor: firstEvidence.continueCursor,
				numItems: 2,
			},
		});
		expect(remainingEvidence.page.map((item) => item.messageId)).toEqual([
			"evidence_c",
		]);
		expect(remainingEvidence.isDone).toBe(true);
	});

	test("pages immutable record history", async () => {
		const user = await authenticatedBackend(t, "release-history");
		const { projectId, targetId } = await createCatalog(user);
		const records: Id<"releaseRecords">[] = [];
		for (const value of ["Hello", "Hallo wieder", "Guten Tag"]) {
			await save(user, projectId, targetId, value);
			records.push((await prepareAndFinish(user, projectId)).recordId);
		}

		const first = await user.query(api.releaseRecords.history, {
			projectId,
			paginationOpts: { cursor: null, numItems: 2 },
		});
		expect(first.records).toHaveLength(2);
		expect(first.isDone).toBe(false);
		const second = await user.query(api.releaseRecords.history, {
			projectId,
			paginationOpts: { cursor: first.continueCursor, numItems: 2 },
		});
		expect(second.records).toHaveLength(1);
		expect(second.isDone).toBe(true);
		expect(
			new Set(
				[...first.records, ...second.records].map((item) => item.recordId),
			),
		).toEqual(new Set(records));

		const latest = await user.query(api.releaseRecords.current, { projectId });
		if (latest.kind !== "available")
			throw new Error("Expected Release history.");
		expect(latest.current?.recordId).toBe(records[records.length - 1]);
		const earlier = await user.query(api.releaseRecords.history, {
			projectId,
			paginationOpts: { cursor: latest.historyCursor, numItems: 8 },
		});
		expect(earlier.records.map((item) => item.recordId)).toEqual(
			records.slice(0, -1).reverse(),
		);
	});

	test("enforces authentication and project ownership on every public read", async () => {
		const owner = await authenticatedBackend(t, "release-owner");
		const outsider = await authenticatedBackend(t, "release-outsider");
		const { projectId, targetId } = await createCatalog(owner);
		await save(owner, projectId, targetId, "Hello");
		const record = await prepareAndFinish(owner, projectId);

		await expect(
			t.query(api.releaseRecords.current, { projectId }),
		).rejects.toThrow();
		await expect(
			outsider.query(api.releaseRecords.current, { projectId }),
		).rejects.toThrow();
		await expect(
			outsider.query(api.releaseRecords.history, {
				projectId,
				paginationOpts: { cursor: null, numItems: 5 },
			}),
		).rejects.toThrow();
		await expect(
			outsider.query(api.releaseRecords.details, {
				recordId: record.recordId,
				findingCursor: -1,
				evidenceCursor: -1,
				limit: 5,
			}),
		).rejects.toThrow();
		await expect(
			outsider.query(api.releaseRecords.evidence, {
				recordId: record.recordId,
				paginationOpts: { cursor: null, numItems: 5 },
			}),
		).rejects.toThrow();
		await expect(
			outsider.query(api.releaseRecords.handoff, {
				recordId: record.recordId,
			}),
		).rejects.toThrow();
		await expect(
			outsider.mutation(api.releaseRecords.prepare, { projectId }),
		).rejects.toThrow();
	});
});
