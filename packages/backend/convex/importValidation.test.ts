import { describe, expect, test } from "bun:test";

import {
	MAX_IMPORT_MESSAGES,
	parseArbMessages,
	parseJsonMessages,
	validateImportTags,
} from "./importValidation";

describe("import validation", () => {
	test("flattens nested JSON without silently accepting non-string leaves", () => {
		expect(parseJsonMessages('{"checkout":{"pay":"Pay now"}}')).toEqual({
			"checkout.pay": "Pay now",
		});
		expect(() => parseJsonMessages('{"count":3}')).toThrow(
			"must be a string or nested object",
		);
	});

	test("rejects duplicate flattened keys", () => {
		expect(() =>
			parseJsonMessages('{"a":{"b":"nested"},"a.b":"flat"}'),
		).toThrow("duplicate flattened key");
	});

	test("caps message count before import writes", () => {
		const payload = Object.fromEntries(
			Array.from({ length: MAX_IMPORT_MESSAGES + 1 }, (_, index) => [
				`key.${index}`,
				"value",
			]),
		);
		expect(() => parseJsonMessages(JSON.stringify(payload))).toThrow(
			"at most 50 messages",
		);
	});

	test("validates ARB message and metadata shapes", () => {
		const result = parseArbMessages(
			'{"hello":"Hello","@hello":{"description":"Greeting"}}',
		);
		expect(result.messages).toEqual({ hello: "Hello" });
		expect(result.metadata.get("hello")).toEqual({
			description: "Greeting",
		});
		expect(() => parseArbMessages('{"hello":42}')).toThrow("must be a string");
	});

	test("rejects tag labels that cannot produce a valid slug", () => {
		expect(() => validateImportTags(["checkout", "legal"])).not.toThrow();
		expect(() => validateImportTags(["!!!"])).toThrow("valid, non-empty tags");
	});
});
