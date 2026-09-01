import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { hashToken } from "./apiTokens";
import { activeProjectionFor, activeWorkingCatalog } from "./catalogProjection";
import {
	applyAgentTargetValue,
	MAX_CATALOG_WORKSPACE_VALUE_HEADS,
} from "./catalogWorkspace";
import { assertTargetValueContract } from "./contractTransforms";
import { type HumanActor, now, sha256Hex } from "./lib";
import { requireEditor, requireViewer } from "./permissions";
import {
	isCurrentSourceProposalHeadForSource,
	publishedResolutionFor,
	sourceProposalHeadFor,
} from "./sourceProposals";

const MAX_PROPOSAL_CLIENT_KEY_BYTES = 256;
const MAX_REVISION_CLIENT_KEY_BYTES = 256;
const MAX_CANDIDATE_VALUE_BYTES = 256 * 1024;
const MAX_SUBMISSION_ITEMS = 16;
const MAX_SUBMISSION_BYTES = 512 * 1024;
const MAX_CANDIDATES = 128;
const MAX_REVISIONS = 256;
const MAX_RETAINED_BYTES = 4 * 1024 * 1024;
const MAX_CONTEXT_KEYS = 50;
const MAX_CONTEXT_LOCALES = 20;
const MAX_CONTEXT_PAIRS = 128;
const MAX_DISCOVERY_RESULTS = 50;
const MAX_DISCOVERY_RESPONSE_BYTES = 512 * 1024;

const targetValidator = v.union(
	v.object({ kind: v.literal("catalogWorkspace") }),
	v.object({
		kind: v.literal("localeProposal"),
		localeProposalId: v.id("localeProposals"),
	}),
);

const candidateRevisionInputValidator = v.object({
	messageId: v.string(),
	localeId: v.optional(v.id("locales")),
	value: v.string(),
	clientRevisionKey: v.string(),
	expectedCandidateRevision: v.number(),
	basis: v.union(
		v.object({
			kind: v.literal("catalogWorkspace"),
			projectionId: v.id("catalogProjections"),
			snapshotId: v.id("sourceSnapshots"),
			gitValueFingerprint: v.string(),
			gitValueRevision: v.number(),
			workspaceRevision: v.number(),
			sourceFingerprint: v.string(),
		}),
		v.object({
			kind: v.literal("localeProposal"),
			localeProposalId: v.id("localeProposals"),
			snapshotId: v.id("sourceSnapshots"),
			sourceFingerprint: v.string(),
		}),
	),
});

const reviewDecisionValidator = v.union(
	v.object({ kind: v.literal("accept") }),
	v.object({ kind: v.literal("acceptWithEdits"), value: v.string() }),
	v.object({
		kind: v.literal("reject"),
		reason: v.optional(v.string()),
	}),
	v.object({ kind: v.literal("intentionalBlank"), reason: v.string() }),
);

type ProposalTarget =
	| { kind: "catalogWorkspace" }
	| { kind: "localeProposal"; localeProposalId: Id<"localeProposals"> };

type CandidateRevisionInput = {
	messageId: string;
	localeId?: Id<"locales">;
	value: string;
	clientRevisionKey: string;
	expectedCandidateRevision: number;
	basis:
		| {
				kind: "catalogWorkspace";
				projectionId: Id<"catalogProjections">;
				snapshotId: Id<"sourceSnapshots">;
				gitValueFingerprint: string;
				gitValueRevision: number;
				workspaceRevision: number;
				sourceFingerprint: string;
		  }
		| {
				kind: "localeProposal";
				localeProposalId: Id<"localeProposals">;
				snapshotId: Id<"sourceSnapshots">;
				sourceFingerprint: string;
		  };
};

function byteLength(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function assertBoundedString(value: string, name: string, limit: number): void {
	if (value.trim().length === 0 || byteLength(value) > limit) {
		throw new ConvexError({
			code: "VALIDATION",
			message: `${name} exceeds its supported envelope.`,
		});
	}
}

function assertNonNegativeInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new ConvexError({
			code: "VALIDATION",
			message: `${name} must be a non-negative integer.`,
		});
	}
}

async function authenticate(
	ctx: QueryCtx | MutationCtx,
	rawToken: string,
	scope: "read" | "search" | "propose",
) {
	const token = await ctx.db
		.query("apiTokens")
		.withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(rawToken)))
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

async function proposalForToken(
	ctx: QueryCtx | MutationCtx,
	proposalId: Id<"agentTranslationProposals">,
	tokenId: Id<"apiTokens">,
) {
	const proposal = await ctx.db.get(proposalId);
	if (!proposal || proposal.createdByTokenId !== tokenId) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Translation proposal not found.",
		});
	}
	return proposal;
}

function proposalSummary(proposal: {
	_id: Id<"agentTranslationProposals">;
	projectId: Id<"projects">;
	clientProposalKey: string;
	target: ProposalTarget;
	status: "open" | "accepted" | "rejected";
	candidateCount: number;
	revisionCount: number;
	retainedByteLength: number;
	createdAt: number;
	updatedAt: number;
}) {
	return {
		proposalId: proposal._id,
		projectId: proposal.projectId,
		clientProposalKey: proposal.clientProposalKey,
		target: proposal.target,
		status: proposal.status,
		candidateCount: proposal.candidateCount,
		revisionCount: proposal.revisionCount,
		retainedByteLength: proposal.retainedByteLength,
		createdAt: proposal.createdAt,
		updatedAt: proposal.updatedAt,
	};
}

async function currentWorkspaceTarget(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
	messageId: string,
	localeId: Id<"locales">,
) {
	const [project, projection] = await Promise.all([
		ctx.db.get(projectId),
		activeProjectionFor(ctx, projectId),
	]);
	const sourceLocaleId = project?.sourceLocaleId;
	if (!project || !sourceLocaleId || !projection?.snapshotId) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "No active Baseline Catalog is available for this project.",
		});
	}
	const [source, target, head] = await Promise.all([
		ctx.db
			.query("catalogProjectionMessages")
			.withIndex("by_projection_and_messageId_and_localeId", (q) =>
				q
					.eq("projectionId", projection._id)
					.eq("messageId", messageId)
					.eq("localeId", sourceLocaleId),
			)
			.unique(),
		ctx.db
			.query("catalogProjectionMessages")
			.withIndex("by_projection_and_messageId_and_localeId", (q) =>
				q
					.eq("projectionId", projection._id)
					.eq("messageId", messageId)
					.eq("localeId", localeId),
			)
			.unique(),
		ctx.db
			.query("catalogWorkspaceValueHeads")
			.withIndex("by_project_and_messageId_and_localeId", (q) =>
				q
					.eq("projectId", projectId)
					.eq("messageId", messageId)
					.eq("localeId", localeId),
			)
			.unique(),
	]);
	if (!source?.isSource || !target || target.isSource) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "The requested Catalog Workspace target is not active.",
		});
	}
	if (target.gitValueFingerprint === undefined) {
		throw new ConvexError({
			code: "STALE_BASIS",
			message:
				"This target predates Git value identity. Refresh the active Catalog Workspace before proposing it.",
		});
	}
	const currentHead =
		head &&
		head.basisGitValueFingerprint === target.gitValueFingerprint &&
		head.basisGitValueRevision === (target.gitValueRevision ?? 0)
			? head
			: undefined;
	const sourceProposalHead = await sourceProposalHeadFor(
		ctx,
		projectId,
		messageId,
	);
	const sourceProposalResolution = sourceProposalHead
		? await publishedResolutionFor(ctx, {
				_id: sourceProposalHead.proposalId,
				projectId,
				messageId,
			})
		: null;
	const effectiveSource =
		isCurrentSourceProposalHeadForSource(source, sourceProposalHead) &&
		!sourceProposalResolution
			? {
					...source,
					value: sourceProposalHead.sourceValue,
					valueFingerprint: sourceProposalHead.sourceFingerprint,
					sourceFingerprint: sourceProposalHead.sourceFingerprint,
				}
			: source;
	return {
		projection,
		source: effectiveSource,
		target,
		value: currentHead?.value ?? target.value,
		valueFingerprint:
			currentHead?.valueFingerprint ??
			(await sha256Hex(currentHead?.value ?? target.value)),
		workspaceRevision: currentHead?.revision ?? 0,
	};
}

async function currentLocaleProposalTarget(
	ctx: QueryCtx | MutationCtx,
	proposal: {
		projectId: Id<"projects">;
		target: ProposalTarget;
	},
	messageId: string,
) {
	if (proposal.target.kind !== "localeProposal") {
		throw new ConvexError({
			code: "INTEGRITY",
			message: "The proposal target is not a Locale Proposal.",
		});
	}
	const localeProposal = await ctx.db.get(proposal.target.localeProposalId);
	if (!localeProposal || localeProposal.projectId !== proposal.projectId) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Locale Proposal not found for this project.",
		});
	}
	const project = await ctx.db.get(proposal.projectId);
	const projection = project
		? await activeProjectionFor(ctx, proposal.projectId)
		: null;
	const sourceRow =
		project && projection
			? await ctx.db
					.query("catalogProjectionMessages")
					.withIndex("by_projection_and_messageId_and_isSource", (q) =>
						q
							.eq("projectionId", projection._id)
							.eq("messageId", messageId)
							.eq("isSource", true),
					)
					.unique()
			: null;
	if (
		!project ||
		!projection ||
		projection.snapshotId !== localeProposal.sourceSnapshotId ||
		!sourceRow?.isSource ||
		localeProposal.status !== "draft"
	) {
		throw new ConvexError({
			code: "STALE_BASIS",
			message: "The Locale Proposal is no longer an editable current draft.",
		});
	}
	return {
		localeProposal,
		source: {
			sourceSnapshotId: localeProposal.sourceSnapshotId,
			isCurrentBaseline:
				project.baselineSnapshotId === localeProposal.sourceSnapshotId,
			localeCode: localeProposal.localeCode,
			sourceValue: sourceRow.value,
			sourceFingerprint: sourceRow.sourceFingerprint,
			source: {
				icuType: sourceRow.icuType,
				argumentNames: sourceRow.argumentNames,
				argumentNamesComplete: sourceRow.argumentNamesComplete,
				declaredPlaceholderNames: sourceRow.declaredPlaceholderNames ?? [],
				declaredPlaceholderNamesComplete:
					sourceRow.declaredPlaceholderNamesComplete ?? true,
			},
		},
	};
}

function discoveryEntry(
	current: Awaited<ReturnType<typeof currentWorkspaceTarget>>,
) {
	if (!current.projection.snapshotId) {
		throw new ConvexError({
			code: "INTEGRITY",
			message: "The active Catalog Workspace is missing Snapshot identity.",
		});
	}
	return {
		messageId: current.target.messageId,
		localeId: current.target.localeId,
		localeCode: current.target.localeCode,
		source: {
			value: current.source.value,
			fingerprint: current.source.sourceFingerprint,
			icuType: current.source.icuType,
			argumentNames: current.source.argumentNames,
			argumentNamesComplete: current.source.argumentNamesComplete,
			declaredPlaceholderNames: current.source.declaredPlaceholderNames ?? [],
			declaredPlaceholderNamesComplete:
				current.source.declaredPlaceholderNamesComplete ?? true,
		},
		target: {
			value: current.value,
			valueFingerprint: current.valueFingerprint,
			gitValueFingerprint: current.target.gitValueFingerprint,
			gitValueRevision: current.target.gitValueRevision ?? 0,
			workspaceRevision: current.workspaceRevision,
			catalogPath: current.target.catalogPath,
			sourceFingerprint: current.target.sourceFingerprint,
		},
		basis: {
			projectionId: current.projection._id,
			snapshotId: current.projection.snapshotId,
			gitValueFingerprint: current.target.gitValueFingerprint,
			gitValueRevision: current.target.gitValueRevision ?? 0,
			workspaceRevision: current.workspaceRevision,
			sourceFingerprint: current.source.sourceFingerprint,
		},
	};
}

function assertDiscoveryResponse(value: unknown): void {
	if (byteLength(value) > MAX_DISCOVERY_RESPONSE_BYTES) {
		throw new ConvexError({
			code: "LIMIT_EXCEEDED",
			message: "Workspace discovery response exceeds its byte envelope.",
		});
	}
}

export const workspaceContext = internalQuery({
	args: {
		token: v.string(),
		keys: v.array(v.string()),
		locales: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "read");
		if (
			args.keys.length > MAX_CONTEXT_KEYS ||
			args.locales.length > MAX_CONTEXT_LOCALES ||
			args.keys.length * args.locales.length > MAX_CONTEXT_PAIRS
		) {
			throw new ConvexError({
				code: "LIMIT_EXCEEDED",
				message: `Workspace context supports at most ${MAX_CONTEXT_KEYS} keys, ${MAX_CONTEXT_LOCALES} Locales, and ${MAX_CONTEXT_PAIRS} pairs.`,
			});
		}
		const localeIds = new Map<string, Id<"locales">>();
		for (const code of args.locales) {
			const locale = await ctx.db
				.query("locales")
				.withIndex("by_project_code", (q) =>
					q.eq("projectId", token.projectId).eq("code", code),
				)
				.unique();
			if (locale && locale.archivedAt === undefined) {
				localeIds.set(code, locale._id);
			}
		}
		const rows = [];
		for (const messageId of args.keys) {
			for (const localeId of localeIds.values()) {
				try {
					rows.push(
						discoveryEntry(
							await currentWorkspaceTarget(
								ctx,
								token.projectId,
								messageId,
								localeId,
							),
						),
					);
				} catch (error) {
					if (
						error instanceof ConvexError &&
						typeof error.data === "object" &&
						error.data !== null &&
						"code" in error.data &&
						error.data.code === "NOT_FOUND"
					) {
						continue;
					}
					throw error;
				}
			}
		}
		const result = { rows };
		assertDiscoveryResponse(result);
		return result;
	},
});

export const workspaceSearch = internalQuery({
	args: {
		token: v.string(),
		q: v.optional(v.string()),
		localeCode: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "search");
		const active = await activeWorkingCatalog(ctx, token.projectId);
		if (!active) return { results: [], hasMore: false };
		const limit = Math.min(
			MAX_DISCOVERY_RESULTS,
			Math.max(1, Math.trunc(args.limit ?? MAX_DISCOVERY_RESULTS)),
		);
		const heads = await ctx.db
			.query("catalogWorkspaceValueHeads")
			.withIndex("by_project", (q) => q.eq("projectId", token.projectId))
			.take(MAX_CATALOG_WORKSPACE_VALUE_HEADS + 1);
		if (heads.length > MAX_CATALOG_WORKSPACE_VALUE_HEADS) {
			throw new ConvexError({
				code: "INTEGRITY",
				message: "Catalog Workspace exceeds its value-head envelope.",
			});
		}
		const headByIdentity = new Map(
			heads.map((head) => [`${head.messageId}\u0000${head.localeId}`, head]),
		);
		const sourceByMessageId = new Map(
			active.rows
				.filter((row) => row.isSource)
				.map((row) => [row.messageId, row]),
		);
		const needle = args.q?.trim().toLocaleLowerCase() ?? "";
		const matchingRows = active.rows.filter((row) => {
			if (row.isSource) return false;
			if (args.localeCode && row.localeCode !== args.localeCode) return false;
			const source = sourceByMessageId.get(row.messageId);
			const head = headByIdentity.get(`${row.messageId}\u0000${row.localeId}`);
			const visibleValue =
				head &&
				head.basisGitValueFingerprint === row.gitValueFingerprint &&
				head.basisGitValueRevision === (row.gitValueRevision ?? 0)
					? head.value
					: row.value;
			return (
				needle.length === 0 ||
				[row.messageId, source?.value ?? "", visibleValue]
					.join(" ")
					.toLocaleLowerCase()
					.includes(needle)
			);
		});
		const pageRows = matchingRows.slice(0, limit + 1);
		const hasMore = pageRows.length > limit;
		const results = await Promise.all(
			pageRows
				.slice(0, limit)
				.map(async (row) =>
					discoveryEntry(
						await currentWorkspaceTarget(
							ctx,
							token.projectId,
							row.messageId,
							row.localeId,
						),
					),
				),
		);
		const result = { results, hasMore };
		assertDiscoveryResponse(result);
		return result;
	},
});

function assertBasisMatches(
	input: CandidateRevisionInput,
	current: Awaited<ReturnType<typeof currentWorkspaceTarget>>,
): void {
	if (input.basis.kind !== "catalogWorkspace") {
		throw new ConvexError({
			code: "VALIDATION",
			message: "Catalog Workspace candidates need a workspace basis.",
		});
	}
	if (
		input.basis.projectionId !== current.projection._id ||
		input.basis.snapshotId !== current.projection.snapshotId ||
		input.basis.gitValueFingerprint !== current.target.gitValueFingerprint ||
		input.basis.gitValueRevision !== (current.target.gitValueRevision ?? 0) ||
		input.basis.workspaceRevision !== current.workspaceRevision ||
		input.basis.sourceFingerprint !== current.source.sourceFingerprint
	) {
		throw new ConvexError({
			code: "STALE_BASIS",
			message: "The Catalog Workspace basis changed; refresh before proposing.",
			current: {
				projectionId: current.projection._id,
				snapshotId: current.projection.snapshotId,
				gitValueFingerprint: current.target.gitValueFingerprint,
				gitValueRevision: current.target.gitValueRevision ?? 0,
				workspaceRevision: current.workspaceRevision,
				sourceFingerprint: current.source.sourceFingerprint,
				value: current.value,
			},
		});
	}
}

function revisionByteLength(input: {
	value: string;
	clientRevisionKey: string;
	basis: CandidateRevisionInput["basis"];
}): number {
	return byteLength(input);
}

export const create = internalMutation({
	args: {
		token: v.string(),
		clientProposalKey: v.string(),
		target: targetValidator,
	},
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "propose");
		assertBoundedString(
			args.clientProposalKey,
			"clientProposalKey",
			MAX_PROPOSAL_CLIENT_KEY_BYTES,
		);
		if (args.target.kind === "localeProposal") {
			const localeProposal = await ctx.db.get(args.target.localeProposalId);
			if (!localeProposal || localeProposal.projectId !== token.projectId) {
				throw new ConvexError({
					code: "NOT_FOUND",
					message: "Locale Proposal not found for this project.",
				});
			}
		}
		const existing = await ctx.db
			.query("agentTranslationProposals")
			.withIndex("by_project_and_token_and_clientProposalKey", (q) =>
				q
					.eq("projectId", token.projectId)
					.eq("createdByTokenId", token._id)
					.eq("clientProposalKey", args.clientProposalKey),
			)
			.unique();
		if (existing) {
			if (JSON.stringify(existing.target) !== JSON.stringify(args.target)) {
				throw new ConvexError({
					code: "IDEMPOTENCY_KEY_REUSED",
					message:
						"clientProposalKey is already bound to a different proposal target.",
				});
			}
			return proposalSummary(existing);
		}
		const timestamp = now();
		const proposalId = await ctx.db.insert("agentTranslationProposals", {
			projectId: token.projectId,
			createdByTokenId: token._id,
			createdBy: { kind: "agent", id: token._id },
			clientProposalKey: args.clientProposalKey,
			target: args.target,
			status: "open",
			candidateCount: 0,
			revisionCount: 0,
			retainedByteLength: 0,
			createdAt: timestamp,
			updatedAt: timestamp,
		});
		const proposal = await ctx.db.get(proposalId);
		if (!proposal) throw new ConvexError("Proposal was not created.");
		return proposalSummary(proposal);
	},
});

export const submitRevisions = internalMutation({
	args: {
		token: v.string(),
		proposalId: v.id("agentTranslationProposals"),
		items: v.array(candidateRevisionInputValidator),
	},
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "propose");
		const proposal = await proposalForToken(ctx, args.proposalId, token._id);
		if (args.items.length === 0 || args.items.length > MAX_SUBMISSION_ITEMS) {
			throw new ConvexError({
				code: "LIMIT_EXCEEDED",
				message: `A candidate revision batch must contain 1–${MAX_SUBMISSION_ITEMS} items.`,
			});
		}
		if (proposal.status !== "open") {
			throw new ConvexError({
				code: "BAD_STATE",
				message: "A closed translation proposal cannot receive revisions.",
			});
		}
		if (byteLength(args.items) > MAX_SUBMISSION_BYTES) {
			throw new ConvexError({
				code: "LIMIT_EXCEEDED",
				message: "A candidate revision batch exceeds its byte envelope.",
			});
		}
		const results = [];
		const identities = new Set<string>();
		let addedBytes = 0;
		let addedCandidates = 0;
		let addedRevisions = 0;
		for (const item of args.items) {
			assertBoundedString(
				item.clientRevisionKey,
				"clientRevisionKey",
				MAX_REVISION_CLIENT_KEY_BYTES,
			);
			if (item.value.trim().length === 0) {
				throw new ConvexError({
					code: "VALIDATION",
					message:
						"Agent candidate values must be non-empty; intentional blanks are human-only.",
				});
			}
			if (
				new TextEncoder().encode(item.value).byteLength >
				MAX_CANDIDATE_VALUE_BYTES
			) {
				throw new ConvexError({
					code: "LIMIT_EXCEEDED",
					message: "One candidate value exceeds its byte envelope.",
				});
			}
			assertNonNegativeInteger(
				item.expectedCandidateRevision,
				"expectedCandidateRevision",
			);
			const identity =
				item.basis.kind === "localeProposal"
					? `${item.messageId}\u0000localeProposal:${item.basis.localeProposalId}`
					: `${item.messageId}\u0000${item.localeId}`;
			if (identities.has(identity)) {
				throw new ConvexError({
					code: "VALIDATION",
					message: "A revision batch contains a duplicate target.",
				});
			}
			identities.add(identity);
			let candidate: Doc<"agentTranslationCandidates"> | null = null;
			if (proposal.target.kind === "catalogWorkspace") {
				if (
					item.localeId === undefined ||
					item.basis.kind !== "catalogWorkspace"
				) {
					throw new ConvexError({
						code: "VALIDATION",
						message:
							"Catalog Workspace candidates need a Locale and workspace basis.",
					});
				}
				candidate = await ctx.db
					.query("agentTranslationCandidates")
					.withIndex("by_proposal_and_messageId_and_localeId", (q) =>
						q
							.eq("proposalId", proposal._id)
							.eq("messageId", item.messageId)
							.eq("localeId", item.localeId),
					)
					.unique();
			} else {
				const localeProposalId = proposal.target.localeProposalId;
				if (
					item.localeId !== undefined ||
					item.basis.kind !== "localeProposal" ||
					item.basis.localeProposalId !== proposal.target.localeProposalId
				) {
					throw new ConvexError({
						code: "VALIDATION",
						message:
							"Locale Proposal candidates need their proposal source basis.",
					});
				}
				candidate = await ctx.db
					.query("agentTranslationCandidates")
					.withIndex("by_proposal_and_messageId_and_localeProposalId", (q) =>
						q
							.eq("proposalId", proposal._id)
							.eq("messageId", item.messageId)
							.eq("localeProposalId", localeProposalId),
					)
					.unique();
			}
			const existingRevision = candidate
				? await ctx.db
						.query("agentTranslationCandidateRevisions")
						.withIndex("by_candidate_and_clientRevisionKey", (q) =>
							q
								.eq("candidateId", candidate._id)
								.eq("clientRevisionKey", item.clientRevisionKey),
						)
						.unique()
				: null;
			if (existingRevision) {
				if (
					existingRevision.value !== item.value ||
					JSON.stringify(existingRevision.basis) !== JSON.stringify(item.basis)
				) {
					throw new ConvexError({
						code: "IDEMPOTENCY_KEY_REUSED",
						message:
							"clientRevisionKey is already bound to different candidate evidence.",
					});
				}
				results.push({
					candidateId: existingRevision.candidateId,
					revisionId: existingRevision._id,
					revision: existingRevision.revision,
					status: "open" as const,
				});
				continue;
			}
			if (proposal.target.kind === "catalogWorkspace") {
				const current = await currentWorkspaceTarget(
					ctx,
					proposal.projectId,
					item.messageId,
					item.localeId as Id<"locales">,
				);
				assertBasisMatches(item, current);
				assertTargetValueContract({
					messageId: item.messageId,
					localeCode: current.target.localeCode,
					value: item.value,
					source: current.source,
				});
			} else {
				const current = await currentLocaleProposalTarget(
					ctx,
					proposal,
					item.messageId,
				);
				if (
					item.basis.kind !== "localeProposal" ||
					item.basis.snapshotId !== current.source.sourceSnapshotId ||
					item.basis.sourceFingerprint !== current.source.sourceFingerprint
				) {
					throw new ConvexError({
						code: "STALE_BASIS",
						message:
							"The Locale Proposal source basis changed; refresh before proposing.",
					});
				}
				assertTargetValueContract({
					messageId: item.messageId,
					localeCode: current.localeProposal.localeCode,
					value: item.value,
					source: current.source.source,
				});
			}
			const currentRevision = candidate?.currentRevision ?? 0;
			if (item.expectedCandidateRevision !== currentRevision) {
				throw new ConvexError({
					code: "CONFLICT",
					message:
						"The proposal target has a newer candidate revision; submit a correction against it.",
				});
			}
			if (
				!candidate &&
				proposal.candidateCount + addedCandidates >= MAX_CANDIDATES
			) {
				throw new ConvexError({
					code: "LIMIT_EXCEEDED",
					message: "This proposal has reached its candidate target limit.",
				});
			}
			const revision = currentRevision + 1;
			if (proposal.revisionCount + addedRevisions >= MAX_REVISIONS) {
				throw new ConvexError({
					code: "LIMIT_EXCEEDED",
					message: "This proposal has reached its revision limit.",
				});
			}
			const valueFingerprint = await sha256Hex(item.value);
			const retainedBytes = revisionByteLength({
				value: item.value,
				clientRevisionKey: item.clientRevisionKey,
				basis: item.basis,
			});
			addedBytes += retainedBytes;
			if (proposal.retainedByteLength + addedBytes > MAX_RETAINED_BYTES) {
				throw new ConvexError({
					code: "LIMIT_EXCEEDED",
					message: "This proposal has reached its retained evidence limit.",
				});
			}
			const timestamp = now();
			const candidateId =
				candidate?._id ??
				(await ctx.db.insert("agentTranslationCandidates", {
					projectId: proposal.projectId,
					proposalId: proposal._id,
					messageId: item.messageId,
					...(item.localeId === undefined ? {} : { localeId: item.localeId }),
					...(item.basis.kind === "localeProposal"
						? { localeProposalId: item.basis.localeProposalId }
						: {}),
					currentRevision: 0,
					createdAt: timestamp,
					updatedAt: timestamp,
				}));
			const revisionId = await ctx.db.insert(
				"agentTranslationCandidateRevisions",
				{
					projectId: proposal.projectId,
					proposalId: proposal._id,
					candidateId,
					messageId: item.messageId,
					...(item.localeId === undefined ? {} : { localeId: item.localeId }),
					...(item.basis.kind === "localeProposal"
						? { localeProposalId: item.basis.localeProposalId }
						: {}),
					revision,
					clientRevisionKey: item.clientRevisionKey,
					value: item.value,
					valueFingerprint,
					basis: item.basis,
					createdBy: { kind: "agent", id: token._id },
					createdAt: timestamp,
				},
			);
			await ctx.db.patch(candidateId, {
				currentRevision: revision,
				latestRevisionId: revisionId,
				updatedAt: timestamp,
			});
			addedCandidates += candidate ? 0 : 1;
			addedRevisions += 1;
			results.push({
				candidateId,
				revisionId,
				revision,
				status: "open" as const,
			});
		}
		await ctx.db.patch(proposal._id, {
			candidateCount: proposal.candidateCount + addedCandidates,
			revisionCount: proposal.revisionCount + addedRevisions,
			retainedByteLength: proposal.retainedByteLength + addedBytes,
			updatedAt: now(),
		});
		return {
			proposal: proposalSummary({
				...proposal,
				candidateCount: proposal.candidateCount + addedCandidates,
				revisionCount: proposal.revisionCount + addedRevisions,
				retainedByteLength: proposal.retainedByteLength + addedBytes,
				updatedAt: now(),
			}),
			revisions: results,
		};
	},
});

export const get = internalQuery({
	args: {
		token: v.string(),
		proposalId: v.id("agentTranslationProposals"),
	},
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "read");
		const proposal = await proposalForToken(ctx, args.proposalId, token._id);
		return proposalSummary(proposal);
	},
});

export const listCandidates = internalQuery({
	args: {
		token: v.string(),
		proposalId: v.id("agentTranslationProposals"),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const token = await authenticate(ctx, args.token, "read");
		const proposal = await proposalForToken(ctx, args.proposalId, token._id);
		const page = await ctx.db
			.query("agentTranslationCandidates")
			.withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
			.paginate(args.paginationOpts);
		const entries = await Promise.all(
			page.page.map(async (candidate) => {
				const revision = candidate.latestRevisionId
					? await ctx.db.get(candidate.latestRevisionId)
					: null;
				return { candidate, revision };
			}),
		);
		return { ...page, page: entries };
	},
});

export const listForReview = query({
	args: {
		projectId: v.id("projects"),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		return await ctx.db
			.query("agentTranslationProposals")
			.withIndex("by_project_and_updatedAt", (q) =>
				q.eq("projectId", args.projectId),
			)
			.order("desc")
			.paginate(args.paginationOpts);
	},
});

export const getForReview = query({
	args: { proposalId: v.id("agentTranslationProposals") },
	handler: async (ctx, args) => {
		const proposal = await ctx.db.get(args.proposalId);
		if (!proposal) return null;
		await requireViewer(ctx, proposal.projectId);
		const candidates = await ctx.db
			.query("agentTranslationCandidates")
			.withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
			.take(MAX_CANDIDATES + 1);
		if (candidates.length > MAX_CANDIDATES) {
			throw new ConvexError({
				code: "INTEGRITY",
				message: "Translation proposal exceeds its candidate envelope.",
			});
		}
		const entries = await Promise.all(
			candidates.map(async (candidate) => {
				const revision = candidate.latestRevisionId
					? await ctx.db.get(candidate.latestRevisionId)
					: null;
				const reviews = revision
					? await ctx.db
							.query("agentTranslationCandidateReviews")
							.withIndex("by_revision", (q) => q.eq("revisionId", revision._id))
							.take(2)
					: [];
				return { candidate, revision, reviews };
			}),
		);
		return { proposal, candidates: entries };
	},
});

/** Resolve the live human-review context for one candidate without widening
 * the proposal-list query into an unbounded Catalog Workspace read. Review
 * cards subscribe independently, so focused proposals show source, current
 * target, and contract facts together while stale evidence remains visible. */
export const contextForReview = query({
	args: { revisionId: v.id("agentTranslationCandidateRevisions") },
	handler: async (ctx, args) => {
		const revision = await ctx.db.get(args.revisionId);
		if (!revision) return null;
		const proposal = await ctx.db.get(revision.proposalId);
		if (!proposal) return null;
		await requireViewer(ctx, proposal.projectId);

		try {
			if (proposal.target.kind === "catalogWorkspace") {
				if (
					revision.localeId === undefined ||
					revision.basis.kind !== "catalogWorkspace"
				) {
					throw new ConvexError({
						code: "INTEGRITY",
						message: "Catalog Workspace candidate evidence is incomplete.",
					});
				}
				const current = await currentWorkspaceTarget(
					ctx,
					proposal.projectId,
					revision.messageId,
					revision.localeId,
				);
				return {
					kind: "catalogWorkspace" as const,
					available: true as const,
					localeCode: current.target.localeCode,
					source: {
						value: current.source.value,
						icuType: current.source.icuType,
						argumentNames: current.source.argumentNames,
						argumentNamesComplete: current.source.argumentNamesComplete,
						declaredPlaceholderNames:
							current.source.declaredPlaceholderNames ?? [],
						declaredPlaceholderNamesComplete:
							current.source.declaredPlaceholderNamesComplete ?? true,
					},
					target: {
						value: current.value,
						catalogPath: current.target.catalogPath,
					},
					basisIsCurrent:
						revision.basis.projectionId === current.projection._id &&
						revision.basis.snapshotId === current.projection.snapshotId &&
						revision.basis.gitValueFingerprint ===
							current.target.gitValueFingerprint &&
						revision.basis.gitValueRevision ===
							(current.target.gitValueRevision ?? 0) &&
						revision.basis.workspaceRevision === current.workspaceRevision &&
						revision.basis.sourceFingerprint ===
							current.source.sourceFingerprint,
				};
			}

			if (revision.basis.kind !== "localeProposal") {
				throw new ConvexError({
					code: "INTEGRITY",
					message: "Locale Proposal candidate evidence is incomplete.",
				});
			}
			const current = await currentLocaleProposalTarget(
				ctx,
				proposal,
				revision.messageId,
			);
			const value = await ctx.db
				.query("localeProposalValues")
				.withIndex("by_proposal_and_messageId", (q) =>
					q
						.eq("proposalId", current.localeProposal._id)
						.eq("messageId", revision.messageId),
				)
				.unique();
			return {
				kind: "localeProposal" as const,
				available: true as const,
				localeCode: current.localeProposal.runtimeLocale,
				source: {
					value: current.source.sourceValue,
					icuType: current.source.source.icuType,
					argumentNames: current.source.source.argumentNames,
					argumentNamesComplete: current.source.source.argumentNamesComplete,
					declaredPlaceholderNames:
						current.source.source.declaredPlaceholderNames,
					declaredPlaceholderNamesComplete:
						current.source.source.declaredPlaceholderNamesComplete,
				},
				target: {
					value: value?.value ?? "",
					catalogPath: `${current.localeProposal.sourceCatalogPath.slice(
						0,
						current.localeProposal.sourceCatalogPath.lastIndexOf("/") + 1,
					)}intl_pt.arb`,
				},
				basisIsCurrent:
					revision.basis.localeProposalId === current.localeProposal._id &&
					revision.basis.snapshotId === current.source.sourceSnapshotId &&
					revision.basis.sourceFingerprint === current.source.sourceFingerprint,
			};
		} catch (error) {
			if (error instanceof ConvexError) {
				return {
					kind: proposal.target.kind,
					available: false as const,
					localeCode: null,
					basisIsCurrent: false,
				};
			}
			throw error;
		}
	},
});

async function completedProposalStatus(
	ctx: MutationCtx,
	proposalId: Id<"agentTranslationProposals">,
): Promise<"open" | "accepted" | "rejected"> {
	const candidates = await ctx.db
		.query("agentTranslationCandidates")
		.withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
		.take(MAX_CANDIDATES + 1);
	if (candidates.length === 0 || candidates.length > MAX_CANDIDATES) {
		return "open";
	}
	let accepted = 0;
	for (const candidate of candidates) {
		if (!candidate.latestRevisionId) return "open";
		const review = await ctx.db
			.query("agentTranslationCandidateReviews")
			.withIndex("by_revision", (q) =>
				q.eq(
					"revisionId",
					candidate.latestRevisionId as Id<"agentTranslationCandidateRevisions">,
				),
			)
			.unique();
		if (!review) return "open";
		if (review.decision.kind !== "reject") accepted += 1;
	}
	return accepted > 0 ? "accepted" : "rejected";
}

export const reviewCandidate = mutation({
	args: {
		candidateRevisionId: v.id("agentTranslationCandidateRevisions"),
		decision: reviewDecisionValidator,
	},
	handler: async (ctx, args) => {
		const revision = await ctx.db.get(args.candidateRevisionId);
		if (!revision) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Candidate revision not found.",
			});
		}
		const proposal = await ctx.db.get(revision.proposalId);
		if (!proposal) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Translation proposal not found.",
			});
		}
		const { userId } = await requireEditor(ctx, proposal.projectId);
		const candidate = await ctx.db.get(revision.candidateId);
		if (!candidate || candidate.latestRevisionId !== revision._id) {
			throw new ConvexError({
				code: "STALE_BASIS",
				message: "Only the current candidate revision can be reviewed.",
			});
		}
		const existingReview = await ctx.db
			.query("agentTranslationCandidateReviews")
			.withIndex("by_revision", (q) => q.eq("revisionId", revision._id))
			.unique();
		if (existingReview) {
			const status = await completedProposalStatus(ctx, proposal._id);
			if (status !== proposal.status) {
				await ctx.db.patch(proposal._id, { status, updatedAt: now() });
			}
			return {
				reviewId: existingReview._id,
				workspaceRevision: undefined,
				decision: existingReview.decision,
			};
		}
		const actor: HumanActor = { kind: "user", id: userId };
		let finalValue: string | undefined;
		let finalValueFingerprint: string | undefined;
		let workspaceRevision: number | undefined;
		if (args.decision.kind === "reject") {
			// Rejection is deliberately evidence-only.
		} else if (proposal.target.kind === "catalogWorkspace") {
			if (
				revision.localeId === undefined ||
				revision.basis.kind !== "catalogWorkspace"
			) {
				throw new ConvexError({
					code: "INTEGRITY",
					message: "Catalog Workspace candidate evidence is incomplete.",
				});
			}
			const value =
				args.decision.kind === "intentionalBlank"
					? ""
					: args.decision.kind === "accept"
						? revision.value
						: args.decision.value;
			const intentionalBlankReason =
				args.decision.kind === "intentionalBlank"
					? args.decision.reason
					: undefined;
			finalValue = value;
			finalValueFingerprint = await sha256Hex(value);
			const applied = await applyAgentTargetValue(ctx, {
				projectId: proposal.projectId,
				messageId: revision.messageId,
				localeId: revision.localeId,
				value,
				expectedProjectionId: revision.basis.projectionId,
				expectedSnapshotId: revision.basis.snapshotId,
				expectedGitValueFingerprint: revision.basis.gitValueFingerprint,
				expectedGitValueRevision: revision.basis.gitValueRevision,
				expectedWorkspaceRevision: revision.basis.workspaceRevision,
				expectedSourceFingerprint: revision.basis.sourceFingerprint,
				actor: { kind: "user", id: userId },
				...(intentionalBlankReason === undefined
					? {}
					: { intentionalBlankReason }),
			});
			workspaceRevision = applied.workspaceRevision;
		} else {
			if (
				revision.localeProposalId !== proposal.target.localeProposalId ||
				revision.basis.kind !== "localeProposal"
			) {
				throw new ConvexError({
					code: "INTEGRITY",
					message: "Locale Proposal candidate evidence is incomplete.",
				});
			}
			const value =
				args.decision.kind === "intentionalBlank"
					? ""
					: args.decision.kind === "accept"
						? revision.value
						: args.decision.value;
			finalValue = value;
			finalValueFingerprint = await sha256Hex(value);
			await ctx.runMutation(internal.localeProposals.applyReviewedValue, {
				projectId: proposal.projectId,
				proposalId: proposal.target.localeProposalId,
				messageId: revision.messageId,
				sourceSnapshotId: revision.basis.snapshotId,
				sourceFingerprint: revision.basis.sourceFingerprint,
				candidateValueFingerprint: revision.valueFingerprint,
				acceptedValue: revision.value,
				decision: args.decision,
				reviewer: actor,
			});
		}
		const reviewId = await ctx.db.insert("agentTranslationCandidateReviews", {
			projectId: proposal.projectId,
			proposalId: proposal._id,
			candidateId: candidate._id,
			revisionId: revision._id,
			decision: args.decision,
			reviewer: actor,
			...(finalValue === undefined ? {} : { finalValue }),
			...(finalValueFingerprint === undefined ? {} : { finalValueFingerprint }),
			createdAt: now(),
		});
		const status = await completedProposalStatus(ctx, proposal._id);
		await ctx.db.patch(proposal._id, { status, updatedAt: now() });
		return { reviewId, workspaceRevision, decision: args.decision };
	},
});
