// PROTOTYPE ONLY — throwaway. Variants of the Reconciliation Report review and
// recovery experience, switchable via `?variant=`, mounted in the real project
// shell so density and chrome are honest. Fixture data only; no mutations.
// A–C were the first round, D–G the second, H is where it landed.
// Question: how should a Reconciliation Report make automatic snapshot actions
// clear, scannable, and recoverable after the fact, without turning source sync
// into a pre-approval queue?
import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import { Input } from "@blabla/ui/components/input";
import { Separator } from "@blabla/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@blabla/ui/components/sheet";
import { Textarea } from "@blabla/ui/components/textarea";
import { cn } from "@blabla/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	Archive,
	ArrowRight,
	Check,
	ChevronDown,
	ChevronRight,
	Clock,
	FileWarning,
	GitCommitHorizontal,
	Languages,
	Plus,
	RotateCcw,
	Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { PrototypeVariantSwitcher } from "@/components/localization/prototype-variant-switcher";

export const Route = createFileRoute("/prototype-reconciliation")({
	validateSearch: (search: Record<string, unknown>) => ({
		variant: typeof search.variant === "string" ? search.variant : "A",
	}),
	component: PrototypeReconciliationRoute,
});

/* ------------------------------------------------------------------ fixtures */

type ActionKind =
	| "added"
	| "staled"
	| "blocked"
	| "archived"
	| "unbound"
	| "carried";

type ActionItem = {
	key: string;
	detail: string;
	locales?: string[];
	recovery?: string;
	severity: "attention" | "routine";
};

type ActionGroup = {
	kind: ActionKind;
	title: string;
	blurb: string;
	items: ActionItem[];
};

type Report = {
	id: string;
	commit: string;
	ref: string;
	author: string;
	when: string;
	unread: boolean;
	files: number;
	digest: string;
	consequential: boolean;
	groups: ActionGroup[];
};

const LOCALES = ["de", "es", "fr", "ru", "zh"];

const LATEST: Report = {
	id: "r-6f2c81d",
	commit: "6f2c81d",
	ref: "develop",
	author: "danya",
	when: "2h ago",
	unread: true,
	files: 6,
	digest:
		"6 keys added, 4 sources reworded, 1 contract change, 2 keys archived, 1 unbound file.",
	consequential: true,
	groups: [
		{
			kind: "blocked",
			title: "Blocked — target work cannot carry forward",
			blurb:
				"A contract-breaking source change. Existing target values are held until each is explicitly rebased.",
			items: [
				{
					key: "ideas_search_selection_ideas",
					detail:
						"ICU shape changed: plural gained a `two` arm and `{count}` is now `int`.",
					locales: LOCALES,
					recovery: "Rebase 5 targets",
					severity: "attention",
				},
			],
		},
		{
			kind: "staled",
			title: "Staled — source wording changed",
			blurb:
				"Copy-only edits. Targets are retained and still shipping, but need confirmation or an update before the next release.",
			items: [
				{
					key: "activity_feed_title",
					detail: "“What's new” → “What’s new”",
					locales: LOCALES,
					recovery: "Confirm all 5",
					severity: "routine",
				},
				{
					key: "about_app_disclaimer",
					detail: "“is not an official LEGO® product” → “is not affiliated with LEGO®”",
					locales: LOCALES,
					recovery: "Confirm all 5",
					severity: "routine",
				},
				{
					key: "ads_banner_close_button_text",
					detail: "“Go ad-free” → “Remove ads”",
					locales: LOCALES,
					recovery: "Confirm all 5",
					severity: "routine",
				},
				{
					key: "aboutapp_rate_google",
					detail: "“Rate on the Google Play” → “Rate on Google Play”",
					locales: LOCALES,
					recovery: "Confirm all 5",
					severity: "routine",
				},
			],
		},
		{
			kind: "archived",
			title: "Archived — key absent from the source contract",
			blurb:
				"Automatically soft-archived. History and translations are retained; restoring one while Git lacks it creates a Restore Proposal.",
			items: [
				{
					key: "after_scan_page_pom_description",
					detail: "5 target values retained · last edited 12 Jul",
					recovery: "Restore Proposal",
					severity: "attention",
				},
				{
					key: "leaderboard_intro_collection_with",
					detail: "5 target values retained · all blank",
					recovery: "Restore Proposal",
					severity: "routine",
				},
			],
		},
		{
			kind: "added",
			title: "Added — new source keys",
			blurb: "New translation work. Nothing was decided on your behalf.",
			items: [
				{
					key: "sets_detail_missing_parts_title",
					detail: "“Missing parts”",
					severity: "routine",
				},
				{
					key: "sets_detail_missing_parts_hint",
					detail: "“We'll suggest substitutes from your bricks.”",
					severity: "routine",
				},
				{
					key: "scanner_hint_retry",
					detail: "“Try spreading the bricks out”",
					severity: "routine",
				},
				{
					key: "paywall_annual_savings",
					detail: "“Save {percent}%”",
					severity: "routine",
				},
				{
					key: "paywall_trial_note",
					detail: "“Cancel anytime during your trial”",
					severity: "routine",
				},
				{
					key: "profile_badge_new",
					detail: "“New”",
					severity: "routine",
				},
			],
		},
		{
			kind: "unbound",
			title: "Setup — unbound locale file",
			blurb:
				"Found in the snapshot with no Locale Binding. Excluded from translation and release work until it is bound.",
			items: [
				{
					key: "intl_pt.arb",
					detail: "declares @@locale \"pt\" · 1,459 entries",
					recovery: "Bind a Locale",
					severity: "attention",
				},
			],
		},
	],
};

const HISTORY: Report[] = [
	LATEST,
	{
		id: "r-19a07bc",
		commit: "19a07bc",
		ref: "develop",
		author: "sergey",
		when: "yesterday",
		unread: false,
		files: 6,
		digest: "1 source reworded.",
		consequential: true,
		groups: [
			{
				kind: "staled",
				title: "Staled — source wording changed",
				blurb: "Copy-only edit.",
				items: [
					{
						key: "aboutapp_insta",
						detail: "“Brickit on Instagram” → “Follow Brickit on Instagram”",
						locales: LOCALES,
						recovery: "Confirm all 5",
						severity: "routine",
					},
				],
			},
		],
	},
	{
		id: "r-4c6b654",
		commit: "4c6b654",
		ref: "develop",
		author: "ci",
		when: "2 days ago",
		unread: false,
		files: 6,
		digest: "No catalog effect.",
		consequential: false,
		groups: [],
	},
	{
		id: "r-a91ff02",
		commit: "a91ff02",
		ref: "develop",
		author: "ci",
		when: "2 days ago",
		unread: false,
		files: 6,
		digest: "No catalog effect.",
		consequential: false,
		groups: [],
	},
	{
		id: "r-77bd410",
		commit: "77bd410",
		ref: "develop",
		author: "ci",
		when: "3 days ago",
		unread: false,
		files: 6,
		digest: "No catalog effect.",
		consequential: false,
		groups: [],
	},
];

const KIND_META: Record<
	ActionKind,
	{ label: string; icon: typeof Plus; tone: string }
> = {
	blocked: {
		label: "Blocked",
		icon: AlertTriangle,
		tone: "text-destructive",
	},
	staled: { label: "Staled", icon: Clock, tone: "text-warning" },
	archived: { label: "Archived", icon: Archive, tone: "text-muted-foreground" },
	added: { label: "Added", icon: Plus, tone: "text-success" },
	unbound: { label: "Unbound", icon: FileWarning, tone: "text-warning" },
	carried: { label: "Carried", icon: ArrowRight, tone: "text-muted-foreground" },
};

function countOf(report: Report, kind: ActionKind) {
	const group = report.groups.find((candidate) => candidate.kind === kind);
	if (!group) return 0;
	if (kind === "staled" || kind === "blocked") {
		return group.items.reduce(
			(total, item) => total + (item.locales?.length ?? 1),
			0,
		);
	}
	return group.items.length;
}

function Provenance({ report }: { report: Report }) {
	return (
		<span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground text-xs">
			<GitCommitHorizontal aria-hidden className="size-3.5" />
			{report.commit}
			<span className="font-sans">·</span>
			<span className="font-sans">{report.ref}</span>
		</span>
	);
}

/* ------------------------------------------------- variant A — sync feed */

function VariantA() {
	const [open, setOpen] = useState<string | null>(LATEST.id);
	const quiet = HISTORY.filter((report) => !report.consequential);
	const loud = HISTORY.filter((report) => report.consequential);

	return (
		<>
			<PageHeader
				title="Sync"
				description="Every snapshot Blabla accepted from Git, newest first. Nothing here is waiting on your approval."
			/>
			<div className="flex flex-col gap-2">
				{loud.map((report) => {
					const expanded = open === report.id;
					return (
						<Card key={report.id} size="sm" className="overflow-hidden">
							<CardContent className="p-0">
								<button
									type="button"
									onClick={() => setOpen(expanded ? null : report.id)}
									className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
								>
									<span className="pt-1">
										{expanded ? (
											<ChevronDown aria-hidden className="size-4 text-muted-foreground" />
										) : (
											<ChevronRight aria-hidden className="size-4 text-muted-foreground" />
										)}
									</span>
									<span className="flex min-w-0 flex-1 flex-col gap-1.5">
										<span className="flex flex-wrap items-center gap-2">
											{report.unread ? (
												<span
													aria-label="Unreviewed"
													className="size-1.5 rounded-full bg-primary"
												/>
											) : null}
											<span className="font-medium text-sm">{report.digest}</span>
										</span>
										<span className="flex flex-wrap items-center gap-2">
											<Provenance report={report} />
											<span className="text-muted-foreground text-xs">
												· {report.author} · {report.when}
											</span>
										</span>
										<span className="flex flex-wrap gap-1.5 pt-0.5">
											{(
												["blocked", "staled", "archived", "added", "unbound"] as ActionKind[]
											).map((kind) => {
												const count = countOf(report, kind);
												if (!count) return null;
												const meta = KIND_META[kind];
												return (
													<Badge
														key={kind}
														variant={kind === "blocked" ? "destructive" : "outline"}
													>
														<meta.icon data-icon="inline-start" />
														{count} {meta.label.toLowerCase()}
													</Badge>
												);
											})}
										</span>
									</span>
								</button>
								{expanded ? (
									<div className="border-t bg-muted/20 px-4 py-3">
										<div className="flex flex-col gap-4">
											{report.groups.map((group) => {
												const meta = KIND_META[group.kind];
												return (
													<div key={group.kind} className="flex flex-col gap-2">
														<div className="flex items-center gap-2">
															<meta.icon aria-hidden className={cn("size-3.5", meta.tone)} />
															<span className="font-medium text-xs">{group.title}</span>
														</div>
														<p className="text-muted-foreground text-xs">{group.blurb}</p>
														<div className="divide-y rounded-md border bg-background">
															{group.items.map((item) => (
																<div
																	key={item.key}
																	className="flex items-center justify-between gap-3 px-3 py-2"
																>
																	<div className="flex min-w-0 flex-col gap-0.5">
																		<span className="truncate font-mono text-xs">
																			{item.key}
																		</span>
																		<span className="truncate text-muted-foreground text-xs">
																			{item.detail}
																		</span>
																	</div>
																	{item.recovery ? (
																		<Button size="sm" variant="outline">
																			<Undo2 data-icon="inline-start" />
																			{item.recovery}
																		</Button>
																	) : null}
																</div>
															))}
														</div>
													</div>
												);
											})}
										</div>
									</div>
								) : null}
							</CardContent>
						</Card>
					);
				})}

				<div className="flex items-center gap-3 px-1 py-2 text-muted-foreground text-xs">
					<Separator className="flex-1" />
					{quiet.length} syncs with no catalog effect
					<Separator className="flex-1" />
				</div>
			</div>
		</>
	);
}

/* -------------------------------------------- variant B — report document */

function VariantB() {
	const [selected, setSelected] = useState(LATEST.id);
	const report = HISTORY.find((candidate) => candidate.id === selected) ?? LATEST;

	return (
		<>
			<PageHeader
				title="Reconciliation reports"
				description="One durable record per accepted snapshot. Read it like a receipt: what arrived, what Blabla did, and how to undo any of it."
			/>
			<div className="grid gap-5 lg:grid-cols-[220px_1fr]">
				<div className="flex flex-col gap-1">
					{HISTORY.map((candidate) => (
						<button
							key={candidate.id}
							type="button"
							onClick={() => setSelected(candidate.id)}
							className={cn(
								"flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
								candidate.id === selected
									? "bg-sidebar-accent text-sidebar-accent-foreground"
									: "text-muted-foreground hover:bg-sidebar-accent/50",
							)}
						>
							<span className="flex items-center gap-1.5 font-mono">
								{candidate.unread ? (
									<span className="size-1.5 rounded-full bg-primary" />
								) : null}
								{candidate.commit}
							</span>
							<span className="truncate">
								{candidate.consequential ? candidate.digest : "No catalog effect"}
							</span>
							<span className="text-[10px] opacity-70">{candidate.when}</span>
						</button>
					))}
				</div>

				<div className="flex min-w-0 flex-col gap-4">
					<Card size="sm">
						<CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
							<div className="flex flex-col gap-0.5">
								<span className="text-muted-foreground">Commit</span>
								<span className="font-mono">{report.commit}</span>
							</div>
							<div className="flex flex-col gap-0.5">
								<span className="text-muted-foreground">Ref</span>
								<span>{report.ref}</span>
							</div>
							<div className="flex flex-col gap-0.5">
								<span className="text-muted-foreground">Author</span>
								<span>{report.author}</span>
							</div>
							<div className="flex flex-col gap-0.5">
								<span className="text-muted-foreground">Manifest</span>
								<span>{report.files} ARB files</span>
							</div>
						</CardContent>
					</Card>

					{report.groups.length === 0 ? (
						<Card size="sm">
							<CardContent className="py-6 text-center text-muted-foreground text-xs">
								This snapshot changed nothing in the catalog.
							</CardContent>
						</Card>
					) : (
						report.groups.map((group, index) => {
							const meta = KIND_META[group.kind];
							return (
								<section key={group.kind} className="flex flex-col gap-2">
									<div className="flex items-baseline gap-2">
										<span className="font-mono text-muted-foreground text-xs">
											{index + 1}.
										</span>
										<h2 className={cn("font-medium text-sm", meta.tone)}>
											{group.title}
										</h2>
									</div>
									<p className="pl-6 text-muted-foreground text-xs">{group.blurb}</p>
									<Card size="sm" className="ml-6">
										<CardContent className="divide-y p-0">
											{group.items.map((item) => (
												<div
													key={item.key}
													className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5"
												>
													<div className="flex min-w-0 flex-col gap-1">
														<span className="truncate font-mono text-xs">{item.key}</span>
														<span className="text-muted-foreground text-xs">
															{item.detail}
														</span>
														{item.locales ? (
															<span className="flex flex-wrap gap-1 pt-0.5">
																{item.locales.map((locale) => (
																	<Badge key={locale} variant="outline">
																		{locale}
																	</Badge>
																))}
															</span>
														) : null}
													</div>
													{item.recovery ? (
														<Button size="sm" variant="outline">
															<RotateCcw data-icon="inline-start" />
															{item.recovery}
														</Button>
													) : null}
												</div>
											))}
										</CardContent>
									</Card>
								</section>
							);
						})
					)}
				</div>
			</div>
		</>
	);
}

/* ------------------------------------- variant C — consequence worklist */

type Bucket = {
	id: string;
	title: string;
	count: string;
	blurb: string;
	icon: typeof Plus;
	tone: string;
	rows: { key: string; detail: string; from: string; action: string }[];
};

const BUCKETS: Bucket[] = [
	{
		id: "rebase",
		title: "Needs rebase",
		count: "5 values",
		blurb: "A source contract change means the old target can't carry forward.",
		icon: AlertTriangle,
		tone: "text-destructive",
		rows: [
			{
				key: "ideas_search_selection_ideas",
				detail: "plural gained a `two` arm · de es fr ru zh",
				from: "6f2c81d",
				action: "Rebase",
			},
		],
	},
	{
		id: "stale",
		title: "Needs confirmation",
		count: "25 values",
		blurb: "Source wording changed. Targets still ship, but go stale for the next release.",
		icon: Clock,
		tone: "text-warning",
		rows: [
			{
				key: "activity_feed_title",
				detail: "“What's new” → “What’s new” · 5 locales",
				from: "6f2c81d",
				action: "Review",
			},
			{
				key: "about_app_disclaimer",
				detail: "disclaimer reworded · 5 locales",
				from: "6f2c81d",
				action: "Review",
			},
			{
				key: "ads_banner_close_button_text",
				detail: "“Go ad-free” → “Remove ads” · 5 locales",
				from: "6f2c81d",
				action: "Review",
			},
			{
				key: "aboutapp_rate_google",
				detail: "“Rate on the Google Play” → “Rate on Google Play” · 5 locales",
				from: "6f2c81d",
				action: "Review",
			},
			{
				key: "aboutapp_insta",
				detail: "“Brickit on Instagram” → “Follow Brickit on Instagram” · 5 locales",
				from: "19a07bc",
				action: "Review",
			},
		],
	},
	{
		id: "archived",
		title: "Archived by sync — restorable",
		count: "2 keys",
		blurb:
			"Absent from the source contract, so Blabla archived them. History is retained; restoring creates a Restore Proposal.",
		icon: Archive,
		tone: "text-muted-foreground",
		rows: [
			{
				key: "after_scan_page_pom_description",
				detail: "5 target values retained · last edited 12 Jul",
				from: "6f2c81d",
				action: "Restore",
			},
			{
				key: "leaderboard_intro_collection_with",
				detail: "5 target values retained · all blank",
				from: "6f2c81d",
				action: "Restore",
			},
		],
	},
	{
		id: "setup",
		title: "Setup needed",
		count: "1 file",
		blurb: "Found in the snapshot with no Locale Binding, so it is excluded from work.",
		icon: Languages,
		tone: "text-warning",
		rows: [
			{
				key: "intl_pt.arb",
				detail: "declares @@locale \"pt\" · 1,459 entries",
				from: "6f2c81d",
				action: "Bind",
			},
		],
	},
	{
		id: "new",
		title: "New, untranslated",
		count: "30 values",
		blurb: "6 keys arrived from Git. Ordinary translation work, no recovery needed.",
		icon: Plus,
		tone: "text-success",
		rows: [
			{
				key: "sets_detail_missing_parts_title",
				detail: "“Missing parts” · 5 locales",
				from: "6f2c81d",
				action: "Translate",
			},
			{
				key: "paywall_annual_savings",
				detail: "“Save {percent}%” · 5 locales",
				from: "6f2c81d",
				action: "Translate",
			},
			{
				key: "+ 4 more",
				detail: "scanner_hint_retry, paywall_trial_note, profile_badge_new…",
				from: "6f2c81d",
				action: "Translate",
			},
		],
	},
];

function VariantC() {
	return (
		<>
			<PageHeader
				title="What sync changed"
				description="Everything automatic sync left on your desk, grouped by the work it needs. Syncs with no consequence never appear here."
				action={
					<Button size="sm" variant="ghost">
						Sync history
						<ArrowRight data-icon="inline-end" />
					</Button>
				}
			/>
			<div className="flex flex-col gap-5">
				{BUCKETS.map((bucket) => (
					<section key={bucket.id} className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center gap-2">
							<bucket.icon aria-hidden className={cn("size-4", bucket.tone)} />
							<h2 className="font-medium text-sm">{bucket.title}</h2>
							<Badge variant={bucket.id === "rebase" ? "destructive" : "secondary"}>
								{bucket.count}
							</Badge>
						</div>
						<p className="text-muted-foreground text-xs">{bucket.blurb}</p>
						<Card size="sm">
							<CardContent className="divide-y p-0">
								{bucket.rows.map((row) => (
									<div
										key={row.key}
										className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5"
									>
										<div className="flex min-w-0 flex-col gap-0.5">
											<span className="truncate font-mono text-xs">{row.key}</span>
											<span className="truncate text-muted-foreground text-xs">
												{row.detail}
											</span>
										</div>
										<div className="flex items-center gap-2">
											<Badge variant="ghost" className="font-mono">
												<GitCommitHorizontal data-icon="inline-start" />
												{row.from}
											</Badge>
											<Button size="sm" variant="outline">
												{row.action}
											</Button>
										</div>
									</div>
								))}
							</CardContent>
						</Card>
					</section>
				))}
			</div>
		</>
	);
}

/* --------------------------------- variant D — refined consequence worklist */

// Refinements over C:
//  · ordering by scope then severity: locale → rebase → drift → archived → review → translate
//  · rows expand to per-locale lines with inline editing, so a quick fix never
//    leaves the surface
//  · a row shows per-locale state, so a mixed key is legible without opening
//  · provenance chip only when the row did NOT come from the newest snapshot
//  · every bucket deep-links into Strings with the filter pre-applied, so the
//    worklist never becomes a second translation UI
//  · target-side divergence ("Changed in Git") added — the category C was missing

const NEWEST = "6f2c81d";

type LocaleState = "ok" | "stale" | "missing" | "invalid" | "drifted";

type WorkRow = {
	key: string;
	source: string;
	note: string;
	from: string;
	locales: { code: string; state: LocaleState; value: string }[];
	action: string;
	editable: boolean;
	// Dispositioned consequences stay on the list rather than vanishing — the
	// worklist ages into the durable report rather than emptying out.
	resolved?: { what: string; who: string; when: string };
};

type WorkBucket = {
	id: string;
	title: string;
	count: string;
	blurb: string;
	icon: typeof Plus;
	tone: string;
	blocking: boolean;
	stringsFilter?: string;
	rows: WorkRow[];
};

const STATE_TONE: Record<LocaleState, string> = {
	ok: "text-success",
	stale: "text-warning",
	missing: "text-muted-foreground",
	invalid: "text-destructive",
	drifted: "text-warning",
};

function locale(
	code: string,
	state: LocaleState,
	value: string,
): { code: string; state: LocaleState; value: string } {
	return { code, state, value };
}

const WORK: WorkBucket[] = [
	{
		id: "locale",
		title: "Locale setup",
		count: "1 file",
		blurb:
			"Locale-scope findings: an unbound catalog file, or a bound file that vanished. Excluded from translation and release work until resolved. (A bound file declaring the wrong @@locale never reaches here — it fails the whole snapshot.)",
		icon: Languages,
		tone: "text-warning",
		blocking: false,
		rows: [
			{
				key: "intl_pt.arb",
				source: "unbound catalog file",
				note: "declares @@locale \"pt\" · 1,459 entries · no Locale Binding",
				from: NEWEST,
				locales: [],
				action: "Bind a Locale",
				editable: false,
			},
		],
	},
	{
		id: "rebase",
		title: "Needs rebase",
		count: "5 values · blocks release",
		blurb:
			"The source contract changed shape, so the old target cannot carry forward unchanged. Held until each is rebased — an invalid message can never be released.",
		icon: AlertTriangle,
		tone: "text-destructive",
		blocking: true,
		stringsFilter: "status:invalid",
		rows: [
			{
				key: "ideas_search_selection_ideas",
				source: "{count, plural, one{…} two{…} other{…}}",
				note: "plural gained a `two` arm · existing arms stay valid, so this rebase is mechanical",
				from: NEWEST,
				locales: [
					locale("de", "invalid", "{count, plural, one{{count} Idee} other{{count} Ideen}}"),
					locale("es", "invalid", "{count, plural, one{{count} idea} other{{count} ideas}}"),
					locale("fr", "invalid", "{count, plural, one{{count} idée} other{{count} idées}}"),
					locale("ru", "invalid", "{count, plural, one{{count} идея} other{{count} идей}}"),
					locale("zh", "invalid", "{count, plural, other{{count} 个创意}}"),
				],
				action: "Rebase all 5",
				editable: true,
			},
		],
	},
	{
		id: "drift",
		title: "Changed in Git",
		count: "3 values",
		blurb:
			"Target values that differ from Blabla's. Blabla's own delivered bundle reconciles silently; these did not match one, so someone edited the ARB by hand. What the report does about them is the open question in the baseline-drift contract.",
		icon: GitCommitHorizontal,
		tone: "text-warning",
		blocking: false,
		rows: [
			{
				key: "activity_feed_subtitle_today",
				source: "Today",
				note: "Git value differs from Blabla's · no bundle delivered this",
				from: NEWEST,
				locales: [
					locale("de", "drifted", "Heute!"),
					locale("es", "ok", "Hoy"),
					locale("fr", "ok", "Aujourd'hui"),
					locale("ru", "ok", "Сегодня"),
					locale("zh", "ok", "今天"),
				],
				action: "Take Git's / keep Blabla's",
				editable: true,
			},
			{
				key: "aboutapp_license",
				source: "License agreement",
				note: "Git value blanked by hand · Blabla holds a translation",
				from: NEWEST,
				locales: [
					locale("de", "ok", "Lizenzvereinbarung"),
					locale("es", "ok", "Acuerdo de licencia"),
					locale("fr", "drifted", ""),
					locale("ru", "ok", "Лицензионное соглашение"),
					locale("zh", "drifted", ""),
				],
				action: "Take Git's / keep Blabla's",
				editable: true,
			},
		],
	},
	{
		id: "archived",
		title: "Archived by sync",
		count: "2 keys",
		blurb:
			"Absent from the source contract, so Blabla archived them automatically. History and translations are retained; restoring one while Git lacks the key creates a Restore Proposal.",
		icon: Archive,
		tone: "text-muted-foreground",
		blocking: false,
		rows: [
			{
				key: "after_scan_page_pom_description",
				source: "There's an app for you!",
				note: "5 target values retained · last edited 12 Jul",
				from: NEWEST,
				locales: [],
				action: "Restore Proposal",
				editable: false,
			},
			{
				key: "leaderboard_intro_collection_with",
				source: "(blank)",
				note: "5 target values retained · all blank",
				from: NEWEST,
				locales: [],
				action: "Restore Proposal",
				editable: false,
				resolved: { what: "accepted the archive", who: "you", when: "1h ago" },
			},
		],
	},
	{
		id: "review",
		title: "To review",
		count: "18 values",
		blurb:
			"The source was reworded, so retained targets went stale. They still ship, but must be confirmed or updated before the next release.",
		icon: Clock,
		tone: "text-warning",
		blocking: false,
		stringsFilter: "status:stale",
		rows: [
			{
				key: "about_app_disclaimer",
				source: "Brickit is not affiliated with LEGO®…",
				note: "disclaimer reworded",
				from: NEWEST,
				locales: [
					locale("de", "stale", "Brickit wurde von Fans erstellt und ist kein offizielles LEGO® Produkt."),
					locale("es", "stale", "Brickit fue creado por fans y no es un producto LEGO® oficial."),
					locale("fr", "ok", "Brickit n'est pas affilié à LEGO®."),
					locale("ru", "missing", ""),
					locale("zh", "stale", "Brickit 由粉丝创建，不是official LEGO® 产品。"),
				],
				action: "Confirm 3",
				editable: true,
			},
			{
				key: "activity_feed_title",
				source: "What's new",
				note: "straight apostrophe → typographic",
				from: NEWEST,
				locales: [
					locale("de", "ok", "Was ist neu"),
					locale("es", "ok", "Novedades"),
					locale("fr", "ok", "Quoi de neuf"),
					locale("ru", "ok", "Что нового"),
					locale("zh", "ok", "最新动态"),
				],
				action: "Confirm all 5",
				editable: true,
				resolved: { what: "confirmed all 5 unchanged", who: "you", when: "1h ago" },
			},
			{
				key: "aboutapp_insta",
				source: "Follow Brickit on Instagram",
				note: "reworded",
				from: "19a07bc",
				locales: [
					locale("de", "stale", "Brickit auf Instagram"),
					locale("es", "stale", "Brickit en Instagram"),
					locale("fr", "stale", "Brickit sur Instagram"),
					locale("ru", "stale", "Brickit в Instagram"),
					locale("zh", "stale", "Instagram 上的 Brickit"),
				],
				action: "Confirm all 5",
				editable: true,
			},
		],
	},
	{
		id: "translate",
		title: "To translate",
		count: "30 values",
		blurb:
			"6 keys arrived from Git. Ordinary translation work — nothing was decided on your behalf and nothing needs recovering.",
		icon: Plus,
		tone: "text-success",
		blocking: false,
		stringsFilter: "status:missing",
		rows: [
			{
				key: "sets_detail_missing_parts_title",
				source: "Missing parts",
				note: "new key",
				from: NEWEST,
				locales: [
					locale("de", "missing", ""),
					locale("es", "missing", ""),
					locale("fr", "missing", ""),
					locale("ru", "missing", ""),
					locale("zh", "missing", ""),
				],
				action: "Translate",
				editable: true,
			},
			{
				key: "paywall_annual_savings",
				source: "Save {percent}%",
				note: "new key · carries a placeholder",
				from: NEWEST,
				locales: [
					locale("de", "missing", ""),
					locale("es", "missing", ""),
					locale("fr", "missing", ""),
					locale("ru", "missing", ""),
					locale("zh", "missing", ""),
				],
				action: "Translate",
				editable: true,
			},
		],
	},
];

function LocaleChips({ locales }: { locales: WorkRow["locales"] }) {
	if (locales.length === 0) return null;
	return (
		<span className="flex flex-wrap gap-1">
			{locales.map((entry) => (
				<span
					key={entry.code}
					className={cn(
						"inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
						STATE_TONE[entry.state],
					)}
				>
					{entry.code}
					<span className="opacity-70">{entry.state}</span>
				</span>
			))}
		</span>
	);
}

function WorkRowView({ row, newest }: { row: WorkRow; newest: string }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="flex flex-col">
			<div className="grid grid-cols-[1fr_auto] items-start gap-3 px-3 py-2.5">
				<button
					type="button"
					onClick={() => row.locales.length > 0 && setOpen(!open)}
					className="flex min-w-0 flex-col items-start gap-1 text-left"
				>
					<span className="flex items-center gap-1.5">
						{row.locales.length > 0 ? (
							open ? (
								<ChevronDown aria-hidden className="size-3 text-muted-foreground" />
							) : (
								<ChevronRight aria-hidden className="size-3 text-muted-foreground" />
							)
						) : null}
						<span className="truncate font-mono text-xs">{row.key}</span>
						{row.from !== newest ? (
							<Badge variant="ghost" className="font-mono">
								<GitCommitHorizontal data-icon="inline-start" />
								{row.from}
							</Badge>
						) : null}
					</span>
					<span className="truncate text-muted-foreground text-xs">
						{row.source} — {row.note}
					</span>
					<LocaleChips locales={row.locales} />
				</button>
				<Button size="sm" variant="outline">
					{row.action}
				</Button>
			</div>
			{open ? (
				<div className="flex flex-col gap-1.5 border-t bg-muted/20 px-3 py-2.5">
					{row.locales.map((entry) => (
						<div key={entry.code} className="flex items-center gap-2">
							<span
								className={cn(
									"w-14 shrink-0 font-mono text-[10px]",
									STATE_TONE[entry.state],
								)}
							>
								{entry.code} {entry.state}
							</span>
							{row.editable ? (
								<Input
									defaultValue={entry.value}
									placeholder="—"
									className="h-7 font-mono text-xs"
								/>
							) : (
								<span className="truncate font-mono text-xs">{entry.value}</span>
							)}
							<Button size="sm" variant="ghost">
								<Check data-icon="inline-start" />
								Save
							</Button>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

function VariantD() {
	return (
		<>
			<PageHeader
				title="What sync changed"
				description="Everything automatic sync left on your desk, newest snapshot first, grouped by the work each consequence needs. Syncs with no consequence never appear."
				action={
					<Button size="sm" variant="ghost">
						Sync history
						<ArrowRight data-icon="inline-end" />
					</Button>
				}
			/>
			<div className="flex flex-col gap-5">
				{WORK.map((bucket) => (
					<section key={bucket.id} className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center gap-2">
							<bucket.icon aria-hidden className={cn("size-4", bucket.tone)} />
							<h2 className="font-medium text-sm">{bucket.title}</h2>
							<Badge variant={bucket.blocking ? "destructive" : "secondary"}>
								{bucket.count}
							</Badge>
							{bucket.stringsFilter ? (
								<Button size="sm" variant="ghost" className="ml-auto">
									Open in Strings
									<ArrowRight data-icon="inline-end" />
								</Button>
							) : null}
						</div>
						<p className="max-w-3xl text-muted-foreground text-xs">{bucket.blurb}</p>
						<Card size="sm">
							<CardContent className="divide-y p-0">
								{bucket.rows.map((row) => (
									<WorkRowView key={row.key} row={row} newest={NEWEST} />
								))}
							</CardContent>
						</Card>
					</section>
				))}
			</div>
		</>
	);
}

/* ------------------------- variants E / F / G — where does the work happen? */

// Same worklist, same fixture, three answers to "how much of the work lives
// here versus on the Strings page, which already filters on these statuses".

function ResolvedNote({ resolved }: { resolved: NonNullable<WorkRow["resolved"]> }) {
	return (
		<span className="inline-flex items-center gap-1.5 text-success text-xs">
			<Check aria-hidden className="size-3" />
			{resolved.what} · {resolved.who} · {resolved.when}
		</span>
	);
}

function BucketFrame({
	bucket,
	children,
	trailing,
}: {
	bucket: WorkBucket;
	children: ReactNode;
	trailing?: ReactNode;
}) {
	const outstanding = bucket.rows.filter((row) => !row.resolved).length;
	return (
		<section className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<bucket.icon aria-hidden className={cn("size-4", bucket.tone)} />
				<h2 className="font-medium text-sm">{bucket.title}</h2>
				<Badge variant={bucket.blocking ? "destructive" : "secondary"}>
					{bucket.count}
				</Badge>
				{outstanding === 0 ? (
					<Badge variant="outline" className="text-success">
						<Check data-icon="inline-start" />
						all dispositioned
					</Badge>
				) : null}
				{trailing ? <div className="ml-auto">{trailing}</div> : null}
			</div>
			<p className="max-w-3xl text-muted-foreground text-xs">{bucket.blurb}</p>
			<Card size="sm">
				<CardContent className="divide-y p-0">{children}</CardContent>
			</Card>
		</section>
	);
}

function RowHead({ row }: { row: WorkRow }) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<span className="flex items-center gap-1.5">
				<span
					className={cn(
						"truncate font-mono text-xs",
						row.resolved ? "text-muted-foreground line-through" : null,
					)}
				>
					{row.key}
				</span>
				{row.from !== NEWEST ? (
					<Badge variant="ghost" className="font-mono">
						<GitCommitHorizontal data-icon="inline-start" />
						{row.from}
					</Badge>
				) : null}
			</span>
			<span className="truncate text-muted-foreground text-xs">
				{row.source} — {row.note}
			</span>
			{row.resolved ? (
				<ResolvedNote resolved={row.resolved} />
			) : (
				<LocaleChips locales={row.locales} />
			)}
		</div>
	);
}

// E — thin worklist. One-click dispositions only; anything needing typing
// hands off to Strings with the filter applied.
function VariantE() {
	return (
		<>
			<PageHeader
				title="What sync changed"
				description="Explains and undoes. Typing happens on Strings, which already filters on these statuses."
			/>
			<div className="flex flex-col gap-5">
				{WORK.map((bucket) => (
					<BucketFrame
						key={bucket.id}
						bucket={bucket}
						trailing={
							bucket.stringsFilter ? (
								<Button size="sm" variant="outline">
									Open {bucket.count.split(" ")[0]} in Strings
									<ArrowRight data-icon="inline-end" />
								</Button>
							) : null
						}
					>
						{bucket.rows.map((row) => (
							<div
								key={row.key}
								className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5"
							>
								<RowHead row={row} />
								{row.resolved ? null : (
									<Button size="sm" variant="outline">
										{row.action}
									</Button>
								)}
							</div>
						))}
					</BucketFrame>
				))}
			</div>
		</>
	);
}

// F — the worklist owns the work. Every locale is editable in place, buckets
// expand wholesale, and Strings goes back to being browse and search.
function VariantF() {
	const [openAll, setOpenAll] = useState(true);
	return (
		<>
			<PageHeader
				title="What sync changed"
				description="The full working surface for everything a sync produced. Strings stays for browsing and search."
				action={
					<Button size="sm" variant="ghost" onClick={() => setOpenAll(!openAll)}>
						{openAll ? "Collapse all" : "Expand all"}
					</Button>
				}
			/>
			<div className="flex flex-col gap-5">
				{WORK.map((bucket) => (
					<BucketFrame key={bucket.id} bucket={bucket}>
						{bucket.rows.map((row) => (
							<div key={row.key} className="flex flex-col">
								<div className="grid grid-cols-[1fr_auto] items-start gap-3 px-3 py-2.5">
									<RowHead row={row} />
									{row.resolved ? null : (
										<Button size="sm" variant="outline">
											{row.action}
										</Button>
									)}
								</div>
								{openAll && row.editable && !row.resolved ? (
									<div className="flex flex-col gap-1.5 border-t bg-muted/20 px-3 py-2.5">
										{row.locales.map((entry) => (
											<div key={entry.code} className="flex items-center gap-2">
												<span
													className={cn(
														"w-16 shrink-0 font-mono text-[10px]",
														STATE_TONE[entry.state],
													)}
												>
													{entry.code} {entry.state}
												</span>
												<Input
													defaultValue={entry.value}
													placeholder="—"
													className="h-7 font-mono text-xs"
												/>
												<Button size="sm" variant="ghost">
													<Check data-icon="inline-start" />
													Save
												</Button>
											</div>
										))}
									</div>
								) : null}
							</div>
						))}
					</BucketFrame>
				))}
			</div>
		</>
	);
}

// G — one editor, two entry points. Rows are thin, but opening one slides in
// the same string editor Strings uses, so nothing is reimplemented and you
// never leave the worklist.
function VariantG() {
	const [active, setActive] = useState<WorkRow | null>(null);

	return (
		<>
			<PageHeader
				title="What sync changed"
				description="Rows explain and undo; editing opens the same string editor Strings uses, in place."
			/>
			<div className="flex flex-col gap-5">
				{WORK.map((bucket) => (
					<BucketFrame
						key={bucket.id}
						bucket={bucket}
						trailing={
							bucket.stringsFilter ? (
								<Button size="sm" variant="ghost">
									Open in Strings
									<ArrowRight data-icon="inline-end" />
								</Button>
							) : null
						}
					>
						{bucket.rows.map((row) => (
							<div
								key={row.key}
								className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5"
							>
								<RowHead row={row} />
								{row.resolved ? null : (
									<div className="flex gap-2">
										{row.editable ? (
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setActive(row)}
											>
												Edit
											</Button>
										) : null}
										<Button size="sm" variant="outline">
											{row.action}
										</Button>
									</div>
								)}
							</div>
						))}
					</BucketFrame>
				))}
			</div>

			<Sheet open={active !== null} onOpenChange={() => setActive(null)}>
				<SheetContent side="right" className="w-[min(34rem,92vw)]">
					<SheetHeader>
						<SheetTitle className="font-mono text-sm">{active?.key}</SheetTitle>
						<SheetDescription>
							The shared string editor — same component Strings renders.
						</SheetDescription>
					</SheetHeader>
					<div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
						<div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-2.5">
							<span className="text-muted-foreground text-[10px] uppercase tracking-wider">
								Source
							</span>
							<span className="font-mono text-xs">{active?.source}</span>
						</div>
						{active?.locales.map((entry) => (
							<div key={entry.code} className="flex flex-col gap-1">
								<span
									className={cn(
										"font-mono text-[10px] uppercase tracking-wider",
										STATE_TONE[entry.state],
									)}
								>
									{entry.code} · {entry.state}
								</span>
								<Input
									defaultValue={entry.value}
									placeholder="—"
									className="font-mono text-xs"
								/>
							</div>
						))}
						<div className="flex gap-2 pt-1">
							<Button size="sm">Save all</Button>
							<Button size="sm" variant="outline" onClick={() => setActive(null)}>
								Cancel
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
}

/* ------------------------------------ variant H — snapshot-scoped worklist */

// Corrections this variant carries over D–G:
//  · a report describes ONE baseline→snapshot transition. No cross-commit rows,
//    so no provenance chips inside it. Older unresolved work is simply still
//    true of the database, and is reached through Strings.
//  · no "needs rebase" bucket. Contract changes auto-transform where the
//    transform loses nothing, and the residue surfaces as ordinary work with a
//    reason. Only values that cannot be represented at all stay broken.
//  · ICU plural categories are per language, so a shape change lands differently
//    in every locale — zh is finished the moment it is wrapped, ru needs three
//    more arms.
//  · one report-level "Open in Strings", filtered to everything needing
//    attention; sub-filtering happens there.
//  · the editor opens inline under the row, not in a drawer, and grows for long
//    values.

type HState =
	| "done"
	| "stale"
	| "missing"
	| "incomplete"
	| "broken"
	| "drifted"
	| "identical";

const H_TONE: Record<HState, string> = {
	done: "text-success",
	stale: "text-warning",
	missing: "text-muted-foreground",
	incomplete: "text-warning",
	broken: "text-destructive",
	drifted: "text-warning",
	identical: "text-muted-foreground",
};

type HLocale = { code: string; state: HState; value: string; why?: string };
type HRow = {
	key: string;
	source: string;
	auto: string | null;
	locales: HLocale[];
	action?: string;
	resolved?: string;
};
type HBucket = {
	id: string;
	title: string;
	blurb: string;
	icon: typeof Plus;
	tone: string;
	blocking: boolean;
	rows: HRow[];
};

const H_WORK: HBucket[] = [
	{
		id: "locale",
		title: "Locale setup",
		blurb: "Not bound to a Locale, so it takes no part in translation or release.",
		icon: Languages,
		tone: "text-warning",
		blocking: false,
		rows: [
			{
				key: "intl_pt.arb",
				source: "declares @@locale \"pt\" · 1,459 entries",
				auto: null,
				locales: [],
				action: "Bind a Locale",
			},
		],
	},
	{
		id: "broken",
		title: "Broken by a source change",
		blurb: "Nothing correct could be derived from these. They cannot be released.",
		icon: AlertTriangle,
		tone: "text-destructive",
		blocking: true,
		rows: [
			{
				key: "sets_detail_part_count",
				source: "Parts in this set   ← was “{count} parts in this set”",
				auto: null,
				locales: [
					{ code: "de", state: "broken", value: "{count} Teile in diesem Set", why: "references {count}, removed from the source" },
					{ code: "es", state: "done", value: "Piezas de este set" },
					{ code: "fr", state: "missing", value: "" },
					{ code: "ru", state: "broken", value: "{count} деталей в наборе", why: "references {count}, removed from the source" },
					{ code: "zh", state: "missing", value: "" },
				],
			},
		],
	},
	{
		id: "drift",
		title: "Changed in Git",
		blurb: "Edited by hand outside Blabla. Git's value is now current; review it.",
		icon: GitCommitHorizontal,
		tone: "text-warning",
		blocking: false,
		rows: [
			{
				key: "activity_feed_subtitle_today",
				source: "Today",
				auto: "Git's value taken. Blabla's previous value is in history.",
				locales: [
					{ code: "de", state: "drifted", value: "Heute!", why: "Blabla held “Heute”" },
					{ code: "es", state: "done", value: "Hoy" },
					{ code: "fr", state: "done", value: "Aujourd'hui" },
					{ code: "ru", state: "done", value: "Сегодня" },
					{ code: "zh", state: "done", value: "今天" },
				],
				action: "Confirm 1",
			},
		],
	},
	{
		id: "archived",
		title: "Archived by sync",
		blurb: "Gone from the source. History and translations are retained.",
		icon: Archive,
		tone: "text-muted-foreground",
		blocking: false,
		rows: [
			{
				key: "after_scan_page_pom_description",
				source: "There's an app for you!",
				auto: null,
				locales: [],
				action: "Restore Proposal",
			},
			{
				key: "leaderboard_intro_collection_with",
				source: "(blank in every locale)",
				auto: null,
				locales: [],
				action: "Restore Proposal",
				resolved: "accepted the archive · you · 1h ago",
			},
		],
	},
	{
		id: "review",
		title: "To review",
		blurb: "The source was reworded. These still ship, but go stale until confirmed.",
		icon: Clock,
		tone: "text-warning",
		blocking: false,
		rows: [
			{
				key: "about_app_disclaimer",
				source: "Brickit is not affiliated with the LEGO Group.",
				auto: null,
				locales: [
					{ code: "de", state: "stale", value: "Brickit wurde von Fans erstellt und ist kein offizielles LEGO® Produkt." },
					{ code: "es", state: "stale", value: "Brickit fue creado por fans y no es un producto LEGO® oficial." },
					{ code: "fr", state: "missing", value: "", why: "never translated — a reworded source changes nothing here" },
					{ code: "ru", state: "stale", value: "Brickit создан фанатами и не является официальным продуктом LEGO®." },
					{ code: "zh", state: "missing", value: "" },
				],
				action: "Confirm 3",
			},
			{
				key: "ads_banner_close_button_text",
				source: "Remove ads   ← was “Go ad-free”",
				auto: null,
				locales: [
					{ code: "de", state: "stale", value: "Werbefrei" },
					{ code: "es", state: "identical", value: "Go ad-free", why: "source-identical and never human-saved — disposition still undecided" },
					{ code: "fr", state: "missing", value: "" },
					{ code: "ru", state: "stale", value: "Без рекламы" },
					{ code: "zh", state: "missing", value: "" },
				],
				action: "Confirm 2",
			},
		],
	},
	{
		id: "translate",
		title: "To translate",
		blurb: "New keys, and values a contract change left incomplete.",
		icon: Plus,
		tone: "text-success",
		blocking: false,
		rows: [
			{
				key: "ideas_search_selection_ideas",
				source: "{count, plural, one{{count} idea} other{{count} ideas}}   ← was “{count} ideas”",
				auto: "Each existing value wrapped in other{} — nothing lost.",
				locales: [
					{ code: "de", state: "incomplete", value: "{count, plural, other{{count} Ideen}}", why: "German needs one" },
					{ code: "es", state: "incomplete", value: "{count, plural, other{{count} ideas}}", why: "Spanish needs one, many" },
					{ code: "fr", state: "incomplete", value: "{count, plural, other{{count} idées}}", why: "French needs one, many" },
					{ code: "ru", state: "incomplete", value: "{count, plural, other{{count} идей}}", why: "Russian needs one, few, many" },
					{ code: "zh", state: "done", value: "{count, plural, other{{count} 个创意}}", why: "Chinese uses other only — complete" },
				],
			},
			{
				key: "paywall_annual_savings",
				source: "Save {percent}%",
				auto: null,
				locales: [
					{ code: "de", state: "missing", value: "" },
					{ code: "es", state: "missing", value: "" },
					{ code: "fr", state: "missing", value: "" },
					{ code: "ru", state: "missing", value: "" },
					{ code: "zh", state: "missing", value: "" },
				],
			},
			{
				key: "sets_detail_missing_parts_title",
				source: "Missing parts",
				auto: null,
				locales: [
					{ code: "de", state: "done", value: "Fehlende Teile" },
					{ code: "es", state: "missing", value: "" },
					{ code: "fr", state: "missing", value: "" },
					{ code: "ru", state: "missing", value: "" },
					{ code: "zh", state: "missing", value: "" },
				],
				resolved: "de translated · you · 20m ago",
			},
		],
	},
];

function HRowView({ row }: { row: HRow }) {
	const [open, setOpen] = useState(false);
	const long = row.source.length > 60;

	return (
		<div className="flex flex-col">
			<div className="grid grid-cols-[1fr_auto] items-start gap-3 px-3 py-2.5">
				<button
					type="button"
					onClick={() => row.locales.length > 0 && setOpen(!open)}
					className="flex min-w-0 flex-col items-start gap-1 text-left"
				>
					<span className="flex items-center gap-1.5">
						{row.locales.length > 0 ? (
							open ? (
								<ChevronDown aria-hidden className="size-3 text-muted-foreground" />
							) : (
								<ChevronRight aria-hidden className="size-3 text-muted-foreground" />
							)
						) : null}
						<span className="font-mono text-xs">{row.key}</span>
					</span>
					<span className="truncate text-muted-foreground text-xs">{row.source}</span>
					{row.auto ? (
						<span className="inline-flex items-start gap-1.5 text-muted-foreground text-xs italic">
							<Check aria-hidden className="mt-0.5 size-3 shrink-0 text-success" />
							{row.auto}
						</span>
					) : null}
					{row.resolved ? (
						<span className="inline-flex items-center gap-1.5 text-success text-xs">
							<Check aria-hidden className="size-3" />
							{row.resolved}
						</span>
					) : null}
					<span className="flex flex-wrap gap-1 pt-0.5">
						{row.locales.map((entry) => (
							<span
								key={entry.code}
								className={cn(
									"inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
									H_TONE[entry.state],
								)}
							>
								{entry.code}
								<span className="opacity-70">{entry.state}</span>
							</span>
						))}
					</span>
				</button>
				{row.action ? (
					<Button size="sm" variant="outline">
						{row.action}
					</Button>
				) : null}
			</div>
			{open ? (
				// Inline, in place — the shared string editor, not a drawer.
				<div className="flex flex-col gap-2.5 border-t bg-muted/20 px-3 py-3">
					{row.locales.map((entry) => (
						<div key={entry.code} className="flex flex-col gap-1">
							<span className="flex items-baseline gap-2">
								<span
									className={cn(
										"font-mono text-[10px] uppercase tracking-wider",
										H_TONE[entry.state],
									)}
								>
									{entry.code} · {entry.state}
								</span>
								{entry.why ? (
									<span className="text-muted-foreground text-[10px]">
										{entry.why}
									</span>
								) : null}
							</span>
							{entry.state === "done" ? (
								<span className="font-mono text-muted-foreground text-xs">
									{entry.value}
								</span>
							) : long || entry.value.length > 60 ? (
								<Textarea
									defaultValue={entry.value}
									placeholder="—"
									rows={2}
									className="font-mono text-xs"
								/>
							) : (
								<Input
									defaultValue={entry.value}
									placeholder="—"
									className="h-7 font-mono text-xs"
								/>
							)}
						</div>
					))}
					<div>
						<Button size="sm">Save</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}

function VariantH() {
	return (
		<>
			<PageHeader
				title="Sync 6f2c81d"
				description="What changed between the accepted baseline and this snapshot, and what it left for you. One commit, one report — older unresolved work lives in Strings."
				action={
					<Button size="sm" variant="outline">
						Open 21 in Strings
						<ArrowRight data-icon="inline-end" />
					</Button>
				}
			/>
			<div className="flex flex-col gap-5">
				{H_WORK.map((bucket) => (
					<section key={bucket.id} className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center gap-2">
							<bucket.icon aria-hidden className={cn("size-4", bucket.tone)} />
							<h2 className="font-medium text-sm">{bucket.title}</h2>
							{bucket.blocking ? (
								<Badge variant="destructive">blocks release</Badge>
							) : null}
						</div>
						<p className="max-w-3xl text-muted-foreground text-xs">{bucket.blurb}</p>
						<Card size="sm">
							<CardContent className="divide-y p-0">
								{bucket.rows.map((row) => (
									<HRowView key={row.key} row={row} />
								))}
							</CardContent>
						</Card>
					</section>
				))}
			</div>
		</>
	);
}

/* ---------------------------------------------------------------- switcher */

const VARIANTS = [
	{ key: "A", name: "Sync feed" },
	{ key: "B", name: "Report document" },
	{ key: "C", name: "Consequence worklist" },
	{ key: "D", name: "Worklist, refined" },
	{ key: "E", name: "Thin — Strings does the work" },
	{ key: "F", name: "Full — worklist owns the work" },
	{ key: "G", name: "Shared editor, opened in place" },
	{ key: "H", name: "Snapshot-scoped, auto-transformed" },
];

function PrototypeReconciliationRoute() {
	// Top-level route so the prototype opens without signing in.
	const projectId = "prototype";
	const { variant } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		// Fixture-only: no Convex query, so any :projectId in the URL renders.
		<ProjectShell projectId={projectId} title="Brickit">
			{variant === "B" ? (
				<VariantB />
			) : variant === "C" ? (
				<VariantC />
			) : variant === "D" ? (
				<VariantD />
			) : variant === "E" ? (
				<VariantE />
			) : variant === "F" ? (
				<VariantF />
			) : variant === "G" ? (
				<VariantG />
			) : variant === "H" ? (
				<VariantH />
			) : (
				<VariantA />
			)}
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
