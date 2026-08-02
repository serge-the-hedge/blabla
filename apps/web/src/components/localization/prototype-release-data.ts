// PROTOTYPE ONLY — throwaway fixture for the release-record prototype route.
// Delete with the route it serves.
//
// Shape follows the measured Brickit catalog: six ARBs (en template + de, es,
// fr, ru, zh), 1,434 message identifiers in each. The findings below are a
// plausible release scope for one Baseline Snapshot, not real data.

export type FindingKind = "contract" | "missing" | "blank" | "stale";

export type Finding = {
	id: string;
	key: string;
	locale: string;
	kind: FindingKind;
	source: string;
	fingerprint: string;
	screen: string;
	tag: string;
	value?: string;
	note?: string;
	placeholders: string[];
	// Stale only: a meaning change blocks its targets, a cosmetic edit does not.
	impact?: "semantic" | "cosmetic";
};

export type EvidenceItem = {
	id: string;
	key: string;
	locales: string[];
	kind: "identical" | "intentional-blank";
	value: string;
	why: string;
};

export type PastRecord = {
	id: string;
	commit: string;
	openedAt: string;
	posture: Posture;
	summary: string;
	output: string | null;
};

export type Posture =
	| "Blocked"
	| "Requires Approval"
	| "Ready with Deviations"
	| "Ready";

export const TEMPLATE_LOCALE = "en";
export const TARGET_LOCALES = ["de", "es", "fr", "ru", "zh"];
export const LOCALE_LABEL: Record<string, string> = {
	de: "German",
	es: "Spanish",
	fr: "French",
	ru: "Russian",
	zh: "Chinese",
};

export const SNAPSHOT = {
	commit: "6f2c81d",
	branch: "main",
	ingestedAt: "1 Aug, 09:14",
	keys: 1434,
	openedBy: "Sergey",
	openedAt: "1 Aug, 10:02",
};

type Area = {
	screen: string;
	tag: string;
	prefix: string;
	leaves: [string, string][];
};

const AREAS: Area[] = [
	{
		screen: "Set detail",
		tag: "sets",
		prefix: "sets_detail_",
		leaves: [
			["title", "Set details"],
			["subtitle", "From your collection"],
			["missing_parts_title", "Missing parts"],
			["missing_parts_hint", "Tap a part to mark it as missing."],
			["parts_count", "{total} parts"],
			["build_button", "Build this set"],
			["instructions_link", "Open instructions"],
			["share_action", "Share set"],
			["added_to_collection", "Added to your collection"],
			["remove_confirm", "Remove this set from your collection?"],
			["pieces_label", "Pieces"],
			["year_label", "Released {year}"],
			["substitute_hint", "A similar part can stand in here."],
			["progress_label", "{done} of {total} parts found"],
		],
	},
	{
		screen: "Scanner",
		tag: "scanner",
		prefix: "scanner_",
		leaves: [
			["hint_retry", "Spread the bricks out and scan again."],
			["hint_light", "Find a spot with more light."],
			["hint_move_closer", "Hold the camera a little closer."],
			["progress_label", "Scanning your bricks…"],
			["result_empty", "No bricks recognised yet."],
			["error_camera_denied", "Brickit needs camera access to scan."],
			["permission_prompt", "Allow camera access"],
			["tutorial_step_one", "Pour your bricks onto a flat surface."],
			["tutorial_step_two", "Spread them into a single layer."],
			["tutorial_step_three", "Keep the whole pile in frame."],
			["cancel_action", "Cancel scan"],
			["saving_label", "Saving your bricks…"],
			["error_generic", "Something went wrong. Try scanning again."],
			["bricks_found", "{count} bricks found"],
		],
	},
	{
		screen: "Paywall",
		tag: "paywall",
		prefix: "paywall_",
		leaves: [
			["headline", "Build more with Brickit Plus"],
			["subheadline", "Unlimited ideas from every scan."],
			["annual_savings", "Save {percent} with a yearly plan"],
			["trial_note", "7 days free, then $4.99 a month. Cancel anytime."],
			["plan_monthly", "Monthly"],
			["plan_annual", "Yearly"],
			["restore_action", "Restore purchase"],
			["terms_link", "Terms and conditions"],
			["feature_scan", "Faster scanning"],
			["feature_ideas", "Every idea unlocked"],
			["feature_offline", "Build without a connection"],
			["price_note", "{price} billed once a year"],
			["close_action", "Not now"],
			["already_member", "Already a member?"],
		],
	},
	{
		screen: "Ideas",
		tag: "ideas",
		prefix: "ideas_search_",
		leaves: [
			["selection_ideas", "{count} ideas"],
			["empty_state", "Nothing matches this search yet."],
			["filter_all", "All ideas"],
			["filter_saved", "Saved"],
			["placeholder", "Search ideas"],
			["recent_title", "Recently viewed"],
			["difficulty_label", "Difficulty"],
			["time_label", "About {minutes} minutes"],
			["difficulty_easy", "Easy"],
			["difficulty_medium", "Medium"],
			["difficulty_hard", "Hard"],
			["save_action", "Save this idea"],
			["saved_toast", "Saved to your ideas"],
			["share_action", "Share this build"],
		],
	},
	{
		screen: "Activity",
		tag: "social",
		prefix: "activity_feed_",
		leaves: [
			["title", "Activity"],
			["subtitle_today", "Today"],
			["empty_state", "Nothing has happened yet."],
			["load_more", "Show more"],
			["comment_action", "Comment"],
			["like_action", "Like"],
			["followed_you", "{name} started following you"],
			["built_set", "{name} built {set}"],
			["yesterday", "Yesterday"],
			["earlier", "Earlier"],
			["report_action", "Report"],
		],
	},
	{
		screen: "About",
		tag: "legal",
		prefix: "aboutapp_",
		leaves: [
			["insta", "Instagram"],
			["rate_google", "Rate Brickit on Google Play"],
			["license", "Licences"],
			["version_label", "Version {version}"],
			["contact_support", "Contact support"],
			["privacy_policy", "Privacy policy"],
			["terms", "Terms of use"],
			["disclaimer", "Brickit is not affiliated with the LEGO Group."],
		],
	},
	{
		screen: "Profile",
		tag: "profile",
		prefix: "profile_",
		leaves: [
			["badge_new", "New"],
			["collection_title", "Your collection"],
			["stats_bricks", "Bricks scanned"],
			["stats_sets", "Sets built"],
			["edit_action", "Edit profile"],
			["sign_out", "Sign out"],
			["delete_account", "Delete account"],
			["notifications_title", "Notifications"],
			["notifications_hint", "We only send build reminders."],
			["language_label", "App language"],
			["joined_label", "Building since {date}"],
		],
	},
	{
		screen: "Leaderboard",
		tag: "social",
		prefix: "leaderboard_",
		leaves: [
			["intro_collection_with", "Your collection, ranked with builders near you."],
			["weekly_title", "This week"],
			["rank_label", "#{rank}"],
			["empty_state", "No builders nearby yet."],
			["invite_action", "Invite a friend"],
		],
	},
	{
		screen: "Scan results",
		tag: "scanner",
		prefix: "after_scan_page_",
		leaves: [
			["pom_description", "We found these ideas in your pile."],
			["retry_action", "Scan again"],
			["save_action", "Save to collection"],
			["results_title", "{count} ideas found"],
			["sort_label", "Sort by"],
		],
	},
	{
		screen: "Onboarding",
		tag: "onboarding",
		prefix: "onboarding_",
		leaves: [
			["welcome_title", "Welcome to Brickit"],
			["welcome_body", "Scan your bricks and get ideas you can build right now."],
			["permission_camera", "Brickit uses the camera to see your bricks."],
			["permission_photos_hint", "Photos stay on your device."],
			["skip_action", "Skip"],
			["next_action", "Next"],
		],
	},
	{
		screen: "Collection",
		tag: "sets",
		prefix: "collection_",
		leaves: [
			["empty_title", "Your collection is empty"],
			["empty_body", "Sets you build show up here."],
			["add_set_action", "Add a set"],
			["sort_recent", "Most recent"],
			["sort_name", "Name"],
		],
	},
	{
		screen: "Ads",
		tag: "growth",
		prefix: "ads_banner_",
		leaves: [
			["close_button_text", "Close"],
			["label", "Ad"],
		],
	},
];

type CatalogKey = {
	key: string;
	source: string;
	screen: string;
	tag: string;
	placeholders: string[];
};

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

export const CATALOG: CatalogKey[] = AREAS.flatMap((area) =>
	area.leaves.map(([leaf, source]) => ({
		key: `${area.prefix}${leaf}`,
		source,
		screen: area.screen,
		tag: area.tag,
		placeholders: [...source.matchAll(PLACEHOLDER_PATTERN)].map(
			(match) => match[1],
		),
	})),
);

function hash(input: string): number {
	let value = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		value ^= input.charCodeAt(index);
		value = Math.imul(value, 16777619);
	}
	return value >>> 0;
}

export function fingerprintOf(key: string, source: string): string {
	return `en@${hash(`${key}::${source}`).toString(16).padStart(8, "0").slice(0, 7)}`;
}

const byKey = new Map(CATALOG.map((entry) => [entry.key, entry]));

// Nine English strings were edited in this snapshot; every target that had a
// value for them is now stale. Hand-written translations so the rows read like
// a real catalog rather than placeholder text.
const STALE_KEYS = [
	"aboutapp_disclaimer",
	"sets_detail_missing_parts_hint",
	"paywall_trial_note",
	"scanner_hint_retry",
	"after_scan_page_pom_description",
	"leaderboard_intro_collection_with",
	"onboarding_welcome_body",
	"profile_stats_bricks",
	"ads_banner_close_button_text",
];

// Three of the nine English edits were punctuation or wording polish that does
// not change what the string means.
const COSMETIC_STALE = new Set([
	"aboutapp_disclaimer",
	"profile_stats_bricks",
	"ads_banner_close_button_text",
]);

const STALE_VALUES: Record<string, Record<string, string>> = {
	aboutapp_disclaimer: {
		de: "Brickit steht in keiner Verbindung zur LEGO Gruppe.",
		es: "Brickit no está afiliado al Grupo LEGO.",
		fr: "Brickit n'est pas affilié au groupe LEGO.",
		ru: "Brickit не связан с группой компаний LEGO.",
		zh: "Brickit 与乐高集团无关联。",
	},
	sets_detail_missing_parts_hint: {
		de: "Tippe auf ein Teil, um es als fehlend zu markieren.",
		es: "Toca una pieza para marcarla como faltante.",
		fr: "Touchez une pièce pour la marquer comme manquante.",
		ru: "Нажмите на деталь, чтобы отметить её как отсутствующую.",
		zh: "点按零件即可标记为缺失。",
	},
	paywall_trial_note: {
		de: "7 Tage kostenlos, danach 4,99 $ pro Monat. Jederzeit kündbar.",
		es: "7 días gratis y luego 4,99 $ al mes. Cancela cuando quieras.",
		fr: "7 jours gratuits, puis 4,99 $ par mois. Annulable à tout moment.",
		ru: "7 дней бесплатно, затем 4,99 $ в месяц. Отмена в любой момент.",
		zh: "免费试用 7 天，之后每月 4.99 美元，可随时取消。",
	},
	scanner_hint_retry: {
		de: "Verteile die Steine und scanne erneut.",
		es: "Extiende las piezas y vuelve a escanear.",
		fr: "Étalez les briques et relancez le scan.",
		ru: "Разложите детали и отсканируйте ещё раз.",
		zh: "把积木摊开再扫描一次。",
	},
	after_scan_page_pom_description: {
		de: "Wir haben diese Ideen in deinem Haufen gefunden.",
		es: "Encontramos estas ideas en tu montón.",
		fr: "Nous avons trouvé ces idées dans votre tas.",
		ru: "Мы нашли эти идеи в вашей куче деталей.",
		zh: "我们在你的积木堆里找到了这些创意。",
	},
	leaderboard_intro_collection_with: {
		de: "Deine Sammlung im Vergleich mit Baumeistern in deiner Nähe.",
		es: "Tu colección, comparada con constructores cerca de ti.",
		fr: "Votre collection, classée avec les constructeurs près de chez vous.",
		ru: "Ваша коллекция в рейтинге среди строителей рядом с вами.",
		zh: "你的收藏，与附近的搭建者一同排名。",
	},
	onboarding_welcome_body: {
		de: "Scanne deine Steine und erhalte Ideen, die du sofort bauen kannst.",
		es: "Escanea tus piezas y recibe ideas que puedes construir ahora.",
		fr: "Scannez vos briques et recevez des idées à construire tout de suite.",
		ru: "Отсканируйте детали и получите идеи, которые можно собрать прямо сейчас.",
		zh: "扫描积木，立即获得可以搭建的创意。",
	},
	profile_stats_bricks: {
		de: "Gescannte Steine",
		es: "Piezas escaneadas",
		fr: "Briques scannées",
		ru: "Отсканировано деталей",
		zh: "已扫描积木数",
	},
	ads_banner_close_button_text: {
		de: "Schließen",
		es: "Cerrar",
		fr: "Fermer",
		ru: "Закрыть",
		zh: "关闭",
	},
};

// Two locales joined late and still lag; the other three are nearly complete.
const MISSING_COUNTS: Record<string, number> = {
	de: 3,
	es: 2,
	fr: 6,
	ru: 24,
	zh: 38,
};

// Empty strings carried in from the ARBs at cutover. Present but unresolved:
// nobody has confirmed they are meant to render nothing.
const BLANK_COUNTS: Record<string, number> = {
	de: 1,
	es: 0,
	fr: 0,
	ru: 6,
	zh: 9,
};

function pick(locale: string, salt: string, count: number, skip: Set<string>) {
	return CATALOG.map((entry) => ({
		entry,
		rank: hash(`${locale}:${salt}:${entry.key}`),
	}))
		.filter(({ entry }) => !skip.has(entry.key))
		.sort((a, b) => a.rank - b.rank)
		.slice(0, count)
		.map(({ entry }) => entry);
}

function buildFindings(): Finding[] {
	const findings: Finding[] = [];

	// The one non-waivable failure: a Russian value survives a source rename it
	// cannot be transformed through, so gen_l10n would not compile.
	const partsCount = byKey.get("sets_detail_parts_count");
	if (partsCount) {
		findings.push({
			id: "f-contract-ru",
			key: partsCount.key,
			locale: "ru",
			kind: "contract",
			source: partsCount.source,
			fingerprint: fingerprintOf(partsCount.key, partsCount.source),
			screen: partsCount.screen,
			tag: partsCount.tag,
			value: "{count} деталей",
			note: "References {count}; the source declares {total}.",
			placeholders: partsCount.placeholders,
		});
	}

	// The nine edited keys are long-standing strings every locale already had,
	// so they never overlap with the lagging locales' missing sets.
	const spoken = new Set(["sets_detail_parts_count", ...STALE_KEYS]);

	for (const locale of TARGET_LOCALES) {
		const missing = pick(locale, "missing", MISSING_COUNTS[locale] ?? 0, spoken);
		const missingKeys = new Set(missing.map((entry) => entry.key));
		for (const entry of missing) {
			findings.push({
				id: `f-missing-${locale}-${entry.key}`,
				key: entry.key,
				locale,
				kind: "missing",
				source: entry.source,
				fingerprint: fingerprintOf(entry.key, entry.source),
				screen: entry.screen,
				tag: entry.tag,
				placeholders: entry.placeholders,
			});
		}

		const blanks = pick(
			locale,
			"blank",
			BLANK_COUNTS[locale] ?? 0,
			new Set([...missingKeys, ...spoken]),
		);
		const blankKeys = new Set(blanks.map((entry) => entry.key));
		for (const entry of blanks) {
			findings.push({
				id: `f-blank-${locale}-${entry.key}`,
				key: entry.key,
				locale,
				kind: "blank",
				source: entry.source,
				fingerprint: fingerprintOf(entry.key, entry.source),
				screen: entry.screen,
				tag: entry.tag,
				value: "",
				note: "Empty since the cutover import.",
				placeholders: entry.placeholders,
			});
		}

		for (const key of STALE_KEYS) {
			const entry = byKey.get(key);
			if (!entry || missingKeys.has(key) || blankKeys.has(key)) continue;
			findings.push({
				id: `f-stale-${locale}-${key}`,
				key,
				locale,
				kind: "stale",
				source: entry.source,
				fingerprint: fingerprintOf(entry.key, entry.source),
				screen: entry.screen,
				tag: entry.tag,
				value: STALE_VALUES[key]?.[locale],
				note: COSMETIC_STALE.has(key)
					? "English polished; meaning unchanged."
					: "English meaning changed in this snapshot.",
				placeholders: entry.placeholders,
				impact: COSMETIC_STALE.has(key) ? "cosmetic" : "semantic",
			});
		}
	}

	return findings;
}

export const FINDINGS = buildFindings();

export const EVIDENCE: EvidenceItem[] = [
	{
		id: "e-insta",
		key: "aboutapp_insta",
		locales: ["de", "es", "fr", "ru"],
		kind: "identical",
		value: "Instagram",
		why: "Brand name, saved as-is",
	},
	{
		id: "e-label",
		key: "ads_banner_label",
		locales: ["de", "es"],
		kind: "identical",
		value: "Ad",
		why: "Kept short on purpose",
	},
	{
		id: "e-badge",
		key: "profile_badge_new",
		locales: ["fr"],
		kind: "identical",
		value: "New",
		why: "Brand voice, saved as-is",
	},
	{
		id: "e-license",
		key: "aboutapp_license",
		locales: ["ru", "zh"],
		kind: "intentional-blank",
		value: "",
		why: "Legal page not localised; confirmed 24 Jul by Sergey",
	},
	{
		id: "e-photos",
		key: "onboarding_permission_photos_hint",
		locales: ["de"],
		kind: "intentional-blank",
		value: "",
		why: "Line does not apply on Android; confirmed 24 Jul by Sergey",
	},
];

export const IDENTICAL_TOTAL = 18;

// Finished work that shows up as evidence on the record rather than as a
// finding: nothing here needs a disposition.
export const IDENTICAL_BY_LOCALE: Record<string, number> = {
	de: 5,
	es: 4,
	fr: 4,
	ru: 3,
	zh: 2,
};

export const INTENTIONAL_BLANK_BY_LOCALE: Record<string, number> = {
	de: 1,
	es: 0,
	fr: 0,
	ru: 1,
	zh: 1,
};

export const INTENTIONAL_BLANK_TOTAL = 3;

export const HISTORY: PastRecord[] = [
	{
		id: "r-2026-07-24",
		commit: "4b19ee0",
		openedAt: "24 Jul",
		posture: "Ready with Deviations",
		summary: "18 source fallbacks approved for zh and ru",
		output: "PR #412 · merged",
	},
	{
		id: "r-2026-07-11",
		commit: "9c74a13",
		openedAt: "11 Jul",
		posture: "Ready",
		summary: "Every bound locale current",
		output: "PR #401 · merged",
	},
	{
		id: "r-2026-06-28",
		commit: "2d0af55",
		openedAt: "28 Jun",
		posture: "Blocked",
		summary: "2 contract failures in ru",
		output: null,
	},
];

export const KIND_LABEL: Record<FindingKind, string> = {
	contract: "Invalid for the contract",
	missing: "No value yet",
	blank: "Blank, unconfirmed",
	stale: "Source changed",
};

export const KIND_SHORT: Record<FindingKind, string> = {
	contract: "Invalid",
	missing: "Missing",
	blank: "Blank",
	stale: "Stale",
};

export const KIND_ORDER: FindingKind[] = ["contract", "missing", "blank", "stale"];

export const SCREENS = [...new Set(CATALOG.map((entry) => entry.screen))];
export const TAGS = [...new Set(CATALOG.map((entry) => entry.tag))];

export type Disposition =
	| { kind: "approved-fallback"; at: string; by: string }
	| { kind: "confirmed"; at: string; by: string }
	| { kind: "translated"; at: string; by: string }
	| { kind: "fixed"; at: string; by: string };

export function postureOf(
	findings: Finding[],
	dispositions: Record<string, Disposition>,
): Posture {
	const open = findings.filter((finding) => !dispositions[finding.id]);
	if (open.some((finding) => finding.kind === "contract")) return "Blocked";
	if (open.length > 0) return "Requires Approval";
	const approved = Object.values(dispositions).some(
		(disposition) => disposition.kind === "approved-fallback",
	);
	return approved ? "Ready with Deviations" : "Ready";
}

export const POSTURE_TONE: Record<Posture, string> = {
	Blocked: "text-destructive",
	"Requires Approval": "text-foreground",
	"Ready with Deviations": "text-foreground",
	Ready: "text-success",
};
