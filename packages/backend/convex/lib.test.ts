import { describe, expect, test } from "bun:test";

import { normalizeSelection, toArbKey } from "./lib";

describe("ARB key normalization", () => {
	test("falls back when key segments are numeric only", () => {
		expect(toArbKey("123.456")).toBe("message");
	});

	test("keeps usable nonnumeric segments", () => {
		expect(toArbKey("123.checkout.title")).toBe("checkoutTitle");
	});
});

describe("selection normalization", () => {
	test("defaults missing selection type", () => {
		expect(normalizeSelection({ keys: ["a"] })).toEqual({
			type: "all",
			keys: ["a"],
		});
	});

	test("preserves explicit selection type", () => {
		expect(normalizeSelection({ type: "keys", keys: ["a"] })).toEqual({
			type: "keys",
			keys: ["a"],
		});
	});
});
