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
		const result = applyReleaseBundleToDeliveryTree(bundle([]), [
			{ catalogPath: "en.arb", content: source },
			{ catalogPath: "de.arb", content: german },
		]);
		expect(result.files).toEqual([
			{ catalogPath: "en.arb", content: source },
			{ catalogPath: "de.arb", content: german },
		]);
		expect(result.applied).toEqual([]);
	});

	test("applies a target change over target drift when Source is unchanged", () => {
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
				{
					catalogPath: "de.arb",
					content: german.replace("Hallo", "Servus"),
				},
			],
		);
		expect(result.applied).toEqual(["greeting"]);
		expect(result.skipped).toEqual([]);
		expect(result.files[1]?.content).toContain('"greeting": "Guten Tag"');
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
