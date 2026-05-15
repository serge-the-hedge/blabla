import { describe, expect, test } from "bun:test";

import { buildUnifiedPatch, diffStat, summarizeItems } from "./diffs";

describe("change set diffs", () => {
	test("counts empty values as zero-line additions and deletions", () => {
		expect(diffStat(null, "Hello")).toEqual({ additions: 1, deletions: 0 });
		expect(diffStat("Hello", "")).toEqual({ additions: 0, deletions: 1 });
		expect(diffStat("", "")).toEqual({ additions: 0, deletions: 0 });
	});

	test("builds a unified patch for review items", () => {
		const patch = buildUnifiedPatch([
			{
				fieldPath: "locales/hy/checkout.payButton.json",
				previousValue: "Pay",
				nextValue: "Վճարել",
			},
		]);

		expect(patch).toContain(
			"diff --git a/locales/hy/checkout.payButton.json b/locales/hy/checkout.payButton.json",
		);
		expect(patch).toContain("-Pay");
		expect(patch).toContain("+Վճարել");
	});

	test("summarizes additions and deletions across items", () => {
		expect(
			summarizeItems([
				{ previousValue: "One", nextValue: "One\nTwo" },
				{ previousValue: null, nextValue: "Three" },
			]),
		).toEqual({
			filesChanged: 2,
			fieldsChanged: 2,
			additions: 3,
			deletions: 1,
		});
	});
});
