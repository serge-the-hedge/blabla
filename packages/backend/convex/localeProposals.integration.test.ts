import { beforeEach, describe, expect, test } from "vitest";

import {
	type AuthenticatedBackend,
	authenticatedBackend,
	type Backend,
	createBackend,
	createProject,
} from "../test/support";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

async function ingestSourceBaseline(
	user: AuthenticatedBackend,
	projectId: Id<"projects">,
	input: {
		commit?: string;
		content?: string;
		additionalFiles?: Array<{ catalogPath: string; content: string }>;
		lineage?: {
			baselineCommit: string;
			relationship: "ancestor" | "descendant" | "divergent";
			mergeBase: string;
		};
	} = {},
) {
	const [sourceLocale] = await user.query(api.locales.list, { projectId });
	if (!sourceLocale) throw new Error("Expected the source Locale.");
	await user.mutation(api.locales.bind, {
		localeId: sourceLocale._id,
		catalogPath: "intl_en.arb",
	});
	const result = await user.action(api.snapshots.ingest, {
		projectId,
		repository: "github.com/brickit-app/brickit-flutter",
		commit: input.commit ?? "baseline",
		files: [
			{
				catalogPath: "intl_en.arb",
				content:
					input.content ??
					'{"@@locale":"en","welcome":"Welcome, {name}!","@welcome":{"description":"A welcome for a signed-in person.","placeholders":{"name":{"type":"String"}}}}',
			},
			...(input.additionalFiles ?? []),
		],
		...(input.lineage === undefined ? {} : { lineage: input.lineage }),
	});
	if (!result.snapshotId) throw new Error("Expected a Baseline Snapshot.");
	return result.snapshotId;
}

async function proposalToken(
	user: AuthenticatedBackend,
	projectId: Id<"projects">,
) {
	return await user.mutation(api.apiTokens.create, {
		projectId,
		name: "Portuguese proposal agent",
		scopes: ["read", "propose"],
	});
}

type AgentProposal = {
	proposalId: Id<"localeProposals">;
	sourceSnapshotId: Id<"sourceSnapshots">;
	locale: { code: string; label: string; runtimeLocale: string };
	status: "draft" | "ready";
	deliveryStatus: "draft" | "ready" | "stale";
	progress: { total: number; staged: number; remaining: number };
	diagnostics: { count: number; messages: string[] };
};

type AgentTemplate = {
	sourceSnapshotId: Id<"sourceSnapshots">;
	isDone: boolean;
	messages: Array<{
		id: string;
		sourceValue: string;
		sourceFingerprint: string;
		staged: boolean;
		metadataJson?: string;
	}>;
};

type AgentStagedValues = {
	values: Array<{
		messageId: string;
		value: string;
		sourceFingerprint: string;
		intentionalBlankReason?: string;
	}>;
};

type AgentArtifact = {
	proposalId: Id<"localeProposals">;
	sourceSnapshot: { id: string; commit: string; catalogPath: string };
	locale: { code: string; label: string; runtimeLocale: string };
	catalog: { fileName: string; content: string };
};

type AgentStageItem = {
	messageId: string;
	value: string;
	sourceFingerprint: string;
	intentionalBlankReason?: string;
};

type AgentError = {
	error: string;
	code?: string;
};

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

async function successfulJson<T>(response: Response): Promise<T> {
	const body = await response.text();
	expect(response.status, body).toBe(200);
	return JSON.parse(body) as T;
}

async function createPortugueseProposal(
	t: Backend,
	token: string,
): Promise<AgentProposal> {
	return await successfulJson<AgentProposal>(
		await agentRequest(t, token, "/api/agent/v1/locale-proposals/pt", {
			method: "POST",
		}),
	);
}

async function portugueseTemplate(
	t: Backend,
	token: string,
	proposalId: Id<"localeProposals">,
): Promise<AgentTemplate> {
	return await successfulJson<AgentTemplate>(
		await agentRequest(
			t,
			token,
			`/api/agent/v1/locale-proposals/pt/template?proposalId=${encodeURIComponent(proposalId)}&limit=10`,
		),
	);
}

async function stagePortugueseValues(
	t: Backend,
	token: string,
	proposalId: Id<"localeProposals">,
	items: AgentStageItem[],
): Promise<Response> {
	return await agentRequest(
		t,
		token,
		"/api/agent/v1/locale-proposals/pt/values",
		{
			method: "POST",
			body: JSON.stringify({ proposalId, items }),
		},
	);
}

async function portugueseStagedValues(
	t: Backend,
	token: string,
	proposalId: Id<"localeProposals">,
): Promise<AgentStagedValues> {
	return await successfulJson<AgentStagedValues>(
		await agentRequest(
			t,
			token,
			`/api/agent/v1/locale-proposals/pt/values?proposalId=${encodeURIComponent(proposalId)}&limit=10`,
		),
	);
}

async function reviewPortugueseValues(
	user: AuthenticatedBackend,
	projectId: Id<"projects">,
	proposalId: Id<"localeProposals">,
): Promise<void> {
	let cursor: number | undefined;
	for (;;) {
		const page = await user.query(api.localeProposals.getForReview, {
			proposalId,
			...(cursor === undefined ? {} : { cursor }),
			limit: 16,
		});
		if (!page) throw new Error("Expected a Locale Proposal review page.");
		for (const message of page.messages) {
			if (!message.value || message.review) continue;
			await user.mutation(api.localeProposals.reviewStagedValue, {
				projectId,
				proposalId,
				messageId: message.messageId,
				decision:
					message.value.value.length === 0
						? {
								kind: "intentionalBlank",
								reason:
									message.value.intentionalBlankReason ??
									"Reviewed as intentionally blank.",
							}
						: { kind: "accept" },
			});
		}
		if (page.continueCursor === null) return;
		cursor = page.continueCursor;
	}
}

async function expectStageFailure(
	t: Backend,
	token: string,
	proposalId: Id<"localeProposals">,
	items: AgentStageItem[],
	message: string,
	code = "VALIDATION",
): Promise<void> {
	const response = await stagePortugueseValues(t, token, proposalId, items);
	expect(response.status).toBe(400);
	const error = (await response.json()) as AgentError;
	expect(error).toMatchObject({
		error: expect.stringContaining(message),
		code,
	});
}

async function finalizePortugueseProposal(
	t: Backend,
	token: string,
	proposalId: Id<"localeProposals">,
): Promise<Response> {
	return await agentRequest(
		t,
		token,
		"/api/agent/v1/locale-proposals/pt/finalize",
		{
			method: "POST",
			body: JSON.stringify({ proposalId }),
		},
	);
}

async function portugueseArtifact(
	t: Backend,
	token: string,
	proposalId: Id<"localeProposals">,
): Promise<AgentArtifact> {
	return await successfulJson<AgentArtifact>(
		await agentRequest(
			t,
			token,
			`/api/agent/v1/locale-proposals/pt/artifact?proposalId=${encodeURIComponent(proposalId)}`,
		),
	);
}

describe("Portuguese Locale Proposals through the Agent API", () => {
	let t: Backend;

	beforeEach(() => {
		t = createBackend();
	});

	test("resumes one current Portuguese proposal without creating a Locale", async () => {
		const user = await authenticatedBackend(t, "locale-proposal-owner");
		const projectId = await createProject(user);
		const snapshotId = await ingestSourceBaseline(user, projectId);
		const { token } = await proposalToken(user, projectId);

		const first = await createPortugueseProposal(t, token);
		const resumed = await createPortugueseProposal(t, token);

		expect(resumed).toMatchObject({
			proposalId: first.proposalId,
			sourceSnapshotId: snapshotId,
			progress: { total: 1, staged: 0, remaining: 1 },
		});
		expect(
			(await user.query(api.locales.list, { projectId })).map(
				(locale) => locale.code,
			),
		).toEqual(["en"]);
	}, 60_000);

	test("requires both agent scopes", async () => {
		const user = await authenticatedBackend(t, "locale-proposal-owner");
		const projectId = await createProject(user);
		await ingestSourceBaseline(user, projectId);
		const readOnly = await user.mutation(api.apiTokens.create, {
			projectId,
			name: "Read-only agent",
			scopes: ["read"],
		});
		const unauthorized = await agentRequest(
			t,
			readOnly.token,
			"/api/agent/v1/locale-proposals/pt",
			{ method: "POST" },
		);
		expect(unauthorized.status).toBe(401);
		expect(await unauthorized.json()).toMatchObject({
			error: expect.stringContaining("Invalid or insufficient API token."),
		});
	});

	test("publishes a project CLI floor and refuses only an incompatible protocol", async () => {
		const user = await authenticatedBackend(t, "locale-proposal-owner");
		const projectId = await createProject(user);
		await ingestSourceBaseline(user, projectId);
		const { token } = await proposalToken(user, projectId);
		const proposal = await createPortugueseProposal(t, token);
		await user.mutation(api.projects.update, {
			projectId,
			name: "Primary project",
			minimumCliVersion: "0.2.0",
			minimumCliProtocol: 2,
		});

		const incompatible = await agentRequest(
			t,
			token,
			`/api/agent/v1/locale-proposals/pt?proposalId=${encodeURIComponent(proposal.proposalId)}`,
			{
				headers: {
					"X-Blabla-CLI-Version": "0.1.0",
					"X-Blabla-CLI-Protocol": "1",
				},
			},
		);
		expect(incompatible.status).toBe(426);
		expect(await incompatible.json()).toMatchObject({
			code: "CLI_UPGRADE_REQUIRED",
		});

		const compatible = await agentRequest(
			t,
			token,
			`/api/agent/v1/locale-proposals/pt?proposalId=${encodeURIComponent(proposal.proposalId)}`,
			{
				headers: {
					"X-Blabla-CLI-Version": "0.1.0",
					"X-Blabla-CLI-Protocol": "2",
				},
			},
		);
		expect(compatible.status).toBe(200);
		expect(compatible.headers.get("X-Blabla-Minimum-CLI-Version")).toBe(
			"0.2.0",
		);
		expect(compatible.headers.get("X-Blabla-Minimum-CLI-Protocol")).toBe("2");
	});

	test("persists validation diagnostics and refuses invalid proposal values", async () => {
		const user = await authenticatedBackend(t, "locale-proposal-owner");
		const projectId = await createProject(user);
		await ingestSourceBaseline(user, projectId);

		const { token } = await proposalToken(user, projectId);
		const proposal = await createPortugueseProposal(t, token);
		const template = await portugueseTemplate(t, token, proposal.proposalId);
		const [message] = template.messages;
		if (!message) throw new Error("Expected the welcome template message.");
		const { token: validationToken } = await proposalToken(user, projectId);

		await expectStageFailure(
			t,
			validationToken,
			proposal.proposalId,
			[
				{
					messageId: "unknown",
					value: "Olá",
					sourceFingerprint: message.sourceFingerprint,
				},
			],
			"not in the pinned Source Snapshot",
		);
		await expectStageFailure(
			t,
			validationToken,
			proposal.proposalId,
			[
				{
					messageId: message.id,
					value: "Olá, {name}!",
					sourceFingerprint: message.sourceFingerprint,
				},
				{
					messageId: message.id,
					value: "Boas-vindas, {name}!",
					sourceFingerprint: message.sourceFingerprint,
				},
			],
			"repeats or omits a message identity",
		);
		await expectStageFailure(
			t,
			validationToken,
			proposal.proposalId,
			[
				{
					messageId: message.id,
					value: "",
					sourceFingerprint: message.sourceFingerprint,
				},
			],
			"Intentional Blank",
		);
		await expectStageFailure(
			t,
			validationToken,
			proposal.proposalId,
			[
				{
					messageId: message.id,
					value: "Olá, {name",
					sourceFingerprint: message.sourceFingerprint,
				},
			],
			"Contract Validity failed",
		);
		await expectStageFailure(
			t,
			validationToken,
			proposal.proposalId,
			[
				{
					messageId: message.id,
					value: "Olá, {name}!",
					sourceFingerprint: `${message.sourceFingerprint}stale`,
				},
			],
			"outdated Source Contract",
		);
		await expectStageFailure(
			t,
			validationToken,
			proposal.proposalId,
			[
				{
					messageId: message.id,
					value: "Olá, {unknown}!",
					sourceFingerprint: message.sourceFingerprint,
				},
			],
			"Contract Validity failed",
		);
		const incomplete = await finalizePortugueseProposal(
			t,
			validationToken,
			proposal.proposalId,
		);
		expect(incomplete.status).toBe(400);
		expect(await incomplete.json()).toMatchObject({
			error: expect.stringContaining("Missing Portuguese value"),
			code: "VALIDATION",
			diagnosticCount: 1,
			diagnostics: [expect.stringContaining("Missing Portuguese value")],
		});
		const reviewed = await successfulJson<AgentProposal>(
			await agentRequest(
				t,
				validationToken,
				`/api/agent/v1/locale-proposals/pt?proposalId=${encodeURIComponent(proposal.proposalId)}`,
			),
		);
		expect(reviewed.diagnostics).toEqual({
			count: 1,
			messages: [expect.stringContaining("Missing Portuguese value")],
		});
		const { token: artifactToken } = await proposalToken(user, projectId);
		const unavailableArtifact = await agentRequest(
			t,
			artifactToken,
			`/api/agent/v1/locale-proposals/pt/artifact?proposalId=${encodeURIComponent(proposal.proposalId)}`,
		);
		expect(unavailableArtifact.status).toBe(400);
		expect(await unavailableArtifact.json()).toMatchObject({
			error: expect.stringContaining("has no finalized delivery artifact"),
		});
	});

	test("keeps a resumed proposal pinned despite later source setup changes", async () => {
		const user = await authenticatedBackend(t, "locale-proposal-owner");
		const projectId = await createProject(user);
		const frenchLocaleId = await user.mutation(api.locales.create, {
			projectId,
			code: "fr",
			label: "French",
		});
		await user.mutation(api.locales.bind, {
			localeId: frenchLocaleId,
			catalogPath: "intl_fr.arb",
		});
		await ingestSourceBaseline(user, projectId, {
			additionalFiles: [
				{
					catalogPath: "intl_fr.arb",
					content:
						'{"@@locale":"fr","welcome":"Bonjour, {name}!","@welcome":{"description":"Une salutation.","placeholders":{"name":{"type":"String"}}}}',
				},
			],
		});
		const { token } = await proposalToken(user, projectId);

		// This simulates a source-locale migration after the Baseline was ingested.
		// The Agent API must use the snapshot-time source role, then retain that
		// chosen Catalog Document as immutable proposal evidence.
		await t.run(async (ctx) => {
			await ctx.db.patch(projectId, { sourceLocaleId: frenchLocaleId });
		});
		const proposal = await createPortugueseProposal(t, token);

		const template = await portugueseTemplate(t, token, proposal.proposalId);
		expect(template.messages).toMatchObject([
			{ id: "welcome", sourceValue: "Welcome, {name}!" },
		]);
		const [message] = template.messages;
		if (!message) throw new Error("Expected the welcome template message.");
		await successfulJson<AgentProposal>(
			await stagePortugueseValues(t, token, proposal.proposalId, [
				{
					messageId: message.id,
					value: "Boas-vindas, {name}!",
					sourceFingerprint: message.sourceFingerprint,
				},
			]),
		);
		await reviewPortugueseValues(user, projectId, proposal.proposalId);
		await successfulJson<AgentProposal>(
			await finalizePortugueseProposal(t, token, proposal.proposalId),
		);
		await expect(
			portugueseArtifact(t, token, proposal.proposalId),
		).resolves.toMatchObject({
			sourceSnapshot: { catalogPath: "intl_en.arb" },
		});
	});

	test("keeps Portuguese proposals inside the agent token's project", async () => {
		const user = await authenticatedBackend(t, "locale-proposal-owner");
		const firstProjectId = await createProject(user, { slug: "first-project" });
		const secondProjectId = await createProject(user, {
			slug: "second-project",
		});
		await ingestSourceBaseline(user, firstProjectId);
		await ingestSourceBaseline(user, secondProjectId);
		const { token: firstToken } = await proposalToken(user, firstProjectId);
		const { token: secondToken } = await proposalToken(user, secondProjectId);
		const secondProposal = await createPortugueseProposal(t, secondToken);

		const response = await agentRequest(
			t,
			firstToken,
			`/api/agent/v1/locale-proposals/pt?proposalId=${encodeURIComponent(secondProposal.proposalId)}`,
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("Portuguese Locale Proposal not found"),
			code: "NOT_FOUND",
		});
	});

	test("pins a proposal to its Baseline Snapshot and starts fresh after Git advances", async () => {
		const user = await authenticatedBackend(t, "locale-proposal-owner");
		const projectId = await createProject(user);
		const baselineSnapshotId = await ingestSourceBaseline(user, projectId);
		const { token } = await proposalToken(user, projectId);
		const oldProposal = await createPortugueseProposal(t, token);
		const template = await portugueseTemplate(t, token, oldProposal.proposalId);
		const [message] = template.messages;
		if (!message) throw new Error("Expected the welcome template message.");

		const nextSnapshotId = await ingestSourceBaseline(user, projectId, {
			commit: "next",
			content:
				'{"@@locale":"en","welcome":"Welcome back, {name}!","@welcome":{"description":"A welcome for a signed-in person.","placeholders":{"name":{"type":"String"}}}}',
			lineage: {
				baselineCommit: "baseline",
				relationship: "descendant",
				mergeBase: "baseline",
			},
		});

		await expectStageFailure(
			t,
			token,
			oldProposal.proposalId,
			[
				{
					messageId: message.id,
					value: "Boas-vindas, {name}!",
					sourceFingerprint: message.sourceFingerprint,
				},
			],
			"no longer the Baseline Snapshot",
			"STALE_SOURCE",
		);
		expect(
			await successfulJson<AgentProposal>(
				await agentRequest(
					t,
					token,
					`/api/agent/v1/locale-proposals/pt?proposalId=${encodeURIComponent(oldProposal.proposalId)}`,
				),
			),
		).toMatchObject({
			sourceSnapshotId: baselineSnapshotId,
			deliveryStatus: "stale",
		});

		const currentProposal = await createPortugueseProposal(t, token);
		expect(currentProposal).toMatchObject({
			sourceSnapshotId: nextSnapshotId,
			progress: { total: 1, staged: 0, remaining: 1 },
		});
		expect(currentProposal.proposalId).not.toBe(oldProposal.proposalId);
	});

	test("accepts an exact Intentional Blank with its reason", async () => {
		const user = await authenticatedBackend(t, "locale-proposal-owner");
		const projectId = await createProject(user);
		await ingestSourceBaseline(user, projectId);
		const { token } = await proposalToken(user, projectId);
		const proposal = await createPortugueseProposal(t, token);
		const template = await portugueseTemplate(t, token, proposal.proposalId);
		const [message] = template.messages;
		if (!message) throw new Error("Expected the welcome template message.");

		await successfulJson<AgentProposal>(
			await stagePortugueseValues(t, token, proposal.proposalId, [
				{
					messageId: message.id,
					value: "",
					sourceFingerprint: message.sourceFingerprint,
					intentionalBlankReason:
						"This message is intentionally hidden in Portuguese.",
				},
			]),
		);
		await expect(
			portugueseStagedValues(t, token, proposal.proposalId),
		).resolves.toMatchObject({
			values: [
				{
					messageId: "welcome",
					value: "",
					sourceFingerprint: message.sourceFingerprint,
					intentionalBlankReason:
						"This message is intentionally hidden in Portuguese.",
				},
			],
		});
		await reviewPortugueseValues(user, projectId, proposal.proposalId);
		await expect(
			successfulJson<AgentProposal>(
				await finalizePortugueseProposal(t, token, proposal.proposalId),
			),
		).resolves.toMatchObject({ status: "ready" });
		await expect(
			portugueseArtifact(t, token, proposal.proposalId),
		).resolves.toMatchObject({
			catalog: { content: expect.stringContaining('"welcome": ""') },
		});
	});

	test("creates a source-pinned Portuguese delivery artifact", async () => {
		const user = await authenticatedBackend(t, "locale-proposal-owner");
		const projectId = await createProject(user);
		const snapshotId = await ingestSourceBaseline(user, projectId);
		const { token } = await proposalToken(user, projectId);

		const proposal = await createPortugueseProposal(t, token);
		expect(proposal).toMatchObject({
			sourceSnapshotId: snapshotId,
			locale: {
				code: "pt",
				label: "Portuguese",
				runtimeLocale: "pt-BR",
			},
			status: "draft",
			progress: { total: 1, staged: 0, remaining: 1 },
		});

		const template = await portugueseTemplate(t, token, proposal.proposalId);
		expect(template).toMatchObject({
			sourceSnapshotId: snapshotId,
			isDone: true,
			messages: [
				{
					id: "welcome",
					sourceValue: "Welcome, {name}!",
					staged: false,
					metadataJson:
						'{"description":"A welcome for a signed-in person.","placeholders":{"name":{"type":"String"}}}',
				},
			],
		});
		const [message] = template.messages;
		if (!message) throw new Error("Expected the welcome template message.");

		const staged = await successfulJson<AgentProposal>(
			await stagePortugueseValues(t, token, proposal.proposalId, [
				{
					messageId: message.id,
					value: "Boas-vindas, {name}!",
					sourceFingerprint: message.sourceFingerprint,
				},
			]),
		);
		expect(staged.progress).toEqual({ total: 1, staged: 1, remaining: 0 });
		const resumedTemplate = await portugueseTemplate(
			t,
			token,
			proposal.proposalId,
		);
		expect(resumedTemplate.messages).toMatchObject([
			{ id: "welcome", staged: true },
		]);
		await reviewPortugueseValues(user, projectId, proposal.proposalId);

		const finalized = await successfulJson<AgentProposal>(
			await finalizePortugueseProposal(t, token, proposal.proposalId),
		);
		expect(finalized).toMatchObject({
			status: "ready",
			proposalId: proposal.proposalId,
		});

		const artifact = await portugueseArtifact(t, token, proposal.proposalId);
		expect(artifact).toMatchObject({
			proposalId: proposal.proposalId,
			sourceSnapshot: {
				id: snapshotId,
				commit: "baseline",
				integrationBranch: "develop",
			},
			locale: {
				code: "pt",
				label: "Portuguese",
				runtimeLocale: "pt-BR",
			},
			catalog: {
				fileName: "intl_pt.arb",
				content:
					'{\n  "@@locale": "pt",\n  "welcome": "Boas-vindas, {name}!",\n  "@welcome": {\n    "description": "A welcome for a signed-in person.",\n    "placeholders": {\n      "name": {\n        "type": "String"\n      }\n    }\n  }\n}',
			},
		});
	});

	test("routes a locale candidate through the generic agent review seam", async () => {
		const user = await authenticatedBackend(t, "generic-locale-reviewer");
		const projectId = await createProject(user);
		await ingestSourceBaseline(user, projectId);
		const { token } = await proposalToken(user, projectId);
		const localeProposal = await createPortugueseProposal(t, token);
		const template = await portugueseTemplate(
			t,
			token,
			localeProposal.proposalId,
		);
		const [message] = template.messages;
		if (!message) throw new Error("Expected the welcome template message.");

		const created = await successfulJson<{
			proposalId: Id<"agentTranslationProposals">;
		}>(
			await agentRequest(t, token, "/api/agent/v1/translation-proposals", {
				method: "POST",
				body: JSON.stringify({
					clientProposalKey: "pt-welcome-v1",
					target: {
						kind: "localeProposal",
						localeProposalId: localeProposal.proposalId,
					},
				}),
			}),
		);
		const revision = await successfulJson<{
			revisions: Array<{
				revisionId: Id<"agentTranslationCandidateRevisions">;
			}>;
		}>(
			await agentRequest(
				t,
				token,
				`/api/agent/v1/translation-proposals/${created.proposalId}/candidate-revisions`,
				{
					method: "POST",
					body: JSON.stringify({
						items: [
							{
								messageId: message.id,
								value: "Boas-vindas, {name}!",
								clientRevisionKey: "pt-welcome-v1-r1",
								expectedCandidateRevision: 0,
								basis: {
									kind: "localeProposal",
									localeProposalId: localeProposal.proposalId,
									snapshotId: template.sourceSnapshotId,
									sourceFingerprint: message.sourceFingerprint,
								},
							},
						],
					}),
				},
			),
		);
		const revisionId = revision.revisions[0]?.revisionId;
		if (!revisionId) throw new Error("Expected a locale candidate revision.");

		const review = await user.mutation(
			api.agentTranslationProposals.reviewCandidate,
			{
				candidateRevisionId: revisionId,
				decision: { kind: "accept" },
			},
		);
		expect(review.decision).toEqual({ kind: "accept" });

		const reviewPage = await user.query(api.localeProposals.getForReview, {
			proposalId: localeProposal.proposalId,
			limit: 16,
		});
		const reviewed = reviewPage?.messages.find(
			(entry) => entry.messageId === message.id,
		);
		expect(reviewed).toMatchObject({
			value: {
				value: "Boas-vindas, {name}!",
				updatedBy: { kind: "user" },
			},
			review: { decision: { kind: "accept" } },
		});

		await expect(
			user.action(api.localeProposals.finalizeForReview, {
				projectId,
				proposalId: localeProposal.proposalId,
			}),
		).resolves.toMatchObject({ status: "ready" });
	});

	test("lets an editor prepare and approve an Intentional Blank", async () => {
		const user = await authenticatedBackend(t, "manual-locale-reviewer");
		const projectId = await createProject(user);
		await ingestSourceBaseline(user, projectId);
		const { proposalId } = await user.mutation(
			api.localeProposals.ensureForReview,
			{ projectId },
		);
		const page = await user.query(api.localeProposals.getForReview, {
			proposalId,
			limit: 16,
		});
		const [message] = page?.messages ?? [];
		if (!message) throw new Error("Expected the source message.");

		await user.mutation(api.localeProposals.stageForReview, {
			projectId,
			proposalId,
			items: [
				{
					messageId: message.messageId,
					value: "",
					sourceFingerprint: message.sourceFingerprint,
					intentionalBlankReason: "Not shown in the Portuguese experience.",
				},
			],
		});
		await user.mutation(api.localeProposals.reviewStagedValue, {
			projectId,
			proposalId,
			messageId: message.messageId,
			decision: {
				kind: "intentionalBlank",
				reason: "Not shown in the Portuguese experience.",
			},
		});

		await expect(
			user.action(api.localeProposals.finalizeForReview, {
				projectId,
				proposalId,
			}),
		).resolves.toMatchObject({ status: "ready" });
	});
});
