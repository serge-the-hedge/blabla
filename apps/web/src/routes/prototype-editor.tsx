// PROTOTYPE ONLY — throwaway. Three variants of the per-key, many-Locale
// editing block on one route, switchable via ?variant=. Answers "Prototype the
// per-key translation editor" (#24). Delete with the branch that holds it.
//
// A — Ledger:    every Locale, one line each. Scanning is the primary act;
//                editing is a mode you enter on one line at a time.
// B — Focus:     one Locale at a time behind a rail. Doing the work is the
//                primary act; cross-locale scanning is demoted to dots.
// C — Attention: only what is unsettled, grouped by the decision it waits for.
//                Settled Locales collapse to one line.
//
// The `context` search param puts the same block in both homes it has to work
// in: the Strings page, and inlined under a Reconciliation Report row.

import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import { Input } from "@blabla/ui/components/input";
import { Separator } from "@blabla/ui/components/separator";
import { Textarea } from "@blabla/ui/components/textarea";
import { cn } from "@blabla/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import {
	ChevronDown,
	ChevronRight,
	CircleSlash,
	Equal,
	Languages,
	Pencil,
	ShieldAlert,
	Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import {
	ATTENTION_LABEL,
	type Attention,
	joinPluralArms,
	KEYS,
	type KeyEntry,
	LOCALE_LABEL,
	type LocaleCode,
	PLURAL_CATEGORIES,
	REPORT_GROUP_ORDER,
	REPORT_ROWS,
	STATE_ATTENTION,
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
		variant: typeof search.variant === "string" ? search.variant : "A",
		context: search.context === "report" ? "report" : "strings",
	}),
	component: PrototypeEditorRoute,
});

const VARIANTS = [
	{ key: "A", name: "Ledger — every Locale, one line" },
	{ key: "B", name: "Focus — one Locale, all the room" },
	{ key: "C", name: "Attention — only what is unsettled" },
];

const ME = "Sergey";
const NOW = "today";

// ─────────────────────────────────────────────────────────────── shared state

type Edits = Record<string, TargetValue>;

function useEditorState() {
	const [edits, setEdits] = useState<Edits>({});

	const readValue = (entry: KeyEntry, locale: LocaleCode): TargetValue =>
		edits[`${entry.key}:${locale}`] ?? entry.targets[locale];

	const write = (
		entry: KeyEntry,
		locale: LocaleCode,
		next: Partial<TargetValue>,
	) =>
		setEdits((current) => ({
			...current,
			[`${entry.key}:${locale}`]: {
				...(current[`${entry.key}:${locale}`] ?? entry.targets[locale]),
				by: ME,
				at: NOW,
				...next,
			},
		}));

	return {
		readValue,
		reset: () => setEdits({}),
		/** Ordinary edit. Typing the source text is what makes it identical. */
		save: (entry: KeyEntry, locale: LocaleCode, value: string) =>
			write(entry, locale, {
				value,
				state: value === entry.source ? "identical" : "current",
				reason: undefined,
				note: undefined,
			}),
		/** Stale confirmed as still correct — the value itself does not change. */
		confirm: (entry: KeyEntry, locale: LocaleCode) =>
			write(entry, locale, { state: "current", note: undefined }),
		/** Deliberate blank. The reason is the thing that makes it shippable. */
		blank: (entry: KeyEntry, locale: LocaleCode, reason: string) =>
			write(entry, locale, { value: "", state: "blank", reason }),
	};
}

type EditorState = ReturnType<typeof useEditorState>;

// ───────────────────────────────────────────────────────── shared vocabulary
// Only the state vocabulary and the field primitives are shared. Every variant
// owns its own layout — that is the thing being compared.

const STATE_TONE: Record<ValueState, string> = {
	current: "text-muted-foreground",
	identical: "text-muted-foreground",
	blank: "text-muted-foreground",
	"stale-cosmetic": "text-amber-600 dark:text-amber-500",
	"stale-semantic": "text-amber-700 dark:text-amber-400",
	"imported-identical": "text-amber-700 dark:text-amber-400",
	undecided: "text-amber-700 dark:text-amber-400",
	broken: "text-destructive",
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

function StateLabel({ state }: { state: ValueState }) {
	return (
		<span className={cn("text-[11px]", STATE_TONE[state])}>
			{STATE_LABEL[state]}
		</span>
	);
}

function ValuePreview({
	target,
	className,
}: {
	target: TargetValue;
	className?: string;
}) {
	if (target.state === "blank") {
		return (
			<span className={cn("text-[11px] text-muted-foreground", className)}>
				<em>empty</em> — {target.reason}
			</span>
		);
	}
	if (!target.value) {
		return (
			<span className={cn("text-[11px] text-muted-foreground/60", className)}>
				—
			</span>
		);
	}
	return (
		<span className={cn("truncate text-xs", className)} dir="auto">
			{target.value}
		</span>
	);
}

function SourceChangeDiff({ entry }: { entry: KeyEntry }) {
	if (!entry.change) return null;
	const diff = wordDiff(entry.change.was, entry.change.now);
	return (
		<div className="flex flex-col gap-1 border-amber-500/50 border-l-2 bg-amber-500/5 py-1.5 pr-2 pl-2.5">
			<div className="flex items-baseline gap-2">
				<Badge
					variant="outline"
					className={cn(
						"h-4 px-1 text-[10px]",
						entry.change.kind === "cosmetic"
							? "border-muted-foreground/30 text-muted-foreground"
							: "border-amber-500/50 text-amber-700 dark:text-amber-400",
					)}
				>
					{entry.change.kind === "cosmetic"
						? "cosmetic"
						: entry.change.kind === "contract"
							? "contract"
							: "meaning"}
				</Badge>
				<span className="text-[11px] text-muted-foreground">
					{entry.change.summary}
				</span>
			</div>
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
		</div>
	);
}

/**
 * The value field. One textarea for a plain message; one field per plural
 * category the *target language* needs when the source is a plural — which is
 * why zh gets one field and ru gets four for the same key.
 */
function ValueField({
	entry,
	locale,
	value,
	onChange,
	rows,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	value: string;
	onChange: (next: string) => void;
	rows?: number;
}) {
	const sourceArms = entry.plural ? splitPluralArms(entry.source) : null;

	if (!entry.plural || !sourceArms) {
		return (
			<Textarea
				aria-label={`${LOCALE_LABEL[locale]} value`}
				className="min-h-16 text-xs leading-relaxed"
				style={rows ? { minHeight: `${rows * 1.5}rem` } : undefined}
				value={value}
				dir="auto"
				placeholder="—"
				onChange={(event) => onChange(event.target.value)}
			/>
		);
	}

	const parsed = splitPluralArms(value);
	const needed = PLURAL_CATEGORIES[locale];
	const extra = (parsed?.arms ?? [])
		.map((arm) => arm.category)
		.filter((category) => !needed.includes(category));
	const categories = [...needed, ...extra];
	const armOf = (category: string) =>
		parsed?.arms.find((arm) => arm.category === category)?.body ?? "";
	const sourceArmOf = (category: string) =>
		sourceArms.arms.find((arm) => arm.category === category)?.body ??
		sourceArms.arms.find((arm) => arm.category === "other")?.body ??
		"";

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
				<Languages aria-hidden="true" className="size-3" />
				{LOCALE_LABEL[locale]} needs {needed.length}{" "}
				{needed.length === 1 ? "form" : "forms"} for{" "}
				<code className="font-mono">{`{${entry.plural.arg}}`}</code>
			</div>
			{categories.map((category) => (
				<div key={category} className="flex items-start gap-2">
					<span
						className={cn(
							"w-12 shrink-0 pt-1.5 text-right font-mono text-[10px]",
							needed.includes(category)
								? "text-muted-foreground"
								: "text-muted-foreground/50 line-through",
						)}
					>
						{category}
					</span>
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<Input
							aria-label={`${LOCALE_LABEL[locale]} ${category} form`}
							className="h-7 text-xs"
							dir="auto"
							value={armOf(category)}
							placeholder={sourceArmOf(category)}
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
						/>
					</div>
				</div>
			))}
		</div>
	);
}

/** The prompt that makes a blank shippable: it refuses to save without a reason. */
function BlankPrompt({
	onCancel,
	onSave,
}: {
	onCancel: () => void;
	onSave: (reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	return (
		<div className="flex flex-col gap-2 border border-dashed p-2.5">
			<div className="text-[11px] text-muted-foreground">
				A blank ships only with a reason, and the reason stays with the value
				across snapshots. Why should this render as nothing?
			</div>
			<Input
				autoFocus
				className="h-7 text-xs"
				placeholder="e.g. Row is icon-only in German — the label overflows the chip."
				value={reason}
				onChange={(event) => setReason(event.target.value)}
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

/** Actions common to editing any one target — laid out by each variant. */
function EditorActions({
	entry,
	locale,
	target,
	draft,
	state,
	onDone,
	onBlank,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	target: TargetValue;
	draft: string;
	state: EditorState;
	onDone: () => void;
	onBlank: () => void;
}) {
	const dirty = draft !== target.value;
	const stale =
		target.state === "stale-semantic" || target.state === "stale-cosmetic";

	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<div className="flex flex-wrap items-center gap-1.5">
				{stale && !dirty ? (
					<Button
						size="xs"
						variant="outline"
						onClick={() => {
							state.confirm(entry, locale);
							onDone();
						}}
					>
						Still correct
					</Button>
				) : null}
				<Button size="xs" variant="ghost" onClick={onBlank}>
					<CircleSlash aria-hidden="true" data-icon="inline-start" />
					Deliberately empty…
				</Button>
				{draft !== entry.source ? (
					<Button
						size="xs"
						variant="ghost"
						title="Put the English text in, as a decision"
						onClick={() => {
							state.save(entry, locale, entry.source);
							onDone();
						}}
					>
						<Equal aria-hidden="true" data-icon="inline-start" />
						Use English here
					</Button>
				) : (
					<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
						<Equal aria-hidden="true" className="size-3" />
						Saving this records a deliberate English value
					</span>
				)}
			</div>
			<div className="flex items-center gap-1.5">
				<Button size="xs" variant="ghost" onClick={onDone}>
					Cancel
				</Button>
				<Button
					size="xs"
					disabled={!dirty && !stale}
					onClick={() => {
						state.save(entry, locale, draft);
						onDone();
					}}
				>
					Save
				</Button>
			</div>
		</div>
	);
}

/** One open editor, used by all three variants but placed differently by each. */
function OpenEditor({
	entry,
	locale,
	state,
	onDone,
	rows,
	showSource,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	state: EditorState;
	onDone: () => void;
	rows?: number;
	showSource?: boolean;
}) {
	const target = state.readValue(entry, locale);
	const [draft, setDraft] = useState(target.value);
	const [blanking, setBlanking] = useState(false);

	return (
		<div className="flex flex-col gap-2">
			{entry.change ? <SourceChangeDiff entry={entry} /> : null}
			{showSource ? (
				<div className="flex flex-col gap-0.5">
					<span className="text-[10px] text-muted-foreground uppercase tracking-wide">
						English
					</span>
					<span className="text-xs leading-relaxed">{entry.source}</span>
				</div>
			) : null}
			{target.note ? (
				<div className="flex items-start gap-1.5 text-[11px] text-destructive">
					<ShieldAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
					{target.note}
				</div>
			) : null}
			{target.state === "blank" ? (
				<div className="text-[11px] text-muted-foreground">
					Recorded blank: “{target.reason}” — editing replaces it.
				</div>
			) : null}
			<ValueField
				entry={entry}
				locale={locale}
				value={draft}
				onChange={setDraft}
				rows={rows}
			/>
			{blanking ? (
				<BlankPrompt
					onCancel={() => setBlanking(false)}
					onSave={(reason) => {
						state.blank(entry, locale, reason);
						setBlanking(false);
						onDone();
					}}
				/>
			) : (
				<EditorActions
					entry={entry}
					locale={locale}
					target={target}
					draft={draft}
					state={state}
					onDone={onDone}
					onBlank={() => setBlanking(true)}
				/>
			)}
		</div>
	);
}

function KeyIdentity({ entry }: { entry: KeyEntry }) {
	return (
		<div className="flex min-w-0 flex-wrap items-baseline gap-2">
			<span className="truncate font-mono text-xs">{entry.key}</span>
			{entry.screen ? (
				<Badge variant="outline" className="h-4 px-1 font-normal text-[10px]">
					{entry.screen}
				</Badge>
			) : null}
			{entry.placeholders && Object.keys(entry.placeholders).length ? (
				<span className="font-mono text-[10px] text-muted-foreground">
					{Object.entries(entry.placeholders)
						.map(([name, type]) => `{${name}: ${type}}`)
						.join(" ")}
				</span>
			) : null}
		</div>
	);
}

// ──────────────────────────────────────────────────────────── A — the Ledger

function VariantA({ entry, state }: { entry: KeyEntry; state: EditorState }) {
	const [open, setOpen] = useState<LocaleCode | null>(null);

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-2 pb-2.5">
				<KeyIdentity entry={entry} />
				{entry.change ? <SourceChangeDiff entry={entry} /> : null}
			</div>

			<div className="flex items-start gap-2 border-y bg-muted/40 px-2 py-1.5">
				<span className="flex w-24 shrink-0 items-center gap-1.5">
					<Sparkles aria-hidden="true" className="size-3 text-brand" />
					<span className="font-mono text-[11px]">en</span>
				</span>
				<span className="min-w-0 flex-1 text-xs leading-relaxed">
					{entry.source}
				</span>
			</div>

			<div className="flex flex-col divide-y">
				{TARGETS.map((locale) => {
					const target = state.readValue(entry, locale);
					const isOpen = open === locale;
					return (
						<div key={locale} className="flex flex-col">
							<button
								type="button"
								onClick={() => setOpen(isOpen ? null : locale)}
								className={cn(
									"flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
									isOpen && "bg-muted/50",
								)}
							>
								<span className="flex w-24 shrink-0 items-center gap-1.5">
									<StateDot state={target.state} />
									<span className="font-mono text-[11px]">{locale}</span>
									<span className="truncate text-[10px] text-muted-foreground">
										{LOCALE_LABEL[locale]}
									</span>
								</span>
								<span className="min-w-0 flex-1 overflow-hidden">
									<ValuePreview target={target} className="block" />
								</span>
								<span className="hidden w-36 shrink-0 text-right sm:block">
									<StateLabel state={target.state} />
								</span>
								<Pencil
									aria-hidden="true"
									className="size-3 shrink-0 text-muted-foreground"
								/>
							</button>
							{isOpen ? (
								<div className="bg-muted/20 px-2 py-2.5">
									<OpenEditor
										entry={entry}
										locale={locale}
										state={state}
										onDone={() => setOpen(null)}
									/>
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────── B — the Focus

function VariantB({ entry, state }: { entry: KeyEntry; state: EditorState }) {
	const [locale, setLocale] = useState<LocaleCode>(TARGETS[0]);
	const target = state.readValue(entry, locale);
	const sourceArms = entry.plural ? splitPluralArms(entry.source) : null;

	return (
		<div className="flex flex-col gap-2.5">
			<KeyIdentity entry={entry} />
			{entry.change ? <SourceChangeDiff entry={entry} /> : null}

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-[9.5rem_1fr]">
				<div className="flex flex-col border">
					{TARGETS.map((item) => {
						const value = state.readValue(entry, item);
						const active = item === locale;
						return (
							<button
								key={item}
								type="button"
								onClick={() => setLocale(item)}
								className={cn(
									"flex flex-col gap-0.5 border-b px-2 py-1.5 text-left transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
									active && "bg-muted",
								)}
							>
								<span className="flex items-center gap-1.5">
									<StateDot state={value.state} />
									<span className="font-mono text-[11px]">{item}</span>
									<span className="truncate text-[10px] text-muted-foreground">
										{LOCALE_LABEL[item]}
									</span>
								</span>
								<span className="truncate pl-3 text-[10px] text-muted-foreground">
									{STATE_LABEL[value.state]}
								</span>
							</button>
						);
					})}
				</div>

				<div className="flex min-w-0 flex-col gap-3">
					<div className="flex flex-col gap-1 border bg-muted/40 p-2.5">
						<span className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
							<Sparkles aria-hidden="true" className="size-3 text-brand" />
							English source
						</span>
						{sourceArms ? (
							<div className="flex flex-col gap-0.5">
								{sourceArms.arms.map((arm) => (
									<div key={arm.category} className="flex gap-2">
										<span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
											{arm.category}
										</span>
										<span className="text-xs">{arm.body}</span>
									</div>
								))}
							</div>
						) : (
							<p className="text-xs leading-relaxed">{entry.source}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between gap-2">
							<span className="font-medium text-sm">
								{LOCALE_LABEL[locale]}
							</span>
							<span className="flex items-center gap-1.5">
								<StateDot state={target.state} />
								<StateLabel state={target.state} />
							</span>
						</div>
						<OpenEditor
							key={`${entry.key}:${locale}`}
							entry={entry}
							locale={locale}
							state={state}
							onDone={() => undefined}
							rows={6}
						/>
						{target.by ? (
							<span className="text-[10px] text-muted-foreground">
								Last decided by {target.by}, {target.at}
							</span>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────── C — the Attention

const ATTENTION_ORDER: Attention[] = ["blocked", "decide", "review"];

function VariantC({ entry, state }: { entry: KeyEntry; state: EditorState }) {
	const [open, setOpen] = useState<LocaleCode | null>(null);
	const [showSettled, setShowSettled] = useState(false);

	const grouped = useMemo(() => {
		const groups: Record<Attention, TargetValue[]> = {
			blocked: [],
			decide: [],
			review: [],
			settled: [],
		};
		for (const locale of TARGETS) {
			const value = state.readValue(entry, locale);
			groups[STATE_ATTENTION[value.state]].push(value);
		}
		return groups;
	}, [entry, state]);

	const settled = grouped.settled;
	const anyOpen = ATTENTION_ORDER.some((group) => grouped[group].length);

	return (
		<div className="flex flex-col gap-2.5">
			<div className="flex flex-col gap-1.5">
				<KeyIdentity entry={entry} />
				<p className="text-muted-foreground text-xs leading-relaxed" dir="auto">
					<Sparkles
						aria-hidden="true"
						className="mr-1 inline size-3 text-brand"
					/>
					{entry.source}
				</p>
			</div>
			{entry.change ? <SourceChangeDiff entry={entry} /> : null}

			{!anyOpen ? (
				<div className="border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground">
					Nothing waiting. All five Locales are settled.
				</div>
			) : null}

			{ATTENTION_ORDER.map((group) => {
				const items = grouped[group];
				if (!items.length) return null;
				return (
					<div key={group} className="flex flex-col">
						<div className="flex items-baseline gap-2 pb-1">
							<span
								className={cn(
									"font-medium text-[11px] uppercase tracking-wide",
									group === "blocked"
										? "text-destructive"
										: group === "decide"
											? "text-amber-700 dark:text-amber-400"
											: "text-muted-foreground",
								)}
							>
								{ATTENTION_LABEL[group]}
							</span>
							<span className="text-[11px] text-muted-foreground">
								{items.length}
							</span>
							{group === "review" ? (
								<span className="text-[10px] text-muted-foreground">
									{entry.change?.kind === "cosmetic"
										? "ships unchanged either way"
										: "will not ship until answered"}
								</span>
							) : null}
						</div>
						<div className="flex flex-col divide-y border">
							{items.map((target) => (
								<AttentionItem
									key={target.locale}
									entry={entry}
									target={target}
									state={state}
									open={open === target.locale}
									onToggle={() =>
										setOpen(open === target.locale ? null : target.locale)
									}
									onDone={() => setOpen(null)}
								/>
							))}
						</div>
					</div>
				);
			})}

			{settled.length ? (
				<div className="flex flex-col">
					<button
						type="button"
						onClick={() => setShowSettled(!showSettled)}
						className="flex items-center gap-1.5 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						{showSettled ? (
							<ChevronDown aria-hidden="true" className="size-3" />
						) : (
							<ChevronRight aria-hidden="true" className="size-3" />
						)}
						Settled — {settled.length}:{" "}
						{settled
							.map((item) => `${item.locale} ${STATE_LABEL[item.state]}`)
							.join(" · ")}
					</button>
					{showSettled ? (
						<div className="flex flex-col divide-y border">
							{settled.map((target) => (
								<AttentionItem
									key={target.locale}
									entry={entry}
									target={target}
									state={state}
									open={open === target.locale}
									onToggle={() =>
										setOpen(open === target.locale ? null : target.locale)
									}
									onDone={() => setOpen(null)}
								/>
							))}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

/** The one-line answer to "what is this Locale waiting for, and what do I press". */
function AttentionItem({
	entry,
	target,
	state,
	open,
	onToggle,
	onDone,
}: {
	entry: KeyEntry;
	target: TargetValue;
	state: EditorState;
	open: boolean;
	onToggle: () => void;
	onDone: () => void;
}) {
	const prompt: Record<ValueState, string> = {
		broken: target.note ?? "Cannot be carried forward.",
		undecided: "Nothing here, and nobody has said it should be empty.",
		"imported-identical": "Holds the English text; nobody chose that.",
		"stale-semantic": "The English meaning moved. Confirm or update.",
		"stale-cosmetic": "The English was touched, not changed.",
		current: "Translated.",
		identical: "English, deliberately.",
		blank: `Empty, deliberately — ${target.reason ?? ""}`,
	};

	return (
		<div className="flex flex-col">
			<div className="flex items-start gap-2 px-2 py-1.5">
				<button
					type="button"
					onClick={onToggle}
					className="flex min-w-0 flex-1 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					<span className="flex w-24 shrink-0 items-center gap-1.5 pt-0.5">
						<StateDot state={target.state} />
						<span className="font-mono text-[11px]">{target.locale}</span>
						<span className="truncate text-[10px] text-muted-foreground">
							{LOCALE_LABEL[target.locale]}
						</span>
					</span>
					<span className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className={cn("text-[11px]", STATE_TONE[target.state])}>
							{prompt[target.state]}
						</span>
						{target.value ? (
							<ValuePreview
								target={target}
								className="block text-muted-foreground"
							/>
						) : null}
					</span>
				</button>
				<span className="flex shrink-0 items-center gap-1">
					{target.state === "stale-semantic" ||
					target.state === "stale-cosmetic" ? (
						<Button
							size="xs"
							variant="outline"
							onClick={() => state.confirm(entry, target.locale)}
						>
							Still correct
						</Button>
					) : null}
					{target.state === "imported-identical" ? (
						<Button
							size="xs"
							variant="outline"
							onClick={() => state.save(entry, target.locale, entry.source)}
						>
							Meant to be English
						</Button>
					) : null}
					<Button size="xs" variant="ghost" onClick={onToggle}>
						{open ? "Close" : "Edit"}
					</Button>
				</span>
			</div>
			{open ? (
				<div className="border-t bg-muted/20 px-2 py-2.5">
					<OpenEditor
						entry={entry}
						locale={target.locale}
						state={state}
						onDone={onDone}
						showSource
					/>
				</div>
			) : null}
		</div>
	);
}

// ───────────────────────────────────────────────────── the two hosting shells

type Variant = "A" | "B" | "C";

function Block({
	variant,
	entry,
	state,
}: {
	variant: Variant;
	entry: KeyEntry;
	state: EditorState;
}) {
	if (variant === "A") return <VariantA entry={entry} state={state} />;
	if (variant === "B") return <VariantB entry={entry} state={state} />;
	return <VariantC entry={entry} state={state} />;
}

/** Home 1: the Strings page — the block is the whole body, one card per key. */
function StringsHost({
	variant,
	state,
}: {
	variant: Variant;
	state: EditorState;
}) {
	return (
		<div className="flex flex-col gap-3">
			{KEYS.map((entry) => (
				<Card key={entry.key} size="sm">
					<CardContent>
						<Block variant={variant} entry={entry} state={state} />
						{entry.staged ? <StagedNote note={entry.staged} /> : null}
					</CardContent>
				</Card>
			))}
		</div>
	);
}

/** Home 2: a Reconciliation Report row — the same block, inlined beneath it. */
function ReportHost({
	variant,
	state,
}: {
	variant: Variant;
	state: EditorState;
}) {
	const [open, setOpen] = useState<string | null>("part_count");
	const rows = KEYS.filter((entry) => REPORT_ROWS[entry.key]);
	const groups = REPORT_GROUP_ORDER.filter((group) =>
		rows.some((entry) => REPORT_ROWS[entry.key] === group),
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
				Reconciliation Report ·{" "}
				<span className="font-mono">develop @ 19a07bc</span> · ingested today.
				Rows persist after disposition; the editor opens inline beneath a row,
				never in a drawer.
			</div>
			{groups.map((group) => (
				<div key={group} className="flex flex-col gap-1.5">
					<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
						{group}
					</span>
					<div className="flex flex-col divide-y border">
						{rows
							.filter((entry) => REPORT_ROWS[entry.key] === group)
							.map((entry) => {
								const isOpen = open === entry.key;
								return (
									<div key={entry.key} className="flex flex-col">
										<button
											type="button"
											onClick={() => setOpen(isOpen ? null : entry.key)}
											className={cn(
												"flex items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
												isOpen && "bg-muted/40",
											)}
										>
											{isOpen ? (
												<ChevronDown
													aria-hidden="true"
													className="size-3 shrink-0 text-muted-foreground"
												/>
											) : (
												<ChevronRight
													aria-hidden="true"
													className="size-3 shrink-0 text-muted-foreground"
												/>
											)}
											<span className="min-w-0 flex-1 truncate font-mono text-xs">
												{entry.key}
											</span>
											<span className="flex shrink-0 flex-wrap gap-1">
												{TARGETS.map((locale) => {
													const value = state.readValue(entry, locale);
													return (
														<span
															key={locale}
															title={`${LOCALE_LABEL[locale]} — ${STATE_LABEL[value.state]}`}
															className={cn(
																"inline-flex items-center gap-1 border px-1 font-mono text-[10px]",
																STATE_TONE[value.state],
															)}
														>
															<StateDot state={value.state} />
															{locale}
														</span>
													);
												})}
											</span>
										</button>
										{isOpen ? (
											<div className="border-t bg-muted/10 px-2.5 py-3">
												<Block variant={variant} entry={entry} state={state} />
												{entry.staged ? (
													<StagedNote note={entry.staged} />
												) : null}
											</div>
										) : null}
									</div>
								);
							})}
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

// ──────────────────────────────────────────────────────────────────── route

function PrototypeEditorRoute() {
	const { variant, context } = Route.useSearch();
	const navigate = Route.useNavigate();
	const state = useEditorState();
	const current = (
		["A", "B", "C"].includes(variant) ? variant : "A"
	) as Variant;

	return (
		<ProjectShell projectId="prototype" title="Brickit">
			<PageHeader
				title={context === "report" ? "Reconciliation Report" : "Strings"}
				description={
					context === "report"
						? "The per-key editor inlined under a report row — the second home it has to work in."
						: "The per-key editor as the main body of Strings, across six Locales of the real Brickit catalog."
				}
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
									navigate({ search: { variant: current, context: value } })
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
			{context === "report" ? (
				<ReportHost variant={current} state={state} />
			) : (
				<StringsHost variant={current} state={state} />
			)}
			<div className="h-16" />
			<PrototypeVariantSwitcher
				variants={VARIANTS}
				current={current}
				onChange={(key) => navigate({ search: { variant: key, context } })}
			/>
		</ProjectShell>
	);
}
