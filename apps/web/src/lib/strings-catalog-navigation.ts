import type { CatalogWorkspaceValue } from "./strings-catalog";

export type StringsCatalogNavigationState = {
	query: string;
	key?: string;
	scope?: CatalogValueScope;
};

export type CatalogValueScope = "waiting" | "unconfirmedImport" | "stale";

/** An editable target's place in the locally loaded Catalog Workspace. The
 * component owns DOM focus; this module owns the deterministic movement rule. */
export type CatalogWorkspaceFocusTarget = {
	messageId: string;
	localeId: string;
	keyIndex: number;
	valueState?: CatalogWorkspaceValue["valueState"];
	sourceChangeKind?: CatalogWorkspaceValue["sourceChangeKind"];
};

export type CatalogWorkspaceFocusIntent =
	| { kind: "adjacent"; direction: -1 | 1 }
	| { kind: "next" }
	| { kind: "nextWaiting" };

/** Find the next editor field without changing Catalog Order. Tab does not
 * wrap at an edge; after a commit, the next field wraps through the catalog so
 * populated values are never skipped. The older nextWaiting intent remains
 * available for callers that explicitly want unresolved work. */
export function nextCatalogWorkspaceFocusTarget(
	targets: readonly CatalogWorkspaceFocusTarget[],
	current: Pick<CatalogWorkspaceFocusTarget, "messageId" | "localeId">,
	intent: CatalogWorkspaceFocusIntent,
): CatalogWorkspaceFocusTarget | undefined {
	const currentIndex = targets.findIndex(
		(target) =>
			target.messageId === current.messageId &&
			target.localeId === current.localeId,
	);
	if (currentIndex < 0) return undefined;
	if (intent.kind === "adjacent") {
		return targets[currentIndex + intent.direction];
	}
	if (intent.kind === "next") {
		if (targets.length < 2) return undefined;
		return targets[(currentIndex + 1) % targets.length];
	}
	for (let offset = 1; offset < targets.length; offset++) {
		const candidate = targets[(currentIndex + offset) % targets.length];
		if (
			candidate?.valueState === "waiting" ||
			(candidate?.valueState === "stale" &&
				candidate.sourceChangeKind !== "cosmetic")
		) {
			return candidate;
		}
	}
	return undefined;
}

/** One compact key digest of the Navigation read: identity, Catalog Order
 * position, the case-folded search corpus, and the per-target state facts
 * Catalog Scopes need. Carried without any full Locale value. */
export type StringsNavigationDigest = {
	messageId: string;
	catalogIndex: number;
	searchCorpus: readonly string[];
	source: {
		localeId: string;
		gitValueFingerprint: string;
	};
	targets: readonly {
		localeId: string;
		localeCode: string;
		valueState: CatalogValueScope | "settled";
		touched: boolean;
		confirmedGitContent: boolean;
		confirmedContentPreviously: boolean;
		repeatedGitContent?: boolean;
		gitValueFingerprint?: string;
	}[];
};

export type StringsNavigationRead = {
	kind: "noBaseline" | "incomplete" | "ready";
	projectionId?: string;
	canEdit?: boolean;
	keyCount?: number;
	status?: "missing" | "staging" | "verifying" | "ready" | "failed";
	failure?: {
		code?: string;
		message: string;
		failedAt: number;
	} | null;
	valueStateCounts?: {
		waiting: number;
		unconfirmedImport: number;
		stale: number;
		settled: number;
	};
	keys?: readonly StringsNavigationDigest[];
};

function matchesDigestQuery(digest: StringsNavigationDigest, query: string) {
	return digest.searchCorpus.some((corpusEntry) => corpusEntry.includes(query));
}

function matchesDigestScope(
	digest: StringsNavigationDigest,
	scope: CatalogValueScope | undefined,
) {
	return (
		scope === undefined ||
		digest.targets.some((target) => target.valueState === scope)
	);
}

/** Apply the local Strings navigation state to the compact Navigation digests
 * without changing Catalog Order. Search and Catalog Scopes stay local over
 * the digests — typing never executes a server query — and a key permalink
 * still selects a card in the current result rather than becoming a filter.
 * A whole key is selected: scopes match when any target carries the state. */
export function navigateStringsDigests(
	navigation: StringsNavigationRead,
	state: StringsCatalogNavigationState,
): {
	matchingDigests: readonly StringsNavigationDigest[];
	target?: { id: string; index: number };
} {
	const keys = navigation.keys ?? [];
	const query = (state.query ?? "").trim().toLowerCase();
	const matchingDigests = keys.filter(
		(digest) =>
			matchesDigestScope(digest, state.scope) &&
			(query.length === 0 || matchesDigestQuery(digest, query)),
	);
	const targetKey = state.key;
	const targetIndex = targetKey
		? matchingDigests.findIndex((digest) => digest.messageId === targetKey)
		: -1;
	return {
		matchingDigests,
		target:
			targetKey === undefined || targetIndex === -1
				? undefined
				: { id: targetKey, index: targetIndex },
	};
}
