import { describe, expect, test } from "bun:test";

import {
	assertBoundedChangeSetSize,
	assertChangeItemReferencesProject,
	assertNoPendingItems,
	isAcceptedForApply,
	MAX_CHANGE_SET_ITEMS,
	parseTagMetadataPayload,
} from "./changeSetValidation";

describe("change set security invariants", () => {
	const activeProjectA = { projectId: "project-a" };
	const activeProjectB = { projectId: "project-b" };

	test("rejects cross-project key metadata references", () => {
		expect(() =>
			assertChangeItemReferencesProject(
				"project-a",
				{
					kind: "key_metadata",
					keyId: "key-b",
					nextValue: JSON.stringify({ tagSlugs: ["security"] }),
				},
				activeProjectB,
				null,
			),
		).toThrow("references must belong to this project");
	});

	test("rejects cross-project translation locale references", () => {
		expect(() =>
			assertChangeItemReferencesProject(
				"project-a",
				{
					kind: "translation_value",
					keyId: "key-a",
					localeId: "locale-b",
					nextValue: "Hello",
				},
				activeProjectA,
				activeProjectB,
			),
		).toThrow("references must belong to this project");
	});

	test("requires structured bounded tag metadata", () => {
		expect(parseTagMetadataPayload('{"tagSlugs":["one","one"]}')).toEqual({
			tagSlugs: ["one"],
		});
		expect(() => parseTagMetadataPayload('{"tagSlugs":"one"}')).toThrow(
			"tagSlugs must contain",
		);
		expect(() => parseTagMetadataPayload('{"tagSlugs":["!!!"]}')).toThrow(
			"tagSlugs must contain",
		);
		expect(() => parseTagMetadataPayload('{"tagSlugs":["!!!"]}')).toThrow(
			"tagSlugs must contain",
		);
		expect(() =>
			parseTagMetadataPayload('{"tagSlugs":[],"unexpected":true}'),
		).toThrow("must contain only tagSlugs");
	});

	test("only fully reviewed, explicitly accepted items can apply", () => {
		expect(isAcceptedForApply({ status: "accepted" })).toBe(true);
		expect(isAcceptedForApply({ status: "pending" })).toBe(false);
		expect(() =>
			assertNoPendingItems([{ status: "accepted" }, { status: "rejected" }]),
		).not.toThrow();
		expect(() =>
			assertNoPendingItems([{ status: "accepted" }, { status: "pending" }]),
		).toThrow("Accept or reject every pending item");
	});

	test("enforces the supported change set size", () => {
		expect(() =>
			assertBoundedChangeSetSize(MAX_CHANGE_SET_ITEMS),
		).not.toThrow();
		expect(() => assertBoundedChangeSetSize(MAX_CHANGE_SET_ITEMS + 1)).toThrow(
			"at most 50 items",
		);
	});
});
