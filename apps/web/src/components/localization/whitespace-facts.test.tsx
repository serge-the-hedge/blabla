import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
	translationWhitespaceFacts,
	WhitespaceFacts,
} from "./whitespace-facts";

describe("translation whitespace facts", () => {
	test("does not call attention to ordinary text", () => {
		expect(translationWhitespaceFacts("Ordinary text")).toEqual([]);
		expect(
			renderToStaticMarkup(<WhitespaceFacts value="Ordinary text" />),
		).toBe("");
	});

	test("describes edge spaces, tabs, and line breaks", () => {
		expect(translationWhitespaceFacts("  First\nSecond\n\t")).toEqual([
			"leading: 2 spaces",
			"trailing: 1 tab",
			"2 line breaks",
		]);
	});
});
