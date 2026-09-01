import { beforeEach, describe, expect, test } from "vitest";

import {
	type AuthenticatedBackend,
	authenticatedBackend,
	type Backend,
	createBackend,
	createProject,
	readWorkspaceKeyCards,
} from "../test/support";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

async function agentRequest(
	t: Backend,
	token: string,
	path: string,
	init: RequestInit = {},
): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set("Authorization", `Bearer ${token}`);
	if (init.body !== undefined && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}
	return await t.fetch(path, { ...init, headers });
}

async function setupProject(user: AuthenticatedBackend) {
	const projectId = await createProject(user);
	const locales = await user.query(api.locales.list, { projectId });
	const source = locales.find((locale) => locale.code === "en");
	if (!source) throw new Error("Expected the source Locale.");
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
	const ingested = await user.action(api.snapshots.ingest, {
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
				content: '{"@@locale":"de","greeting":"Hallo {name}"}',
			},
		],
	});
	if (!ingested.snapshotId) throw new Error("Expected a baseline snapshot.");
	const token = await user.mutation(api.apiTokens.create, {
		projectId,
		name: "translation agent",
		scopes: ["read", "search", "propose"],
	});
	return { projectId, targetId, token: token.token };
}

async function targetBasis(
	user: AuthenticatedBackend,
	projectId: Id<"projects">,
) {
	const workspace = await readWorkspaceKeyCards(user, projectId);
	const key = workspace.keys.find((entry) => entry.id === "greeting");
	const target = key?.values.find((value) => !value.isSource);
	if (
		!target?.snapshotId ||
		target.gitValueFingerprint === undefined ||
		target.gitValueRevision === undefined ||
		target.workspaceRevision === undefined ||
		target.expectedSourceFingerprint === undefined
	) {
		throw new Error("Expected a complete Catalog Workspace target basis.");
	}
	return {
		projectionId: workspace.projectionId,
		snapshotId: target.snapshotId,
		gitValueFingerprint: target.gitValueFingerprint,
		gitValueRevision: target.gitValueRevision,
		workspaceRevision: target.workspaceRevision,
		sourceFingerprint: target.expectedSourceFingerprint,
		localeId: target.localeId,
	};
}

describe("Agent Translation Proposals", () => {
	let t: Backend;

	beforeEach(() => {
		t = createBackend();
	});

	test("discovers current workspace facts through the agent transport", async () => {
		const user = await authenticatedBackend(t, "agent-translation-discovery");
		const { token } = await setupProject(user);

		const search = await agentRequest(
			t,
			token,
			"/api/agent/v1/workspace/search?q=greeting&localeCode=de",
		);
		expect(search.status).toBe(200);
		const searchBody = (await search.json()) as {
			results: Array<{ messageId: string; target: { value: string } }>;
		};
		expect(searchBody.results).toEqual([
			expect.objectContaining({
				messageId: "greeting",
				target: expect.objectContaining({ value: "Hallo {name}" }),
			}),
		]);

		const context = await agentRequest(
			t,
			token,
			"/api/agent/v1/workspace/context",
			{
				method: "POST",
				body: JSON.stringify({ keys: ["greeting"], locales: ["de"] }),
			},
		);
		expect(context.status).toBe(200);
		const contextBody = (await context.json()) as {
			rows: Array<{
				basis: {
					projectionId: string;
					snapshotId: string;
					gitValueFingerprint: string;
				};
			}>;
		};
		expect(contextBody.rows).toHaveLength(1);
		expect(contextBody.rows[0]?.basis).toMatchObject({
			projectionId: expect.any(String),
			snapshotId: expect.any(String),
			gitValueFingerprint: expect.any(String),
		});

		const confirmationPlan = await agentRequest(
			t,
			token,
			"/api/agent/v1/workspace/ordinary-confirmations?limit=10",
		);
		expect(confirmationPlan.status).toBe(200);
		expect(await confirmationPlan.json()).toMatchObject({
			policy: "ordinary-v1",
			candidates: [expect.objectContaining({ messageId: "greeting" })],
			nextCursor: null,
		});
	});

	test("creates, resumes, and human-accepts a Catalog Workspace candidate", async () => {
		const user = await authenticatedBackend(t, "agent-translation-reviewer");
		const { projectId, token } = await setupProject(user);
		const basis = await targetBasis(user, projectId);

		const createResponse = await agentRequest(
			t,
			token,
			"/api/agent/v1/translation-proposals",
			{
				method: "POST",
				body: JSON.stringify({
					clientProposalKey: "greeting-de-v1",
					target: { kind: "catalogWorkspace" },
				}),
			},
		);
		expect(createResponse.status).toBe(200);
		const proposal = (await createResponse.json()) as {
			proposalId: Id<"agentTranslationProposals">;
		};

		const resumedResponse = await agentRequest(
			t,
			token,
			"/api/agent/v1/translation-proposals",
			{
				method: "POST",
				body: JSON.stringify({
					clientProposalKey: "greeting-de-v1",
					target: { kind: "catalogWorkspace" },
				}),
			},
		);
		expect(resumedResponse.status).toBe(200);
		expect((await resumedResponse.json()).proposalId).toBe(proposal.proposalId);

		const revisionResponse = await agentRequest(
			t,
			token,
			`/api/agent/v1/translation-proposals/${proposal.proposalId}/candidate-revisions`,
			{
				method: "POST",
				body: JSON.stringify({
					items: [
						{
							messageId: "greeting",
							localeId: basis.localeId,
							value: "Guten Tag {name}",
							clientRevisionKey: "greeting-de-v1-r1",
							expectedCandidateRevision: 0,
							basis,
						},
					],
				}),
			},
		);
		expect(revisionResponse.status).toBe(200);
		const revision = (await revisionResponse.json()) as {
			revisions: Array<{
				revisionId: Id<"agentTranslationCandidateRevisions">;
			}>;
		};
		const revisionId = revision.revisions[0]?.revisionId;
		if (!revisionId) throw new Error("Expected a candidate revision.");
		const reviewContext = await user.query(
			api.agentTranslationProposals.contextForReview,
			{ revisionId },
		);
		expect(reviewContext).toMatchObject({
			available: true,
			localeCode: "de",
			basisIsCurrent: true,
			source: {
				value: "Hello {name}",
				argumentNames: ["name"],
			},
			target: { value: "Hallo {name}", catalogPath: "de.arb" },
		});

		const review = await user.mutation(
			api.agentTranslationProposals.reviewCandidate,
			{
				candidateRevisionId: revisionId,
				decision: { kind: "acceptWithEdits", value: "Willkommen {name}" },
			},
		);
		expect(review.workspaceRevision).toBe(1);

		const workspace = await readWorkspaceKeyCards(user, projectId);
		const value = workspace.keys
			.find((entry) => entry.id === "greeting")
			?.values.find((entry) => entry.localeId === basis.localeId);
		expect(value).toMatchObject({
			value: "Willkommen {name}",
			valueState: "settled",
		});
		// The Navigation Index advanced atomically with the accepted proposal.
		const navRow = await t.run(async (ctx) => {
			const project = await ctx.db.get(projectId);
			const projectionId = project?.activeCatalogProjectionId;
			if (!projectionId) {
				throw new Error("Expected an active Baseline Catalog.");
			}
			return await ctx.db
				.query("catalogWorkspaceNavigationRows")
				.withIndex("by_project_and_projection_and_messageId", (q) =>
					q
						.eq("projectId", projectId)
						.eq("projectionId", projectionId)
						.eq("messageId", "greeting"),
				)
				.unique();
		});
		if (!navRow) throw new Error("Expected the Navigation digest.");
		expect(navRow.searchCorpus).toContain("willkommen {name}");
		expect(navRow.targets[0]).toMatchObject({
			valueState: "settled",
			touched: true,
		});
		const reviewedProposal = await user.query(
			api.agentTranslationProposals.getForReview,
			{ proposalId: proposal.proposalId },
		);
		expect(reviewedProposal?.proposal.status).toBe("accepted");
	});

	test("lets a human freeze an existing-Locale task and an agent fill it without basis plumbing", async () => {
		const user = await authenticatedBackend(t, "human-translation-task");
		const { projectId, targetId, token } = await setupProject(user);
		const created = await user.mutation(
			api.agentTranslationProposals.createTask,
			{
				projectId,
				title: "Polish German greeting",
				localeId: targetId,
				messageIds: ["greeting"],
			},
		);
		expect(created).toMatchObject({
			title: "Polish German greeting",
			localeCode: "de",
			targetCount: 1,
		});

		const taskResponse = await agentRequest(
			t,
			token,
			`/api/agent/v1/translation-tasks/${created.taskId}`,
		);
		expect(taskResponse.status).toBe(200);
		expect(await taskResponse.json()).toMatchObject({
			task: {
				taskId: created.taskId,
				localeCode: "de",
				targetCount: 1,
				candidateCount: 0,
			},
			targets: [
				expect.objectContaining({
					messageId: "greeting",
					sourceValue: "Hello {name}",
					targetValue: "Hallo {name}",
				}),
			],
			nextCursor: null,
		});

		const submit = () =>
			agentRequest(
				t,
				token,
				`/api/agent/v1/translation-tasks/${created.taskId}/candidates`,
				{
					method: "POST",
					body: JSON.stringify({
						items: [{ messageId: "greeting", value: "Guten Tag {name}" }],
					}),
				},
			);
		const submitted = await submit();
		expect(submitted.status).toBe(200);
		const submittedBody = (await submitted.json()) as {
			revisions: Array<{
				revisionId: Id<"agentTranslationCandidateRevisions">;
			}>;
		};
		const revisionId = submittedBody.revisions[0]?.revisionId;
		if (!revisionId) throw new Error("Expected a task candidate revision.");
		const retry = await submit();
		expect(retry.status).toBe(200);
		expect((await retry.json()).revisions[0]?.revisionId).toBe(revisionId);

		const beforeReview = await user.query(
			api.agentTranslationProposals.getForReview,
			{ proposalId: created.taskId },
		);
		expect(beforeReview).toMatchObject({
			proposal: { status: "open", taskScope: { targetCount: 1 } },
			taskTargets: [expect.objectContaining({ messageId: "greeting" })],
			candidates: [
				expect.objectContaining({
					revision: expect.objectContaining({ value: "Guten Tag {name}" }),
				}),
			],
		});
		await user.mutation(api.agentTranslationProposals.reviewCandidate, {
			candidateRevisionId: revisionId,
			decision: { kind: "accept" },
		});
		const reviewed = await user.query(
			api.agentTranslationProposals.getForReview,
			{ proposalId: created.taskId },
		);
		expect(reviewed?.proposal.status).toBe("accepted");
	});

	test("rejects an agent blank and rejects stale basis evidence", async () => {
		const user = await authenticatedBackend(t, "agent-translation-safety");
		const { projectId, token } = await setupProject(user);
		const basis = await targetBasis(user, projectId);
		const createResponse = await agentRequest(
			t,
			token,
			"/api/agent/v1/translation-proposals",
			{
				method: "POST",
				body: JSON.stringify({
					clientProposalKey: "safety",
					target: { kind: "catalogWorkspace" },
				}),
			},
		);
		const proposal = (await createResponse.json()) as {
			proposalId: Id<"agentTranslationProposals">;
		};
		const blank = await agentRequest(
			t,
			token,
			`/api/agent/v1/translation-proposals/${proposal.proposalId}/candidate-revisions`,
			{
				method: "POST",
				body: JSON.stringify({
					items: [
						{
							messageId: "greeting",
							localeId: basis.localeId,
							value: "",
							clientRevisionKey: "blank",
							expectedCandidateRevision: 0,
							basis,
						},
					],
				}),
			},
		);
		expect(blank.status).toBe(400);
		expect(await blank.json()).toMatchObject({
			code: "VALIDATION",
		});

		await user.mutation(api.catalogWorkspace.commit, {
			projectId,
			messageId: "greeting",
			localeId: basis.localeId,
			intent: { kind: "save", value: "Hallo zusammen {name}" },
			expectedGitValueFingerprint: basis.gitValueFingerprint,
			expectedGitValueRevision: basis.gitValueRevision,
			expectedWorkspaceRevision: basis.workspaceRevision,
			expectedSourceFingerprint: basis.sourceFingerprint,
		});
		const stale = await agentRequest(
			t,
			token,
			`/api/agent/v1/translation-proposals/${proposal.proposalId}/candidate-revisions`,
			{
				method: "POST",
				body: JSON.stringify({
					items: [
						{
							messageId: "greeting",
							localeId: basis.localeId,
							value: "Guten Morgen {name}",
							clientRevisionKey: "stale",
							expectedCandidateRevision: 0,
							basis,
						},
					],
				}),
			},
		);
		expect(stale.status).toBe(400);
		expect(await stale.json()).toMatchObject({ code: "STALE_BASIS" });
	});
});
