// PROTOTYPE ONLY — throwaway fixture for the per-key translation editor (#24).
// Delete with the branch that holds it.
//
// Values are lifted verbatim from the real Brickit catalogs at
// ../brickit-app/brickit-flutter/packages/brickit_generated/lib/l10n/intl_*.arb
// (origin/develop). Where a case needed staging — a source change that has not
// actually happened yet — the fixture says so in `staged`, so nothing here
// pretends to be observed when it is invented.

export type LocaleCode = "en" | "de" | "es" | "fr" | "ru" | "zh";

export const SOURCE: LocaleCode = "en";
export const TARGETS: LocaleCode[] = ["de", "es", "fr", "ru", "zh"];
export const ALL_LOCALES: LocaleCode[] = ["en", ...TARGETS];

export const LOCALE_LABEL: Record<LocaleCode, string> = {
	en: "English",
	de: "German",
	es: "Spanish",
	fr: "French",
	ru: "Russian",
	zh: "Chinese",
};

// ICU plural categories that each language actually needs. This is the whole
// reason one contract change lands as a different amount of work per Locale.
export const PLURAL_CATEGORIES: Record<LocaleCode, string[]> = {
	en: ["one", "other"],
	de: ["one", "other"],
	es: ["one", "other"],
	fr: ["one", "other"],
	ru: ["one", "few", "many", "other"],
	zh: ["other"],
};

/**
 * The state of one target value. These are the states the settled decisions
 * left standing — Fallback Approval and Ready with Deviations are gone (#16),
 * so English never reaches the app by absence.
 */
export type ValueState =
	/** Translated and current against this source. */
	| "current"
	/** Deliberately equal to the source, saved by a human. Completed work. */
	| "identical"
	/** Equal to the source but merely carried in from Git. Unresolved (#22). */
	| "imported-identical"
	/** Deliberately empty, with a durable recorded reason. Ships. */
	| "blank"
	/** Empty or absent with nobody's decision behind it. Blocks its Locale. */
	| "undecided"
	/** Source meaning changed. Blocks until confirmed or updated. */
	| "stale-semantic"
	/** Source changed cosmetically. Ships unchanged; flagged for the translator. */
	| "stale-cosmetic"
	/** References a placeholder the source deleted. Non-waivable blocker. */
	| "broken";

export const STATE_LABEL: Record<ValueState, string> = {
	current: "Current",
	identical: "Same as English",
	"imported-identical": "English, not chosen",
	blank: "Deliberately empty",
	undecided: "No value",
	"stale-semantic": "Source changed",
	"stale-cosmetic": "Source touched",
	broken: "Broken",
};

/** Does this state stop its Locale from shipping? */
export const STATE_BLOCKS: Record<ValueState, boolean> = {
	current: false,
	identical: false,
	"imported-identical": true,
	blank: false,
	undecided: true,
	"stale-semantic": true,
	"stale-cosmetic": false,
	broken: true,
};

/** The decision each unsettled state is waiting for — the grouping in C. */
export type Attention = "blocked" | "decide" | "review" | "settled";

export const STATE_ATTENTION: Record<ValueState, Attention> = {
	current: "settled",
	identical: "settled",
	blank: "settled",
	broken: "blocked",
	undecided: "decide",
	"imported-identical": "decide",
	"stale-semantic": "review",
	"stale-cosmetic": "review",
};

export const ATTENTION_LABEL: Record<Attention, string> = {
	blocked: "Cannot be released",
	decide: "Needs a decision",
	review: "Source moved under it",
	settled: "Settled",
};

export type TargetValue = {
	locale: LocaleCode;
	value: string;
	state: ValueState;
	/** Why it is deliberately empty. Durable across snapshots (#16). */
	reason?: string;
	/** Why it is broken, or what the source did to it. */
	note?: string;
	/** Who last decided this and when — provenance, not a timestamp for show. */
	by?: string;
	at?: string;
};

export type SourceChange = {
	kind: "semantic" | "cosmetic" | "contract";
	was: string;
	now: string;
	summary: string;
	/** Snapshot that carried it in. */
	snapshot: string;
};

export type KeyEntry = {
	key: string;
	/** ARB @-metadata placeholders, verbatim. */
	placeholders?: Record<string, string>;
	/** True when the source is an ICU plural expression. */
	plural?: { arg: string };
	source: string;
	description?: string;
	screen?: string;
	change?: SourceChange;
	targets: Record<LocaleCode, TargetValue>;
	/** Anything in this fixture that is invented rather than observed. */
	staged?: string;
};

const t = (
	locale: LocaleCode,
	value: string,
	state: ValueState,
	extra: Partial<TargetValue> = {},
): TargetValue => ({ locale, value, state, ...extra });

const byLocale = (values: TargetValue[]) =>
	Object.fromEntries(values.map((value) => [value.locale, value])) as Record<
		LocaleCode,
		TargetValue
	>;

export const KEYS: KeyEntry[] = [
	// ── The English-carried-in case. Observed exactly as it stands in Git:
	//    French is translated, the other four hold the English sentence.
	{
		key: "notification_center_no_results",
		screen: "notification_center",
		source:
			"No one's here yet. Building and taking photos could help you gain followers",
		targets: byLocale([
			t(
				"de",
				"No one's here yet. Building and taking photos could help you gain followers",
				"imported-identical",
			),
			t(
				"es",
				"No one's here yet. Building and taking photos could help you gain followers",
				"imported-identical",
			),
			t(
				"fr",
				"Il n’y a encore personne ici. Construire et prendre des photos pourrait vous aider à gagner des abonnés",
				"current",
				{ by: "Camille", at: "12 Jun" },
			),
			t(
				"ru",
				"No one's here yet. Building and taking photos could help you gain followers",
				"imported-identical",
			),
			t(
				"zh",
				"No one's here yet. Building and taking photos could help you gain followers",
				"imported-identical",
			),
		]),
	},

	// ── The blank case. Also observed: French translated, four empty in Git
	//    with no provenance behind the emptiness.
	{
		key: "pm_pocket_loading_state",
		screen: "pocket",
		source: "One moment…",
		targets: byLocale([
			t("de", "", "undecided"),
			t("es", "", "undecided"),
			t("fr", "Un instant…", "current", { by: "Camille", at: "3 Jul" }),
			t("ru", "", "undecided"),
			t("zh", "", "undecided"),
		]),
	},

	// ── Deliberate blank, decided in Blabla, with the reason that keeps it
	//    shippable. The reason lives in Blabla only; the ARB stays a contract.
	{
		key: "pm_all_sizes",
		screen: "pocket",
		description: "Label above the size filter row.",
		source: "All sizes",
		staged:
			"In Git this key is empty in every Locale including English. Here it has a source and two recorded blanks, to show what a decided blank looks like.",
		targets: byLocale([
			t("de", "", "blank", {
				reason: "Row is icon-only in German — the label overflows the chip.",
				by: "Sergey",
				at: "28 Jul",
			}),
			t("es", "Todos los tamaños", "current", { by: "Sergey", at: "28 Jul" }),
			t("fr", "Toutes les tailles", "current", { by: "Camille", at: "3 Jul" }),
			t("ru", "", "blank", {
				reason: "Row is icon-only in Russian — the label overflows the chip.",
				by: "Sergey",
				at: "28 Jul",
			}),
			t("zh", "所有尺寸", "current", { by: "Sergey", at: "28 Jul" }),
		]),
	},

	// ── The brand name. Source-identical everywhere and deliberately so.
	{
		key: "aboutapp_brickit",
		screen: "about",
		description: "Product name in the About screen header.",
		source: "Brickit",
		staged:
			"Values are verbatim; the human provenance that makes them Source-identical Translations rather than carried-in English is invented.",
		targets: byLocale([
			t("de", "Brickit", "identical", { by: "Sergey", at: "28 Jul" }),
			t("es", "Brickit", "identical", { by: "Sergey", at: "28 Jul" }),
			t("fr", "Brickit", "identical", { by: "Sergey", at: "28 Jul" }),
			t("ru", "Brickit", "identical", { by: "Sergey", at: "28 Jul" }),
			t("zh", "Brickit", "identical", { by: "Sergey", at: "28 Jul" }),
		]),
	},

	// ── Plural, with the arm counts each language actually needs: zh needs
	//    `other` alone, ru needs four. Staged with a semantic source change so
	//    confirm-vs-edit has something real to sit on.
	{
		key: "part_count",
		screen: "scan_result",
		placeholders: { count: "int" },
		plural: { arg: "count" },
		source: "{count, plural, one{{count} brick} other{{count} bricks}}",
		change: {
			kind: "semantic",
			was: "{count, plural, one{{count} brick} other{{count} bricks}}",
			now: "{count, plural, one{{count} part} other{{count} parts}}",
			summary:
				"“brick” became “part” — the scanner counts non-brick pieces now.",
			snapshot: "develop @ 19a07bc",
		},
		staged:
			"The brick→part source change is invented. All target values, including Russian’s four arms and Chinese’s single one, are verbatim.",
		targets: byLocale([
			t(
				"de",
				"{count, plural, one{{count} Stein} other{{count} Steine}}",
				"stale-semantic",
				{ by: "Sergey", at: "12 Jun" },
			),
			t(
				"es",
				"{count, plural, one{{count} pieza} other{{count} piezas}}",
				"current",
				{ by: "Sergey", at: "12 Jun" },
			),
			t(
				"fr",
				"{count, plural, one{{count} brique} other{{count} briques}}",
				"stale-semantic",
				{ by: "Camille", at: "12 Jun" },
			),
			t(
				"ru",
				"{count, plural, one{{count} деталь} few{{count} детали} many{{count} деталей} other{{count} деталей}}",
				"current",
				{ by: "Sergey", at: "12 Jun" },
			),
			t("zh", "{count, plural, other{{count} 块积木}}", "stale-semantic", {
				by: "Sergey",
				at: "12 Jun",
			}),
		]),
	},

	// ── The long value. Staged with a cosmetic source change, which must not
	//    look like the semantic one above.
	{
		key: "brickit_school_about_app_desc",
		screen: "school_about",
		source:
			"This is a version of Brickit tuned for classes. If you play with bricks outside of a classroom, try our other app — it’s simply called Brickit! There are many features there that you won’t find here: people share photos of their creations, create AI-generated stories from their builds, and much more!",
		change: {
			kind: "cosmetic",
			was: "…try our other app - it's simply called Brickit!…",
			now: "…try our other app — it’s simply called Brickit!…",
			summary:
				"Hyphen became an em dash and the apostrophe became typographic.",
			snapshot: "develop @ 19a07bc",
		},
		staged:
			"The punctuation source change is invented; the values are verbatim.",
		targets: byLocale([
			t(
				"de",
				"Dies ist eine für Schulen angepasste Version von Brickit. Wenn du außerhalb des Klassenzimmers mit Steinen spielst, probiere unsere andere App aus — sie heißt einfach Brickit! Dort gibt es viele Funktionen, die du hier nicht findest: Leute teilen Fotos ihrer Kreationen, erstellen KI-Geschichten aus ihren Bauwerken und vieles mehr!",
				"stale-cosmetic",
				{ by: "Sergey", at: "4 May" },
			),
			t(
				"es",
				"Esta es una versión de Brickit ajustada para escuelas. Si juegas con ladrillos fuera del aula, prueba nuestra otra aplicación, que simplemente se llama Brickit. ¡Allí hay muchas funciones que no encontrarás aquí: la gente comparte fotos de sus creaciones, crea historias generadas por IA a partir de sus construcciones y mucho más!",
				"stale-cosmetic",
				{ by: "Sergey", at: "4 May" },
			),
			t(
				"fr",
				"Voici une version de Brickit adaptée aux classes. Si vous jouez avec des briques en dehors d’une salle de classe, essayez notre autre appli — elle s’appelle simplement Brickit ! Vous y trouverez de nombreuses fonctionnalités absentes ici : les gens partagent des photos de leurs créations, créent des histoires générées par IA à partir de leurs constructions, et bien plus encore !",
				"stale-cosmetic",
				{ by: "Camille", at: "4 May" },
			),
			t(
				"ru",
				"Это версия Brickit, настроенная для школ. Если вы играете вне класса, попробуйте обычную версию Brickit! Там есть много функций, которых вы не найдете здесь: люди делятся фотографиями своих поделок, создают на их основе истории с помощью ИИ, и многое другое!",
				"stale-cosmetic",
				{ by: "Sergey", at: "4 May" },
			),
			t(
				"zh",
				"这是为学校量身定制的 Brickit 版本。如果您在教室外玩积木，请尝试我们的另一款应用程序——它就叫 Brickit！那里有许多您在这里找不到的功能：人们分享他们的创作照片，基于他们的建造创建 AI 生成的故事，等等！",
				"stale-cosmetic",
				{ by: "Sergey", at: "4 May" },
			),
		]),
	},

	// ── The transform residue that nothing can repair: the source dropped the
	//    placeholder, so every value that used it is broken (#15, #23).
	{
		key: "finder_found_basic_ideas",
		screen: "finder",
		placeholders: {},
		source: "Picked up ideas",
		change: {
			kind: "contract",
			was: "Picked up {d} ideas",
			now: "Picked up ideas",
			summary: "Placeholder {d} was removed — the count moved to its own line.",
			snapshot: "develop @ 19a07bc",
		},
		staged:
			"The placeholder removal is invented. Target values are verbatim, which is what makes four of them reference a {d} that no longer exists.",
		targets: byLocale([
			t("de", "{d} Ideen gefunden", "broken", {
				note: "Uses {d}, which the source removed. No transform can recover the wording.",
			}),
			t("es", "Se han seleccionado {d} ideas", "broken", {
				note: "Uses {d}, which the source removed.",
			}),
			t("fr", "Idées trouvées", "current", {
				by: "Camille",
				at: "3 Jul",
				note: "Never used the placeholder, so the source change cost it nothing.",
			}),
			t("ru", "Подобрано {d} идей", "broken", {
				note: "Uses {d}, which the source removed.",
			}),
			t("zh", "已选择 {d} 个创意", "broken", {
				note: "Uses {d}, which the source removed.",
			}),
		]),
	},

	// ── Two plurals in one message, and a Chinese value that dropped the ICU
	//    shape entirely. The worst thing the editor has to render.
	{
		key: "pm_scans_feed_export_pack_summary",
		screen: "scans_feed",
		placeholders: { pocketCount: "int", partCount: "int" },
		source:
			"{pocketCount, plural, one{{pocketCount} pocket} other{{pocketCount} pockets}}, {partCount, plural, one{{partCount} part} other{{partCount} parts}}",
		targets: byLocale([
			t(
				"de",
				"{pocketCount, plural, one{{pocketCount} Pocket} other{{pocketCount} Pockets}}, {partCount, plural, one{{partCount} Stein} other{{partCount} Steine}}",
				"current",
				{ by: "Sergey", at: "12 Jun" },
			),
			t(
				"es",
				"{pocketCount, plural, one{{pocketCount} pocket} other{{pocketCount} pockets}}, {partCount, plural, one{{partCount} pieza} other{{partCount} piezas}}",
				"current",
				{ by: "Sergey", at: "12 Jun" },
			),
			t("fr", "", "undecided"),
			t(
				"ru",
				"{pocketCount, plural, one{{pocketCount} кармашек} few{{pocketCount} кармашка} many{{pocketCount} кармашков} other{{pocketCount} кармашка}}, {partCount, plural, one{{partCount} деталь} few{{partCount} детали} many{{partCount} деталей} other{{partCount} деталей}}",
				"current",
				{ by: "Sergey", at: "12 Jun" },
			),
			t("zh", "{pocketCount} 个口袋，{partCount} 块积木", "current", {
				by: "Sergey",
				at: "12 Jun",
				note: "Chinese needs no plural arms, so a plain message is valid here.",
			}),
		]),
	},

	// ── A key the source just added. Nothing to confirm, nothing stale — the
	//    ordinary bulk of the work.
	{
		key: "experience_page_craft_idea_bricks",
		screen: "experience",
		placeholders: { count: "int" },
		plural: { arg: "count" },
		source: "{count, plural, one{{count} brick} other{{count} bricks}}",
		staged:
			"Presented as newly added by the source; in Git it is already translated everywhere.",
		targets: byLocale([
			t("de", "", "undecided"),
			t("es", "", "undecided"),
			t("fr", "", "undecided"),
			t("ru", "", "undecided"),
			t("zh", "", "undecided"),
		]),
	},
];

/** Split an ICU plural expression into its arms. Prototype-grade, not a parser. */
export function splitPluralArms(
	value: string,
): { arg: string; arms: { category: string; body: string }[] } | null {
	const head = value.match(/^\{(\w+),\s*plural,\s*/);
	if (!head) return null;
	const body = value.slice(head[0].length);
	const arms: { category: string; body: string }[] = [];
	let index = 0;
	while (index < body.length) {
		const match = /^\s*(=?\w+)\s*\{/.exec(body.slice(index));
		if (!match) break;
		let depth = 1;
		let cursor = index + match[0].length;
		const start = cursor;
		while (cursor < body.length && depth > 0) {
			if (body[cursor] === "{") depth += 1;
			if (body[cursor] === "}") depth -= 1;
			cursor += 1;
		}
		arms.push({ category: match[1], body: body.slice(start, cursor - 1) });
		index = cursor;
	}
	return arms.length ? { arg: head[1], arms } : null;
}

export function joinPluralArms(
	arg: string,
	arms: { category: string; body: string }[],
): string {
	return `{${arg}, plural, ${arms
		.map((arm) => `${arm.category}{${arm.body}}`)
		.join(" ")}}`;
}

export type DiffSegment = { kind: "same" | "removed" | "added"; text: string };

/**
 * Word-level diff over an LCS, so a change in two places reads as two marks
 * rather than one swallowed tail. ICU makes that difference matter: a plain
 * head-and-tail diff of a plural marks every arm changed when one word moved.
 */
export function wordDiff(was: string, now: string): DiffSegment[] {
	const a = was.split(/(\s+)/).filter(Boolean);
	const b = now.split(/(\s+)/).filter(Boolean);

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

	const segments: DiffSegment[] = [];
	const push = (kind: DiffSegment["kind"], text: string) => {
		const last = segments[segments.length - 1];
		if (last && last.kind === kind) last.text += text;
		else segments.push({ kind, text });
	};

	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			push("same", a[i]);
			i += 1;
			j += 1;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			push("removed", a[i]);
			i += 1;
		} else {
			push("added", b[j]);
			j += 1;
		}
	}
	for (; i < a.length; i += 1) push("removed", a[i]);
	for (; j < b.length; j += 1) push("added", b[j]);

	return segments;
}

/**
 * The Reconciliation Report row this key would sit under, for the inline
 * context. Group order is the one settled in #15 — scope, then severity, then
 * routine work — not the fixture's order.
 */
export const REPORT_GROUP_ORDER = [
	"Broken by a source change",
	"Changed in Git",
	"To review",
	"To translate",
] as const;

export const REPORT_ROWS: Record<string, (typeof REPORT_GROUP_ORDER)[number]> =
	{
		finder_found_basic_ideas: "Broken by a source change",
		part_count: "Changed in Git",
		brickit_school_about_app_desc: "Changed in Git",
		notification_center_no_results: "To review",
		pm_pocket_loading_state: "To review",
		experience_page_craft_idea_bricks: "To translate",
	};
