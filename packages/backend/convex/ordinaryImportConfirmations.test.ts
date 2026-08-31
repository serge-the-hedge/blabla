import { describe, expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import { ordinaryImportConfirmationPlan } from "./ordinaryImportConfirmations";

const localeId = "locale-de" as Id<"locales">;
const sourceLocaleId = "locale-en" as Id<"locales">;

function row(input: {
	messageId: string;
	isSource: boolean;
	value: string;
	valueFingerprint?: string;
	sourceFingerprint?: string;
}) {
	return {
		messageId: input.messageId,
		localeId: input.isSource ? sourceLocaleId : localeId,
		localeCode: input.isSource ? "en" : "de",
		isSource: input.isSource,
		value: input.value,
		valueFingerprint:
			input.valueFingerprint ??
			`${input.messageId}-${input.isSource ? "en" : "de"}`,
		sourceFingerprint: input.sourceFingerprint ?? `${input.messageId}-source`,
		gitValueFingerprint: `${input.messageId}-${input.isSource ? "en" : "de"}-git`,
		gitValueRevision: 0,
	};
}

describe("ordinary import confirmation policy", () => {
	test("explains every target once and selects only untouched unique translations", () => {
		const messages = [
			["eligible", "Account", "Konto"],
			["empty", "Empty", ""],
			["source-identical", "Same", "Same"],
			["repeat-one", "First", "OK"],
			["repeat-two", "Second", "OK"],
			["modified", "Modified", "Bearbeitet"],
			["stale", "Stale", "Veraltet"],
			["confirmed", "Confirmed", "Bestätigt"],
			["pending-source", "Pending", "Ausstehend"],
		] as const;
		const rows = messages.flatMap(([messageId, source, target]) => [
			row({ messageId, isSource: true, value: source }),
			row({ messageId, isSource: false, value: target }),
		]);
		const plan = ordinaryImportConfirmationPlan({
			rows,
			heads: [
				{
					messageId: "modified",
					localeId,
					basisGitValueFingerprint: "modified-de-git",
					basisGitValueRevision: 0,
				},
			],
			decisions: [
				{
					kind: "translatorConfirmation",
					messageId: "stale",
					localeId,
					sourceFingerprint: "stale-previous-source",
					valueFingerprint: "stale-de",
				},
				{
					kind: "translatorConfirmation",
					messageId: "confirmed",
					localeId,
					sourceFingerprint: "confirmed-source",
					valueFingerprint: "confirmed-de",
				},
			],
			pendingSourceMessageIds: new Set(["pending-source"]),
		});

		expect(plan.counts).toEqual({
			total: 9,
			eligible: 1,
			empty: 1,
			sourceIdentical: 1,
			repeated: 2,
			modified: 1,
			stale: 1,
			alreadyConfirmed: 1,
			pendingSourceProposal: 1,
		});
		expect(plan.candidates).toEqual([
			{
				messageId: "eligible",
				localeId,
				sourceFingerprint: "eligible-source",
				valueFingerprint: "eligible-de",
			},
		]);
	});
});
