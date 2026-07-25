import { describe, expect, test } from "vitest";

import { diffStat, summarizeItems } from "./diffs";

describe("change set diffs", () => {
	test("counts empty values as zero-line additions and deletions", () => {
		expect(diffStat(null, "Hello")).toEqual({ additions: 1, deletions: 0 });
		expect(diffStat("Hello", "")).toEqual({ additions: 0, deletions: 1 });
		expect(diffStat("", "")).toEqual({ additions: 0, deletions: 0 });
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
			additions: 2,
			deletions: 0,
		});
	});
});
