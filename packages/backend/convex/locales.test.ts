import { describe, expect, test } from "vitest";

import { normalizeCatalogPath } from "./locales";

describe("catalog path", () => {
	test("keeps an ordinary repository-relative path as written", () => {
		expect(
			normalizeCatalogPath("packages/brickit_generated/lib/l10n/intl_de.arb"),
		).toBe("packages/brickit_generated/lib/l10n/intl_de.arb");
	});

	test("drops `.` segments so one file has one spelling", () => {
		// Two Locales claiming the same file under different spellings would
		// each pass an exclusivity check done on the raw string.
		expect(normalizeCatalogPath("./lib/l10n/intl_de.arb")).toBe(
			"lib/l10n/intl_de.arb",
		);
		expect(normalizeCatalogPath("lib/./l10n/intl_de.arb")).toBe(
			"lib/l10n/intl_de.arb",
		);
	});

	test("trims surrounding whitespace", () => {
		expect(normalizeCatalogPath("  lib/l10n/intl_de.arb  ")).toBe(
			"lib/l10n/intl_de.arb",
		);
	});

	test.each([
		["an absolute path", "/etc/passwd"],
		["a parent traversal", "packages/../../secrets.arb"],
		["a bare traversal", ".."],
		["an empty path", ""],
		["whitespace alone", "   "],
		["a trailing slash", "lib/l10n/"],
		["a doubled separator", "lib//l10n/intl_de.arb"],
		["a backslash separator", "lib\\l10n\\intl_de.arb"],
		["a path of nothing but dots", "./."],
	])("refuses %s", (_label, path) => {
		expect(() => normalizeCatalogPath(path)).toThrow("Catalog path");
	});
});
