// PROTOTYPE ONLY — throwaway. Round three of the per-key, many-Locale editing
// block, at /prototype-editor?variant=. Answers "Prototype the per-key
// translation editor" (#24). Delete with the branch that holds it.
//
// Round one died on a click between the translator and the field. Round two
// kept the field live but was loud: a status caption under every row, five per
// key; English pinned as a read-only source panel; and a grid whose columns
// were far too narrow to read a paragraph in. Round three adds three rules and
// keeps round two's zero-click field and one commit gesture.
//
//   1. A settled value says NOTHING. Silence is the resting state, and the
//      whole noise budget goes to the handful of values still waiting.
//   2. English is a row, not a panel. It is editable like any other Locale;
//      editing it produces a Source Proposal, because Git authors the contract.
//   3. A value gets the full width of the page and grows without limit,
//      capped only at a comfortable reading measure.
//
// G — Stack:  every Locale open, full width, borderless. Nothing is hidden.
// H — Reader: a key index beside one key at a time, given the whole pane.
// I — Lines:  every Locale one line at rest; the one you are in opens. No
//             click — it follows focus.

import { Button } from "@blabla/ui/components/button";
import { Input } from "@blabla/ui/components/input";
import { Separator } from "@blabla/ui/components/separator";
import { Textarea } from "@blabla/ui/components/textarea";
import { cn } from "@blabla/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import {
	joinPluralArms,
	KEYS,
	type KeyEntry,
	LOCALE_LABEL,
	LOCALES,
	type LocaleCode,
	PLURAL_CATEGORIES,
	REFERENCE,
	REPORT_GROUP_ORDER,
	REPORT_ROWS,
	STATE_BLOCKS,
	STATE_LABEL,
	splitPluralArms,
	type TargetValue,
	type ValueState,
	wordDiff,
} from "@/components/localization/prototype-editor-data";
import { PrototypeVariantSwitcher } from "@/components/localization/prototype-variant-switcher";

export const Route = createFileRoute("/prototype-editor")({
	validateSearch: (search: Record<string, unknown>) => ({
		variant: typeof search.variant === "string" ? search.variant : "G",
		context: search.context === "report" ? "report" : "strings",
		key: typeof search.key === "string" ? search.key : undefined,
	}),
	component: PrototypeEditorRoute,
});

const VARIANTS = [
	{ key: "G", name: "Stack — every Locale open, full width" },
	{ key: "H", name: "Reader — one key, the whole pane" },
	{ key: "I", name: "Lines — one line each, the focused one opens" },
];

const ME = "Sergey";
const NOW = "today";

/**
 * The reading measure. Wide enough that a 300-character German paragraph is
 * comfortable, capped short of the line lengths that make the eye lose its
 * place on the return sweep.
 */
const MEASURE = "max-w-[74ch]";

// ───────────────────────────────────────────────────────────────────── state

const idOf = (entry: KeyEntry, locale: LocaleCode) => `${entry.key}:${locale}`;

function useEditorState() {
	const [saved, setSaved] = useState<Record<string, TargetValue>>({});
	const [drafts, setDrafts] = useState<Record<string, string>>({});

	const stored = useCallback(
		(entry: KeyEntry, locale: LocaleCode): TargetValue =>
			saved[idOf(entry, locale)] ?? entry.targets[locale],
		[saved],
	);

	const draft = useCallback(
		(entry: KeyEntry, locale: LocaleCode): string =>
			drafts[idOf(entry, locale)] ?? stored(entry, locale).value,
		[drafts, stored],
	);

	const setDraft = useCallback(
		(entry: KeyEntry, locale: LocaleCode, value: string) =>
			setDrafts((current) => ({ ...current, [idOf(entry, locale)]: value })),
		[],
	);

	const write = useCallback(
		(entry: KeyEntry, locale: LocaleCode, next: Partial<TargetValue>) => {
			const id = idOf(entry, locale);
			setSaved((current) => ({
				...current,
				[id]: {
					...(current[id] ?? entry.targets[locale]),
					by: ME,
					at: NOW,
					...next,
				},
			}));
			setDrafts((current) => {
				const { [id]: _dropped, ...rest } = current;
				return rest;
			});
		},
		[],
	);

	/**
	 * The one gesture, behind blur, ⌘↵, and the confirm link. Touched it → an
	 * edit. Left it alone while it was stale → a confirmation. Left it alone
	 * otherwise → nothing happened, and nothing should.
	 */
	const commit = useCallback(
		(entry: KeyEntry, locale: LocaleCode) => {
			const current = stored(entry, locale);
			const next = draft(entry, locale);
			if (next !== current.value) {
				write(entry, locale, {
					value: next,
					state:
						locale === REFERENCE
							? "proposal"
							: next === entry.source
								? "identical"
								: "current",
					reason: undefined,
					note: undefined,
				});
				return;
			}
			if (
				current.state === "stale-semantic" ||
				current.state === "stale-cosmetic"
			) {
				write(entry, locale, { state: "current" });
			}
		},
		[draft, stored, write],
	);

	return {
		stored,
		draft,
		setDraft,
		commit,
		blank: (entry: KeyEntry, locale: LocaleCode, reason: string) =>
			write(entry, locale, { value: "", state: "blank", reason }),
		revert: (entry: KeyEntry, locale: LocaleCode) =>
			setDrafts((current) => {
				const { [idOf(entry, locale)]: _dropped, ...rest } = current;
				return rest;
			}),
		reset: () => {
			setSaved({});
			setDrafts({});
		},
	};
}

type EditorState = ReturnType<typeof useEditorState>;

function waitingCount(entry: KeyEntry, state: EditorState) {
	return LOCALES.filter(
		(locale) => STATE_BLOCKS[state.stored(entry, locale).state],
	).length;
}

/** ⌘↵ goes to the next value still waiting on someone, wrapping at the end. */
function focusNextWaiting(from: HTMLElement) {
	const fields = Array.from(
		document.querySelectorAll<HTMLElement>("[data-field]"),
	);
	const index = fields.indexOf(from);
	if (index < 0) return;
	const next =
		fields.slice(index + 1).find((el) => el.dataset.waiting === "true") ??
		fields.slice(0, index).find((el) => el.dataset.waiting === "true");
	next?.focus();
	if (next instanceof HTMLTextAreaElement || next instanceof HTMLInputElement) {
		next.setSelectionRange(next.value.length, next.value.length);
	}
}

// ────────────────────────────────────────────────────────────── vocabulary
//
// One accent, spent only on things that stop a release. Everything else is
// greyscale, because everything else is either fine or merely informative.

const STATE_TONE: Record<ValueState, string> = {
	current: "text-muted-foreground",
	identical: "text-muted-foreground",
	blank: "text-muted-foreground",
	"stale-cosmetic": "text-muted-foreground",
	proposal: "text-muted-foreground",
	"imported-identical": "text-amber-600 dark:text-amber-500",
	undecided: "text-amber-600 dark:text-amber-500",
	"stale-semantic": "text-amber-600 dark:text-amber-500",
	broken: "text-destructive",
};

const STATE_RULE: Record<ValueState, string> = {
	current: "bg-transparent",
	identical: "bg-transparent",
	blank: "bg-transparent",
	"stale-cosmetic": "bg-transparent",
	proposal: "bg-border",
	"imported-identical": "bg-amber-500/70",
	undecided: "bg-amber-500/70",
	"stale-semantic": "bg-amber-500/70",
	broken: "bg-destructive/80",
};

/**
 * The key's own header. Once per key, never per Locale — the change that made
 * five rows stale is one fact, and repeating it five times was most of the
 * noise in round two.
 */
function KeyHeader({
	entry,
	waiting,
	className,
}: {
	entry: KeyEntry;
	waiting: number;
	className?: string;
}) {
	return (
		<div className={cn("flex items-baseline gap-2", className)}>
			<span className="min-w-0 truncate font-mono text-[13px] text-foreground/90">
				{entry.key}
			</span>
			{entry.screen ? (
				<span className="shrink-0 text-[11px] text-muted-foreground/70">
					{entry.screen}
				</span>
			) : null}
			{waiting ? (
				<span className="ml-auto shrink-0 text-[11px] text-amber-600 tabular-nums dark:text-amber-500">
					{waiting} waiting
				</span>
			) : null}
		</div>
	);
}

function DiffLine({ was, now }: { was: string; now: string }) {
	return (
		<span dir="auto">
			{wordDiff(was, now).map((segment, index) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: static diff, never reordered
					key={index}
					className={cn(
						segment.kind === "removed" &&
							"text-muted-foreground/60 line-through",
						segment.kind === "added" && "text-foreground",
						segment.kind === "same" && "text-muted-foreground/60",
					)}
				>
					{segment.text}
				</span>
			))}
		</span>
	);
}

/**
 * What English did, said once per key rather than once per Locale. A plural
 * diffs arm by arm — the raw ICU diff of a plural is unreadable, and the arms
 * are what the translator is about to edit anyway.
 */
function ChangeNote({ entry }: { entry: KeyEntry }) {
	if (!entry.change) return null;

	if (entry.change.kind === "cosmetic") {
		return (
			<p className={cn("text-[12px] text-muted-foreground/70", MEASURE)}>
				English was touched, not changed — {entry.change.summary} Everything
				below still ships.
			</p>
		);
	}

	const wasArms = splitPluralArms(entry.change.was);
	const nowArms = splitPluralArms(entry.change.now);

	return (
		<div className="flex flex-col gap-1">
			<p
				className={cn(
					"text-[12px]",
					entry.change.kind === "contract"
						? "text-destructive"
						: "text-amber-600 dark:text-amber-500",
				)}
			>
				{entry.change.kind === "contract"
					? "English dropped part of the contract"
					: "English changed meaning"}{" "}
				<span className="text-muted-foreground">— {entry.change.summary}</span>
			</p>
			<div className={cn("flex flex-col text-[13px] leading-relaxed", MEASURE)}>
				{wasArms && nowArms ? (
					nowArms.arms.map((arm) => (
						<div key={arm.category} className="flex items-baseline gap-2">
							<span className="w-11 shrink-0 font-mono text-[10px] text-muted-foreground/60">
								{arm.category}
							</span>
							<DiffLine
								was={
									wasArms.arms.find((item) => item.category === arm.category)
										?.body ?? ""
								}
								now={arm.body}
							/>
						</div>
					))
				) : (
					<DiffLine was={entry.change.was} now={entry.change.now} />
				)}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────── the value
//
// Borderless at rest, so a page of values reads as text rather than as a form.
// Still a live field: the caret lands where you click, on the first paint.

// min-h-0 and the md: override are both deliberate: the shared Textarea ships
// min-h-16 and md:text-xs, which would give a one-word value four lines of
// height and shrink a paragraph back to 12px on the only breakpoint that
// matters here.
const FIELD_BASE =
	"field-sizing-content min-h-0 w-full resize-none border-0 bg-transparent px-2 py-1 text-[13px] leading-relaxed shadow-none outline-none transition-colors hover:bg-muted/40 focus:bg-muted/60 focus-visible:border-0 focus-visible:ring-0 md:text-[13px] dark:bg-transparent dark:hover:bg-muted/30 dark:focus:bg-muted/50";

function LocaleRow({
	entry,
	locale,
	state,
	/** "open" grows to the content; "line" clamps until focused. */
	mode = "open",
	dense,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	state: EditorState;
	mode?: "open" | "line";
	dense?: boolean;
}) {
	const target = state.stored(entry, locale);
	const value = state.draft(entry, locale);
	const dirty = value !== target.value;
	const waiting = STATE_BLOCKS[target.state];
	const [focused, setFocused] = useState(false);
	const [blanking, setBlanking] = useState(false);
	const sourceArms = entry.plural ? splitPluralArms(entry.source) : null;

	const plumbing = {
		"data-field": true,
		"data-waiting": waiting ? "true" : "false",
		dir: "auto" as const,
		onFocus: () => setFocused(true),
		onBlur: () => {
			setFocused(false);
			if (dirty) state.commit(entry, locale);
		},
		onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				state.commit(entry, locale);
				focusNextWaiting(event.currentTarget);
			} else if (event.key === "Escape" && dirty) {
				event.preventDefault();
				state.revert(entry, locale);
			}
		},
	};

	const clamp =
		mode === "line" && !focused && !dirty
			? "max-h-[1.9rem] overflow-hidden"
			: "";

	return (
		<div className="flex items-start gap-2">
			<span
				aria-hidden="true"
				className={cn(
					"mt-1 w-px shrink-0 self-stretch rounded",
					STATE_RULE[target.state],
				)}
			/>
			<span
				className={cn(
					"w-6 shrink-0 pt-1.5 font-mono text-[11px]",
					waiting ? STATE_TONE[target.state] : "text-muted-foreground/50",
				)}
				title={LOCALE_LABEL[locale]}
			>
				{locale}
			</span>

			<div className={cn("min-w-0 flex-1", dense ? "" : MEASURE)}>
				{blanking ? (
					<BlankPrompt
						onCancel={() => setBlanking(false)}
						onSave={(reason) => {
							state.blank(entry, locale, reason);
							setBlanking(false);
						}}
					/>
				) : target.state === "blank" && !dirty ? (
					<button
						type="button"
						{...plumbing}
						className={cn(
							"w-full px-2 py-1 text-left text-[13px] text-muted-foreground/70 italic leading-relaxed hover:bg-muted/40",
						)}
						onClick={() => state.setDraft(entry, locale, " ")}
						title="Write a value instead"
					>
						Renders nothing — {target.reason}
					</button>
				) : sourceArms && entry.plural ? (
					<PluralArms
						entry={entry}
						locale={locale}
						value={value}
						sourceArms={sourceArms.arms}
						onChange={(next) => state.setDraft(entry, locale, next)}
						plumbing={plumbing}
					/>
				) : (
					<Textarea
						aria-label={`${LOCALE_LABEL[locale]} — ${entry.key}`}
						className={cn(FIELD_BASE, clamp)}
						placeholder={waiting ? "—" : undefined}
						spellCheck
						value={value}
						onChange={(event) =>
							state.setDraft(entry, locale, event.target.value)
						}
						{...plumbing}
					/>
				)}

				<RowNote
					entry={entry}
					locale={locale}
					state={state}
					target={target}
					value={value}
					dirty={dirty}
					focused={focused}
					onBlank={() => setBlanking(true)}
				/>
			</div>
		</div>
	);
}

/**
 * The only thing allowed under a value, and only when there is something to
 * say. A settled, unfocused row renders nothing at all — which is what makes
 * a page of forty values readable.
 */
function RowNote({
	entry,
	locale,
	state,
	target,
	value,
	dirty,
	focused,
	onBlank,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	state: EditorState;
	target: TargetValue;
	value: string;
	dirty: boolean;
	focused: boolean;
	onBlank: () => void;
}) {
	const stale =
		target.state === "stale-semantic" || target.state === "stale-cosmetic";

	if (!focused && !dirty) {
		const label = STATE_LABEL[target.state];
		if (!label) return null;
		return (
			<p className={cn("px-2 pb-0.5 text-[11px]", STATE_TONE[target.state])}>
				{target.state === "broken" ? target.note : label}
			</p>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 pb-0.5 text-[11px] text-muted-foreground/70">
			{dirty ? (
				<span>⌘↵ save</span>
			) : stale ? (
				<button
					type="button"
					className="text-amber-600 underline underline-offset-2 dark:text-amber-500"
					// mousedown, not click: blur must not beat the press.
					onMouseDown={(event) => {
						event.preventDefault();
						state.commit(entry, locale);
					}}
				>
					⌘↵ still correct
				</button>
			) : null}

			{locale === REFERENCE && dirty ? (
				<span>editing English proposes a change to Git</span>
			) : null}
			{locale !== REFERENCE && value && value === entry.source ? (
				<span>identical to English — saving records that as the decision</span>
			) : null}
			{target.state === "broken" ? (
				<span className="text-destructive">{target.note}</span>
			) : null}

			{target.state !== "blank" ? (
				<button
					type="button"
					className="ml-auto underline underline-offset-2 hover:text-foreground"
					onMouseDown={(event) => {
						event.preventDefault();
						onBlank();
					}}
				>
					deliberately empty
				</button>
			) : null}
		</div>
	);
}

/** One line per plural category the target language needs. Always visible. */
function PluralArms({
	entry,
	locale,
	value,
	sourceArms,
	onChange,
	plumbing,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	value: string;
	sourceArms: { category: string; body: string }[];
	onChange: (next: string) => void;
	plumbing: Record<string, unknown>;
}) {
	const parsed = splitPluralArms(value);
	const needed = PLURAL_CATEGORIES[locale];
	const extra = (parsed?.arms ?? [])
		.map((arm) => arm.category)
		.filter((category) => !needed.includes(category));
	const categories = [...needed, ...extra];
	const armOf = (category: string) =>
		parsed?.arms.find((arm) => arm.category === category)?.body ?? "";
	const sourceArmOf = (category: string) =>
		sourceArms.find((arm) => arm.category === category)?.body ??
		sourceArms.find((arm) => arm.category === "other")?.body ??
		"";

	return (
		<div className="flex flex-col">
			{categories.map((category) => (
				<div key={category} className="flex items-baseline gap-2">
					<span
						className={cn(
							"w-11 shrink-0 pl-2 font-mono text-[10px]",
							needed.includes(category)
								? "text-muted-foreground/60"
								: "text-muted-foreground/40 line-through",
						)}
					>
						{category}
					</span>
					<Textarea
						aria-label={`${LOCALE_LABEL[locale]} ${category} — ${entry.key}`}
						className={cn(FIELD_BASE, "min-h-0")}
						placeholder={sourceArmOf(category)}
						value={armOf(category)}
						onChange={(event) => {
							const arms = categories
								.map((item) => ({
									category: item,
									body: item === category ? event.target.value : armOf(item),
								}))
								.filter((arm) => arm.body !== "");
							onChange(
								arms.length
									? joinPluralArms(
											parsed?.arg ?? entry.plural?.arg ?? "count",
											arms,
										)
									: "",
							);
						}}
						{...plumbing}
					/>
				</div>
			))}
		</div>
	);
}

function BlankPrompt({
	onCancel,
	onSave,
}: {
	onCancel: () => void;
	onSave: (reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	const ref = useRef<HTMLInputElement>(null);
	useEffect(() => ref.current?.focus(), []);
	return (
		<div className="flex flex-col gap-1.5 py-1">
			<Input
				ref={ref}
				className="h-7 text-[13px]"
				placeholder="Why should this render as nothing?"
				value={reason}
				onChange={(event) => setReason(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && reason.trim()) onSave(reason.trim());
					if (event.key === "Escape") onCancel();
				}}
			/>
			<p className="text-[11px] text-muted-foreground/70">
				The reason stays with the value across snapshots. Enter to record, Esc
				to cancel.
			</p>
		</div>
	);
}

// ────────────────────────────────────────────────────────────── G — Stack

function KeyBlock({
	entry,
	state,
	mode,
	dense,
}: {
	entry: KeyEntry;
	state: EditorState;
	mode?: "open" | "line";
	dense?: boolean;
}) {
	return (
		<section className="flex flex-col gap-2 py-4">
			<KeyHeader entry={entry} waiting={waitingCount(entry, state)} />
			<ChangeNote entry={entry} />
			<div className="-ml-0.5 flex flex-col">
				{LOCALES.map((locale) => (
					<LocaleRow
						key={locale}
						entry={entry}
						locale={locale}
						state={state}
						mode={mode}
						dense={dense}
					/>
				))}
			</div>
		</section>
	);
}

// ───────────────────────────────────────────────────────────── H — Reader

function KeyIndex({
	entries,
	selected,
	onSelect,
	state,
}: {
	entries: KeyEntry[];
	selected: string;
	onSelect: (key: string) => void;
	state: EditorState;
}) {
	return (
		<nav className="flex flex-col gap-px">
			{entries.map((entry) => {
				const waiting = waitingCount(entry, state);
				const active = entry.key === selected;
				return (
					<button
						key={entry.key}
						type="button"
						onClick={() => onSelect(entry.key)}
						className={cn(
							"flex items-baseline gap-2 px-2 py-1.5 text-left transition-colors",
							active
								? "bg-muted text-foreground"
								: "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
						)}
					>
						<span className="min-w-0 flex-1 truncate font-mono text-[11px]">
							{entry.key}
						</span>
						{waiting ? (
							<span className="shrink-0 text-[11px] text-amber-600 tabular-nums dark:text-amber-500">
								{waiting}
							</span>
						) : null}
					</button>
				);
			})}
		</nav>
	);
}

// ───────────────────────────────────────────────────────────────── hosting

type Variant = "G" | "H" | "I";

function StringsHost({
	variant,
	state,
	selectedKey,
	onSelectKey,
}: {
	variant: Variant;
	state: EditorState;
	selectedKey: string;
	onSelectKey: (key: string) => void;
}) {
	if (variant === "H") {
		const entry = KEYS.find((item) => item.key === selectedKey) ?? KEYS[0];
		return (
			<div className="grid grid-cols-1 gap-8 md:grid-cols-[14rem_1fr]">
				<KeyIndex
					entries={KEYS}
					selected={entry.key}
					onSelect={onSelectKey}
					state={state}
				/>
				<div className="min-w-0">
					<KeyBlock entry={entry} state={state} />
					{entry.staged ? <StagedNote note={entry.staged} /> : null}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col divide-y">
			{KEYS.map((entry) => (
				<KeyBlock
					key={entry.key}
					entry={entry}
					state={state}
					mode={variant === "I" ? "line" : "open"}
				/>
			))}
		</div>
	);
}

/**
 * Home 2: a Reconciliation Report. Same blocks, grouped by the work each needs.
 * Rows stay open — closing them would put back the click round one died on.
 */
function ReportHost({
	variant,
	state,
	selectedKey,
	onSelectKey,
}: {
	variant: Variant;
	state: EditorState;
	selectedKey: string;
	onSelectKey: (key: string) => void;
}) {
	const rows = KEYS.filter((entry) => REPORT_ROWS[entry.key]);
	const groups = REPORT_GROUP_ORDER.filter((group) =>
		rows.some((entry) => REPORT_ROWS[entry.key] === group),
	);

	if (variant === "H") {
		const entry = rows.find((item) => item.key === selectedKey) ?? rows[0];
		return (
			<div className="grid grid-cols-1 gap-8 md:grid-cols-[14rem_1fr]">
				<div className="flex flex-col gap-4">
					{groups.map((group) => (
						<div key={group} className="flex flex-col gap-1">
							<span className="px-2 text-[11px] text-muted-foreground/60">
								{group}
							</span>
							<KeyIndex
								entries={rows.filter((item) => REPORT_ROWS[item.key] === group)}
								selected={entry.key}
								onSelect={onSelectKey}
								state={state}
							/>
						</div>
					))}
				</div>
				<div className="min-w-0">
					<KeyBlock entry={entry} state={state} />
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-8">
			{groups.map((group) => (
				<div key={group} className="flex flex-col">
					<h2 className="border-b pb-2 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
						{group}
					</h2>
					<div className="flex flex-col divide-y">
						{rows
							.filter((entry) => REPORT_ROWS[entry.key] === group)
							.map((entry) => (
								<KeyBlock
									key={entry.key}
									entry={entry}
									state={state}
									mode={variant === "I" ? "line" : "open"}
								/>
							))}
					</div>
				</div>
			))}
		</div>
	);
}

function StagedNote({ note }: { note: string }) {
	return (
		<p className="mt-6 border-t pt-2 text-[11px] text-muted-foreground/50">
			Fixture note — {note}
		</p>
	);
}

// ────────────────────────────────────────────────────────────────── route

function PrototypeEditorRoute() {
	const { variant, context, key } = Route.useSearch();
	const navigate = Route.useNavigate();
	const state = useEditorState();
	const current = (
		["G", "H", "I"].includes(variant) ? variant : "G"
	) as Variant;
	const Host = context === "report" ? ReportHost : StringsHost;

	return (
		<ProjectShell projectId="prototype" title="Brickit">
			<PageHeader
				title={context === "report" ? "Reconciliation Report" : "Strings"}
				description="Six Locales, none of them a source panel. Click any value and type; ⌘↵ saves and goes to the next one still waiting."
				action={
					<div className="flex items-center gap-1">
						{(
							[
								["strings", "Strings"],
								["report", "Report"],
							] as const
						).map(([value, label]) => (
							<Button
								key={value}
								size="xs"
								variant={context === value ? "secondary" : "ghost"}
								onClick={() =>
									navigate({
										search: { variant: current, context: value, key },
									})
								}
							>
								{label}
							</Button>
						))}
						<Separator orientation="vertical" className="mx-1 h-4" />
						<Button size="xs" variant="ghost" onClick={state.reset}>
							Reset
						</Button>
					</div>
				}
			/>
			<Host
				variant={current}
				state={state}
				selectedKey={key ?? KEYS[0].key}
				onSelectKey={(next) =>
					navigate({ search: { variant: current, context, key: next } })
				}
			/>
			<div className="h-20" />
			<PrototypeVariantSwitcher
				variants={VARIANTS}
				current={current}
				onChange={(next) =>
					navigate({ search: { variant: next, context, key } })
				}
			/>
		</ProjectShell>
	);
}
