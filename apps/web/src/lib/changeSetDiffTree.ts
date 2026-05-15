export interface ChangeSetDiffNode {
	path: string;
	additions: number;
	deletions: number;
}

export function summarizeChangeItems(
	items: Array<{
		fieldPath: string;
		previousValue: string | null;
		nextValue: string | null;
	}>,
): ChangeSetDiffNode[] {
	return items.map((item) => ({
		path: item.fieldPath,
		additions: item.nextValue ? item.nextValue.split("\n").length : 0,
		deletions: item.previousValue ? item.previousValue.split("\n").length : 0,
	}));
}
