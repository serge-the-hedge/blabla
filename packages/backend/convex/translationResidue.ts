import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import {
	activeProjectionFor,
	MAX_WORKING_CATALOG_ROWS,
} from "./catalogProjection";
import {
	type ContractConsequence,
	MAX_CONTRACT_CONSEQUENCE_PLACEHOLDER_BYTES,
	MAX_CONTRACT_CONSEQUENCE_PLACEHOLDER_NAMES,
	type TranslationResidueCode,
} from "./contractTransforms";
import {
	authorizeProjectIngestion,
	repositoryAdapterActorValidator,
	requireViewer,
} from "./permissions";

/** A target value can need at most one of each supported concrete reason. */
export const MAX_TRANSLATION_RESIDUE_REASONS_PER_VALUE = 4;
export const MAX_TRANSLATION_RESIDUE_ROWS = MAX_WORKING_CATALOG_ROWS;
// Residue copies only the projection's small identity fields and a bounded set
// of reason codes. This leaves room for row/document overhead while retaining
// a clear actual envelope for action staging.
export const MAX_TRANSLATION_RESIDUE_BYTES = 12 * 1024 * 1024;
const MAX_RESIDUES_PER_STAGE_BATCH = 500;
const MAX_RESIDUE_STAGE_BATCH_BYTES = 512_000;
const MAX_RESIDUE_ROW_BYTES = 256 * 1024;
// A page may contain full token evidence (up to 256 KiB per row), so this
// count stays well below Convex's 16 MiB query-return envelope.
const MAX_RESIDUE_PAGE_ITEMS = 16;

const residueCodeValidator = v.union(
	v.literal("removed_placeholder"),
	v.literal("target_argument_not_in_source"),
	v.literal("placeholder_rename_conflict"),
	v.literal("plural_to_plain_requires_translation"),
);

const translationResidueReasonValidator = v.object({
	code: residueCodeValidator,
	placeholderNames: v.optional(v.array(v.string())),
	placeholderNameCount: v.optional(v.number()),
	placeholderNamesComplete: v.optional(v.boolean()),
});

const translationResidueCodes = new Set<TranslationResidueCode>([
	"removed_placeholder",
	"target_argument_not_in_source",
	"placeholder_rename_conflict",
	"plural_to_plain_requires_translation",
]);

function isTranslationResidueCode(
	code: ContractConsequence["code"],
): code is TranslationResidueCode {
	return translationResidueCodes.has(code as TranslationResidueCode);
}

const translationResidueValidator = v.object({
	localeId: v.id("locales"),
	localeCode: v.string(),
	catalogPath: v.string(),
	catalogIndex: v.number(),
	messageId: v.string(),
	reasons: v.array(translationResidueReasonValidator),
});

export type TranslationResidueReason = {
	code: TranslationResidueCode;
	placeholderNames?: string[];
	placeholderNameCount?: number;
	placeholderNamesComplete?: boolean;
};

export type TranslationResidue = {
	localeId: Id<"locales">;
	localeCode: string;
	catalogPath: string;
	catalogIndex: number;
	messageId: string;
	reasons: TranslationResidueReason[];
};

function encodedSize(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function residueIdentity(residue: TranslationResidue): string {
	return JSON.stringify([residue.localeId, residue.messageId]);
}

function cloneReason(
	reason: TranslationResidueReason,
): TranslationResidueReason {
	return {
		code: reason.code,
		...(reason.placeholderNames === undefined
			? {}
			: { placeholderNames: [...reason.placeholderNames] }),
		...(reason.placeholderNameCount === undefined
			? {}
			: { placeholderNameCount: reason.placeholderNameCount }),
		...(reason.placeholderNamesComplete === undefined
			? {}
			: { placeholderNamesComplete: reason.placeholderNamesComplete }),
	};
}

function assertReason(reason: TranslationResidueReason): void {
	if (reason.placeholderNames === undefined) {
		if (
			reason.placeholderNameCount !== undefined ||
			reason.placeholderNamesComplete !== undefined
		) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "Translation Residue placeholder detail is inconsistent.",
			});
		}
		return;
	}
	if (
		reason.placeholderNames.length >
			MAX_CONTRACT_CONSEQUENCE_PLACEHOLDER_NAMES ||
		new Set(reason.placeholderNames).size !== reason.placeholderNames.length ||
		reason.placeholderNames.some((name) => name.length === 0) ||
		reason.placeholderNameCount === undefined ||
		reason.placeholderNamesComplete === undefined ||
		reason.placeholderNameCount < reason.placeholderNames.length ||
		(reason.placeholderNamesComplete &&
			reason.placeholderNameCount !== reason.placeholderNames.length) ||
		encodedSize(reason.placeholderNames) >
			MAX_CONTRACT_CONSEQUENCE_PLACEHOLDER_BYTES
	) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "Translation Residue placeholder detail exceeds its envelope.",
		});
	}
}

function assertResidue(residue: TranslationResidue): void {
	if (
		!Number.isInteger(residue.catalogIndex) ||
		residue.catalogIndex < 0 ||
		residue.localeCode.length === 0 ||
		residue.catalogPath.length === 0 ||
		residue.messageId.length === 0 ||
		residue.reasons.length === 0 ||
		residue.reasons.length > MAX_TRANSLATION_RESIDUE_REASONS_PER_VALUE ||
		new Set(residue.reasons.map((reason) => reason.code)).size !==
			residue.reasons.length ||
		encodedSize(residue) > MAX_RESIDUE_ROW_BYTES
	) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "One Translation Residue exceeds the supported envelope.",
		});
	}
	for (const reason of residue.reasons) assertReason(reason);
}

function residueByteLength(residue: TranslationResidue): number {
	return encodedSize(residue);
}

export function translationResidues(
	consequences: readonly ContractConsequence[],
): TranslationResidue[] {
	const residues = new Map<string, TranslationResidue>();
	for (const consequence of consequences) {
		if (consequence.kind !== "residue") continue;
		if (!isTranslationResidueCode(consequence.code)) {
			throw new ConvexError({
				code: "INTEGRITY",
				message: "A Translation Residue has an unsupported concrete reason.",
			});
		}
		const reason: TranslationResidueReason = {
			code: consequence.code,
			...(consequence.placeholderNames === undefined
				? {}
				: { placeholderNames: [...consequence.placeholderNames] }),
			...(consequence.placeholderNameCount === undefined
				? {}
				: { placeholderNameCount: consequence.placeholderNameCount }),
			...(consequence.placeholderNamesComplete === undefined
				? {}
				: {
						placeholderNamesComplete: consequence.placeholderNamesComplete,
					}),
		};
		const candidate: TranslationResidue = {
			localeId: consequence.localeId,
			localeCode: consequence.localeCode,
			catalogPath: consequence.catalogPath,
			catalogIndex: consequence.catalogIndex,
			messageId: consequence.messageId,
			reasons: [reason],
		};
		const identity = residueIdentity(candidate);
		const existing = residues.get(identity);
		if (!existing) {
			residues.set(identity, candidate);
			continue;
		}
		if (
			existing.localeCode !== candidate.localeCode ||
			existing.catalogPath !== candidate.catalogPath ||
			existing.catalogIndex !== candidate.catalogIndex
		) {
			throw new ConvexError({
				code: "INTEGRITY",
				message:
					"A Contract Transform produced conflicting Translation Residue identities.",
			});
		}
		const sameReason = existing.reasons.find(
			(candidateReason) => candidateReason.code === reason.code,
		);
		if (!sameReason) {
			existing.reasons.push(reason);
		} else if (JSON.stringify(sameReason) !== JSON.stringify(reason)) {
			throw new ConvexError({
				code: "INTEGRITY",
				message:
					"A Contract Transform produced conflicting Translation Residue detail.",
			});
		}
	}
	const rows = [...residues.values()]
		.map((residue) => ({
			...residue,
			reasons: [...residue.reasons]
				.map(cloneReason)
				.sort((left, right) => left.code.localeCompare(right.code)),
		}))
		.sort(
			(left, right) =>
				left.catalogIndex - right.catalogIndex ||
				left.localeCode.localeCompare(right.localeCode),
		);
	if (rows.length > MAX_TRANSLATION_RESIDUE_ROWS) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "Translation Residue exceeds the working-catalog row envelope.",
		});
	}
	for (const residue of rows) assertResidue(residue);
	if (
		translationResidueEnvelope(rows).byteLength > MAX_TRANSLATION_RESIDUE_BYTES
	) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "Translation Residue exceeds the supported byte envelope.",
		});
	}
	return rows;
}

export function translationResidueEnvelope(
	residues: readonly TranslationResidue[],
): { count: number; byteLength: number } {
	return {
		count: residues.length,
		byteLength: residues.reduce(
			(total, residue) => total + residueByteLength(residue),
			0,
		),
	};
}

export function translationResidueBatches(
	residues: readonly TranslationResidue[],
): TranslationResidue[][] {
	const batches: TranslationResidue[][] = [];
	let batch: TranslationResidue[] = [];
	let batchByteLength = 2;
	for (const residue of residues) {
		assertResidue(residue);
		const bytes = residueByteLength(residue);
		const separatorBytes = batch.length === 0 ? 0 : 1;
		if (
			batch.length === MAX_RESIDUES_PER_STAGE_BATCH ||
			batchByteLength + separatorBytes + bytes > MAX_RESIDUE_STAGE_BATCH_BYTES
		) {
			batches.push(batch);
			batch = [];
			batchByteLength = 2;
		}
		batch.push(residue);
		batchByteLength += separatorBytes + bytes;
	}
	if (batch.length > 0) batches.push(batch);
	return batches;
}

function stagingCounters(projection: Doc<"catalogProjections">): {
	expectedCount: number;
	expectedByteLength: number;
	stagedCount: number;
	stagedByteLength: number;
} {
	if (
		projection.translationResidueStatus !== "staging" ||
		projection.expectedTranslationResidueCount === undefined ||
		projection.expectedTranslationResidueByteLength === undefined ||
		projection.stagedTranslationResidueCount === undefined ||
		projection.stagedTranslationResidueByteLength === undefined
	) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "A staging Translation Residue set was not found.",
		});
	}
	return {
		expectedCount: projection.expectedTranslationResidueCount,
		expectedByteLength: projection.expectedTranslationResidueByteLength,
		stagedCount: projection.stagedTranslationResidueCount,
		stagedByteLength: projection.stagedTranslationResidueByteLength,
	};
}

/** Claim the complete residue envelope before any target row is written. */
export const declare = internalMutation({
	args: {
		projectId: v.id("projects"),
		projectionId: v.id("catalogProjections"),
		expectedTranslationResidueCount: v.number(),
		expectedTranslationResidueByteLength: v.number(),
		actor: v.optional(repositoryAdapterActorValidator),
	},
	handler: async (ctx, args) => {
		await authorizeProjectIngestion(ctx, args.projectId, args.actor);
		if (
			!Number.isInteger(args.expectedTranslationResidueCount) ||
			!Number.isInteger(args.expectedTranslationResidueByteLength) ||
			args.expectedTranslationResidueCount < 0 ||
			args.expectedTranslationResidueCount > MAX_TRANSLATION_RESIDUE_ROWS ||
			args.expectedTranslationResidueByteLength < 0 ||
			args.expectedTranslationResidueByteLength >
				MAX_TRANSLATION_RESIDUE_BYTES ||
			(args.expectedTranslationResidueCount === 0) !==
				(args.expectedTranslationResidueByteLength === 0)
		) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "Translation Residue exceeds the supported staging envelope.",
			});
		}
		const projection = await ctx.db.get(args.projectionId);
		if (
			!projection ||
			projection.projectId !== args.projectId ||
			projection.status !== "staging" ||
			projection.snapshotId !== undefined ||
			projection.translationResidueStatus !== "pending"
		) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "A pending Translation Residue set was not found.",
			});
		}
		await ctx.db.patch(projection._id, {
			expectedTranslationResidueCount: args.expectedTranslationResidueCount,
			expectedTranslationResidueByteLength:
				args.expectedTranslationResidueByteLength,
			translationResidueStatus:
				args.expectedTranslationResidueCount === 0 ? "staged" : "staging",
		});
		return null;
	},
});

export const stageBatch = internalMutation({
	args: {
		projectId: v.id("projects"),
		projectionId: v.id("catalogProjections"),
		residues: v.array(translationResidueValidator),
		isFinal: v.boolean(),
		actor: v.optional(repositoryAdapterActorValidator),
	},
	handler: async (ctx, args) => {
		await authorizeProjectIngestion(ctx, args.projectId, args.actor);
		if (
			args.residues.length === 0 ||
			args.residues.length > MAX_RESIDUES_PER_STAGE_BATCH ||
			new Set(args.residues.map(residueIdentity)).size !== args.residues.length
		) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "A Translation Residue batch is invalid.",
			});
		}
		for (const residue of args.residues) assertResidue(residue);
		const batchByteLength = args.residues.reduce(
			(total, residue) => total + residueByteLength(residue),
			0,
		);
		if (batchByteLength > MAX_RESIDUE_STAGE_BATCH_BYTES) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "A Translation Residue batch exceeds its byte budget.",
			});
		}
		const projection = await ctx.db.get(args.projectionId);
		if (
			!projection ||
			projection.projectId !== args.projectId ||
			projection.status !== "staging" ||
			projection.snapshotId !== undefined
		) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "A staging Translation Residue set was not found.",
			});
		}
		const counters = stagingCounters(projection);
		const nextCount = counters.stagedCount + args.residues.length;
		const nextByteLength = counters.stagedByteLength + batchByteLength;
		if (
			nextCount > counters.expectedCount ||
			nextByteLength > counters.expectedByteLength ||
			(args.isFinal &&
				(nextCount !== counters.expectedCount ||
					nextByteLength !== counters.expectedByteLength))
		) {
			throw new ConvexError({
				code: "INTEGRITY",
				message: "Translation Residue staging exceeded its declared envelope.",
			});
		}
		for (const residue of args.residues) {
			await ctx.db.insert("catalogProjectionTranslationResidues", {
				projectId: args.projectId,
				projectionId: projection._id,
				...residue,
				reasons: residue.reasons.map(cloneReason),
			});
		}
		await ctx.db.patch(projection._id, {
			stagedTranslationResidueCount: nextCount,
			stagedTranslationResidueByteLength: nextByteLength,
			...(args.isFinal ? { translationResidueStatus: "staged" } : {}),
		});
		return null;
	},
});

function activeEnvelope(projection: Doc<"catalogProjections">): {
	count: number;
	byteLength: number;
} {
	const fields = [
		projection.expectedTranslationResidueCount,
		projection.expectedTranslationResidueByteLength,
		projection.stagedTranslationResidueCount,
		projection.stagedTranslationResidueByteLength,
		projection.translationResidueStatus,
	];
	if (fields.every((field) => field === undefined)) {
		return { count: 0, byteLength: 0 };
	}
	if (
		projection.expectedTranslationResidueCount === undefined ||
		projection.expectedTranslationResidueByteLength === undefined ||
		projection.stagedTranslationResidueCount === undefined ||
		projection.stagedTranslationResidueByteLength === undefined ||
		projection.translationResidueStatus !== "staged" ||
		projection.expectedTranslationResidueCount < 0 ||
		projection.expectedTranslationResidueCount > MAX_TRANSLATION_RESIDUE_ROWS ||
		projection.expectedTranslationResidueByteLength < 0 ||
		projection.expectedTranslationResidueByteLength >
			MAX_TRANSLATION_RESIDUE_BYTES ||
		projection.stagedTranslationResidueCount !==
			projection.expectedTranslationResidueCount ||
		projection.stagedTranslationResidueByteLength !==
			projection.expectedTranslationResidueByteLength
	) {
		throw new ConvexError({
			code: "INTEGRITY",
			message: "The active Translation Residue set is incomplete.",
		});
	}
	return {
		count: projection.expectedTranslationResidueCount,
		byteLength: projection.expectedTranslationResidueByteLength,
	};
}

/** List translator work introduced by the active Baseline transition. The
 * working catalog remains a one-query read; Residue is unbounded history, so
 * the review surface is explicitly paginated. */
export const listActive = query({
	args: {
		projectId: v.id("projects"),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		await requireViewer(ctx, args.projectId);
		if (
			!Number.isInteger(args.paginationOpts.numItems) ||
			args.paginationOpts.numItems < 1 ||
			args.paginationOpts.numItems > MAX_RESIDUE_PAGE_ITEMS
		) {
			throw new ConvexError({
				code: "VALIDATION",
				message: `A Translation Residue page may contain at most ${MAX_RESIDUE_PAGE_ITEMS} values.`,
			});
		}
		const projection = await activeProjectionFor(ctx, args.projectId);
		if (!projection) return null;
		activeEnvelope(projection);
		const page = await ctx.db
			.query("catalogProjectionTranslationResidues")
			.withIndex("by_projection", (q) => q.eq("projectionId", projection._id))
			.paginate(args.paginationOpts);
		for (const row of page.page) {
			assertResidue({
				localeId: row.localeId,
				localeCode: row.localeCode,
				catalogPath: row.catalogPath,
				catalogIndex: row.catalogIndex,
				messageId: row.messageId,
				reasons: row.reasons.map(cloneReason),
			});
		}
		return {
			projectionId: projection._id,
			snapshotId: projection.snapshotId,
			page: page.page.map((row) => ({
				localeId: row.localeId,
				localeCode: row.localeCode,
				catalogPath: row.catalogPath,
				catalogIndex: row.catalogIndex,
				messageId: row.messageId,
				reasons: row.reasons.map(cloneReason),
			})),
			isDone: page.isDone,
			continueCursor: page.continueCursor,
		};
	},
});
