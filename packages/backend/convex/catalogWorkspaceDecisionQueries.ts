import { ConvexError } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DecisionContext = MutationCtx | QueryCtx;
type DecisionRecord = Doc<"catalogWorkspaceDecisionRecords">;

/** Read the one decision for an exact Source/value identity without opening
 * the history for the Locale value. Duplicate identities are an integrity
 * failure, not a reason to make every caller scan more evidence. */
export async function decisionForIdentity(
	ctx: DecisionContext,
	input: {
		projectId: Id<"projects">;
		messageId: string;
		localeId: Id<"locales">;
		sourceFingerprint: string;
		valueFingerprint: string;
	},
): Promise<DecisionRecord | null> {
	const records = await ctx.db
		.query("catalogWorkspaceDecisionRecords")
		.withIndex("by_value_identity", (q) =>
			q
				.eq("projectId", input.projectId)
				.eq("messageId", input.messageId)
				.eq("localeId", input.localeId)
				.eq("sourceFingerprint", input.sourceFingerprint)
				.eq("valueFingerprint", input.valueFingerprint),
		)
		.take(2);
	if (records.length > 1) {
		throw new ConvexError({
			code: "INTEGRITY",
			message: "Catalog Workspace contains duplicate decision identities.",
		});
	}
	return records[0] ?? null;
}

/** Return the most recent decision attached to one value fingerprint. This is
 * the only history fact needed to classify a current value as previously
 * confirmed; the exact current identity is read separately above. */
export async function latestDecisionForValue(
	ctx: DecisionContext,
	input: {
		projectId: Id<"projects">;
		messageId: string;
		localeId: Id<"locales">;
		valueFingerprint: string;
	},
): Promise<DecisionRecord | null> {
	const records = await ctx.db
		.query("catalogWorkspaceDecisionRecords")
		.withIndex(
			"by_project_and_messageId_and_localeId_and_valueFingerprint",
			(q) =>
				q
					.eq("projectId", input.projectId)
					.eq("messageId", input.messageId)
					.eq("localeId", input.localeId)
					.eq("valueFingerprint", input.valueFingerprint),
		)
		.order("desc")
		.take(1);
	return records[0] ?? null;
}
