import { describe, expect, test } from "bun:test";

import { canRecordIntentionalBlank } from "./catalog-value-lifecycle";

describe("canRecordIntentionalBlank", () => {
	test("permits only an exactly empty draft", () => {
		expect(canRecordIntentionalBlank("")).toBe(true);
		expect(canRecordIntentionalBlank("Translation")).toBe(false);
		expect(canRecordIntentionalBlank(" ")).toBe(false);
		expect(canRecordIntentionalBlank("\n")).toBe(false);
	});
});
