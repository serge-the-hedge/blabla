import type { Id } from "./_generated/dataModel";

type IntroductionSource = {
	introducedAt?: number;
	introductionLocaleIds?: readonly Id<"locales">[];
};

type IntroductionDecision = {
	localeId: Id<"locales">;
	recordedAt: number;
	recordedBy: { kind: "user" | "agent" | "system" | "repositoryAdapter" };
};

/** First Review is deliberately content-independent: once a person has
 * examined one introduction Locale, later target changes use ordinary
 * confirmation and currency rules rather than pretending the key is new
 * again. Inactive Locales pause their requirement until they return. */
export function pendingIntroductionLocaleIds(input: {
	source: IntroductionSource;
	activeTargetLocaleIds: ReadonlySet<Id<"locales">>;
	decisions: readonly IntroductionDecision[];
}): Set<Id<"locales">> {
	if (
		input.source.introducedAt === undefined ||
		input.source.introductionLocaleIds === undefined
	) {
		return new Set();
	}
	const reviewed = new Set(
		input.decisions.flatMap((decision) =>
			decision.recordedBy.kind === "user" &&
			decision.recordedAt >=
				(input.source.introducedAt ?? Number.POSITIVE_INFINITY)
				? [decision.localeId]
				: [],
		),
	);
	return new Set(
		input.source.introductionLocaleIds.filter(
			(localeId) =>
				input.activeTargetLocaleIds.has(localeId) && !reviewed.has(localeId),
		),
	);
}
