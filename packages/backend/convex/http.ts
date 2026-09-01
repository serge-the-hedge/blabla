import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, httpAction } from "./_generated/server";
import { authComponent, createAuth, getTrustedOrigins } from "./auth";
import type { TokenScope } from "./lib";
import {
	createOrResumeProposal,
	finalizeProposal,
	type ProposalActor,
	readProposal,
	readProposalArtifact,
	reviewProposalValues,
	stageProposal,
	templateProposal,
} from "./localeProposals";

const http = httpRouter();
const internalApi = internal;

type AgentScope = TokenScope;
type StringStatus = "missing" | "translated" | "needs_review" | "stale";
type AgentRateLimitName =
	| "agentRead"
	| "agentSearch"
	| "agentCreateChangeSet"
	| "agentExport"
	| "agentLocaleProposal"
	| "agentTranslationProposal";
type RepositoryAdapterRateLimitName =
	| "repositorySnapshotContext"
	| "repositorySnapshotSubmit";

const MAX_SNAPSHOT_FILES = 1_000;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers":
		"Content-Type, Authorization, X-Blabla-CLI-Version, X-Blabla-CLI-Protocol",
	"Access-Control-Expose-Headers":
		"X-Blabla-Minimum-CLI-Version, X-Blabla-Minimum-CLI-Protocol",
};

function json(
	data: unknown,
	status = 200,
	extraHeaders: Record<string, string> = {},
) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			...corsHeaders,
			...extraHeaders,
		},
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function optionalStringStatus(value: string | null): StringStatus | undefined {
	if (value === null) return undefined;
	if (
		value === "missing" ||
		value === "translated" ||
		value === "needs_review" ||
		value === "stale"
	) {
		return value;
	}
	throw new Error(
		"status must be missing, translated, needs_review, or stale.",
	);
}

async function jsonObject(request: Request): Promise<Record<string, unknown>> {
	const body: unknown = await request.json();
	if (!isRecord(body)) throw new Error("Request body must be a JSON object.");
	return body;
}

function jsonString(body: Record<string, unknown>, field: string): string {
	const value = body[field];
	if (typeof value !== "string") throw new Error(`${field} must be a string.`);
	return value;
}

function requiredJsonString(
	body: Record<string, unknown>,
	field: string,
): string {
	const value = jsonString(body, field);
	if (value.length === 0) throw new Error(`Missing ${field}.`);
	return value;
}

function optionalJsonArray(
	body: Record<string, unknown>,
	field: string,
): unknown[] {
	const value = body[field];
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
	return value;
}

type SnapshotFileInput = { catalogPath: string; content: string };

function snapshotFiles(body: Record<string, unknown>): SnapshotFileInput[] {
	const items = optionalJsonArray(body, "files");
	if (items.length > MAX_SNAPSHOT_FILES) {
		throw new ConvexError({
			code: "LIMIT_EXCEEDED",
			message: `A snapshot may contain at most ${MAX_SNAPSHOT_FILES} catalog files.`,
		});
	}
	const files = items.map((item, index) => {
		if (!isRecord(item)) throw new Error(`files[${index}] must be an object.`);
		return {
			catalogPath: requiredJsonString(item, "catalogPath"),
			content: jsonString(item, "content"),
		};
	});
	const byteLength = new TextEncoder().encode(JSON.stringify(files)).byteLength;
	if (byteLength > MAX_SNAPSHOT_BYTES) {
		throw new ConvexError({
			code: "LIMIT_EXCEEDED",
			message: `A snapshot request may contain at most ${MAX_SNAPSHOT_BYTES} bytes.`,
		});
	}
	return files;
}

function snapshotLineage(body: Record<string, unknown>) {
	const value = body.lineage;
	if (value === undefined) return undefined;
	if (!isRecord(value)) throw new Error("lineage must be an object.");
	const relationshipValue = value.relationship;
	const relationship: "ancestor" | "descendant" | "divergent" =
		relationshipValue === "ancestor" ||
		relationshipValue === "descendant" ||
		relationshipValue === "divergent"
			? relationshipValue
			: (() => {
					throw new Error(
						"lineage.relationship must be ancestor, descendant, or divergent.",
					);
				})();
	if (
		relationshipValue !== "ancestor" &&
		relationshipValue !== "descendant" &&
		relationshipValue !== "divergent"
	) {
		throw new Error(
			"lineage.relationship must be ancestor, descendant, or divergent.",
		);
	}
	return {
		baselineCommit: requiredJsonString(value, "baselineCommit"),
		relationship,
		mergeBase: requiredJsonString(value, "mergeBase"),
	};
}

function localeProposalId(value: string | null): Id<"localeProposals"> {
	if (!value) throw new Error("Missing Portuguese Locale Proposal id.");
	// The internal query and mutation boundaries validate this branded ID.
	return value as Id<"localeProposals">;
}

type LocaleProposalValueInput = {
	messageId: string;
	value: string;
	sourceFingerprint: string;
	intentionalBlankReason?: string;
};

function localeProposalValues(
	body: Record<string, unknown>,
): LocaleProposalValueInput[] {
	return optionalJsonArray(body, "items").map((item, index) => {
		if (!isRecord(item)) throw new Error(`items[${index}] must be an object.`);
		const intentionalBlankReason = item.intentionalBlankReason;
		if (
			intentionalBlankReason !== undefined &&
			typeof intentionalBlankReason !== "string"
		) {
			throw new Error(
				`items[${index}].intentionalBlankReason must be a string.`,
			);
		}
		return {
			messageId: requiredJsonString(item, "messageId"),
			value: jsonString(item, "value"),
			sourceFingerprint: requiredJsonString(item, "sourceFingerprint"),
			...(intentionalBlankReason === undefined
				? {}
				: { intentionalBlankReason }),
		};
	});
}

type TranslationProposalTargetInput =
	| { kind: "catalogWorkspace" }
	| { kind: "localeProposal"; localeProposalId: string };

type TranslationProposalRevisionHttpInput = {
	messageId: string;
	localeId?: string;
	value: string;
	clientRevisionKey: string;
	expectedCandidateRevision: number;
	basis:
		| {
				kind: "catalogWorkspace";
				projectionId: string;
				snapshotId: string;
				gitValueFingerprint: string;
				gitValueRevision: number;
				workspaceRevision: number;
				sourceFingerprint: string;
		  }
		| {
				kind: "localeProposal";
				localeProposalId: string;
				snapshotId: string;
				sourceFingerprint: string;
		  };
};

function translationProposalTarget(
	body: Record<string, unknown>,
): TranslationProposalTargetInput {
	const target = body.target;
	if (!isRecord(target) || typeof target.kind !== "string") {
		throw new Error("target must be an object with a kind.");
	}
	if (target.kind === "catalogWorkspace") return { kind: "catalogWorkspace" };
	if (
		target.kind === "localeProposal" &&
		typeof target.localeProposalId === "string" &&
		target.localeProposalId.length > 0
	) {
		return {
			kind: "localeProposal",
			localeProposalId: target.localeProposalId,
		};
	}
	throw new Error("target must describe catalogWorkspace or localeProposal.");
}

function requiredJsonNumber(
	body: Record<string, unknown>,
	field: string,
): number {
	const value = body[field];
	if (typeof value !== "number" || !Number.isSafeInteger(value)) {
		throw new Error(`${field} must be a safe integer.`);
	}
	return value;
}

function translationProposalRevisionItems(
	body: Record<string, unknown>,
): TranslationProposalRevisionHttpInput[] {
	return optionalJsonArray(body, "items").map((item, index) => {
		if (!isRecord(item)) throw new Error(`items[${index}] must be an object.`);
		const basis = item.basis;
		if (!isRecord(basis))
			throw new Error(`items[${index}].basis must be an object.`);
		// Catalog Workspace basis predated the discriminant; keep that wire
		// representation readable while making Locale Proposal evidence explicit.
		const kind =
			basis.kind ??
			(typeof basis.projectionId === "string" ? "catalogWorkspace" : undefined);
		if (kind === "catalogWorkspace") {
			return {
				messageId: requiredJsonString(item, "messageId"),
				localeId: requiredJsonString(item, "localeId"),
				value: jsonString(item, "value"),
				clientRevisionKey: requiredJsonString(item, "clientRevisionKey"),
				expectedCandidateRevision: requiredJsonNumber(
					item,
					"expectedCandidateRevision",
				),
				basis: {
					kind,
					projectionId: requiredJsonString(basis, "projectionId"),
					snapshotId: requiredJsonString(basis, "snapshotId"),
					gitValueFingerprint: requiredJsonString(basis, "gitValueFingerprint"),
					gitValueRevision: requiredJsonNumber(basis, "gitValueRevision"),
					workspaceRevision: requiredJsonNumber(basis, "workspaceRevision"),
					sourceFingerprint: requiredJsonString(basis, "sourceFingerprint"),
				},
			};
		}
		if (kind !== "localeProposal") {
			throw new Error(`items[${index}].basis.kind is invalid.`);
		}
		return {
			messageId: requiredJsonString(item, "messageId"),
			value: jsonString(item, "value"),
			clientRevisionKey: requiredJsonString(item, "clientRevisionKey"),
			expectedCandidateRevision: requiredJsonNumber(
				item,
				"expectedCandidateRevision",
			),
			basis: {
				kind,
				localeProposalId: requiredJsonString(basis, "localeProposalId"),
				snapshotId: requiredJsonString(basis, "snapshotId"),
				sourceFingerprint: requiredJsonString(basis, "sourceFingerprint"),
			},
		};
	});
}

function readToken(request: Request): string {
	const header = request.headers.get("Authorization") ?? "";
	const [, token] = header.match(/^Bearer\s+(.+)$/i) ?? [];
	if (!token) throw new Error("Missing bearer token.");
	return token;
}

async function withAgent<T>(
	ctx: ActionCtx,
	request: Request,
	scope: AgentScope | readonly AgentScope[],
	rateLimitName: AgentRateLimitName,
	handler: (token: string, actor: ProposalActor) => Promise<T>,
): Promise<{ value: T; responseHeaders: Record<string, string> }> {
	const token = readToken(request);
	const scopes = Array.isArray(scope) ? scope : [scope];
	const [firstScope, ...remainingScopes] = scopes;
	if (!firstScope) throw new Error("Missing required API token scope.");
	const auth = await ctx.runQuery(internalApi.agentApi.authenticateToken, {
		token,
		scope: firstScope,
	});
	for (const requiredScope of remainingScopes) {
		await ctx.runQuery(internalApi.agentApi.authenticateToken, {
			token,
			scope: requiredScope,
		});
	}
	const compatibility = await ctx.runQuery(
		internalApi.agentApi.cliCompatibility,
		{ projectId: auth.projectId },
	);
	const protocolHeader = request.headers.get("X-Blabla-CLI-Protocol");
	const protocol = protocolHeader === null ? undefined : Number(protocolHeader);
	if (
		compatibility.minimumProtocol !== undefined &&
		(protocol === undefined ||
			!Number.isSafeInteger(protocol) ||
			protocol < compatibility.minimumProtocol)
	) {
		throw new ConvexError({
			code: "CLI_UPGRADE_REQUIRED",
			message: `Blabla requires CLI protocol ${compatibility.minimumProtocol}. Install a compatible Blabla CLI and retry.`,
		});
	}
	await ctx.runMutation(internalApi.rateLimits.consume, {
		name: rateLimitName,
		key: auth._id,
	});
	await ctx.runMutation(internalApi.agentApi.touchToken, { tokenId: auth._id });
	return {
		value: await handler(token, {
			projectId: auth.projectId,
			tokenId: auth._id,
		}),
		responseHeaders: {
			...(compatibility.minimumVersion === undefined
				? {}
				: { "X-Blabla-Minimum-CLI-Version": compatibility.minimumVersion }),
			...(compatibility.minimumProtocol === undefined
				? {}
				: {
						"X-Blabla-Minimum-CLI-Protocol": String(
							compatibility.minimumProtocol,
						),
					}),
		},
	};
}

async function withRepositoryAdapter<T>(
	ctx: ActionCtx,
	request: Request,
	rateLimitName: RepositoryAdapterRateLimitName,
	handler: (auth: {
		projectId: Id<"projects">;
		tokenId: Id<"apiTokens">;
	}) => Promise<T>,
): Promise<{ value: T; responseHeaders: Record<string, string> }> {
	const token = readToken(request);
	const auth = await ctx.runQuery(internalApi.agentApi.authenticateToken, {
		token,
		scope: "snapshot-submission",
	});
	const compatibility = await ctx.runQuery(
		internalApi.agentApi.cliCompatibility,
		{ projectId: auth.projectId },
	);
	const protocolHeader = request.headers.get("X-Blabla-CLI-Protocol");
	const protocol = protocolHeader === null ? undefined : Number(protocolHeader);
	if (
		compatibility.minimumProtocol !== undefined &&
		(protocol === undefined ||
			!Number.isSafeInteger(protocol) ||
			protocol < compatibility.minimumProtocol)
	) {
		throw new ConvexError({
			code: "CLI_UPGRADE_REQUIRED",
			message: `Blabla requires CLI protocol ${compatibility.minimumProtocol}. Install a compatible Blabla CLI and retry.`,
		});
	}
	await ctx.runMutation(internalApi.rateLimits.consume, {
		name: rateLimitName,
		key: auth._id,
	});
	await ctx.runMutation(internalApi.agentApi.touchToken, { tokenId: auth._id });
	return {
		value: await handler({ projectId: auth.projectId, tokenId: auth._id }),
		responseHeaders: {
			...(compatibility.minimumVersion === undefined
				? {}
				: { "X-Blabla-Minimum-CLI-Version": compatibility.minimumVersion }),
			...(compatibility.minimumProtocol === undefined
				? {}
				: {
						"X-Blabla-Minimum-CLI-Protocol": String(
							compatibility.minimumProtocol,
						),
					}),
		},
	};
}

function agentJson<T>(result: {
	value: T;
	responseHeaders: Record<string, string>;
}) {
	return json(result.value, 200, result.responseHeaders);
}

function routeError(error: unknown) {
	const details =
		error instanceof ConvexError && isRecord(error.data)
			? error.data
			: undefined;
	const code = typeof details?.code === "string" ? details.code : undefined;
	const message =
		typeof details?.message === "string"
			? details.message
			: error instanceof Error
				? error.message
				: "Request failed.";
	const diagnostics = isStringArray(details?.diagnostics)
		? details.diagnostics
		: undefined;
	const diagnosticCount =
		typeof details?.diagnosticCount === "number"
			? details.diagnosticCount
			: undefined;
	const isAuthError =
		code === "UNAUTHORIZED" ||
		/\b(Missing bearer|Invalid\b.*\b(token|bearer|authorization))\b/i.test(
			message,
		) ||
		(error instanceof Error && error.name === "UnauthorizedError");
	const status = isAuthError
		? 401
		: code === "CLI_UPGRADE_REQUIRED"
			? 426
			: code === "REPOSITORY_MISMATCH" || code === "CONFLICT"
				? 409
				: code === "LIMIT_EXCEEDED"
					? 413
					: 400;
	return json(
		{
			error: message,
			...(code === undefined ? {} : { code }),
			...(diagnosticCount === undefined ? {} : { diagnosticCount }),
			...(diagnostics === undefined ? {} : { diagnostics }),
		},
		status,
	);
}

authComponent.registerRoutesLazy(http, createAuth, {
	cors: true,
	trustedOrigins: getTrustedOrigins(),
});

http.route({
	pathPrefix: "/api/agent/v1/",
	method: "OPTIONS",
	handler: httpAction(
		async () => new Response(null, { status: 204, headers: corsHeaders }),
	),
});

http.route({
	pathPrefix: "/api/repository-adapter/v1/",
	method: "OPTIONS",
	handler: httpAction(
		async () => new Response(null, { status: 204, headers: corsHeaders }),
	),
});

http.route({
	path: "/api/repository-adapter/v1/snapshot-context",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			return agentJson(
				await withRepositoryAdapter(
					ctx,
					request,
					"repositorySnapshotContext",
					async ({ projectId, tokenId }) =>
						await ctx.runQuery(internalApi.snapshots.repositoryAdapterContext, {
							projectId,
							actor: { kind: "repositoryAdapter", id: tokenId },
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/repository-adapter/v1/snapshots",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await jsonObject(request);
			const repository = requiredJsonString(body, "repository");
			const commit = requiredJsonString(body, "commit");
			const files = snapshotFiles(body);
			const lineage = snapshotLineage(body);
			return agentJson(
				await withRepositoryAdapter(
					ctx,
					request,
					"repositorySnapshotSubmit",
					async ({ projectId, tokenId }) => {
						const actor = { kind: "repositoryAdapter" as const, id: tokenId };
						const result = await ctx.runAction(
							internalApi.snapshots.ingestFromRepositoryAdapter,
							{ projectId, repository, commit, files, lineage, actor },
						);
						return await ctx.runQuery(
							internalApi.snapshots.repositoryAdapterReceipt,
							{ runId: result.runId, actor },
						);
					},
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/projects/current",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			return agentJson(
				await withAgent(
					ctx,
					request,
					"read",
					"agentRead",
					async (token) =>
						await ctx.runQuery(internalApi.agentApi.currentProject, { token }),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/strings/search",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const url = new URL(request.url);
			return agentJson(
				await withAgent(
					ctx,
					request,
					"search",
					"agentSearch",
					async (token) =>
						await ctx.runQuery(internalApi.agentApi.searchStrings, {
							token,
							q: url.searchParams.get("q") ?? undefined,
							locale: url.searchParams.get("locale") ?? undefined,
							screen: url.searchParams.get("screen") ?? undefined,
							tag: url.searchParams.get("tag") ?? undefined,
							status: optionalStringStatus(url.searchParams.get("status")),
							limit: Number(url.searchParams.get("limit") ?? 25),
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/workspace/search",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const url = new URL(request.url);
			return agentJson(
				await withAgent(
					ctx,
					request,
					"search",
					"agentSearch",
					async (token) =>
						await ctx.runQuery(
							internalApi.agentTranslationProposals.workspaceSearch,
							{
								token,
								q: url.searchParams.get("q") ?? undefined,
								localeCode: url.searchParams.get("localeCode") ?? undefined,
								limit: Number(url.searchParams.get("limit") ?? 50),
							},
						),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/workspace/context",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await jsonObject(request);
			const keys = body.keys;
			const locales = body.locales;
			if (!isStringArray(keys) || !isStringArray(locales)) {
				throw new Error("keys and locales must be string arrays.");
			}
			return agentJson(
				await withAgent(
					ctx,
					request,
					"read",
					"agentRead",
					async (token) =>
						await ctx.runQuery(
							internalApi.agentTranslationProposals.workspaceContext,
							{ token, keys, locales },
						),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/workspace/ordinary-confirmations",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const url = new URL(request.url);
			return agentJson(
				await withAgent(
					ctx,
					request,
					"read",
					"agentRead",
					async (_token, actor) =>
						await ctx.runQuery(
							internalApi.ordinaryImportRuns.pageOrdinaryImportCandidates,
							{
								projectId: actor.projectId,
								cursor: url.searchParams.get("cursor") ?? "",
								limit: Number(url.searchParams.get("limit") ?? 100),
							},
						),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/context",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await request.json();
			return agentJson(
				await withAgent(
					ctx,
					request,
					"read",
					"agentRead",
					async (token) =>
						await ctx.runQuery(internalApi.agentApi.getContext, {
							token,
							keys: body.keys ?? [],
							locales: body.locales ?? [],
							includeHistory: Boolean(body.includeHistory),
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/change-sets",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await request.json();
			const agentResult = await withAgent(
				ctx,
				request,
				"propose",
				"agentCreateChangeSet",
				async (token) =>
					await ctx.runMutation(internalApi.agentApi.createChangeSetFromKeys, {
						token,
						title: body.title,
						description: body.description,
						items: body.items ?? [],
					}),
			);
			return json(
				{
					changeSetId: agentResult.value.changeSetId,
					status: "open",
					itemsProposed: agentResult.value.proposed,
					itemsConflicted: agentResult.value.conflicts,
					itemsRejected: agentResult.value.rejected,
					itemsAccepted:
						agentResult.value.proposed - agentResult.value.conflicts,
					reviewUrl: `/projects/${agentResult.value.projectId}/reviews/${agentResult.value.changeSetId}`,
				},
				200,
				agentResult.responseHeaders,
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/translation-proposals",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await jsonObject(request);
			return agentJson(
				await withAgent(
					ctx,
					request,
					["read", "propose"],
					"agentTranslationProposal",
					async (token) =>
						await ctx.runMutation(
							internalApi.agentTranslationProposals.create,
							{
								token,
								clientProposalKey: requiredJsonString(
									body,
									"clientProposalKey",
								),
								target: (() => {
									const target = translationProposalTarget(body);
									return target.kind === "localeProposal"
										? {
												kind: target.kind,
												localeProposalId:
													target.localeProposalId as Id<"localeProposals">,
											}
										: target;
								})(),
							},
						),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	pathPrefix: "/api/agent/v1/translation-proposals/",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const suffix = new URL(request.url).pathname.replace(
				"/api/agent/v1/translation-proposals/",
				"",
			);
			const candidatesSuffix = "/candidates";
			const isCandidates = suffix.endsWith(candidatesSuffix);
			const proposalId = (
				isCandidates ? suffix.slice(0, -candidatesSuffix.length) : suffix
			) as Id<"agentTranslationProposals">;
			if (!proposalId) throw new Error("Missing translation proposal id.");
			const url = new URL(request.url);
			const numItems = Math.min(
				16,
				Math.max(1, Number(url.searchParams.get("limit") ?? 16)),
			);
			const cursor = url.searchParams.get("cursor");
			return agentJson(
				await withAgent(
					ctx,
					request,
					isCandidates ? ["read", "propose"] : "read",
					"agentTranslationProposal",
					async (token) =>
						isCandidates
							? await ctx.runQuery(
									internalApi.agentTranslationProposals.listCandidates,
									{
										token,
										proposalId,
										paginationOpts: { numItems, cursor },
									},
								)
							: await ctx.runQuery(internalApi.agentTranslationProposals.get, {
									token,
									proposalId,
								}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	pathPrefix: "/api/agent/v1/translation-proposals/",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const suffix = new URL(request.url).pathname.replace(
				"/api/agent/v1/translation-proposals/",
				"",
			);
			const marker = "/candidate-revisions";
			if (!suffix.endsWith(marker)) {
				throw new Error("Expected /candidate-revisions.");
			}
			const proposalId = suffix.slice(
				0,
				-marker.length,
			) as Id<"agentTranslationProposals">;
			const body = await jsonObject(request);
			const rawItems = translationProposalRevisionItems(body);
			const items = rawItems.map((item) =>
				item.basis.kind === "catalogWorkspace"
					? {
							...item,
							localeId: item.localeId as Id<"locales">,
							basis: {
								kind: item.basis.kind,
								projectionId: item.basis
									.projectionId as Id<"catalogProjections">,
								snapshotId: item.basis.snapshotId as Id<"sourceSnapshots">,
								gitValueFingerprint: item.basis.gitValueFingerprint,
								gitValueRevision: item.basis.gitValueRevision,
								workspaceRevision: item.basis.workspaceRevision,
								sourceFingerprint: item.basis.sourceFingerprint,
							},
						}
					: (() => {
							const { localeId: _localeId, ...rest } = item;
							return {
								...rest,
								basis: {
									kind: item.basis.kind,
									localeProposalId: item.basis
										.localeProposalId as Id<"localeProposals">,
									snapshotId: item.basis.snapshotId as Id<"sourceSnapshots">,
									sourceFingerprint: item.basis.sourceFingerprint,
								},
							};
						})(),
			);
			return agentJson(
				await withAgent(
					ctx,
					request,
					["read", "propose"],
					"agentTranslationProposal",
					async (token) =>
						await ctx.runMutation(
							internalApi.agentTranslationProposals.submitRevisions,
							{ token, proposalId, items },
						),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/locale-proposals/pt",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			return agentJson(
				await withAgent(
					ctx,
					request,
					["read", "propose"],
					"agentLocaleProposal",
					async (_token, actor) => await createOrResumeProposal(ctx, actor),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/locale-proposals/pt",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const proposalId = localeProposalId(
				new URL(request.url).searchParams.get("proposalId"),
			);
			return agentJson(
				await withAgent(
					ctx,
					request,
					["read", "propose"],
					"agentLocaleProposal",
					async (_token, actor) => await readProposal(ctx, actor, proposalId),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/locale-proposals/pt/template",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const url = new URL(request.url);
			const proposalId = localeProposalId(url.searchParams.get("proposalId"));
			return agentJson(
				await withAgent(
					ctx,
					request,
					["read", "propose"],
					"agentLocaleProposal",
					async (_token, actor) =>
						await templateProposal(ctx, actor, {
							proposalId,
							cursor: Number(url.searchParams.get("cursor") ?? 0),
							limit: Number(url.searchParams.get("limit") ?? 16),
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/locale-proposals/pt/values",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const url = new URL(request.url);
			const proposalId = localeProposalId(url.searchParams.get("proposalId"));
			return agentJson(
				await withAgent(
					ctx,
					request,
					["read", "propose"],
					"agentLocaleProposal",
					async (_token, actor) =>
						await reviewProposalValues(ctx, actor, {
							proposalId,
							cursor: Number(url.searchParams.get("cursor") ?? 0),
							limit: Number(url.searchParams.get("limit") ?? 16),
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/locale-proposals/pt/values",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await jsonObject(request);
			return agentJson(
				await withAgent(
					ctx,
					request,
					["read", "propose"],
					"agentLocaleProposal",
					async (_token, actor) =>
						await stageProposal(ctx, actor, {
							proposalId: localeProposalId(
								requiredJsonString(body, "proposalId"),
							),
							items: localeProposalValues(body),
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/locale-proposals/pt/finalize",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await jsonObject(request);
			return agentJson(
				await withAgent(
					ctx,
					request,
					["read", "propose"],
					"agentLocaleProposal",
					async (_token, actor) =>
						await finalizeProposal(
							ctx,
							actor,
							localeProposalId(requiredJsonString(body, "proposalId")),
						),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/locale-proposals/pt/artifact",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const proposalId = localeProposalId(
				new URL(request.url).searchParams.get("proposalId"),
			);
			return agentJson(
				await withAgent(
					ctx,
					request,
					["read", "propose"],
					"agentLocaleProposal",
					async (_token, actor) =>
						await readProposalArtifact(ctx, actor, proposalId),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/strings/tags",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await request.json();
			const agentResult = await withAgent(
				ctx,
				request,
				"propose",
				"agentCreateChangeSet",
				async (token) =>
					await ctx.runMutation(internalApi.agentApi.proposeTagBatch, {
						token,
						title: body.title,
						description: body.description,
						selection: body.selection ?? { type: "keys", keys: [] },
						tagSlugs: body.tagSlugs ?? [],
					}),
			);
			return json(
				{
					changeSetId: agentResult.value.changeSetId,
					status: "open",
					itemsProposed: agentResult.value.proposed,
					itemsConflicted: 0,
					itemsRejected: agentResult.value.rejected,
					itemsAccepted: agentResult.value.proposed,
					reviewUrl: `/projects/${agentResult.value.projectId}/reviews/${agentResult.value.changeSetId}`,
				},
				200,
				agentResult.responseHeaders,
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	pathPrefix: "/api/agent/v1/change-sets/",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const id = new URL(request.url).pathname.replace(
				"/api/agent/v1/change-sets/",
				"",
			);
			return agentJson(
				await withAgent(
					ctx,
					request,
					"read",
					"agentRead",
					async (token) =>
						await ctx.runQuery(internalApi.agentApi.getChangeSet, {
							token,
							changeSetId: id as Id<"changeSets">,
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/export",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await request.json();
			return agentJson(
				await withAgent(
					ctx,
					request,
					"export",
					"agentExport",
					async (token) =>
						await ctx.runQuery(internalApi.agentApi.exportContent, {
							token,
							format: body.format,
							locale: body.locale,
							selection: body.selection ?? { type: "all" },
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

export default http;
