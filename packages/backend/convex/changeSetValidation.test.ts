import { describe, expect, test } from "vitest";

import {
	assertBoundedChangeSetSize,
	assertChangeItemReferencesProject,
	assertNoPendingItems,
	isAcceptedForApply,
	MAX_CHANGE_SET_ITEMS,
	MAX_TAGS_PER_METADATA_CHANGE,
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
		expect(() => parseTagMetadataPayload(null)).toThrow("require a value");
		expect(() => parseTagMetadataPayload("not-json")).toThrow("valid JSON");
		expect(() => parseTagMetadataPayload('{"tagSlugs":"one"}')).toThrow(
			"tagSlugs must contain",
		);
		expect(() => parseTagMetadataPayload('{"tagSlugs":["!!!"]}')).toThrow(
			"tagSlugs must contain",
		);
		expect(() =>
			parseTagMetadataPayload('{"tagSlugs":[],"unexpected":true}'),
		).toThrow("must contain only tagSlugs");
		expect(() =>
			parseTagMetadataPayload(
				JSON.stringify({
					tagSlugs: Array.from(
						{ length: MAX_TAGS_PER_METADATA_CHANGE + 1 },
						(_, index) => `tag-${index}`,
					),
				}),
			),
		).toThrow(`at most ${MAX_TAGS_PER_METADATA_CHANGE}`);
	});

	test("rejects archived and unsupported references", () => {
		expect(() =>
			assertChangeItemReferencesProject(
				"project-a",
				{
					kind: "translation_value",
					keyId: "key-a",
					localeId: "locale-a",
					nextValue: "Hello",
				},
				{ projectId: "project-a", archivedAt: Date.now() },
				activeProjectA,
			),
		).toThrow("references must belong to this project");
		expect(() =>
			assertChangeItemReferencesProject(
				"project-a",
				{ kind: "key_create", nextValue: "Hello" },
				null,
				null,
			),
		).toThrow("Cannot add key_create");
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
