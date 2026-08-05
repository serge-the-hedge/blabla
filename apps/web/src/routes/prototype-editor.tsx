// PROTOTYPE ONLY — throwaway. Round two of the per-key, many-Locale editing
// block, at /prototype-editor?variant=. Answers "Prototype the per-key
// translation editor" (#24). Delete with the branch that holds it.
//
// Round one (A–C, in this branch's history) was rejected on one point that
// invalidated all three: every variant put a click between the translator and
// the field. Round two takes that as the governing constraint —
//
//   *Every value on screen is already a live field. Typing is the zero-click
//    act. Only deliberate, rare decisions cost a click.*
//
// D — Ledger:   per-key card, every Locale a live row under the source.
// E — Grid:     keys down, Locales across, every cell live. The translator's
//               workhorse: Tab across a key, Enter down a Locale.
// F — Language: one Locale at a time, source and target paired full-width,
//               the whole catalog front to back.
//
// Also gone: the "Use English here" button. Putting English in a target is
// typing English into the field, and the field says so as you do it.
//
// The `context` param puts the same block in both homes it has to work in:
// the Strings page, and inlined in a Reconciliation Report row.

import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import { Input } from "@blabla/ui/components/input";
import { Separator } from "@blabla/ui/components/separator";
import { Textarea } from "@blabla/ui/components/textarea";
import { cn } from "@blabla/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { Check, CircleSlash, Sparkles } from "lucide-react";
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
	type LocaleCode,
	PLURAL_CATEGORIES,
	REPORT_GROUP_ORDER,
	REPORT_ROWS,
	STATE_BLOCKS,
	STATE_LABEL,
	splitPluralArms,
	TARGETS,
	type TargetValue,
	type ValueState,
	wordDiff,
} from "@/components/localization/prototype-editor-data";
import { PrototypeVariantSwitcher } from "@/components/localization/prototype-variant-switcher";

export const Route = createFileRoute("/prototype-editor")({
	validateSearch: (search: Record<string, unknown>) => ({
		variant: typeof search.variant === "string" ? search.variant : "D",
		context: search.context === "report" ? "report" : "strings",
		locale:
			typeof search.locale === "string" &&
			TARGETS.includes(search.locale as LocaleCode)
				? (search.locale as LocaleCode)
				: "de",
	}),
	component: PrototypeEditorRoute,
});

const VARIANTS = [
	{ key: "D", name: "Ledger — every Locale live under the source" },
	{ key: "E", name: "Grid — keys down, Locales across" },
	{ key: "F", name: "Language — one Locale, front to back" },
];

const ME = "Sergey";
const NOW = "today";

// ───────────────────────────────────────────────────────────────────── state
//
// One store for all three variants. Drafts live beside saved values so a field
// is always typeable without any per-field mounting ceremony, and `commit` is
// the single gesture behind blur, ⌘↵, and the confirm button.

const idOf = (entry: KeyEntry, locale: LocaleCode) => `${entry.key}:${locale}`;

function useEditorState() {
	const [saved, setSaved] = useState<Record<string, TargetValue>>({});
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [flash, setFlash] = useState<string | null>(null);

	const stored = useCallback(
		(entry: KeyEntry, locale: LocaleCode): TargetValue =>
			saved[idOf(entry, locale)] ?? entry.targets[locale],
		[saved],
	);

	const draft = useCallback(
		(entry: KeyEntry, locale: LocaleCode): string => {
			const id = idOf(entry, locale);
			return drafts[id] ?? stored(entry, locale).value;
		},
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
			setFlash(id);
			window.setTimeout(
				() => setFlash((live) => (live === id ? null : live)),
				900,
			);
		},
		[],
	);

	/**
	 * The one gesture. Touched the value → it is an edit. Left it alone and it
	 * was stale → it is a confirmation. Left it alone and it was not stale →
	 * nothing happened, and nothing should.
	 */
	const commit = useCallback(
		(entry: KeyEntry, locale: LocaleCode): boolean => {
			const current = stored(entry, locale);
			const next = draft(entry, locale);
			if (next !== current.value) {
				write(entry, locale, {
					value: next,
					state: next === entry.source ? "identical" : "current",
					reason: undefined,
					note: undefined,
				});
				return true;
			}
			if (
				current.state === "stale-semantic" ||
				current.state === "stale-cosmetic"
			) {
				write(entry, locale, { state: "current" });
				return true;
			}
			return false;
		},
		[draft, stored, write],
	);

	return {
		stored,
		draft,
		setDraft,
		commit,
		flash,
		/** A blank ships only with a reason. This is the one click worth charging. */
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

/**
 * ⌘↵ jumps to the next field still waiting on someone, skipping everything
 * settled — the difference between working a catalog and scrolling one. Field
 * order is DOM order, so each variant gets the traversal its layout implies
 * without declaring one.
 */
function focusNextUnsettled(from: HTMLElement) {
	const fields = Array.from(
		document.querySelectorAll<HTMLElement>("[data-field]"),
	);
	const index = fields.indexOf(from);
	if (index < 0) return;
	const next =
		fields.slice(index + 1).find((el) => el.dataset.settled === "false") ??
		fields.slice(0, index).find((el) => el.dataset.settled === "false");
	next?.focus();
	if (next instanceof HTMLTextAreaElement || next instanceof HTMLInputElement) {
		next.setSelectionRange(next.value.length, next.value.length);
	}
}

// ────────────────────────────────────────────────────────────── vocabulary

const STATE_TONE: Record<ValueState, string> = {
	current: "text-muted-foreground",
	identical: "text-muted-foreground",
	blank: "text-muted-foreground",
	"stale-cosmetic": "text-muted-foreground",
	"stale-semantic": "text-amber-700 dark:text-amber-400",
	"imported-identical": "text-amber-700 dark:text-amber-400",
	undecided: "text-amber-700 dark:text-amber-400",
	broken: "text-destructive",
};

const STATE_EDGE: Record<ValueState, string> = {
	current: "border-l-emerald-500/40",
	identical: "border-l-muted-foreground/30",
	blank: "border-l-muted-foreground/30",
	"stale-cosmetic": "border-l-muted-foreground/40",
	"stale-semantic": "border-l-amber-500",
	"imported-identical": "border-l-amber-500",
	undecided: "border-l-amber-500",
	broken: "border-l-destructive",
};

function StateDot({ state }: { state: ValueState }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				state === "broken"
					? "bg-destructive"
					: STATE_BLOCKS[state]
						? "bg-amber-500"
						: state === "blank" || state === "identical"
							? "bg-muted-foreground/40 ring-1 ring-muted-foreground/40"
							: "bg-emerald-500",
			)}
		/>
	);
}

function SourceChangeStrip({
	entry,
	compact,
}: {
	entry: KeyEntry;
	compact?: boolean;
}) {
	if (!entry.change) return null;
	const cosmetic = entry.change.kind === "cosmetic";
	const diff = wordDiff(entry.change.was, entry.change.now);
	return (
		<div
			className={cn(
				"flex flex-col gap-0.5 border-l-2 py-1 pr-2 pl-2.5",
				cosmetic
					? "border-l-muted-foreground/30 bg-muted/40"
					: "border-l-amber-500 bg-amber-500/5",
			)}
		>
			<div className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
				<span
					className={cn(
						"font-medium uppercase tracking-wide",
						cosmetic
							? "text-muted-foreground"
							: "text-amber-700 dark:text-amber-400",
					)}
				>
					{cosmetic
						? "Cosmetic — ships either way"
						: entry.change.kind === "contract"
							? "Contract — cannot ship until repaired"
							: "Meaning — will not ship until answered"}
				</span>
				<span className="text-muted-foreground">{entry.change.summary}</span>
			</div>
			{compact ? null : (
				<div className="text-[11px] leading-relaxed" dir="auto">
					{diff.map((segment, index) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: static diff, never reordered
							key={index}
							className={cn(
								segment.kind === "removed" &&
									"bg-destructive/10 text-destructive line-through",
								segment.kind === "added" &&
									"bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
								segment.kind === "same" && "text-muted-foreground",
							)}
						>
							{segment.text}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

// ────────────────────────────────────────────────────────────── the field
//
// The whole point of round two. This is never a button, never a disclosure,
// never a mode. It is on screen, focusable, and typeable from the first paint.

type FieldProps = {
	entry: KeyEntry;
	locale: LocaleCode;
	state: EditorState;
	/** Extra classes for the input itself, so each variant can set its density. */
	className?: string;
	/** Rendered under the field when it has focus. */
	footer?: "inline" | "none";
};

function useFieldPlumbing(
	entry: KeyEntry,
	locale: LocaleCode,
	state: EditorState,
) {
	const target = state.stored(entry, locale);
	const value = state.draft(entry, locale);
	const dirty = value !== target.value;
	const settled = !STATE_BLOCKS[target.state] && !dirty;

	const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			state.commit(entry, locale);
			focusNextUnsettled(event.currentTarget);
			return;
		}
		if (event.key === "Escape" && dirty) {
			event.preventDefault();
			state.revert(entry, locale);
		}
	};

	return { target, value, dirty, settled, onKeyDown };
}

function LiveField({
	entry,
	locale,
	state,
	className,
	footer = "inline",
}: FieldProps) {
	const { target, value, dirty, settled, onKeyDown } = useFieldPlumbing(
		entry,
		locale,
		state,
	);
	const [focused, setFocused] = useState(false);
	const [blanking, setBlanking] = useState(false);
	const sourceArms = entry.plural ? splitPluralArms(entry.source) : null;
	const flashing = state.flash === idOf(entry, locale);

	const shared = {
		"data-field": true,
		"data-settled": settled ? "true" : "false",
		dir: "auto" as const,
		onKeyDown,
		onFocus: () => setFocused(true),
		onBlur: () => {
			setFocused(false);
			if (dirty) state.commit(entry, locale);
		},
	};

	if (blanking) {
		return (
			<BlankPrompt
				onCancel={() => setBlanking(false)}
				onSave={(reason) => {
					state.blank(entry, locale, reason);
					setBlanking(false);
				}}
			/>
		);
	}

	return (
		<div className="flex min-w-0 flex-col gap-1">
			{target.state === "blank" && !dirty ? (
				<div
					className={cn(
						"flex items-baseline gap-1.5 border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground",
						className,
					)}
				>
					<CircleSlash aria-hidden="true" className="size-3 shrink-0" />
					<span>
						<em>Renders nothing</em> — {target.reason}
					</span>
					<button
						type="button"
						{...shared}
						className="ml-auto shrink-0 underline underline-offset-2 hover:text-foreground"
						onClick={() => state.setDraft(entry, locale, " ")}
					>
						Write a value instead
					</button>
				</div>
			) : sourceArms && entry.plural ? (
				<PluralArms
					entry={entry}
					locale={locale}
					value={value}
					sourceArms={sourceArms.arms}
					onChange={(next) => state.setDraft(entry, locale, next)}
					shared={shared}
					className={className}
				/>
			) : (
				<Textarea
					aria-label={`${LOCALE_LABEL[locale]} — ${entry.key}`}
					className={cn(
						"field-sizing-content min-h-8 resize-none py-1.5 text-xs leading-relaxed",
						flashing && "border-emerald-500/60",
						className,
					)}
					placeholder={target.state === "undecided" ? "—" : undefined}
					spellCheck
					value={value}
					onChange={(event) =>
						state.setDraft(entry, locale, event.target.value)
					}
					{...shared}
				/>
			)}

			{footer === "inline" ? (
				<FieldFooter
					entry={entry}
					locale={locale}
					state={state}
					target={target}
					value={value}
					dirty={dirty}
					focused={focused}
					flashing={flashing}
					onBlank={() => setBlanking(true)}
				/>
			) : null}
		</div>
	);
}

/**
 * One input per plural category the *target language* needs — zh gets one, ru
 * gets four, for the same key. Always rendered; never behind a disclosure.
 */
function PluralArms({
	entry,
	locale,
	value,
	sourceArms,
	onChange,
	shared,
	className,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	value: string;
	sourceArms: { category: string; body: string }[];
	onChange: (next: string) => void;
	shared: Record<string, unknown>;
	className?: string;
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
		<div className="flex flex-col gap-1">
			{categories.map((category) => (
				<div key={category} className="flex items-center gap-1.5">
					<span
						className={cn(
							"w-10 shrink-0 text-right font-mono text-[10px]",
							needed.includes(category)
								? "text-muted-foreground"
								: "text-muted-foreground/50 line-through",
						)}
					>
						{category}
					</span>
					<Input
						aria-label={`${LOCALE_LABEL[locale]} ${category} — ${entry.key}`}
						className={cn("h-7 min-w-0 flex-1 text-xs", className)}
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
						{...shared}
					/>
				</div>
			))}
		</div>
	);
}

/**
 * Everything under the field. It never occupies space that the field wants,
 * and it never contains anything the translator must click to type.
 */
function FieldFooter({
	entry,
	locale,
	state,
	target,
	value,
	dirty,
	focused,
	flashing,
	onBlank,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	state: EditorState;
	target: TargetValue;
	value: string;
	dirty: boolean;
	focused: boolean;
	flashing: boolean;
	onBlank: () => void;
}) {
	const stale =
		target.state === "stale-semantic" || target.state === "stale-cosmetic";

	if (flashing) {
		return (
			<span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
				<Check aria-hidden="true" className="size-3" />
				Saved
			</span>
		);
	}

	if (target.state === "broken" && !dirty) {
		return <span className="text-[10px] text-destructive">{target.note}</span>;
	}

	if (!focused && !dirty) {
		return (
			<span className="flex items-center gap-1.5 text-[10px]">
				<span className={STATE_TONE[target.state]}>
					{STATE_LABEL[target.state]}
				</span>
				{target.by ? (
					<span className="text-muted-foreground/70">
						{target.by}, {target.at}
					</span>
				) : null}
			</span>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
			{stale && !dirty ? (
				<button
					type="button"
					className="font-medium text-amber-700 underline underline-offset-2 dark:text-amber-400"
					// onMouseDown, not onClick: the field's blur must not beat the click.
					onMouseDown={(event) => {
						event.preventDefault();
						state.commit(entry, locale);
					}}
				>
					⌘↵ Still correct
				</button>
			) : dirty ? (
				<span className="text-muted-foreground">⌘↵ Save and go on</span>
			) : null}
			{value === entry.source && entry.source ? (
				<span className="text-muted-foreground">
					Identical to English — saving records that as the decision
				</span>
			) : null}
			{target.state !== "blank" ? (
				<button
					type="button"
					className="ml-auto inline-flex items-center gap-1 text-muted-foreground underline underline-offset-2 hover:text-foreground"
					onMouseDown={(event) => {
						event.preventDefault();
						onBlank();
					}}
				>
					<CircleSlash aria-hidden="true" className="size-3" />
					Deliberately empty
				</button>
			) : null}
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
		<div className="flex flex-col gap-1.5 border border-dashed p-2">
			<span className="text-[10px] text-muted-foreground">
				A blank ships only with a reason, and the reason stays with the value
				across snapshots. Why should this render as nothing?
			</span>
			<Input
				ref={ref}
				className="h-7 text-xs"
				placeholder="Row is icon-only in German — the label overflows the chip."
				value={reason}
				onChange={(event) => setReason(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && reason.trim()) onSave(reason.trim());
					if (event.key === "Escape") onCancel();
				}}
			/>
			<div className="flex justify-end gap-1.5">
				<Button size="xs" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					size="xs"
					disabled={!reason.trim()}
					onClick={() => onSave(reason.trim())}
				>
					Record blank
				</Button>
			</div>
		</div>
	);
}

function SourceLine({ entry }: { entry: KeyEntry }) {
	return (
		<p className="text-xs leading-relaxed" dir="auto">
			{entry.source}
		</p>
	);
}

function KeyIdentity({ entry }: { entry: KeyEntry }) {
	return (
		<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
			<span className="truncate font-mono text-[11px]">{entry.key}</span>
			{entry.screen ? (
				<Badge variant="outline" className="h-4 px-1 font-normal text-[10px]">
					{entry.screen}
				</Badge>
			) : null}
		</div>
	);
}

// ───────────────────────────────────────────────────────────── D — Ledger

function VariantD({ entry, state }: { entry: KeyEntry; state: EditorState }) {
	return (
		<div className="flex flex-col gap-2">
			<KeyIdentity entry={entry} />
			<SourceChangeStrip entry={entry} />

			<div className="flex items-start gap-2 border-y bg-muted/40 px-2 py-1.5">
				<span className="flex w-20 shrink-0 items-center gap-1.5 pt-px">
					<Sparkles aria-hidden="true" className="size-3 text-brand" />
					<span className="font-mono text-[11px]">en</span>
				</span>
				<div className="min-w-0 flex-1">
					<SourceLine entry={entry} />
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				{TARGETS.map((locale) => {
					const target = state.stored(entry, locale);
					return (
						<div key={locale} className="flex items-start gap-2">
							<span className="flex w-20 shrink-0 items-center gap-1.5 pt-1.5">
								<StateDot state={target.state} />
								<span className="font-mono text-[11px]">{locale}</span>
								<span className="truncate text-[10px] text-muted-foreground">
									{LOCALE_LABEL[locale]}
								</span>
							</span>
							<div className="min-w-0 flex-1">
								<LiveField entry={entry} locale={locale} state={state} />
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────── E — Grid

function GridHeader() {
	return (
		<div className="sticky top-0 z-10 flex gap-2 border-b bg-background px-2 py-1.5">
			<span className="w-[22%] shrink-0 text-[10px] text-muted-foreground uppercase tracking-wide">
				Key and English
			</span>
			{TARGETS.map((locale) => (
				<span
					key={locale}
					className="min-w-0 flex-1 text-[10px] text-muted-foreground uppercase tracking-wide"
				>
					{locale} · {LOCALE_LABEL[locale]}
				</span>
			))}
		</div>
	);
}

function VariantERow({
	entry,
	state,
}: {
	entry: KeyEntry;
	state: EditorState;
}) {
	return (
		<div className="flex flex-col gap-1 px-2 py-2">
			<div className="flex gap-2">
				<div className="flex w-[22%] shrink-0 flex-col gap-1">
					<KeyIdentity entry={entry} />
					<SourceLine entry={entry} />
				</div>
				{TARGETS.map((locale) => {
					const target = state.stored(entry, locale);
					return (
						<div
							key={locale}
							className={cn(
								"min-w-0 flex-1 border-l-2 pl-1.5",
								STATE_EDGE[target.state],
							)}
						>
							<LiveField
								entry={entry}
								locale={locale}
								state={state}
								className="text-[11px]"
							/>
						</div>
					);
				})}
			</div>
			{entry.change ? <SourceChangeStrip entry={entry} compact /> : null}
		</div>
	);
}

// ─────────────────────────────────────────────────────────── F — Language

function VariantFRow({
	entry,
	locale,
	state,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	state: EditorState;
}) {
	const target = state.stored(entry, locale);
	return (
		<div className="flex flex-col gap-1.5 px-3 py-2.5">
			<div className="flex items-baseline justify-between gap-3">
				<KeyIdentity entry={entry} />
				<span className="flex shrink-0 items-center gap-1">
					{TARGETS.map((item) => {
						const other = state.stored(entry, item);
						return (
							<span
								key={item}
								title={`${LOCALE_LABEL[item]} — ${STATE_LABEL[other.state]}`}
								className={cn(
									"inline-flex items-center gap-0.5 font-mono text-[10px]",
									item === locale
										? "text-foreground"
										: "text-muted-foreground/60",
								)}
							>
								<StateDot state={other.state} />
								{item}
							</span>
						);
					})}
				</span>
			</div>
			<SourceChangeStrip entry={entry} />
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div className="flex min-w-0 flex-col gap-1 border-l-2 border-l-brand/40 pl-2">
					<span className="text-[10px] text-muted-foreground uppercase tracking-wide">
						English
					</span>
					<SourceLine entry={entry} />
				</div>
				<div
					className={cn("min-w-0 border-l-2 pl-2", STATE_EDGE[target.state])}
				>
					<LiveField entry={entry} locale={locale} state={state} />
				</div>
			</div>
		</div>
	);
}

function LanguageBar({
	locale,
	onPick,
	state,
}: {
	locale: LocaleCode;
	onPick: (next: LocaleCode) => void;
	state: EditorState;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1 border-b pb-2">
			{TARGETS.map((item) => {
				const waiting = KEYS.filter(
					(entry) => STATE_BLOCKS[state.stored(entry, item).state],
				).length;
				return (
					<Button
						key={item}
						size="xs"
						variant={item === locale ? "secondary" : "ghost"}
						onClick={() => onPick(item)}
					>
						{LOCALE_LABEL[item]}
						<span
							className={cn(
								"ml-1 tabular-nums",
								waiting
									? "text-amber-700 dark:text-amber-400"
									: "text-muted-foreground",
							)}
						>
							{waiting || "✓"}
						</span>
					</Button>
				);
			})}
		</div>
	);
}

// ───────────────────────────────────────────────────────────────── hosting

type Variant = "D" | "E" | "F";

function StringsHost({
	variant,
	locale,
	state,
	onPickLocale,
}: {
	variant: Variant;
	locale: LocaleCode;
	state: EditorState;
	onPickLocale: (next: LocaleCode) => void;
}) {
	if (variant === "E") {
		return (
			<div className="flex flex-col border">
				<GridHeader />
				<div className="flex flex-col divide-y">
					{KEYS.map((entry) => (
						<VariantERow key={entry.key} entry={entry} state={state} />
					))}
				</div>
			</div>
		);
	}

	if (variant === "F") {
		return (
			<div className="flex flex-col gap-2">
				<LanguageBar locale={locale} onPick={onPickLocale} state={state} />
				<div className="flex flex-col divide-y border">
					{KEYS.map((entry) => (
						<VariantFRow
							key={entry.key}
							entry={entry}
							locale={locale}
							state={state}
						/>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{KEYS.map((entry) => (
				<Card key={entry.key} size="sm">
					<CardContent>
						<VariantD entry={entry} state={state} />
						{entry.staged ? <StagedNote note={entry.staged} /> : null}
					</CardContent>
				</Card>
			))}
		</div>
	);
}

/**
 * Home 2: the Reconciliation Report. Rows are open — closing them would put
 * back the click round one was rejected for. The cost is a longer page, which
 * is the trade this variant round is asking about.
 */
function ReportHost({
	variant,
	locale,
	state,
	onPickLocale,
}: {
	variant: Variant;
	locale: LocaleCode;
	state: EditorState;
	onPickLocale: (next: LocaleCode) => void;
}) {
	const rows = KEYS.filter((entry) => REPORT_ROWS[entry.key]);
	const groups = REPORT_GROUP_ORDER.filter((group) =>
		rows.some((entry) => REPORT_ROWS[entry.key] === group),
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
				Reconciliation Report ·{" "}
				<span className="font-mono">develop @ 19a07bc</span> · ingested today.
				Every row is already editable — the report is a worklist, so opening one
				should not be a step.
			</div>
			{variant === "F" ? (
				<LanguageBar locale={locale} onPick={onPickLocale} state={state} />
			) : null}
			{groups.map((group) => (
				<div key={group} className="flex flex-col gap-1.5">
					<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
						{group}
					</span>
					<div className="flex flex-col divide-y border">
						{variant === "E" ? <GridHeader /> : null}
						{rows
							.filter((entry) => REPORT_ROWS[entry.key] === group)
							.map((entry) =>
								variant === "E" ? (
									<VariantERow key={entry.key} entry={entry} state={state} />
								) : variant === "F" ? (
									<VariantFRow
										key={entry.key}
										entry={entry}
										locale={locale}
										state={state}
									/>
								) : (
									<div key={entry.key} className="px-2.5 py-2.5">
										<VariantD entry={entry} state={state} />
									</div>
								),
							)}
					</div>
				</div>
			))}
		</div>
	);
}

function StagedNote({ note }: { note: string }) {
	return (
		<p className="mt-3 border-t pt-2 text-[10px] text-muted-foreground/70">
			Fixture note — {note}
		</p>
	);
}

// ────────────────────────────────────────────────────────────────── route

function PrototypeEditorRoute() {
	const { variant, context, locale } = Route.useSearch();
	const navigate = Route.useNavigate();
	const state = useEditorState();
	const current = (
		["D", "E", "F"].includes(variant) ? variant : "D"
	) as Variant;

	const Host = context === "report" ? ReportHost : StringsHost;

	return (
		<ProjectShell projectId="prototype" title="Brickit">
			<PageHeader
				title={context === "report" ? "Reconciliation Report" : "Strings"}
				description="Every value is a live field. Tab walks them, ⌘↵ saves and jumps to the next one still waiting, Esc reverts."
				action={
					<div className="flex items-center gap-1">
						{(
							[
								["strings", "Strings page"],
								["report", "Report row"],
							] as const
						).map(([value, label]) => (
							<Button
								key={value}
								size="xs"
								variant={context === value ? "secondary" : "ghost"}
								onClick={() =>
									navigate({
										search: { variant: current, context: value, locale },
									})
								}
							>
								{label}
							</Button>
						))}
						<Separator orientation="vertical" className="mx-1 h-4" />
						<Button size="xs" variant="ghost" onClick={state.reset}>
							Reset edits
						</Button>
					</div>
				}
			/>
			<Host
				variant={current}
				locale={locale}
				state={state}
				onPickLocale={(next) =>
					navigate({ search: { variant: current, context, locale: next } })
				}
			/>
			<div className="h-16" />
			<PrototypeVariantSwitcher
				variants={VARIANTS}
				current={current}
				onChange={(key) =>
					navigate({ search: { variant: key, context, locale } })
				}
			/>
		</ProjectShell>
	);
}
