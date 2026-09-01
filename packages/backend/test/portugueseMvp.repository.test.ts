import { expect, test } from "vitest";

import { provePortugueseMvp } from "./portugueseMvpProof";

const brickitCheckout = process.env.BRICKIT_CHECKOUT;
const brickitFlutterSdk = process.env.BRICKIT_FLUTTER_SDK;
const realCorpusTest = brickitCheckout === undefined ? test.skip : test;

realCorpusTest(
	"an agent drafts, a human reviews, and the adapter delivers a complete Portuguese Catalog Document into a Brickit branch",
	async () => {
		if (brickitCheckout === undefined) {
			throw new Error(
				"BRICKIT_CHECKOUT is required for the real-corpus proof.",
			);
		}
		const proof = await provePortugueseMvp(brickitCheckout, {
			flutterSdk: brickitFlutterSdk,
		});

		expect(proof.sourceMessageCount).toBeGreaterThan(1_000);
		expect(proof.artifactMessageCount).toBe(proof.sourceMessageCount);
		expect(proof.branchName).toMatch(/^blabla\/locale-proposal-/);
		expect(proof.changedPaths).toEqual([
			"packages/brickit/lib/constants/locale_const.dart",
			"packages/brickit_generated/lib/l10n/app_localizations.dart",
			"packages/brickit_generated/lib/l10n/app_localizations_pt.dart",
			"packages/brickit_generated/lib/l10n/intl_pt.arb",
		]);
		expect(proof.requestPaths).toEqual(
			expect.arrayContaining([
				"/api/agent/v1/locale-proposals/pt",
				"/api/agent/v1/locale-proposals/pt/template",
				"/api/agent/v1/locale-proposals/pt/values",
				"/api/agent/v1/locale-proposals/pt/finalize",
				"/api/agent/v1/locale-proposals/pt/artifact",
			]),
		);
		expect(proof.remoteGitCommands).toEqual([]);
	},
	5 * 60_000,
);
