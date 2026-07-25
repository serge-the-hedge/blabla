import { describe, expect, test } from "vitest";

import {
	MAX_IMPORT_BYTES,
	MAX_IMPORT_KEY_LENGTH,
	MAX_IMPORT_MESSAGES,
	MAX_IMPORT_TAGS,
	MAX_IMPORT_VALUE_LENGTH,
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

	test("enforces byte, key, value, and nesting limits before writes", () => {
		expect(() =>
			parseJsonMessages(
				JSON.stringify({ message: "é".repeat(MAX_IMPORT_BYTES) }),
			),
		).toThrow("256 KiB or smaller");
		expect(() =>
			parseJsonMessages(
				JSON.stringify({ ["k".repeat(MAX_IMPORT_KEY_LENGTH + 1)]: "value" }),
			),
		).toThrow("Import keys must be");
		expect(() =>
			parseJsonMessages(
				JSON.stringify({ message: "v".repeat(MAX_IMPORT_VALUE_LENGTH + 1) }),
			),
		).toThrow("Import values must be");

		let nested: unknown = "value";
		for (let depth = 0; depth < 21; depth += 1) nested = { child: nested };
		expect(() => parseJsonMessages(JSON.stringify(nested))).toThrow(
			"at most 20 levels",
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
		expect(() => parseArbMessages('{"hello":"Hi","@hello":[]}')).toThrow(
			"must be an object",
		);
		expect(() =>
			parseArbMessages(
				JSON.stringify({
					hello: "Hi",
					"@hello": {
						placeholders: Object.fromEntries(
							Array.from({ length: 51 }, (_, index) => [`p${index}`, {}]),
						),
					},
				}),
			),
		).toThrow("at most 50 named entries");
	});

	test("rejects invalid or excessive tag labels", () => {
		expect(() => validateImportTags(["checkout", "legal"])).not.toThrow();
		expect(() => validateImportTags(["!!!"])).toThrow("valid, non-empty tags");
		expect(() =>
			validateImportTags(
				Array.from(
					{ length: MAX_IMPORT_TAGS + 1 },
					(_, index) => `tag-${index}`,
				),
			),
		).toThrow(`at most ${MAX_IMPORT_TAGS}`);
	});
});
