import { describe, expect, test } from "bun:test";

import {
	navigateStringsDigests,
	nextCatalogWorkspaceFocusTarget,
	type StringsNavigationDigest,
	translationTaskLocales,
} from "./strings-catalog-navigation";

function digest(input: {
	messageId: string;
	catalogIndex: number;
	corpus: string[];
	targetStates?: string[];
}): StringsNavigationDigest {
	return {
		messageId: input.messageId,
		catalogIndex: input.catalogIndex,
		searchCorpus: input.corpus,
		source: {
			localeId: "source-locale",
			gitValueFingerprint: "source-fingerprint",
		},
		targets: (input.targetStates ?? []).map((valueState, index) => ({
			localeId: `locale-${index}`,
			localeCode: `l${index}`,
			valueState: valueState as
				| "waiting"
				| "unconfirmedImport"
				| "stale"
				| "settled",
			touched: true,
			confirmedGitContent: true,
			confirmedContentPreviously: true,
		})),
	};
}

const navigation = {
	kind: "ready" as const,
	projectionId: "projection-1",
	keys: [
		digest({
			messageId: "account_title",
			catalogIndex: 0,
			corpus: ["account_title", "account settings", "kontoeinstellungen"],
			targetStates: ["settled"],
		}),
		digest({
			messageId: "billing_title",
			catalogIndex: 1,
			corpus: [
				"billing_title",
				"billing settings",
				"paramètres de facturation",
			],
			targetStates: ["waiting"],
		}),
		digest({
			messageId: "приветствие",
			catalogIndex: 2,
			corpus: ["приветствие", "hello", "привет"],
			targetStates: ["unconfirmedImport", "stale"],
		}),
	],
};

describe("navigateStringsDigests", () => {
	test("matches the message identifier case-insensitively", () => {
		const result = navigateStringsDigests(navigation, { query: "BILLING" });
		expect(result.matchingDigests.map((d) => d.messageId)).toEqual([
			"billing_title",
		]);
	});

	test("matches every effective Locale value through the folded corpus", () => {
		expect(
			navigateStringsDigests(navigation, {
				query: "kontoeinstellungen",
			}).matchingDigests.map((d) => d.messageId),
		).toEqual(["account_title"]);
		expect(
			navigateStringsDigests(navigation, {
				query: "привет",
			}).matchingDigests.map((d) => d.messageId),
		).toEqual(["приветствие"]);
	});

	test("combines search and scope as AND over whole keys", () => {
		const both = navigateStringsDigests(navigation, {
			query: "title",
			scope: "waiting",
		});
		expect(both.matchingDigests.map((d) => d.messageId)).toEqual([
			"billing_title",
		]);
		const scopeOnly = navigateStringsDigests(navigation, {
			query: "",
			scope: "stale",
		});
		expect(scopeOnly.matchingDigests.map((d) => d.messageId)).toEqual([
			"приветствие",
		]);
	});

	test("combines a frozen hand-off with search and scope without changing Catalog Order", () => {
		const result = navigateStringsDigests(navigation, {
			query: "title",
			scope: "waiting",
			handoffMessageIds: ["приветствие", "billing_title"],
		});
		expect(result.matchingDigests.map((digest) => digest.messageId)).toEqual([
			"billing_title",
		]);
	});

	test("preserves Catalog Order and targets permalinks inside the result", () => {
		const result = navigateStringsDigests(navigation, {
			query: "",
			key: "приветствие",
		});
		expect(result.matchingDigests.map((d) => d.catalogIndex)).toEqual([
			0, 1, 2,
		]);
		expect(result.target).toEqual({ id: "приветствие", index: 2 });
	});

	test("an unknown permalink stays harmless", () => {
		const result = navigateStringsDigests(navigation, {
			query: "",
			key: "no_such_key",
		});
		expect(result.target).toBeUndefined();
		expect(result.matchingDigests).toHaveLength(3);
	});
});

describe("translationTaskLocales", () => {
	test("offers only target Locales shared by every selected key", () => {
		const target = (localeId: string, localeCode: string) => ({
			localeId,
			localeCode,
			valueState: "settled" as const,
			touched: true,
			confirmedGitContent: true,
			confirmedContentPreviously: true,
		});
		const first = {
			...digest({ messageId: "first", catalogIndex: 0, corpus: [] }),
			targets: [target("de-id", "de"), target("fr-id", "fr")],
		};
		const second = {
			...digest({ messageId: "second", catalogIndex: 1, corpus: [] }),
			targets: [target("de-id", "de")],
		};

		expect(
			translationTaskLocales([first, second], new Set(["first", "second"])),
		).toEqual([{ localeId: "de-id", localeCode: "de" }]);
		expect(
			translationTaskLocales([first], new Set(["first", "missing"])),
		).toEqual([]);
	});
});

describe("nextCatalogWorkspaceFocusTarget", () => {
	const targets = [
		{
			messageId: "account_title",
			localeId: "en",
			keyIndex: 0,
		},
		{
			messageId: "account_title",
			localeId: "de",
			keyIndex: 0,
			valueState: "unconfirmedImport" as const,
		},
		{
			messageId: "billing_title",
			localeId: "en",
			keyIndex: 1,
		},
	];

	test("includes the editable Source before target Locales", () => {
		expect(
			nextCatalogWorkspaceFocusTarget(
				targets,
				{ messageId: "account_title", localeId: "en" },
				{ kind: "next" },
			),
		).toMatchObject({ messageId: "account_title", localeId: "de" });
		expect(
			nextCatalogWorkspaceFocusTarget(
				targets,
				{ messageId: "account_title", localeId: "de" },
				{ kind: "next" },
			),
		).toMatchObject({ messageId: "billing_title", localeId: "en" });
	});
});
