import type { Doc } from "./_generated/dataModel";

export function diffStat(
	previousValue: string | null,
	nextValue: string | null,
) {
	const previousLines =
		previousValue === null || previousValue.length === 0
			? []
			: previousValue.split("\n");
	const nextLines =
		nextValue === null || nextValue.length === 0 ? [] : nextValue.split("\n");
	return {
		additions: nextLines.length,
		deletions: previousLines.length,
	};
}

export function summarizeItems(
	items: Pick<Doc<"changeSetItems">, "previousValue" | "nextValue">[],
) {
	return items.reduce(
		(summary, item) => {
			const stat = diffStat(item.previousValue, item.nextValue);
			return {
				filesChanged: summary.filesChanged + 1,
				fieldsChanged: summary.fieldsChanged + 1,
				additions: summary.additions + stat.additions,
				deletions: summary.deletions + stat.deletions,
			};
		},
		{ filesChanged: 0, fieldsChanged: 0, additions: 0, deletions: 0 },
	);
}
