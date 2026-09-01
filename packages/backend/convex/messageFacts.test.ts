import { describe, expect, test } from "vitest";

import { messageFacts } from "./messageFacts";

describe("message facts", () => {
	test("collects nested ICU arguments without treating plural arm text as a placeholder", () => {
		expect(
			messageFacts(
				"{count, plural, zero{Scanned} one{{count} scan} other{{count} scans}}",
			),
		).toEqual({ icuType: "icu", argumentNames: ["count"] });
	});

	test("collects select arguments and ignores quoted ICU syntax", () => {
		expect(
			messageFacts(
				"It's {name}; '{ignored}' {gender, select, male{He} other{They}}",
			),
		).toEqual({
			icuType: "icu",
			argumentNames: ["name", "gender"],
		});
	});
});
