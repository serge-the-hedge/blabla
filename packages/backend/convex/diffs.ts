import type { Doc } from "./_generated/dataModel";

function escapePatchLine(line: string): string {
	return line.length === 0 ? "" : line;
}

function lineBlock(prefix: "+" | "-" | " ", value: string): string[] {
	const lines = value.split("\n");
	return lines.map((line) => `${prefix}${escapePatchLine(line)}`);
}

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

export function buildItemVirtualPath(
	item: Pick<Doc<"changeSetItems">, "fieldPath">,
): string {
	const safePath = item.fieldPath
		.replace(/[^a-zA-Z0-9._/-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return safePath.includes("/")
		? safePath
		: `locales/${safePath || "change"}.json`;
}

export function buildUnifiedPatch(items: Doc<"changeSetItems">[]): string {
	return items
		.map((item) => {
			const path = buildItemVirtualPath(item);
			const previousValue = item.previousValue ?? "";
			const nextValue = item.nextValue ?? "";
			const previousLines = previousValue.split("\n").length || 1;
			const nextLines = nextValue.split("\n").length || 1;
			return [
				`diff --git a/${path} b/${path}`,
				`--- a/${path}`,
				`+++ b/${path}`,
				`@@ -1,${previousLines} +1,${nextLines} @@`,
				...lineBlock("-", previousValue),
				...lineBlock("+", nextValue),
			].join("\n");
		})
		.join("\n");
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
