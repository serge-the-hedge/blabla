import { describe, expect, test } from "vitest";

import {
	applyReleaseBundleToDeliveryTree,
	type ReleaseBundleArtifact,
} from "./releaseBundleModel";

const source =
	'{\n  "@@locale": "en",\n  "farewell": "Bye",\n  "greeting": "Hello"\n}';
const german =
	'{\n  "@@locale": "de",\n  "farewell": "Tschüss",\n  "greeting": "Hallo"\n}';

function bundle(
	changes: ReleaseBundleArtifact["changes"],
): ReleaseBundleArtifact {
	return {
		version: 1,
		releaseRecord: {
			id: "record",
			projectId: "project",
			baselineSnapshotId: "snapshot",
			repository: "repo",
			baselineCommit: "abcdef0",
			manifestHash: "a".repeat(64),
			integrationBranch: "develop",
		},
		catalogs: [
			{ localeCode: "en", catalogPath: "en.arb", isSource: true },
			{ localeCode: "de", catalogPath: "de.arb", isSource: false },
		],
		changes,
	};
}

describe("Release Bundle delivery tree", () => {
	test("reproduces a no-op delivery byte for byte", () => {
		const nonCanonicalGerman =
			'{"@@locale":"de", "farewell":"Tschüss", "greeting":"Hallo"}\n';
		const result = applyReleaseBundleToDeliveryTree(bundle([]), [
			{ catalogPath: "en.arb", content: source },
			{ catalogPath: "de.arb", content: nonCanonicalGerman },
		]);
		expect(result.files).toEqual([
			{ catalogPath: "en.arb", content: source },
			{ catalogPath: "de.arb", content: nonCanonicalGerman },
		]);
		expect(result.applied).toEqual([]);
	});

	test("applies a target change over target drift when Source is unchanged", () => {
		const drifted =
			'{"@@locale":"de", "farewell":"Tschüss", "greeting":"Servus"}\n';
		const result = applyReleaseBundleToDeliveryTree(
			bundle([
				{
					catalogIndex: 1,
					messageId: "greeting",
					baselineSourceValue: "Hello",
					values: [
						{
							localeCode: "de",
							catalogPath: "de.arb",
							isSource: false,
							baselineValue: "Hallo",
							value: "Guten Tag",
						},
					],
				},
			]),
			[
				{ catalogPath: "en.arb", content: source },
				{ catalogPath: "de.arb", content: drifted },
			],
		);
		expect(result.applied).toEqual(["greeting"]);
		expect(result.skipped).toEqual([]);
		expect(result.files[1]?.content).toBe(
			'{"@@locale":"de", "farewell":"Tschüss", "greeting":"Guten Tag"}\n',
		);
	});

	test("applies a reviewed Source proposal and its target changes together", () => {
		const result = applyReleaseBundleToDeliveryTree(
			bundle([
				{
					catalogIndex: 1,
					messageId: "greeting",
					baselineSourceValue: "Hello",
					values: [
						{
							localeCode: "en",
							catalogPath: "en.arb",
							isSource: true,
							baselineValue: "Hello",
							value: "Hello there",
						},
						{
							localeCode: "de",
							catalogPath: "de.arb",
							isSource: false,
							baselineValue: "Hallo",
							value: "Guten Tag",
						},
					],
				},
			]),
			[
				{ catalogPath: "en.arb", content: source },
				{ catalogPath: "de.arb", content: german },
			],
		);

		expect(result.applied).toEqual(["greeting"]);
		expect(result.skipped).toEqual([]);
		expect(result.files).toEqual([
			{
				catalogPath: "en.arb",
				content:
					'{\n  "@@locale": "en",\n  "farewell": "Bye",\n  "greeting": "Hello there"\n}',
			},
			{
				catalogPath: "de.arb",
				content:
					'{\n  "@@locale": "de",\n  "farewell": "Tschüss",\n  "greeting": "Guten Tag"\n}',
			},
		]);
	});

	test("inserts a missing target without reserializing neighbouring members", () => {
		const result = applyReleaseBundleToDeliveryTree(
			bundle([
				{
					catalogIndex: 1,
					messageId: "greeting",
					baselineSourceValue: "Hello",
					values: [
						{
							localeCode: "de",
							catalogPath: "de.arb",
							isSource: false,
							baselineValue: "",
							value: "Guten Tag",
						},
					],
				},
			]),
			[
				{ catalogPath: "en.arb", content: source },
				{
					catalogPath: "de.arb",
					content: '{\n\t"@@locale" : "de",\n\t"farewell" : "Tschüss"\n}',
				},
			],
		);

		expect(result.files[1]?.content).toBe(
			'{\n\t"@@locale" : "de",\n\t"farewell" : "Tschüss",\n\t"greeting": "Guten Tag"\n}',
		);
	});

	test("skips the whole key when Source moved in the delivery tree", () => {
		const result = applyReleaseBundleToDeliveryTree(
			bundle([
				{
					catalogIndex: 1,
					messageId: "greeting",
					baselineSourceValue: "Hello",
					values: [
						{
							localeCode: "de",
							catalogPath: "de.arb",
							isSource: false,
							baselineValue: "Hallo",
							value: "Guten Tag",
						},
					],
				},
			]),
			[
				{
					catalogPath: "en.arb",
					content: source.replace("Hello", "Hello there"),
				},
				{ catalogPath: "de.arb", content: german },
			],
		);
		expect(result.applied).toEqual([]);
		expect(result.skipped).toEqual([
			{ messageId: "greeting", reason: "source_changed" },
		]);
		expect(result.files[1]?.content).toBe(german);
	});
});
