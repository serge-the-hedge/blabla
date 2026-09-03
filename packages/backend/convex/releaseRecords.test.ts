import { describe, expect, test } from "vitest";

import {
	deliberateEvidenceFor,
	isReleaseDelta,
	releasePostureFor,
	releaseTargetContribution,
} from "./releaseRecordModel";

describe("Release Assessment posture", () => {
	test.each([
		[{ blockedCount: 1, needsDecisionCount: 4 }, "blocked"],
		[{ blockedCount: 0, needsDecisionCount: 1 }, "needsDecisions"],
		[{ blockedCount: 0, needsDecisionCount: 0 }, "ready"],
	] as const)("classifies %o as %s", (counts, expected) => {
		expect(releasePostureFor(counts)).toBe(expected);
	});
});

describe("Release Assessment policy", () => {
	test("includes a whole key when Source or target Workspace state changed", () => {
		expect(
			isReleaseDelta({
				pendingSourceProposal: false,
				introductionReviewPending: 0,
				targets: [{ touched: false }, { touched: false }],
			}),
		).toBe(false);
		expect(
			isReleaseDelta({
				pendingSourceProposal: true,
				introductionReviewPending: 0,
				targets: [{ touched: false }],
			}),
		).toBe(true);
		expect(
			isReleaseDelta({
				pendingSourceProposal: false,
				introductionReviewPending: 0,
				targets: [{ touched: false }, { touched: true }],
			}),
		).toBe(true);
		expect(
			isReleaseDelta({
				pendingSourceProposal: false,
				introductionReviewPending: 1,
				targets: [{ touched: false }],
			}),
		).toBe(true);
	});

	test("classifies only deliberate output as release evidence", () => {
		expect(
			deliberateEvidenceFor({
				decision: { kind: "intentionalBlank", reason: "Not shown here" },
				targetValueFingerprint: "blank",
				sourceValueFingerprint: "source",
			}),
		).toEqual({ kind: "intentional_blank", reason: "Not shown here" });
		expect(
			deliberateEvidenceFor({
				decision: { kind: "translatorConfirmation" },
				targetValueFingerprint: "same",
				sourceValueFingerprint: "same",
			}),
		).toEqual({ kind: "source_identical" });
		expect(
			deliberateEvidenceFor({
				decision: { kind: "translatorConfirmation" },
				targetValueFingerprint: "translated",
				sourceValueFingerprint: "source",
			}),
		).toBeNull();
	});

	test("aggregates every finding and stated non-gating fact once", () => {
		expect(
			releaseTargetContribution({
				findings: [
					{ kind: "contract_invalid" },
					{ kind: "missing_value" },
					{ kind: "semantic_source_change" },
					{ kind: "introduction_review" },
				],
				evidence: { kind: "intentional_blank" },
				unconfirmedImport: true,
			}),
		).toEqual({
			scopeValueCount: 1,
			blockedCount: 1,
			needsDecisionCount: 3,
			intentionalBlankCount: 1,
			sourceIdenticalCount: 0,
			unconfirmedImportCount: 1,
		});
	});
});
