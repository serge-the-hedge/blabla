import type { StringsCatalogKey } from "./strings-catalog";

/** The Strings window quantizes hydration to aligned strides so steady
 * scrolling reuses the same subscription arguments instead of re-subscribing
 * on every pixel. A full bounded window supplies scrolling runway while each
 * stride change retains most of the prior subscription. */
export const STRINGS_WINDOW_STRIDE = 8;

/** The Window read's key cap, kept in sync with the backend's
 * MAX_CATALOG_WORKSPACE_WINDOW_KEYS. */
export const WINDOW_KEY_CAP = 32;

export type StringsWindowBounds = { start: number; end: number };

/** Center one full, bounded Window around the visible rows and align its start
 * to a stride. Near either catalog edge the Window clamps without shrinking. */
export function quantizeStringsWindowBounds(
	visibleStart: number,
	visibleEnd: number,
	totalCount: number,
	cap: number,
	stride = STRINGS_WINDOW_STRIDE,
): StringsWindowBounds {
	if (totalCount <= 0 || cap <= 0) return { start: 0, end: 0 };
	const windowSize = Math.min(totalCount, cap);
	const start = Math.max(0, Math.min(visibleStart, totalCount));
	const end = Math.max(start, Math.min(visibleEnd, totalCount));
	const visibleSpan = Math.min(windowSize, Math.max(1, end - start));
	const leadingBuffer = Math.floor((windowSize - visibleSpan) / 2);
	const alignedStart = Math.floor((start - leadingBuffer) / stride) * stride;
	const windowStart = Math.min(
		Math.max(0, totalCount - windowSize),
		Math.max(0, alignedStart),
	);

	// Use the full safe Window budget as scrolling runway. Moving by one stride
	// retains most of the previous window, so a reactive query refresh never
	// needs to blank the viewport.
	return { start: windowStart, end: windowStart + windowSize };
}

/** The hydrated key cards one Window read returned, keyed by message
 * identifier. A card absent from the map is not subscribed yet. */
export type StringsWindowCards = ReadonlyMap<string, StringsCatalogKey>;

export type StringsWindowCardCache = {
	projectionId: string | undefined;
	cards: StringsWindowCards;
};

/** Keep two Window responses at most: enough for calm forward/backward
 * scrolling without gradually rebuilding the complete catalog in memory. */
export const STRINGS_WINDOW_CARD_CACHE_CAP = WINDOW_KEY_CAP * 2;

export function createStringsWindowCardCache(): StringsWindowCardCache {
	return { projectionId: undefined, cards: new Map() };
}

export function updateStringsWindowCardCache(
	cache: StringsWindowCardCache,
	input: {
		projectionId: string | undefined;
		cards: StringsWindowCards | undefined;
		maxCards: number;
	},
): StringsWindowCardCache {
	const sameProjection = cache.projectionId === input.projectionId;
	if (input.cards === undefined) {
		if (sameProjection) return cache;
		return { projectionId: input.projectionId, cards: new Map() };
	}

	const cards = new Map(sameProjection ? cache.cards : []);
	for (const [messageId, card] of input.cards) {
		// Reinserting marks the currently subscribed Window as most recent.
		cards.delete(messageId);
		cards.set(messageId, card);
	}
	while (cards.size > input.maxCards) {
		const oldest = cards.keys().next().value;
		if (oldest === undefined) break;
		cards.delete(oldest);
	}
	return { projectionId: input.projectionId, cards };
}

export function sameStringsWindowMessageIds(
	previous: readonly string[],
	next: readonly string[],
): boolean {
	return (
		previous.length === next.length &&
		previous.every((messageId, index) => messageId === next[index])
	);
}

/** A measurement cache preserves the last known rendered card height per
 * projection and message identifier, so re-entering a window (filter
 * changes, permalink jumps) does not collapse already-measured cards back
 * to the stable estimate. */
export class StringsCardMeasurementCache {
	private readonly heights = new Map<string, number>();

	clear(): void {
		this.heights.clear();
	}

	key(projectionId: string, messageId: string): string {
		return `${projectionId}:${messageId}`;
	}

	record(projectionId: string, messageId: string, height: number): void {
		this.heights.set(this.key(projectionId, messageId), height);
	}

	estimate(projectionId: string, messageId: string, fallback: number): number {
		return this.heights.get(this.key(projectionId, messageId)) ?? fallback;
	}
}

/** Collect the message identifiers of one aligned window slice, plus any
 * extra keys that must stay hydrated (a focus target outside the window).
 * The result never exceeds the Window read's key cap. */
export function collectStringsWindowMessageIds(input: {
	orderedMessageIds: readonly string[];
	bounds: StringsWindowBounds;
	extraMessageIds: readonly string[];
	cap: number;
}): string[] {
	const { orderedMessageIds, bounds, extraMessageIds, cap } = input;
	const catalogIds = new Set(orderedMessageIds);
	const fullSlice = orderedMessageIds.slice(bounds.start, bounds.end);
	const extras = [...new Set(extraMessageIds)]
		.filter((messageId) => catalogIds.has(messageId))
		.slice(0, cap);
	const slice = fullSlice.slice(0, Math.max(0, cap - extras.length));
	// A permalink or pending focus target must fit even when the rolling window
	// already uses the read cap. Sacrifice only the far buffered edge.
	const result = [...slice];
	for (const messageId of extras) {
		if (result.length >= cap) break;
		if (result.includes(messageId)) continue;
		result.push(messageId);
	}
	for (const messageId of fullSlice) {
		if (result.length >= cap) break;
		if (!result.includes(messageId)) result.push(messageId);
	}
	return result;
}
