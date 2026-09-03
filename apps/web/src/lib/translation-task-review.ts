type ReviewCandidate = {
	revision: { _id: string; value: string } | null;
	reviews: readonly unknown[];
};

export type TranslationTaskBasisState = "current" | "changed" | "unavailable";

export function exactTaskBatchRevisionIds(input: {
	candidates: readonly ReviewCandidate[];
	drafts: Readonly<Record<string, string | undefined>>;
	blankReasons: Readonly<Record<string, string | undefined>>;
	basisState: Readonly<Record<string, TranslationTaskBasisState | undefined>>;
	limit?: number;
}): string[] {
	return input.candidates
		.flatMap(({ revision, reviews }) =>
			revision &&
			reviews.length === 0 &&
			input.basisState[revision._id] === "current" &&
			(input.drafts[revision._id] === undefined ||
				input.drafts[revision._id] === revision.value) &&
			(input.blankReasons[revision._id]?.trim().length ?? 0) === 0
				? [revision._id]
				: [],
		)
		.slice(0, input.limit ?? 16);
}

export function convexApplicationErrorMessage(
	cause: unknown,
	fallback: string,
): string {
	if (cause && typeof cause === "object" && "data" in cause) {
		const data = cause.data;
		if (
			data &&
			typeof data === "object" &&
			"message" in data &&
			typeof data.message === "string"
		) {
			return data.message;
		}
	}
	return cause instanceof Error ? cause.message : fallback;
}
