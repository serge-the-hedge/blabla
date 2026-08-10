// PROTOTYPE ONLY — throwaway. Three variants of the compound-ICU editing block,
// at /prototype-icu?variant=. Answers "Decide how compound ICU shapes are
// edited" (#26). Delete with the branch that holds it.
//
// #24 settled the per-key block and left ICU behind: it decomposes ONE
// top-level plural, and anything else falls back to raw ICU in a full-width
// field — "the ugliest thing on the page". This prototype is only about that
// hole. Everything around it — the stack of Locales, the borderless live
// field, the silence of a settled value — is #24's answer, reproduced so the
// ICU block is judged against real neighbours rather than in a vacuum.
//
// Measured at 4c6b6541, the catalog holds exactly two shapes: a WHOLE-MESSAGE
// plural (9 keys, every Locale) and N SEQUENTIAL top-level plurals with prose
// between (2 keys). No select, no selectordinal, no nesting, ever, in ARB
// history. So the variants differ on the compound case and agree everywhere
// else — which is the point of the ticket.
//
// Two facts drive all three variants, and both contradict #24 as written:
//
//   1. `zero` and `two` are NOT plural categories. gen_l10n's `pluralCases`
//      maps "0" -> "zero", and Intl.pluralLogic tests `howMany == 0 && zero
//      != null` BEFORE the CLDR rule. They are `=0` and `=2`, available in
//      every language. All 74 plural blocks in Brickit carry a `zero` arm.
//      "One field per category the target language needs" deletes it.
//   2. That arm is already wrong EVERY time it does anything. In 15 blocks
//      across 11 keys the `= 0` arm changes what renders at 0, and all 15 are
//      wrong: English and Spanish put the singular where the language wants a
//      plural ("0 hour ago", "hace 0 hora"), and French does the reverse in
//      nine blocks, since French takes the singular at 0 and every French
//      `zero` arm holds the plural ("0 briques"). The other 59 blocks carry a
//      `zero` arm that changes nothing. Nobody has ever used this arm on
//      purpose — which is exactly why deleting it silently is not an option
//      either: it is live, and it is load-bearing for the wrong reason.
//
// J — Segments: the message is its parts in reading order, each block expanded.
// K — Sentence: the message stays one sentence; blocks are chips that open.
// L — Outcomes: no decomposition at all — raw ICU beside what it renders.

import { Button } from "@blabla/ui/components/button";
import { Textarea } from "@blabla/ui/components/textarea";
import { cn } from "@blabla/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import {
	ARM_LABEL,
	type Arm,
	armFields,
	CLDR_REQUIRED,
	hasNesting,
	isCompound,
	isDegenerate,
	KEYS,
	type KeyEntry,
	LOCALE_LABEL,
	LOCALES,
	type LocaleCode,
	missingOther,
	newArm,
	parseMessage,
	REFERENCE,
	renderAt,
	type Segment,
	serialize,
	zeroArmOverrides,
} from "@/components/localization/prototype-icu-data";
import { PrototypeVariantSwitcher } from "@/components/localization/prototype-variant-switcher";

export const Route = createFileRoute("/prototype-icu")({
	validateSearch: (search: Record<string, unknown>) => ({
		variant: typeof search.variant === "string" ? search.variant : "J",
	}),
	component: PrototypeIcuRoute,
});

const VARIANTS = [
	{ key: "J", name: "Segments — the message as its parts" },
	{ key: "K", name: "Sentence — chips that open in place" },
	{ key: "L", name: "Outcomes — raw ICU beside what it renders" },
];

const MEASURE = "max-w-[74ch]";
const FIELD =
	"field-sizing-content min-h-0 w-full resize-none border-0 bg-transparent px-2 py-1 text-[13px] leading-relaxed shadow-none outline-none transition-colors hover:bg-muted/40 focus:bg-muted/60 focus-visible:border-0 focus-visible:ring-0 md:text-[13px] dark:bg-transparent dark:hover:bg-muted/30 dark:focus:bg-muted/50";
const MONO = "font-mono text-[11px]";

// ───────────────────────────────────────────────────────────────────── state

type Draft = Record<string, string>;
const at = (key: string, locale: LocaleCode) => `${key}:${locale}`;

function useDrafts() {
	const [drafts, setDrafts] = useState<Draft>({});
	const [raw, setRaw] = useState<Record<string, boolean>>({});
	return {
		value: (entry: KeyEntry, locale: LocaleCode) =>
			drafts[at(entry.key, locale)] ?? entry.values[locale],
		dirty: (entry: KeyEntry, locale: LocaleCode) =>
			at(entry.key, locale) in drafts &&
			drafts[at(entry.key, locale)] !== entry.values[locale],
		set: (entry: KeyEntry, locale: LocaleCode, next: string) =>
			setDrafts((prior) => ({ ...prior, [at(entry.key, locale)]: next })),
		revert: (entry: KeyEntry, locale: LocaleCode) =>
			setDrafts((prior) => {
				const next = { ...prior };
				delete next[at(entry.key, locale)];
				return next;
			}),
		isRaw: (entry: KeyEntry, locale: LocaleCode) =>
			raw[at(entry.key, locale)] ?? false,
		toggleRaw: (entry: KeyEntry, locale: LocaleCode) =>
			setRaw((prior) => ({
				...prior,
				[at(entry.key, locale)]: !prior[at(entry.key, locale)],
			})),
	};
}
type Drafts = ReturnType<typeof useDrafts>;

// ────────────────────────────────────────────────────────── shared fragments

/** The English arm to show as placeholder, falling back to `other`. */
const sourceArm = (source: Segment[], index: number, category: string) => {
	const block = source[index];
	if (!block || block.kind === "text") return "";
	return (
		block.arms.find((arm) => arm.category === category)?.body ??
		block.arms.find((arm) => arm.category === "other")?.body ??
		""
	);
};

/**
 * Rewrite one arm of one block and hand back the whole message. The rest of
 * the value — including arm ORDER — is carried through untouched, so a value
 * nobody edited serializes byte-identical (#17).
 */
function withArm(
	segments: Segment[],
	blockIndex: number,
	category: string,
	body: string,
): Segment[] {
	return segments.map((segment, index) => {
		if (index !== blockIndex || segment.kind === "text") return segment;
		const existing = segment.arms.some((arm) => arm.category === category);
		const arms: Arm[] = existing
			? segment.arms.map((arm) =>
					arm.category === category ? { ...arm, body } : arm,
				)
			: [...segment.arms, { ...newArm(category, segment.arms.at(-1)), body }];
		return { ...segment, arms };
	});
}

/** Fill every arm of a block from one string — the degenerate-plural case. */
function withEveryArm(
	segments: Segment[],
	blockIndex: number,
	body: string,
): Segment[] {
	return segments.map((segment, index) =>
		index !== blockIndex || segment.kind === "text"
			? segment
			: { ...segment, arms: segment.arms.map((arm) => ({ ...arm, body })) },
	);
}

function ArmField({
	category,
	locale,
	value,
	placeholder,
	onChange,
}: {
	category: string;
	locale: LocaleCode;
	value: string;
	placeholder: string;
	onChange: (next: string) => void;
}) {
	const exact = category === "zero" || category === "two";
	const required = CLDR_REQUIRED[locale].includes(category);
	return (
		<div className="flex items-baseline gap-2">
			<span
				className={cn(
					"w-11 shrink-0 pl-2 text-right",
					MONO,
					exact
						? "text-amber-600/70 dark:text-amber-500/70"
						: required
							? "text-muted-foreground/60"
							: "text-muted-foreground/40",
				)}
				title={
					exact
						? "Exact-number case — tested before the language's rule"
						: `CLDR category for ${LOCALE_LABEL[locale]}`
				}
			>
				{ARM_LABEL(category, locale)}
			</span>
			<Textarea
				aria-label={`${LOCALE_LABEL[locale]} ${category}`}
				className={cn(FIELD)}
				dir="auto"
				placeholder={placeholder}
				spellCheck
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
		</div>
	);
}

/** The block header: which argument, and the escape from repeating yourself. */
function BlockBar({
	arg,
	kind,
	degenerate,
	collapsed,
	onCollapse,
}: {
	arg: string;
	kind: string;
	degenerate: boolean;
	collapsed: boolean;
	onCollapse: (next: boolean) => void;
}) {
	return (
		<div className="flex items-center gap-2 pl-2">
			<span className={cn(MONO, "text-muted-foreground/50")}>
				{kind} on {arg}
			</span>
			{degenerate || collapsed ? (
				<button
					type="button"
					className={cn(
						MONO,
						"rounded px-1.5 py-0.5 transition-colors",
						collapsed
							? "bg-muted text-foreground/70"
							: "text-muted-foreground/50 hover:bg-muted/60",
					)}
					onClick={() => onCollapse(!collapsed)}
					title="Every case renders the same string"
				>
					{collapsed ? "✓ same for every case" : "same for every case"}
				</button>
			) : null}
		</div>
	);
}

function RawField({
	value,
	onChange,
}: {
	value: string;
	onChange: (next: string) => void;
}) {
	return (
		<Textarea
			aria-label="Raw ICU"
			className={cn(
				FIELD,
				"font-mono text-[12px] md:text-[12px]",
				"bg-muted/30 dark:bg-muted/20",
			)}
			dir="ltr"
			spellCheck={false}
			value={value}
			onChange={(event) => onChange(event.target.value)}
		/>
	);
}

/** Nothing is ever un-editable: every value, every shape, can be typed raw. */
function EscapeToggle({
	raw,
	onToggle,
	forced,
}: {
	raw: boolean;
	onToggle: () => void;
	forced?: string;
}) {
	return (
		<button
			type="button"
			className={cn(
				MONO,
				"rounded px-1.5 py-0.5 text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-muted-foreground",
			)}
			onClick={onToggle}
			title={forced ?? "Type the ICU string directly"}
		>
			{forced ? `${forced} — raw ICU` : raw ? "back to fields" : "edit as ICU"}
		</button>
	);
}

/** The build-breaking invariant, surfaced where it happens. */
function OtherWarning({ args }: { args: string[] }) {
	if (!args.length) return null;
	return (
		<p className="px-2 pt-1 text-[11px] text-destructive">
			{args.join(", ")} has no <span className="font-mono">other</span> arm —
			gen-l10n aborts the build.
		</p>
	);
}

// ───────────────────────────────────────────────────────── J — the segments
//
// The message is a vertical list of its parts in reading order. A plural block
// expands to its arm fields; the literal text between blocks is an ordinary
// field. The target's list is INDEPENDENT of the source's, which is the only
// way Chinese's ICU-less rewrite is an ordinary value here rather than an
// escape hatch.

function SegmentsRow({
	entry,
	locale,
	drafts,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	drafts: Drafts;
}) {
	const value = drafts.value(entry, locale);
	const segments = parseMessage(value);
	const source = parseMessage(entry.values[REFERENCE]);
	const nested = hasNesting(segments);
	const raw = drafts.isRaw(entry, locale) || nested;
	const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

	const write = (next: Segment[]) => drafts.set(entry, locale, serialize(next));

	return (
		<div className="flex flex-col gap-0.5">
			{raw ? (
				<RawField
					value={value}
					onChange={(next) => drafts.set(entry, locale, next)}
				/>
			) : (
				segments.map((segment, index) => {
					if (segment.kind === "text") {
						return (
							<Textarea
								// biome-ignore lint/suspicious/noArrayIndexKey: prototype
								key={index}
								aria-label="Literal text"
								className={cn(FIELD, "text-muted-foreground")}
								dir="auto"
								value={segment.text}
								onChange={(event) =>
									write(
										segments.map((item, position) =>
											position === index
												? { kind: "text", text: event.target.value }
												: item,
										),
									)
								}
							/>
						);
					}
					const degenerate = isDegenerate(segment.arms);
					const isCollapsed = collapsed[index] ?? degenerate;
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: prototype
						<div key={index} className="py-0.5">
							<BlockBar
								arg={segment.arg}
								kind={segment.kind}
								degenerate={degenerate}
								collapsed={isCollapsed}
								onCollapse={(next) =>
									setCollapsed((prior) => ({ ...prior, [index]: next }))
								}
							/>
							{isCollapsed ? (
								<ArmField
									category="every"
									locale={locale}
									value={segment.arms[0]?.body ?? ""}
									placeholder={sourceArm(source, index, "other")}
									onChange={(next) =>
										write(withEveryArm(segments, index, next))
									}
								/>
							) : (
								armFields(segment.arms, locale).map((category) => (
									<ArmField
										key={category}
										category={category}
										locale={locale}
										value={
											segment.arms.find((arm) => arm.category === category)
												?.body ?? ""
										}
										placeholder={sourceArm(source, index, category)}
										onChange={(next) =>
											write(withArm(segments, index, category, next))
										}
									/>
								))
							)}
						</div>
					);
				})
			)}
			<OtherWarning args={missingOther(segments)} />
			<div className="flex items-center gap-2 pl-1">
				<EscapeToggle
					raw={raw}
					forced={nested ? "nested" : undefined}
					onToggle={() => drafts.toggleRaw(entry, locale)}
				/>
				{drafts.dirty(entry, locale) ? (
					<button
						type="button"
						className={cn(MONO, "text-muted-foreground/40 hover:underline")}
						onClick={() => drafts.revert(entry, locale)}
					>
						revert
					</button>
				) : null}
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────── K — the sentence
//
// The message stays ONE sentence: literal text reads as text and each plural
// block is an inline chip showing the arm the reader would see at n=2. Click a
// chip and its arms open underneath — so the grammar around the block never
// stops being visible, which is the objection to J.

function SentenceRow({
	entry,
	locale,
	drafts,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	drafts: Drafts;
}) {
	const value = drafts.value(entry, locale);
	const segments = parseMessage(value);
	const source = parseMessage(entry.values[REFERENCE]);
	const nested = hasNesting(segments);
	const raw = drafts.isRaw(entry, locale) || nested;
	const [open, setOpen] = useState<number | null>(null);

	const write = (next: Segment[]) => drafts.set(entry, locale, serialize(next));

	if (raw) {
		return (
			<div className="flex flex-col gap-0.5">
				<RawField
					value={value}
					onChange={(next) => drafts.set(entry, locale, next)}
				/>
				<EscapeToggle
					raw
					forced={nested ? "nested" : undefined}
					onToggle={() => drafts.toggleRaw(entry, locale)}
				/>
			</div>
		);
	}

	const openBlock = open === null ? null : segments[open];

	return (
		<div className="flex flex-col gap-1">
			<p className="px-2 py-1 text-[13px] leading-relaxed" dir="auto">
				{segments.map((segment, index) => {
					if (segment.kind === "text") {
						// Inline and editable: the prose between blocks is where the
						// grammar lives, and a value with no ICU at all — Chinese, twice —
						// is nothing BUT this segment.
						return (
							<input
								// biome-ignore lint/suspicious/noArrayIndexKey: prototype
								key={index}
								aria-label="Literal text"
								className="field-sizing-content min-w-4 rounded border-0 bg-transparent px-0.5 text-[13px] leading-relaxed outline-none hover:bg-muted/40 focus:bg-muted/60"
								dir="auto"
								value={segment.text}
								onChange={(event) =>
									write(
										segments.map((item, position) =>
											position === index
												? { kind: "text", text: event.target.value }
												: item,
										),
									)
								}
							/>
						);
					}
					const preview = renderAt([segment], locale, 2);
					return (
						<button
							// biome-ignore lint/suspicious/noArrayIndexKey: prototype
							key={index}
							type="button"
							className={cn(
								"mx-0.5 rounded border px-1.5 py-0.5 align-baseline text-[12px] transition-colors",
								open === index
									? "border-foreground/40 bg-muted"
									: "border-muted-foreground/30 border-dashed hover:bg-muted/60",
							)}
							onClick={() => setOpen(open === index ? null : index)}
							title={`${segment.kind} on ${segment.arg} — ${segment.arms.length} arms`}
						>
							{preview || `{${segment.arg}}`}
							<span className="pl-1 text-muted-foreground/50">
								{segment.arms.length}
							</span>
						</button>
					);
				})}
			</p>

			{openBlock && openBlock.kind !== "text" && open !== null ? (
				<div className="ml-2 border-muted-foreground/20 border-l pl-2">
					<BlockBar
						arg={openBlock.arg}
						kind={openBlock.kind}
						degenerate={isDegenerate(openBlock.arms)}
						collapsed={false}
						onCollapse={() => {}}
					/>
					{armFields(openBlock.arms, locale).map((category) => (
						<ArmField
							key={category}
							category={category}
							locale={locale}
							value={
								openBlock.arms.find((arm) => arm.category === category)?.body ??
								""
							}
							placeholder={sourceArm(source, open, category)}
							onChange={(next) =>
								write(withArm(segments, open, category, next))
							}
						/>
					))}
				</div>
			) : null}

			<OtherWarning args={missingOther(segments)} />
			<div className="flex items-center gap-2 pl-1">
				<EscapeToggle
					raw={false}
					onToggle={() => drafts.toggleRaw(entry, locale)}
				/>
				<span className={cn(MONO, "text-muted-foreground/30")}>
					chips show n=2 · click to open
				</span>
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────── L — the outcomes
//
// No decomposition at all. The ICU string stays one raw field — and beside it,
// what the app renders at 0, 1, 2 and 5, computed the way Intl.pluralLogic
// does. The bet: nobody needs the braces hidden, they need to see the result.
// It is also the only variant where "0 hour ago" is visible without knowing
// anything about ICU.

const PROBES = [0, 1, 2, 5];

function OutcomesRow({
	entry,
	locale,
	drafts,
}: {
	entry: KeyEntry;
	locale: LocaleCode;
	drafts: Drafts;
}) {
	const value = drafts.value(entry, locale);
	const segments = parseMessage(value);
	const source = parseMessage(entry.values[REFERENCE]);
	const plural = segments.some((segment) => segment.kind === "plural");

	return (
		<div className="flex flex-col gap-1">
			<RawField
				value={value}
				onChange={(next) => drafts.set(entry, locale, next)}
			/>
			{plural ? (
				<div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-2">
					{PROBES.map((n) => {
						const rendered = renderAt(segments, locale, n);
						const english = renderAt(source, REFERENCE, n);
						// The `= 0` arm is overriding the language's own rule here.
						const suspicious = n === 0 && zeroArmOverrides(segments, locale);
						return (
							<span key={n} className="flex items-baseline gap-1.5">
								<span className={cn(MONO, "text-muted-foreground/40")}>
									{n}
								</span>
								<span
									className={cn(
										"text-[12px]",
										suspicious ? "text-destructive" : "text-muted-foreground",
									)}
									title={locale === REFERENCE ? undefined : english}
								>
									{rendered}
								</span>
							</span>
						);
					})}
				</div>
			) : null}
			<OtherWarning args={missingOther(segments)} />
		</div>
	);
}

// ────────────────────────────────────────────────────────────────── the page

function KeyCard({
	entry,
	drafts,
	variant,
}: {
	entry: KeyEntry;
	drafts: Drafts;
	variant: string;
}) {
	const segments = parseMessage(entry.values[REFERENCE]);
	const compound = isCompound(segments);

	return (
		<section className="border-b py-5">
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-2">
				<h2 className="font-mono text-[13px]">{entry.key}</h2>
				<span className={cn(MONO, "text-muted-foreground/50")}>
					{entry.screen}
				</span>
				{compound ? (
					<span
						className={cn(
							MONO,
							"rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-500",
						)}
					>
						{segments.filter((segment) => segment.kind !== "text").length}{" "}
						plurals
					</span>
				) : null}
				<span className="text-[12px] text-muted-foreground">{entry.note}</span>
			</div>

			<div className={cn("flex flex-col gap-2", MEASURE)}>
				{LOCALES.map((locale) => (
					<div key={locale} className="flex items-start gap-2">
						<span
							className={cn(
								MONO,
								"w-6 shrink-0 pt-1.5 text-muted-foreground/50",
							)}
							title={LOCALE_LABEL[locale]}
						>
							{locale}
						</span>
						<div className="min-w-0 flex-1">
							{variant === "J" ? (
								<SegmentsRow
									key={`${entry.key}-${locale}`}
									entry={entry}
									locale={locale}
									drafts={drafts}
								/>
							) : variant === "K" ? (
								<SentenceRow
									key={`${entry.key}-${locale}`}
									entry={entry}
									locale={locale}
									drafts={drafts}
								/>
							) : (
								<OutcomesRow entry={entry} locale={locale} drafts={drafts} />
							)}
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function PrototypeIcuRoute() {
	const { variant } = Route.useSearch();
	const navigate = Route.useNavigate();
	const drafts = useDrafts();
	const [showState, setShowState] = useState(false);

	return (
		<ProjectShell projectId="prototype" title="Brickit">
			<PageHeader
				title="Strings — ICU shapes"
				description="Five real keys from the Brickit catalog, verbatim — nothing here is invented, including the bugs. Two hold two plurals in one message. Three ship a wrong '= 0' arm today. One is a plural whose arms are identical in all six Locales, and German renders it with no plural at all. Variant L is the only one that shows you any of that."
				action={
					<Button
						size="sm"
						variant="outline"
						onClick={() => setShowState((prior) => !prior)}
					>
						{showState ? "Hide ICU" : "Show ICU"}
					</Button>
				}
			/>

			<div className="flex flex-col">
				{KEYS.map((entry) => (
					<div key={entry.key}>
						<KeyCard entry={entry} drafts={drafts} variant={variant} />
						{showState ? (
							<pre className="overflow-x-auto whitespace-pre-wrap break-all bg-muted/40 px-3 py-2 font-mono text-[10px] text-muted-foreground">
								{LOCALES.map(
									(locale) =>
										`${locale}  ${drafts.value(entry, locale)}${
											drafts.dirty(entry, locale) ? "   ← edited" : ""
										}`,
								).join("\n")}
							</pre>
						) : null}
					</div>
				))}
				<div className="h-24" />
			</div>

			<PrototypeVariantSwitcher
				variants={VARIANTS}
				current={variant}
				onChange={(key) =>
					navigate({ search: { variant: key }, replace: true })
				}
			/>
		</ProjectShell>
	);
}
