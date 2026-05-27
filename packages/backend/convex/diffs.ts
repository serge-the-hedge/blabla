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
	const previousCount = previousLines.length;
	const nextCount = nextLines.length;
	const lcsLengths = Array.from({ length: previousCount + 1 }, () =>
		Array(nextCount + 1).fill(0),
	);
	for (
		let previousIndex = previousCount - 1;
		previousIndex >= 0;
		previousIndex -= 1
	) {
		for (let nextIndex = nextCount - 1; nextIndex >= 0; nextIndex -= 1) {
			lcsLengths[previousIndex][nextIndex] =
				previousLines[previousIndex] === nextLines[nextIndex]
					? lcsLengths[previousIndex + 1][nextIndex + 1] + 1
					: Math.max(
							lcsLengths[previousIndex + 1][nextIndex],
							lcsLengths[previousIndex][nextIndex + 1],
						);
		}
	}
	const common = lcsLengths[0][0];
	return {
		additions: nextLines.length - common,
		deletions: previousLines.length - common,
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
