import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type MutationCtx,
	mutation,
	type QueryCtx,
} from "./_generated/server";
import {
	activeProjectionFor,
	MAX_PROJECTED_LOCALES,
} from "./catalogProjection";
import { decisionStateFor, recordDecisions } from "./catalogWorkspace";
import {
	decisionForIdentity,
	latestDecisionForValue,
} from "./catalogWorkspaceDecisionQueries";
import {
	readyNavigationStateFor,
	recomputeNavigationRows,
} from "./catalogWorkspaceNavigation";
import { assertTargetValueContract } from "./contractTransforms";
import { now, sha256Hex } from "./lib";
import {
	ORDINARY_IMPORT_CONFIRMATION_POLICY,
	type OrdinaryImportConfirmationCandidate,
} from "./ordinaryImportConfirmations";
import { requireEditor } from "./permissions";
import {
	isCurrentSourceProposalHeadForSource,
	sourceProposalHeadFor,
	sourceProposalStatusesFor,
} from "./sourceProposals";

/** How many Navigation Index rows one run step walks. A step is one
 * transaction: bounded rows keep the reads proportional to keys visited plus
 * candidates processed, never the whole catalog. */
export const MAX_ORDINARY_RUN_ROWS_PER_STEP = 16;

/** How many candidates one Agent API page may carry. */
export const MAX_ORDINARY_AGENT_CANDIDATES = 100;

const RUN_SKIP_CATEGORIES = [
	"alreadyConfirmed",
	"stale",
	"modified",
	"pendingSourceProposal",
	"empty",
	"sourceIdentical",
	"repeated",
] as const;

type RunSkipCategory = (typeof RUN_SKIP_CATEGORIES)[number];

type NavigationDigestRow = Doc<"catalogWorkspaceNavigationRows">;

export const ordinaryImportRunStatusValidator = v.object({
	runId: v.id("ordinaryImportRuns"),
	policy: v.literal(ORDINARY_IMPORT_CONFIRMATION_POLICY),
	status: v.union(
		v.literal("running"),
		v.literal("done"),
		v.literal("superseded"),
		v.literal("failed"),
	),
	confirmed: v.number(),
	skipped: v.number(),
	failure: v.union(
		v.object({
			code: v.optional(v.string()),
			message: v.string(),
			failedAt: v.number(),
		}),
		v.null(),
	),
});

function ordinaryImportFailureFor(error: unknown) {
	const data =
		error instanceof ConvexError &&
		typeof error.data === "object" &&
		error.data !== null
			? error.data
			: null;
	const code =
		data && "code" in data && typeof data.code === "string"
			? data.code
			: undefined;
	return {
		...(code === undefined ? {} : { code }),
		message:
			error instanceof Error
				? error.message
				: "Ordinary-import confirmation failed.",
		failedAt: now(),
	};
}

/** The digest-level conservative pre-filter. A target that any of these
 * categories claims is not a candidate; the projection-stable content
 * categories (empty, Source-identical, repeated) are revalidated against the
 * canonical rows for the key before a decision is recorded. */
function isDigestLevelCandidate(
	digest: NavigationDigestRow,
	target: NavigationDigestRow["targets"][number],
): boolean {
	return (
		!target.confirmedGitContent &&
		!target.confirmedContentPreviously &&
		!target.touched &&
		!digest.pendingSourceProposal
	);
}

type OrdinaryImportCursor = {
	catalogIndex: number;
	targetIndex: number;
};

function decodeOrdinaryImportCursor(
	cursor: string | number,
): OrdinaryImportCursor {
	if (typeof cursor === "number") {
		if (Number.isSafeInteger(cursor) && cursor >= 0) {
			return { catalogIndex: cursor, targetIndex: 0 };
		}
	} else if (cursor.length === 0) {
		return { catalogIndex: 0, targetIndex: 0 };
	} else {
		const match = /^(\d+)(?::(\d+))?$/.exec(cursor);
		if (match) {
			const catalogIndex = Number(match[1]);
			const targetIndex = Number(match[2] ?? 0);
			if (
				Number.isSafeInteger(catalogIndex) &&
				Number.isSafeInteger(targetIndex)
			) {
				return { catalogIndex, targetIndex };
			}
		}
	}
	throw new ConvexError({
		code: "VALIDATION",
		message: "Ordinary-confirmation pagination is invalid.",
	});
}

function encodeOrdinaryImportCursor(cursor: OrdinaryImportCursor): string {
	return cursor.targetIndex === 0
		? String(cursor.catalogIndex)
		: `${cursor.catalogIndex}:${cursor.targetIndex}`;
}

function nextOrdinaryImportCursor(
	rows: readonly NavigationDigestRow[],
	rowIndex: number,
	targetIndex: number,
): string | null {
	const row = rows[rowIndex];
	if (row && targetIndex + 1 < row.targets.length) {
		return encodeOrdinaryImportCursor({
			catalogIndex: row.catalogIndex,
			targetIndex: targetIndex + 1,
		});
	}
	const nextRow = rows[rowIndex + 1];
	return nextRow
		? encodeOrdinaryImportCursor({
				catalogIndex: nextRow.catalogIndex,
				targetIndex: 0,
			})
		: null;
}

/** The targeted canonical revalidation of one digest-level candidate. The
 * reads are per key: the projection's source and target rows, this value's
 * decision records, its head, and its Source Proposal head. The conservative
 * plan categories are re-derived in the exact order the whole-catalog plan
 * uses, so a run never confirms anything the reviewed policy would reject. */
async function revalidateOrdinaryImportTarget(
	ctx: MutationCtx | QueryCtx,
	input: {
		projectId: Id<"projects">;
		projectionId: Id<"catalogProjections">;
		sourceLocaleId: Id<"locales">;
		messageId: string;
		target: NavigationDigestRow["targets"][number];
	},
): Promise<
	| { category: "eligible"; candidate: OrdinaryImportConfirmationCandidate }
	| { category: RunSkipCategory }
> {
	const rows = await ctx.db
		.query("catalogProjectionMessages")
		.withIndex("by_projection_and_messageId", (q) =>
			q.eq("projectionId", input.projectionId).eq("messageId", input.messageId),
		)
		.take(MAX_PROJECTED_LOCALES + 1);
	if (rows.length > MAX_PROJECTED_LOCALES) {
		throw new ConvexError({
			code: "INTEGRITY",
			message: "An ordinary-import candidate exceeds the Locale row envelope.",
		});
	}
	const sourceLocaleId = input.sourceLocaleId;
	const sourceRow = rows.find(
		(row) => row.isSource && row.localeId === sourceLocaleId,
	);
	const targetRow = rows.find(
		(row) => !row.isSource && row.localeId === input.target.localeId,
	);
	if (!sourceRow || !targetRow || targetRow.gitValueFingerprint === undefined) {
		throw new ConvexError({
			code: "INTEGRITY",
			message:
				"Ordinary import confirmation requires complete Source and Git identity.",
		});
	}

	assertTargetValueContract({
		messageId: input.messageId,
		localeCode: targetRow.localeCode,
		value: targetRow.value,
		source: sourceRow,
	});
	const valueFingerprint =
		targetRow.valueFingerprint ?? (await sha256Hex(targetRow.value));
	const candidate: OrdinaryImportConfirmationCandidate = {
		messageId: input.messageId,
		localeId: targetRow.localeId,
		sourceFingerprint: sourceRow.sourceFingerprint,
		valueFingerprint,
	};
	const [exactDecision, latestValueDecision] = await Promise.all([
		decisionForIdentity(ctx, {
			projectId: input.projectId,
			messageId: input.messageId,
			localeId: targetRow.localeId,
			sourceFingerprint: candidate.sourceFingerprint,
			valueFingerprint: candidate.valueFingerprint,
		}),
		latestDecisionForValue(ctx, {
			projectId: input.projectId,
			messageId: input.messageId,
			localeId: targetRow.localeId,
			valueFingerprint: candidate.valueFingerprint,
		}),
	]);
	if (exactDecision?.kind === "translatorConfirmation") {
		return { category: "alreadyConfirmed" };
	}
	if (latestValueDecision?.kind === "translatorConfirmation") {
		return { category: "stale" };
	}
	const head = await ctx.db
		.query("catalogWorkspaceValueHeads")
		.withIndex("by_project_and_messageId_and_localeId", (q) =>
			q
				.eq("projectId", input.projectId)
				.eq("messageId", input.messageId)
				.eq("localeId", targetRow.localeId),
		)
		.unique();
	if (
		head &&
		head.basisGitValueFingerprint === targetRow.gitValueFingerprint &&
		head.basisGitValueRevision === (targetRow.gitValueRevision ?? 0)
	) {
		return { category: "modified" };
	}
	const proposalHead = await sourceProposalHeadFor(
		ctx,
		input.projectId,
		input.messageId,
	);
	if (
		proposalHead &&
		isCurrentSourceProposalHeadForSource(sourceRow, proposalHead)
	) {
		const resolutions = await sourceProposalStatusesFor(ctx, [proposalHead]);
		if (!resolutions.has(proposalHead.proposalId)) {
			return { category: "pendingSourceProposal" };
		}
	}
	if (targetRow.value.length === 0) return { category: "empty" };
	if (targetRow.value === sourceRow.value) {
		return { category: "sourceIdentical" };
	}
	if (
		rows.some(
			(row) =>
				!row.isSource &&
				row.localeId !== targetRow.localeId &&
				row.value === targetRow.value,
		)
	) {
		return { category: "repeated" };
	}
	return { category: "eligible", candidate };
}

export const startOrdinaryImportRun = mutation({
	args: {
		projectId: v.id("projects"),
		expectedProjectionId: v.id("catalogProjections"),
		policy: v.literal(ORDINARY_IMPORT_CONFIRMATION_POLICY),
	},
	returns: ordinaryImportRunStatusValidator,
	handler: async (ctx, args) => {
		const { userId } = await requireEditor(ctx, args.projectId);
		const projection = await activeProjectionFor(ctx, args.projectId);
		if (!projection || projection._id !== args.expectedProjectionId) {
			throw new ConvexError({
				code: "STALE_BASIS",
				message:
					"The Baseline Catalog changed before the confirmation run started.",
			});
		}
		await readyNavigationStateFor(ctx, {
			projectId: args.projectId,
			projectionId: projection._id,
			expectedRowCount: projection.expectedKeyCount,
		});
		const running = await ctx.db
			.query("ordinaryImportRuns")
			.withIndex("by_project_and_status", (q) =>
				q.eq("projectId", args.projectId).eq("status", "running"),
			)
			.take(1);
		const existing = running[0];
		if (existing) {
			if (
				existing.projectionId === args.expectedProjectionId &&
				existing.policy === args.policy
			) {
				// Idempotent restart: resume the same durable run. Always re-arm the
				// scheduled step: a step that exhausted its retries rolls back
				// atomically, leaving the run claimed with nothing scheduled, and an
				// extra step against a live worker is a harmless no-op behind the
				// stepPending claim.
				await ctx.db.patch(existing._id, { stepPending: true });
				await ctx.scheduler.runAfter(
					0,
					internal.ordinaryImportRuns.runOrdinaryImportStep,
					{ runId: existing._id },
				);
				return runStatus(existing);
			}
			await ctx.db.patch(existing._id, { status: "superseded" });
		}
		const runId = await ctx.db.insert("ordinaryImportRuns", {
			projectId: args.projectId,
			projectionId: args.expectedProjectionId,
			policy: args.policy,
			status: "running",
			cursor: 0,
			confirmed: 0,
			skipped: 0,
			skipReasons: {},
			startedBy: { kind: "user" as const, id: userId },
			stepPending: true,
			updatedAt: now(),
		});
		await ctx.scheduler.runAfter(
			0,
			internal.ordinaryImportRuns.runOrdinaryImportStep,
			{ runId },
		);
		const created = await ctx.db.get(runId);
		if (!created) {
			throw new ConvexError({
				code: "INTEGRITY",
				message: "The confirmation run disappeared immediately after starting.",
			});
		}
		return runStatus(created);
	},
});

function runStatus(run: Doc<"ordinaryImportRuns">): {
	runId: Id<"ordinaryImportRuns">;
	policy: "ordinary-v1";
	status: "running" | "done" | "superseded" | "failed";
	confirmed: number;
	skipped: number;
	failure: {
		code?: string;
		message: string;
		failedAt: number;
	} | null;
} {
	return {
		runId: run._id,
		policy: run.policy,
		status: run.status,
		confirmed: run.confirmed,
		skipped: run.skipped,
		failure: run.failure ?? null,
	};
}

/** One bounded step of the server-owned run. A step claims its scheduled
 * token, re-checks the Baseline binding, walks one Catalog Order page of the
 * Navigation Index, revalidates digest-level candidates against canonical
 * rows, records confirmations under the run's truthful actor, updates the
 * affected Navigation rows through the shared projector, and advances the
 * durable cursor and counts before scheduling the next step. */
export const runOrdinaryImportStep = internalMutation({
	args: { runId: v.id("ordinaryImportRuns") },
	returns: v.union(v.null(), ordinaryImportRunStatusValidator),
	handler: async (ctx, args) => {
		try {
			const run = await ctx.db.get(args.runId);
			if (run?.status !== "running" || !run.stepPending) {
				return run ? runStatus(run) : null;
			}
			await ctx.db.patch(args.runId, { stepPending: false });
			const projection = await activeProjectionFor(ctx, run.projectId);
			if (!projection || projection._id !== run.projectionId) {
				await ctx.db.patch(args.runId, { status: "superseded" });
				return runStatus({ ...run, status: "superseded" });
			}
			const rows = await ctx.db
				.query("catalogWorkspaceNavigationRows")
				.withIndex("by_project_and_projection_and_catalogIndex", (q) =>
					q
						.eq("projectId", run.projectId)
						.eq("projectionId", run.projectionId)
						.gte("catalogIndex", run.cursor),
				)
				.take(MAX_ORDINARY_RUN_ROWS_PER_STEP + 1);
			const page = rows.slice(0, MAX_ORDINARY_RUN_ROWS_PER_STEP);
			if (page.length === 0) {
				await ctx.db.patch(args.runId, { status: "done", updatedAt: now() });
				return runStatus({ ...run, status: "done" });
			}
			const project = await ctx.db.get(run.projectId);
			if (!project?.sourceLocaleId) {
				throw new ConvexError({
					code: "INTEGRITY",
					message: "The confirmation run requires the project's Source Locale.",
				});
			}
			const additions: OrdinaryImportConfirmationCandidate[] = [];
			const skipReasons: Record<string, number> = {};
			let skipped = 0;
			for (const digest of page) {
				for (const target of digest.targets) {
					if (!isDigestLevelCandidate(digest, target)) continue;
					const result = await revalidateOrdinaryImportTarget(ctx, {
						projectId: run.projectId,
						projectionId: run.projectionId,
						sourceLocaleId: project.sourceLocaleId,
						messageId: digest.messageId,
						target,
					});
					if (result.category === "eligible") {
						additions.push(result.candidate);
						continue;
					}
					skipped++;
					skipReasons[result.category] =
						(skipReasons[result.category] ?? 0) + 1;
				}
			}
			if (additions.length > 0) {
				const decisionState = await decisionStateFor(ctx, run.projectId);
				const recordedAt = now();
				await recordDecisions(ctx, {
					projectId: run.projectId,
					state: decisionState,
					next: additions.map((candidate) => ({
						...candidate,
						kind: "translatorConfirmation" as const,
						recordedBy: run.startedBy,
						recordedAt,
					})),
				});
				// Confirmed keys leave the ordinary-import summary at once, through the
				// same shared projector every other writer uses.
				await recomputeNavigationRows(ctx, {
					projectId: run.projectId,
					messageIds: [
						...new Set(additions.map((candidate) => candidate.messageId)),
					],
				});
			}
			const nextCursor = page[page.length - 1].catalogIndex + 1;
			const mergedSkipReasons: Record<string, number> = { ...run.skipReasons };
			for (const [category, count] of Object.entries(skipReasons)) {
				mergedSkipReasons[category] =
					(mergedSkipReasons[category] ?? 0) + count;
			}
			await ctx.db.patch(args.runId, {
				cursor: nextCursor,
				confirmed: run.confirmed + additions.length,
				skipped: run.skipped + skipped,
				skipReasons: mergedSkipReasons,
				stepPending: true,
				updatedAt: now(),
			});
			await ctx.scheduler.runAfter(
				0,
				internal.ordinaryImportRuns.runOrdinaryImportStep,
				{ runId: args.runId },
			);
			return {
				runId: args.runId,
				policy: run.policy,
				status: "running" as const,
				confirmed: run.confirmed + additions.length,
				skipped: run.skipped + skipped,
				failure: null,
			};
		} catch (error) {
			const run = await ctx.db.get(args.runId);
			if (!run) throw error;
			const failure = ordinaryImportFailureFor(error);
			await ctx.db.patch(args.runId, {
				status: "failed",
				stepPending: false,
				failure,
				updatedAt: now(),
			});
			return runStatus({ ...run, status: "failed", failure });
		}
	},
});

/** The read-only Agent view pages eligible candidates from the same derived
 * index the run walks, with the same targeted revalidation, and no
 * confirmation authority anywhere in the call path. */
export const pageOrdinaryImportCandidates = internalQuery({
	args: {
		projectId: v.id("projects"),
		// Accept the old numeric form during the transition; every response emits
		// the lossless string cursor used by the public Agent endpoint.
		cursor: v.union(v.string(), v.number()),
		limit: v.number(),
	},
	returns: v.union(
		v.null(),
		v.object({
			policy: v.literal(ORDINARY_IMPORT_CONFIRMATION_POLICY),
			projectionId: v.id("catalogProjections"),
			snapshotId: v.id("sourceSnapshots"),
			// The same conservative whole-workspace vocabulary the Browse read
			// carries, derived from the same digest rows.
			counts: v.object({
				total: v.number(),
				eligible: v.number(),
				empty: v.number(),
				sourceIdentical: v.number(),
				repeated: v.number(),
				modified: v.number(),
				stale: v.number(),
				alreadyConfirmed: v.number(),
				pendingSourceProposal: v.number(),
			}),
			candidates: v.array(
				v.object({
					messageId: v.string(),
					localeId: v.id("locales"),
					sourceFingerprint: v.string(),
					valueFingerprint: v.string(),
				}),
			),
			nextCursor: v.union(v.string(), v.null()),
		}),
	),
	handler: async (ctx, args) => {
		const cursor = decodeOrdinaryImportCursor(args.cursor);
		if (
			!Number.isSafeInteger(args.limit) ||
			args.limit < 1 ||
			args.limit > MAX_ORDINARY_AGENT_CANDIDATES
		) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "Ordinary-confirmation pagination is invalid.",
			});
		}
		const projection = await activeProjectionFor(ctx, args.projectId);
		if (!projection) return null;
		const snapshotId = projection.snapshotId;
		if (!snapshotId) {
			throw new ConvexError({
				code: "INTEGRITY",
				message:
					"Ordinary import confirmation requires a published Baseline Snapshot.",
			});
		}
		const project = await ctx.db.get(args.projectId);
		if (!project?.sourceLocaleId) {
			throw new ConvexError({
				code: "INTEGRITY",
				message: "The Agent view requires the project's Source Locale.",
			});
		}
		const navigationState = await readyNavigationStateFor(ctx, {
			projectId: args.projectId,
			projectionId: projection._id,
			expectedRowCount: projection.expectedKeyCount,
		});
		const counts = navigationState.ordinaryImportCounts;
		const rows = await ctx.db
			.query("catalogWorkspaceNavigationRows")
			.withIndex("by_project_and_projection_and_catalogIndex", (q) =>
				q
					.eq("projectId", args.projectId)
					.eq("projectionId", projection._id)
					.gte("catalogIndex", cursor.catalogIndex),
			)
			.take(MAX_ORDINARY_RUN_ROWS_PER_STEP + 1);
		const page = rows.slice(0, MAX_ORDINARY_RUN_ROWS_PER_STEP);
		const candidates: OrdinaryImportConfirmationCandidate[] = [];
		let firstRowIndex = rows.findIndex(
			(row) => row.catalogIndex >= cursor.catalogIndex,
		);
		if (
			firstRowIndex >= 0 &&
			rows[firstRowIndex]?.catalogIndex === cursor.catalogIndex &&
			cursor.targetIndex >= (rows[firstRowIndex]?.targets.length ?? 0)
		) {
			firstRowIndex += 1;
		}
		if (firstRowIndex < 0) firstRowIndex = rows.length;
		for (let rowIndex = firstRowIndex; rowIndex < page.length; rowIndex += 1) {
			const digest = page[rowIndex];
			if (!digest) continue;
			const targetStart =
				rowIndex === firstRowIndex &&
				digest.catalogIndex === cursor.catalogIndex
					? cursor.targetIndex
					: 0;
			for (
				let targetIndex = targetStart;
				targetIndex < digest.targets.length;
				targetIndex += 1
			) {
				const target = digest.targets[targetIndex];
				if (!target) continue;
				if (!isDigestLevelCandidate(digest, target)) continue;
				const result = await revalidateOrdinaryImportTarget(ctx, {
					projectId: args.projectId,
					projectionId: projection._id,
					sourceLocaleId: project.sourceLocaleId,
					messageId: digest.messageId,
					target,
				});
				if (result.category === "eligible") {
					candidates.push(result.candidate);
					if (candidates.length >= args.limit) {
						return {
							policy: ORDINARY_IMPORT_CONFIRMATION_POLICY,
							projectionId: projection._id,
							snapshotId,
							counts,
							candidates,
							nextCursor: nextOrdinaryImportCursor(rows, rowIndex, targetIndex),
						};
					}
				}
			}
		}
		const nextCursor =
			rows.length > page.length
				? encodeOrdinaryImportCursor({
						catalogIndex:
							rows[page.length]?.catalogIndex ?? cursor.catalogIndex,
						targetIndex: 0,
					})
				: null;
		return {
			policy: ORDINARY_IMPORT_CONFIRMATION_POLICY,
			projectionId: projection._id,
			snapshotId,
			counts,
			candidates,
			nextCursor,
		};
	},
});
