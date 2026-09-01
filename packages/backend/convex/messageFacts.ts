import type { JsonObject } from "./catalogDocument";

/** The projection deliberately keeps a small, explicit interface for facts
 * that later contract validation needs. The raw ARB metadata is still retained
 * as opaque Catalog Document evidence. */
/**
 * The active working catalog is intentionally bounded to Brickit's measured
 * envelope. Facts beyond this per-value cap remain available in the immutable
 * Catalog Document, while the projection marks them incomplete rather than
 * rejecting a faithful Git snapshot.
 */
export const MAX_STORED_FACT_NAMES = 128;

export type MessageFacts = {
	icuType: "plain" | "icu";
	argumentNames: readonly string[];
};

export type StoredFactNames = {
	names: readonly string[];
	complete: boolean;
	count: number;
};

function skipWhitespace(value: string, start: number): number {
	let index = start;
	while (/\s/.test(value[index] ?? "")) index++;
	return index;
}

function readToken(value: string, start: number): [string, number] {
	let index = start;
	while (index < value.length && !/[\s,{}]/.test(value[index] ?? "")) index++;
	return [value.slice(start, index), index];
}

function consumeApostrophe(
	value: string,
	index: number,
	quoted: boolean,
): [number, boolean] {
	if (value[index + 1] === "'") return [index + 2, quoted];
	if (quoted) return [index + 1, false];
	return [index + 1, "{}#".includes(value[index + 1] ?? "")];
}

type FactCollector = {
	sawOpeningBrace: boolean;
	names: string[];
	seen: Set<string>;
};

function addArgument(collector: FactCollector, name: string): void {
	if (name.length === 0 || collector.seen.has(name)) return;
	collector.seen.add(name);
	collector.names.push(name);
}

/**
 * Read an ICU pattern until its enclosing plural/select arm ends, collecting
 * normal arguments along the way. This deliberately stops short of syntax
 * validation: #42 owns validity and transforms. It does understand arm
 * delimiters, however, so literal arm text such as `zero{Scanned}` never
 * becomes a fictional `{Scanned}` placeholder.
 */
function scanPattern(
	value: string,
	start: number,
	collector: FactCollector,
	endsAtClosingBrace: boolean,
): number {
	let index = start;
	let quoted = false;
	while (index < value.length) {
		const char = value[index];
		if (char === "'") {
			[index, quoted] = consumeApostrophe(value, index, quoted);
			continue;
		}
		if (quoted) {
			index++;
			continue;
		}
		if (endsAtClosingBrace && char === "}") return index + 1;
		if (char !== "{") {
			index++;
			continue;
		}
		collector.sawOpeningBrace = true;
		index = scanArgument(value, index + 1, collector);
	}
	return index;
}

function scanArgument(
	value: string,
	start: number,
	collector: FactCollector,
): number {
	let index = start;
	index = skipWhitespace(value, index);
	const [name, afterName] = readToken(value, index);
	addArgument(collector, name);
	index = skipWhitespace(value, afterName);
	if (value[index] === "}") return index + 1;
	if (value[index] !== ",") return index + 1;

	index = skipWhitespace(value, index + 1);
	const [format, afterFormat] = readToken(value, index);
	index = skipWhitespace(value, afterFormat);
	if (value[index] === "}") return index + 1;
	if (value[index] !== ",") return index + 1;
	index = skipWhitespace(value, index + 1);

	if (
		format !== "plural" &&
		format !== "select" &&
		format !== "selectordinal"
	) {
		// Number/date/time styles have no nested message pattern. Stop at the
		// matching closing brace, tolerating an invalid nested block without
		// claiming its literal style text is an argument.
		let depth = 0;
		let quoted = false;
		while (index < value.length) {
			const char = value[index];
			if (char === "'") {
				[index, quoted] = consumeApostrophe(value, index, quoted);
				continue;
			}
			if (!quoted && char === "{") depth++;
			if (!quoted && char === "}") {
				if (depth === 0) return index + 1;
				depth--;
			}
			index++;
		}
		return index;
	}

	while (index < value.length) {
		index = skipWhitespace(value, index);
		if (value[index] === "}") return index + 1;
		const [selector, afterSelector] = readToken(value, index);
		if (selector.length === 0) return index + 1;
		index = skipWhitespace(value, afterSelector);
		if (value[index] !== "{") {
			// `offset:1` is legal before the arms; malformed selectors are simply
			// skipped until the next token because this module does not validate.
			continue;
		}
		index = scanPattern(value, index + 1, collector, true);
	}
	return index;
}

/**
 * Collect argument references without validating an ICU message. Validation is
 * a later contract concern; projection only needs the names that the submitted
 * text already exposes. Quoted ICU syntax and plural/select arm delimiters are
 * understood so the facts remain useful even before full contract validation.
 */
export function messageFacts(value: string): MessageFacts {
	const collector: FactCollector = {
		sawOpeningBrace: false,
		names: [],
		seen: new Set<string>(),
	};
	scanPattern(value, 0, collector, false);
	return {
		icuType: collector.sawOpeningBrace ? "icu" : "plain",
		argumentNames: collector.names,
	};
}

/** Source metadata supplies the declared half of a Message Signature. */
export function declaredPlaceholderNames(
	metadata: JsonObject | undefined,
): readonly string[] {
	const placeholders = metadata?.placeholders;
	if (
		placeholders === null ||
		typeof placeholders !== "object" ||
		Array.isArray(placeholders)
	) {
		return [];
	}
	return Object.keys(placeholders);
}

/**
 * Keep the active-query payload bounded without treating a representable
 * Git-authored contract defect as an ingestion failure. A later validator can
 * follow the value's Snapshot provenance back to its full Catalog Document.
 */
export function storedFactNames(names: readonly string[]): StoredFactNames {
	return {
		names: names.slice(0, MAX_STORED_FACT_NAMES),
		complete: names.length <= MAX_STORED_FACT_NAMES,
		count: names.length,
	};
}
