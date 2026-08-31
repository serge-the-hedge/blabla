import { describe, expect, test } from "bun:test";

import {
	type CatalogWorkspace,
	createCatalogWorkspaceDraft,
	editCatalogWorkspaceDraft,
	readStringsCatalog,
	refreshCatalogWorkspaceDraft,
} from "./strings-catalog";

const workspace: CatalogWorkspace = {
	snapshotId: "baseline-snapshot",
	keys: [
		{
			id: "account_title",
			values: [
				{
					localeCode: "en",
					isSource: true,
					value: "Account",
					materialized: false,
				},
				{
					localeCode: "de",
					isSource: false,
					value: "Konto",
					materialized: false,
				},
			],
		},
		{
			id: "billing_title",
			values: [
				{
					localeCode: "en",
					isSource: true,
					value: "Billing",
					materialized: false,
				},
				{
					localeCode: "de",
					isSource: false,
					value: "",
					materialized: true,
				},
			],
		},
	],
};

describe("readStringsCatalog", () => {
	test("keeps Catalog Order and groups every Locale under its source message", () => {
		expect(readStringsCatalog(workspace)).toEqual({
			snapshotId: "baseline-snapshot",
			canEdit: false,
			keys: [
				{
					id: "account_title",
					source: workspace.keys[0]?.values[0],
					targets: [workspace.keys[0]?.values[1]],
				},
				{
					id: "billing_title",
					source: workspace.keys[1]?.values[0],
					targets: [workspace.keys[1]?.values[1]],
				},
			],
		});

		expect(readStringsCatalog(null)).toBeNull();
	});
});

describe("Catalog Workspace drafts", () => {
	test("retains the source token from a dirty target draft across a newer Source Proposal", () => {
		const firstSource = {
			value: "Hallo",
			expectedSourceFingerprint: "source-proposal-one",
			expectedGitValueFingerprint: "git-one",
			expectedGitValueRevision: 0,
			expectedWorkspaceRevision: 0,
		};
		const dirtyDraft = editCatalogWorkspaceDraft({
			draft: createCatalogWorkspaceDraft(firstSource),
			source: firstSource,
			value: "Willkommen",
		});
		const afterSourceProposalChanges = refreshCatalogWorkspaceDraft(
			dirtyDraft,
			{
				value: "Hallo",
				expectedSourceFingerprint: "source-proposal-two",
				expectedGitValueFingerprint: "git-one",
				expectedGitValueRevision: 0,
				expectedWorkspaceRevision: 1,
			},
		);

		expect(afterSourceProposalChanges).toEqual({
			value: "Willkommen",
			expectedSourceFingerprint: "source-proposal-one",
			expectedGitValueFingerprint: "git-one",
			expectedGitValueRevision: 0,
			expectedWorkspaceRevision: 0,
			isDirty: true,
		});
	});

	test("refreshes the source token while a target draft is clean", () => {
		const refreshed = refreshCatalogWorkspaceDraft(
			createCatalogWorkspaceDraft({
				value: "Hallo",
				expectedSourceFingerprint: "source-proposal-one",
				expectedGitValueFingerprint: "git-one",
				expectedGitValueRevision: 0,
				expectedWorkspaceRevision: 0,
			}),
			{
				value: "Hallo",
				expectedSourceFingerprint: "source-proposal-two",
				expectedGitValueFingerprint: "git-one",
				expectedGitValueRevision: 0,
				expectedWorkspaceRevision: 1,
			},
		);

		expect(refreshed.expectedSourceFingerprint).toBe("source-proposal-two");
		expect(refreshed.expectedWorkspaceRevision).toBe(1);
		expect(refreshed.isDirty).toBeFalse();
	});

	test("refreshes a clean English draft when another editor changes the proposal", () => {
		const refreshed = refreshCatalogWorkspaceDraft(
			createCatalogWorkspaceDraft({
				value: "Account",
				expectedSourceFingerprint: "git-source",
				expectedGitValueFingerprint: "git-one",
				expectedGitValueRevision: 0,
				expectedWorkspaceRevision: 0,
			}),
			{
				value: "Your account",
				expectedSourceFingerprint: "source-proposal-one",
				expectedGitValueFingerprint: "git-one",
				expectedGitValueRevision: 0,
				expectedWorkspaceRevision: 1,
			},
		);

		expect(refreshed).toEqual({
			value: "Your account",
			expectedSourceFingerprint: "source-proposal-one",
			expectedGitValueFingerprint: "git-one",
			expectedGitValueRevision: 0,
			expectedWorkspaceRevision: 1,
			isDirty: false,
		});
	});
});
