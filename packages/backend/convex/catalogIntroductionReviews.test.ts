import { describe, expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import { pendingIntroductionLocaleIds } from "./catalogIntroductionReviews";
import {
	attachIntroductionReviews,
	type ProjectedMessage,
} from "./catalogProjection";
import { ordinaryImportConfirmationPlan } from "./ordinaryImportConfirmations";

const en = "locale-en" as Id<"locales">;
const de = "locale-de" as Id<"locales">;
const fr = "locale-fr" as Id<"locales">;

function message(input: {
	messageId: string;
	localeId: Id<"locales">;
	localeCode: string;
	value: string;
	isSource?: boolean;
}): ProjectedMessage {
	return {
		localeId: input.localeId,
		localeCode: input.localeCode,
		catalogPath: `${input.localeCode}.arb`,
		isSource: input.isSource ?? false,
		catalogIndex: 0,
		messageId: input.messageId,
		value: input.value,
		valueFingerprint: `${input.messageId}-${input.localeCode}-value`,
		gitValueFingerprint: `${input.messageId}-${input.localeCode}-git`,
		gitValueRevision: 0,
		sourceFingerprint: `${input.messageId}-source`,
		icuType: "plain",
		argumentNames: [],
		argumentNamesComplete: true,
		argumentNameCount: 0,
		...(input.isSource
			? {
					declaredPlaceholderNames: [],
					declaredPlaceholderNamesComplete: true,
					declaredPlaceholderNameCount: 0,
				}
			: {}),
		materialized: false,
	};
}

function key(messageId: string, values = ["Source", "Deutsch", "Français"]) {
	return [
		message({
			messageId,
			localeId: en,
			localeCode: "en",
			value: values[0] ?? "",
			isSource: true,
		}),
		message({
			messageId,
			localeId: de,
			localeCode: "de",
			value: values[1] ?? "",
		}),
		message({
			messageId,
			localeId: fr,
			localeCode: "fr",
			value: values[2] ?? "",
		}),
	];
}

describe("Introduced Message provenance", () => {
	test("treats the first Baseline as bootstrap and marks later keys even when targets are populated", () => {
		const bootstrap = attachIntroductionReviews({
			hadPreviousBaseline: false,
			previousMessages: [],
			retainedMessages: [],
			currentMessages: key("existing"),
			introducedAt: 10,
		});
		expect(bootstrap.find((row) => row.isSource)?.introducedAt).toBeUndefined();

		const next = attachIntroductionReviews({
			hadPreviousBaseline: true,
			previousMessages: bootstrap,
			retainedMessages: [],
			currentMessages: [...key("existing"), ...key("new-populated")],
			introducedAt: 20,
		});
		const source = next.find(
			(row) => row.isSource && row.messageId === "new-populated",
		);
		expect(source).toMatchObject({
			introducedAt: 20,
			introductionLocaleIds: [de, fr],
		});
		expect(
			next
				.filter((row) => !row.isSource)
				.every((row) => row.introducedAt === undefined),
		).toBe(true);
	});

	test("carries the original First Review scope through later Baselines and archive restoration", () => {
		const introducedSource = {
			...key("introduced")[0],
			introducedAt: 20,
			introductionLocaleIds: [de, fr],
		};
		const carried = attachIntroductionReviews({
			hadPreviousBaseline: true,
			previousMessages: [],
			retainedMessages: [introducedSource],
			currentMessages: key("introduced"),
			introducedAt: 40,
		});
		expect(carried.find((row) => row.isSource)).toMatchObject({
			introducedAt: 20,
			introductionLocaleIds: [de, fr],
		});
	});
});

describe("First Review", () => {
	test("only a human decision after introduction clears a Locale", () => {
		const source = {
			introducedAt: 20,
			introductionLocaleIds: [de, fr],
		};
		const pending = pendingIntroductionLocaleIds({
			source,
			activeTargetLocaleIds: new Set([de, fr]),
			decisions: [
				{ localeId: de, recordedAt: 21, recordedBy: { kind: "agent" } },
				{ localeId: de, recordedAt: 19, recordedBy: { kind: "user" } },
				{ localeId: fr, recordedAt: 21, recordedBy: { kind: "user" } },
			],
		});
		expect([...pending]).toEqual([de]);
	});

	test("keeps every introduced target out of ordinary batch confirmation", () => {
		const rows = key("new-populated").map((row) => ({
			...row,
			...(row.isSource
				? { introducedAt: 20, introductionLocaleIds: [de, fr] }
				: {}),
			valueFingerprint: row.valueFingerprint ?? "value",
		}));
		const plan = ordinaryImportConfirmationPlan({
			rows,
			heads: [],
			decisions: [],
			pendingSourceMessageIds: new Set(),
		});
		expect(plan.counts).toMatchObject({
			total: 2,
			introduced: 2,
			eligible: 0,
		});
		expect(plan.candidates).toEqual([]);
	});
});
