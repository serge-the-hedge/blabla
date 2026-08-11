// PROTOTYPE ONLY — throwaway fixture for "Decide how compound ICU shapes are
// edited" (#26). Delete with the branch that holds it.
//
// Every value below is lifted VERBATIM from the real Brickit catalogs at
// ../brickit-app/brickit-flutter/packages/brickit_generated/lib/l10n/intl_*.arb
// (4c6b6541). Nothing here is invented — including the two rendering bugs.

export type LocaleCode = "en" | "de" | "es" | "fr" | "ru" | "zh";

export const LOCALES: LocaleCode[] = ["en", "de", "es", "fr", "ru", "zh"];
export const REFERENCE: LocaleCode = "en";

export const LOCALE_LABEL: Record<LocaleCode, string> = {
	en: "English",
	de: "German",
	es: "Spanish",
	fr: "French",
	ru: "Russian",
	zh: "Chinese",
};

/**
 * CLDR plural categories the language genuinely selects on. These are the arms
 * that must be reachable, and the editor shows them even when the ingested
 * value is missing one.
 *
 * `zero` and `two` are deliberately NOT here: in Flutter's dialect they are
 * `=0` and `=2`, exact-number cases available in every language. gen_l10n maps
 * "0" -> "zero" and "2" -> "two" in `pluralCases`, and Intl.pluralLogic tests
 * `howMany == 0 && zero != null` BEFORE consulting the CLDR rule.
 */
export const CLDR_REQUIRED: Record<LocaleCode, string[]> = {
	en: ["one", "other"],
	de: ["one", "other"],
	es: ["one", "other"],
	fr: ["one", "other"],
	ru: ["one", "few", "many", "other"],
	zh: ["other"],
};

/** Exact-number cases. Not categories — "when it is exactly n". */
export const EXACT_LABEL: Record<string, string> = {
	zero: "= 0",
	one: "one",
	two: "= 2",
};

export const ARM_LABEL = (category: string, locale: LocaleCode): string => {
	if (category === "zero") return "= 0";
	if (category === "two") return "= 2";
	if (category === "one" && !CLDR_REQUIRED[locale].includes("one"))
		return "= 1";
	return category;
};

export type KeyEntry = {
	key: string;
	note: string;
	screen: string;
	placeholders: Record<string, string>;
	values: Record<LocaleCode, string>;
};

export const KEYS: KeyEntry[] = [
	{
		key: "pm_scans_feed_export_pack_summary",
		note: "Two plurals in a row, comma between. Chinese drops the ICU shape entirely.",
		screen: "pm/scans feed",
		placeholders: {
			pocketCount: "int",
			partCount: "int",
		},
		values: {
			en: "{pocketCount, plural, zero{{pocketCount} pockets} one{{pocketCount} pocket} other{{pocketCount} pockets}}, {partCount, plural, zero{{partCount} parts} one{{partCount} part} other{{partCount} parts}}",
			de: "{pocketCount, plural, zero{{pocketCount} Pockets} one{{pocketCount} Pocket} other{{pocketCount} Pockets}}, {partCount, plural, zero{{partCount} Steine} one{{partCount} Stein} other{{partCount} Steine}}",
			es: "{pocketCount, plural, zero{{pocketCount} pockets} one{{pocketCount} pocket} other{{pocketCount} pockets}}, {partCount, plural, zero{{partCount} piezas} one{{partCount} pieza} other{{partCount} piezas}}",
			fr: "{pocketCount, plural, zero{{pocketCount} pockets} one{{pocketCount} pocket} other{{pocketCount} pockets}}, {partCount, plural, zero{{partCount} briques} one{{partCount} brique} other{{partCount} briques}}",
			ru: "{pocketCount, plural, zero{{pocketCount} кармашков} one{{pocketCount} кармашек} few{{pocketCount} кармашка} many{{pocketCount} кармашков} other{{pocketCount} кармашка}}, {partCount, plural, zero{{partCount} деталей} one{{partCount} деталь} few{{partCount} детали} many{{partCount} деталей} other{{partCount} детали}}",
			zh: "{pocketCount} 个口袋，{partCount} 块积木",
		},
	},
	{
		key: "workshop_page_sets_widget_subtitle",
		note: "Two plurals with prose between and after. Russian rewrites the connector and drops the tail; Chinese drops the ICU shape.",
		screen: "workshop",
		placeholders: {
			ideas: "int",
			sets: "int",
		},
		values: {
			en: "{ideas, plural,\n    zero {{ideas} building ideas}\n    one {{ideas} building idea}\n    other {{ideas} building ideas}\n} for the {sets, plural,\n    zero {{sets} sets}\n    one {{sets} set}\n    other {{sets} sets}\n} you have",
			de: "{ideas, plural,\n    zero {{ideas} Bauideen}\n    one {{ideas} Bauidee}\n    other {{ideas} Bauideen}\n} für die {sets, plural,\n    zero {{sets} Gruppen}\n    one {{sets} Gruppe}\n    other {{sets} Gruppen}\n}, die Sie haben",
			es: "{ideas, plural,\n    zero {{ideas} ideas de construcción}\n    one {{ideas} idea de construcción}\n    other {{ideas} ideas de construcción}\n} para los {sets, plural,\n    zero {{sets} sets}\n    one {{sets} set}\n    other {{sets} sets}\n} que tienes",
			fr: "{ideas, plural,\n    zero {{ideas} idées de construction}\n    one {{ideas} idée de construction}\n    other {{ideas} idées de construction}\n} pour les {sets, plural,\n    zero {{sets} sets}\n    one {{sets} set}\n    other {{sets} sets}\n} que tu as",
			ru: "{ideas, plural,\n    zero {{ideas} идей}\n    one {{ideas} идея}\n    few {{ideas} идеи}\n    many {{ideas} идей}\n    other {{ideas} идей}\n} для сборки из {sets, plural,\n    zero {{sets} наборов}\n    one {{sets} набора}\n    few {{sets} наборов}\n    many {{sets} наборов}\n    other {{sets} наборов}\n}",
			zh: "{ideas} 个建筑创意对于你拥有的 {sets} 个套装",
		},
	},
	{
		key: "part_count",
		note: 'Whole-message plural. The Spanish "=0" arm is a copy of "one", so 0 renders "0 pieza".',
		screen: "shared",
		placeholders: {
			count: "int",
		},
		values: {
			en: "{count, plural, zero{{count} bricks} one{{count} brick} other{{count} bricks}}",
			de: "{count, plural, zero{{count} Steine} one{{count} Steine} other{{count} Steine}}",
			es: "{count, plural, zero{{count} pieza} one{{count} pieza} other{{count} piezas}}",
			fr: "{count, plural, zero{{count} briques} one{{count} brique} other{{count} briques}}",
			ru: "{count, plural, zero{{count} деталей} one{{count} деталь} few{{count} детали} many{{count} деталей} other{{count} деталей}}",
			zh: "{count, plural, zero{{count} 块积木} other{{count} 块积木}}",
		},
	},
	{
		key: "shoot_and_build_last_scan_hours",
		note: 'Whole-message plural. English "=0" is a copy of "one", so 0 renders "0 hour ago".',
		screen: "shoot and build",
		placeholders: {
			count: "int",
		},
		values: {
			en: "{count, plural, zero{{count} hour ago} one{{count} hour ago} other{{count} hours ago}}",
			de: "{count, plural, zero{Vor {count} Stunde} one{Vor {count} Stunde} other{Vor {count} Stunde}}",
			es: "{count, plural, zero{hace {count} hora} one{hace {count} hora} other{hace {count} horas}}",
			fr: "{count, plural, zero{il y a {count} heure} one{il y a {count} heure} other{il y a {count} heures}}",
			ru: "{count, plural, zero{{count} ч. назад} one{{count} ч. назад} few{{count} ч. назад} many{{count} ч. назад} other{{count} ч. назад}}",
			zh: "{count, plural, zero{{count} 分钟前} other{{count} 分钟前}}",
		},
	},
	{
		key: "page_of_pages",
		note: "Whole-message plural whose arms are identical in all six Locales. Russian asks for the same sentence five times.",
		screen: "shared",
		placeholders: {
			countFrom: "int",
			countTo: "int",
		},
		values: {
			en: "{countFrom, plural, zero{Page {countFrom} of {countTo}} one{Page {countFrom} of {countTo}} other{Page {countFrom} of {countTo}}}",
			de: "{countFrom, plural, zero{Seite {countFrom}/{countTo}} one{Seite {countFrom}/{countTo}} other{Seite {countFrom}/{countTo}}}",
			es: "{countFrom, plural, zero{Página {countFrom} de {countTo}} one{Página {countFrom} de {countTo}} other{Página {countFrom} de {countTo}}}",
			fr: "{countFrom, plural, zero{Page {countFrom} sur {countTo}} one{Page {countFrom} sur {countTo}} other{Page {countFrom} sur {countTo}}}",
			ru: "{countFrom, plural, zero{Стр. {countFrom} из {countTo}} one{Стр. {countFrom} из {countTo}} few{Стр. {countFrom} из {countTo}} many{Стр. {countFrom} из {countTo}} other{Стр. {countFrom} из {countTo}}}",
			zh: "{countFrom, plural, zero{第 {countFrom} 页，共 {countTo} 页} other{第 {countFrom} 页，共 {countTo} 页}}",
		},
	},
];

// ─────────────────────────────────────────────────────────────────── parsing
//
// Prototype-grade, not a parser. Enough to answer the question: it finds
// TOP-LEVEL plural and select blocks and splits their arms, and it refuses
// (returns `nested: true`) when an arm contains another block — gen-l10n
// supports nesting, this editor declines to decompose it.

/**
 * One arm, kept so that re-serializing an untouched value gives back the exact
 * bytes it arrived as. `workshop_page_sets_widget_subtitle` is why: it stores
 * PRETTY-PRINTED ICU, with a newline and four spaces before every arm, in five
 * of its six Locales. A serializer that emits its own spacing rewrites that key
 * in every Locale on the first release, for a value nobody edited.
 *
 *   reconstruction = lead + token + pad + "{" + body + "}"
 *
 * `token` is the arm as written (`=0` or `zero`); `category` is the normalised
 * form both of them mean.
 */
export type Arm = {
	category: string;
	token: string;
	body: string;
	lead: string;
	pad: string;
};

export type Segment =
	| { kind: "text"; text: string }
	| {
			kind: "plural" | "select";
			arg: string;
			arms: Arm[];
			/** An arm holds another block. Not decomposed; raw ICU only. */
			nested: boolean;
			/** `{arg, plural,` exactly as written. */
			head: string;
			/** Whatever sits between the last arm and the closing brace. */
			tail: string;
	  };

const BLOCK_HEAD = /\{\s*(\w+)\s*,\s*(plural|select|selectordinal)\s*,/;

function matchBrace(text: string, open: number): number {
	let depth = 0;
	for (let i = open; i < text.length; i += 1) {
		if (text[i] === "{") depth += 1;
		else if (text[i] === "}") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return text.length - 1;
}

function splitArms(body: string): {
	arms: Arm[];
	nested: boolean;
	tail: string;
} {
	const arms: Arm[] = [];
	let nested = false;
	let index = 0;
	while (index < body.length) {
		const match = /^(\s*)(=?\w+)(\s*)\{/.exec(body.slice(index));
		if (!match) break;
		const open = index + match[0].length - 1;
		const close = matchBrace(body, open);
		const inner = body.slice(open + 1, close);
		if (BLOCK_HEAD.test(inner)) nested = true;
		// "=0" and "zero" are the same Dart argument — gen_l10n's `pluralCases`
		// maps both to `zero:`. Normalise for logic; keep the token for output.
		const category = match[2].replace(/^=(\d)$/, (_, n) =>
			n === "0" ? "zero" : n === "1" ? "one" : n === "2" ? "two" : `=${n}`,
		);
		arms.push({
			category,
			token: match[2],
			body: inner,
			lead: match[1],
			pad: match[3],
		});
		index = close + 1;
	}
	return { arms, nested, tail: body.slice(index) };
}

/** Split a message into its top-level segments, in reading order. */
export function parseMessage(value: string): Segment[] {
	const segments: Segment[] = [];
	let cursor = 0;
	while (cursor < value.length) {
		const match = BLOCK_HEAD.exec(value.slice(cursor));
		if (!match) break;
		const start = cursor + match.index;
		const close = matchBrace(value, start);
		if (start > cursor) {
			segments.push({ kind: "text", text: value.slice(cursor, start) });
		}
		const body = value.slice(start + match[0].length, close);
		const { arms, nested, tail } = splitArms(body);
		segments.push({
			kind: match[2] === "select" ? "select" : "plural",
			arg: match[1],
			arms,
			nested,
			head: match[0],
			tail,
		});
		cursor = close + 1;
	}
	if (cursor < value.length) {
		segments.push({ kind: "text", text: value.slice(cursor) });
	}
	return segments;
}

export function serialize(segments: Segment[]): string {
	return segments
		.map((segment) =>
			segment.kind === "text"
				? segment.text
				: `${segment.head}${segment.arms
						.map((arm) => `${arm.lead}${arm.token}${arm.pad}{${arm.body}}`)
						.join("")}${segment.tail}}`,
		)
		.join("");
}

/**
 * A newly added arm copies the spacing of the arm before it, so appending
 * `many` to a pretty-printed Russian block stays pretty-printed.
 */
export function newArm(category: string, after: Arm | undefined): Arm {
	return {
		category,
		token: category,
		body: "",
		lead: after?.lead ?? " ",
		pad: after?.pad ?? "",
	};
}

export const isCompound = (segments: Segment[]): boolean =>
	segments.filter((segment) => segment.kind !== "text").length > 1;

export const hasNesting = (segments: Segment[]): boolean =>
	segments.some((segment) => segment.kind !== "text" && segment.nested);

/**
 * The arm fields a target shows for one block: the arms the ingested value
 * already carries, IN FILE ORDER, then any CLDR-required category it is
 * missing. Exact-number cases survive because they are present, never because
 * a table says the language needs them.
 */
export function armFields(arms: Arm[], locale: LocaleCode): string[] {
	const present = arms.map((arm) => arm.category);
	const missing = CLDR_REQUIRED[locale].filter(
		(category) => !present.includes(category),
	);
	return [...present, ...missing];
}

/** Arms all render the same string — the plural is doing nothing. */
export const isDegenerate = (arms: Arm[]): boolean =>
	arms.length > 1 && new Set(arms.map((arm) => arm.body.trim())).size === 1;

// ───────────────────────────────────────────────────────────────── rendering
//
// What the app actually shows, following Intl.pluralLogic: the exact-number
// cases are tested first, then the CLDR rule for the locale.

function cldrCategory(locale: LocaleCode, n: number): string {
	if (locale === "zh") return "other";
	if (locale === "ru") {
		const mod10 = n % 10;
		const mod100 = n % 100;
		if (mod10 === 1 && mod100 !== 11) return "one";
		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
		return "many";
	}
	if (locale === "fr") return n === 0 || n === 1 ? "one" : "other";
	return n === 1 ? "one" : "other";
}

export function pickArm(
	arms: Arm[],
	locale: LocaleCode,
	n: number,
): Arm | null {
	const at = (category: string) =>
		arms.find((arm) => arm.category === category) ?? null;
	// Explicit exact-number cases win, regardless of CLDR. This is the whole
	// reason "0 hour ago" ships today.
	if (n === 0 && at("zero")) return at("zero");
	if (n === 1 && at("one")) return at("one");
	if (n === 2 && at("two")) return at("two");
	return at(cldrCategory(locale, n)) ?? at("other");
}

/** Render a message at a given count, the way the app would. */
export function renderAt(
	segments: Segment[],
	locale: LocaleCode,
	n: number,
): string {
	return segments
		.map((segment) => {
			if (segment.kind === "text") return segment.text;
			if (segment.kind === "select") {
				return (
					segment.arms.find((arm) => arm.category === "other")?.body ??
					segment.arms[0]?.body ??
					""
				);
			}
			const arm = pickArm(segment.arms, locale, n);
			return (arm?.body ?? "").replaceAll(`{${segment.arg}}`, String(n));
		})
		.join("")
		.replace(/\{(\w+)\}/g, (_, name) => `‹${name}›`);
}

/** The one hard invariant: gen-l10n aborts the build without an `other` arm. */
export const missingOther = (segments: Segment[]): string[] =>
	segments
		.filter(
			(segment) =>
				segment.kind !== "text" &&
				!segment.arms.some((arm) => arm.category === "other"),
		)
		.map((segment) => (segment.kind === "text" ? "" : segment.arg));

/**
 * Blocks whose `= 0` arm actually changes what renders at zero — i.e. where
 * the exact-number case overrides the language's own rule. Measured across the
 * whole Brickit catalog this fires on 15 blocks in 11 keys, and every one of
 * them is wrong: English and Spanish put a singular where the language wants a
 * plural, and French does the reverse nine times, because French takes the
 * singular at 0 and every French `zero` arm holds the plural.
 */
export function zeroArmOverrides(
	segments: Segment[],
	locale: LocaleCode,
): boolean {
	return segments.some((segment) => {
		if (segment.kind === "text") return false;
		const zero = segment.arms.find((arm) => arm.category === "zero");
		if (!zero) return false;
		const without = pickArm(
			segment.arms.filter((arm) => arm.category !== "zero"),
			locale,
			0,
		);
		return (without?.body ?? "").trim() !== zero.body.trim();
	});
}

// ──────────────────────────────────────────────────────── the arm vocabulary
//
// A plural block has at most SIX arms, ever. gen_l10n's `pluralCases` accepts
// exactly "=0", "=1", "=2", "zero", "one", "two", "few", "many", "other" — and
// the first three are aliases of the next three, so they land on the same Dart
// argument. `=3` is a hard build error, verified against 3.44.6:
//
//   The plural cases must be one of "=0", "=1", "=2", "zero", "one", "two",
//   "few", "many", or "other. 3 is not a valid plural case.
//
// A closed six-item vocabulary is why an "add a case" menu can list the whole
// universe rather than guessing at it.

export type Slot = {
	category: string;
	/** What it does, in this language. */
	blurb: (locale: LocaleCode) => string;
	/** Compiles, but the language's rule will never choose it. */
	dead: (locale: LocaleCode) => boolean;
};

const SAMPLE: Record<LocaleCode, Record<string, string>> = {
	en: { one: "1", other: "0, 2, 3, 4…" },
	de: { one: "1", other: "0, 2, 3, 4…" },
	es: { one: "1", other: "0, 2, 3, 4…" },
	fr: { one: "0, 1", other: "2, 3, 4…" },
	ru: {
		one: "1, 21, 31…",
		few: "2, 3, 4, 22…",
		many: "0, 5, 6…, 11…",
		other: "fractions",
	},
	zh: { other: "every count" },
};

export const PLURAL_SLOTS: Slot[] = [
	{
		category: "zero",
		blurb: () => "exactly 0 — overrides the language's own rule",
		dead: () => false,
	},
	{
		category: "one",
		blurb: (locale) =>
			CLDR_REQUIRED[locale].includes("one")
				? `${LOCALE_LABEL[locale]} chooses it for ${SAMPLE[locale].one}, and exactly 1 always`
				: "exactly 1 — overrides the language's own rule",
		dead: () => false,
	},
	{
		category: "two",
		blurb: () => "exactly 2 — overrides the language's own rule",
		dead: () => false,
	},
	{
		category: "few",
		blurb: (locale) =>
			CLDR_REQUIRED[locale].includes("few")
				? `${LOCALE_LABEL[locale]} chooses it for ${SAMPLE[locale].few}`
				: `${LOCALE_LABEL[locale]} never chooses it — it would be dead`,
		dead: (locale) => !CLDR_REQUIRED[locale].includes("few"),
	},
	{
		category: "many",
		blurb: (locale) =>
			CLDR_REQUIRED[locale].includes("many")
				? `${LOCALE_LABEL[locale]} chooses it for ${SAMPLE[locale].many}`
				: `${LOCALE_LABEL[locale]} never chooses it — it would be dead`,
		dead: (locale) => !CLDR_REQUIRED[locale].includes("many"),
	},
	{
		category: "other",
		blurb: (locale) => `the fallback — ${SAMPLE[locale].other}`,
		dead: () => false,
	},
];

/** Slots this block does not have yet. The menu never invents anything else. */
export const openSlots = (arms: Arm[]): Slot[] =>
	PLURAL_SLOTS.filter(
		(slot) => !arms.some((arm) => arm.category === slot.category),
	);

// ──────────────────────────────────────────────────── aligning arms to arms
//
// Arms of one block are near-identical strings. Character-level alignment lets
// a selection in one arm point at "the same place" in all the others, so one
// edit can land everywhere at once without the translator retyping five
// near-identical sentences.

type Block = {
	aStart: number;
	aEnd: number;
	bStart: number;
	bEnd: number;
	equal: boolean;
};

function alignBlocks(a: string, b: string): Block[] {
	// lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
	const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			lcs[i][j] =
				a[i] === b[j]
					? lcs[i + 1][j + 1] + 1
					: Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}

	const blocks: Block[] = [];
	const push = (block: Block) => {
		const last = blocks.at(-1);
		if (last && last.equal === block.equal) {
			last.aEnd = block.aEnd;
			last.bEnd = block.bEnd;
		} else blocks.push(block);
	};

	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			push({ aStart: i, aEnd: i + 1, bStart: j, bEnd: j + 1, equal: true });
			i += 1;
			j += 1;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			push({ aStart: i, aEnd: i + 1, bStart: j, bEnd: j, equal: false });
			i += 1;
		} else {
			push({ aStart: i, aEnd: i, bStart: j, bEnd: j + 1, equal: false });
			j += 1;
		}
	}
	if (i < a.length || j < b.length) {
		push({
			aStart: i,
			aEnd: a.length,
			bStart: j,
			bEnd: b.length,
			equal: false,
		});
	}
	return blocks;
}

/**
 * Where a range of `from` lands in `to`. Inside matching runs the mapping is
 * exact; across a differing run it widens to the whole run, so selecting a word
 * that is spelled differently in another arm selects that arm's whole spelling
 * rather than a fragment of it.
 */
export function mapRange(
	from: string,
	to: string,
	start: number,
	end: number,
): [number, number] {
	if (from === to) return [start, end];
	const blocks = alignBlocks(from, to);
	const edge = (index: number, side: "start" | "end"): number => {
		for (const block of blocks) {
			if (index < block.aStart) continue;
			if (index > block.aEnd) continue;
			if (block.equal) return block.bStart + (index - block.aStart);
			return side === "start" ? block.bStart : block.bEnd;
		}
		return side === "start" ? 0 : to.length;
	};
	const mapped: [number, number] = [edge(start, "start"), edge(end, "end")];
	return mapped[1] < mapped[0] ? [mapped[0], mapped[0]] : mapped;
}

/** The single edit that turns `prior` into `next`: replace [start,end) with `text`. */
export function inferEdit(
	prior: string,
	next: string,
): { start: number; end: number; text: string } {
	let head = 0;
	while (
		head < prior.length &&
		head < next.length &&
		prior[head] === next[head]
	)
		head += 1;
	let tail = 0;
	while (
		tail < prior.length - head &&
		tail < next.length - head &&
		prior[prior.length - 1 - tail] === next[next.length - 1 - tail]
	)
		tail += 1;
	return {
		start: head,
		end: prior.length - tail,
		text: next.slice(head, next.length - tail),
	};
}

/**
 * Apply one edit made in the representative arm to every other arm of the
 * block, through the alignment. This is the whole point of the variant: the
 * arms of a plural differ by a word, so an edit to the shared part of the
 * sentence should not have to be made five times.
 */
export function editEveryArm(
	arms: Arm[],
	representative: string,
	prior: string,
	next: string,
): Arm[] {
	const edit = inferEdit(prior, next);
	const insertion = edit.start === edit.end;
	return arms.map((arm) => {
		if (arm.category === representative) return { ...arm, body: next };
		const [start, end] = mapRange(prior, arm.body, edit.start, edit.end);
		// A pure insertion is a CARET, not a range. Widening it over a differing
		// run — which is what a selection wants — would swallow that run instead
		// of typing beside it: appending to Russian `деталей` would rewrite the
		// `one` arm's `деталь` as `детал…`, eating the ending that is the entire
		// reason the arm exists. Collapse to the right edge instead.
		const [from, to] = insertion ? [end, end] : [start, end];
		return {
			...arm,
			body: arm.body.slice(0, from) + edit.text + arm.body.slice(to),
		};
	});
}
