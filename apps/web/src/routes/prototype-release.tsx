// PROTOTYPE ONLY — throwaway. Four variants of the Release Record surface on
// one route, switchable via ?variant=. Answers "Prototype the release record
// and batch-decision experience" (#16). Delete with the branch that holds it.
//
// A — Gate: posture first, then an ordered list of what stands in the way.
// B — Matrix: locale × finding-kind grid, drill into a cell, decisions ride in
//     a persistent tray that always shows exact membership.
// C — Query: one flat findings table with facets; filter is the selection tool.
// D — Dossier: the record as a durable document you can read six months later.

import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import { Checkbox } from "@blabla/ui/components/checkbox";
import { Input } from "@blabla/ui/components/input";
import { Separator } from "@blabla/ui/components/separator";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	CircleSlash,
	Clock,
	FileText,
	Package,
	ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
	type Disposition,
	EVIDENCE,
	type Finding,
	type FindingKind,
	FINDINGS,
	HISTORY,
	IDENTICAL_BY_LOCALE,
	IDENTICAL_TOTAL,
	INTENTIONAL_BLANK_BY_LOCALE,
	INTENTIONAL_BLANK_TOTAL,
	KIND_LABEL,
	KIND_ORDER,
	KIND_SHORT,
	LOCALE_LABEL,
	POSTURE_TONE,
	postureOf,
	SCREENS,
	SNAPSHOT,
	TAGS,
	TARGET_LOCALES,
} from "@/components/localization/prototype-release-data";
import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { PrototypeVariantSwitcher } from "@/components/localization/prototype-variant-switcher";

export const Route = createFileRoute("/prototype-release")({
	validateSearch: (search: Record<string, unknown>) => ({
		variant: typeof search.variant === "string" ? search.variant : "E",
	}),
	component: PrototypeReleaseRoute,
});

const VARIANTS = [
	{ key: "A", name: "Gate" },
	{ key: "B", name: "Matrix" },
	{ key: "C", name: "Query" },
	{ key: "D", name: "Dossier" },
	{ key: "E", name: "Pre-flight — where this landed" },
];

const NOW = "2 Aug, 11:40";
const ME = "Sergey";

type ReleaseState = ReturnType<typeof useReleaseState>;

function useReleaseState() {
	const [dispositions, setDispositions] = useState<
		Record<string, Disposition>
	>({});

	const apply = (ids: string[], kind: Disposition["kind"]) => {
		setDispositions((current) => {
			const next = { ...current };
			for (const id of ids) next[id] = { kind, at: NOW, by: ME };
			return next;
		});
	};

	const open = useMemo(
		() => FINDINGS.filter((finding) => !dispositions[finding.id]),
		[dispositions],
	);

	return {
		dispositions,
		open,
		posture: postureOf(FINDINGS, dispositions),
		approve: (ids: string[]) => apply(ids, "approved-fallback"),
		confirm: (ids: string[]) => apply(ids, "confirmed"),
		fix: (ids: string[]) => apply(ids, "fixed"),
		reset: () => setDispositions({}),
	};
}

function countBy(findings: Finding[], kind: FindingKind, locale?: string) {
	return findings.filter(
		(finding) =>
			finding.kind === kind && (locale ? finding.locale === locale : true),
	).length;
}

function Fingerprint({ value }: { value: string }) {
	return (
		<span className="font-mono text-[10px] text-muted-foreground">{value}</span>
	);
}

function PostureBadge({ posture }: { posture: string }) {
	return (
		<span
			className={`font-medium text-sm ${POSTURE_TONE[posture as keyof typeof POSTURE_TONE]}`}
		>
			{posture}
		</span>
	);
}

function SnapshotLine() {
	return (
		<span className="text-muted-foreground text-xs">
			Snapshot{" "}
			<span className="font-mono text-foreground">{SNAPSHOT.commit}</span> ·{" "}
			{SNAPSHOT.keys.toLocaleString()} keys · {TARGET_LOCALES.length} bound
			locales · opened {SNAPSHOT.openedAt} by {SNAPSHOT.openedBy}
		</span>
	);
}

function BuildBar({ state }: { state: ReleaseState }) {
	const buildable =
		state.posture === "Ready" || state.posture === "Ready with Deviations";
	const approved = Object.values(state.dispositions).filter(
		(disposition) => disposition.kind === "approved-fallback",
	).length;
	return (
		<div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background/95 py-3 backdrop-blur">
			<div className="flex flex-col gap-0.5">
				<PostureBadge posture={state.posture} />
				<span className="text-muted-foreground text-xs">
					{state.open.length === 0
						? approved > 0
							? `${approved} approved source fallbacks travel with this build`
							: "Every bound locale is current"
						: `${state.open.length} findings still need a disposition`}
				</span>
			</div>
			<Button size="sm" disabled={!buildable}>
				<Package data-icon="inline-start" />
				Build release
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------- variant A

function VariantA({ state }: { state: ReleaseState }) {
	const [expanded, setExpanded] = useState<FindingKind | null>("contract");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [localeFilter, setLocaleFilter] = useState<string | null>(null);

	const groups = KIND_ORDER.map((kind) => ({
		kind,
		findings: state.open.filter((finding) => finding.kind === kind),
	})).filter((group) => group.findings.length > 0);

	const toggle = (id: string) =>
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<>
			<PageHeader title="Release" description={undefined} />
			<div className="mb-6 flex items-baseline justify-between gap-3">
				<div className="flex flex-col gap-1">
					<PostureBadge posture={state.posture} />
					<SnapshotLine />
				</div>
				<Button size="sm" variant="ghost">
					<Clock data-icon="inline-start" />
					History
				</Button>
			</div>

			{groups.length === 0 ? (
				<Card size="sm">
					<CardContent className="py-6 text-center text-muted-foreground text-sm">
						Nothing stands in the way.
					</CardContent>
				</Card>
			) : null}

			<div className="flex flex-col gap-3">
				{groups.map((group) => {
					const isOpen = expanded === group.kind;
					const visible = group.findings.filter((finding) =>
						localeFilter ? finding.locale === localeFilter : true,
					);
					const shown = visible.slice(0, 40);
					const selectedHere = group.findings.filter((finding) =>
						selected.has(finding.id),
					);
					const localeCounts = TARGET_LOCALES.map((locale) => ({
						locale,
						count: group.findings.filter((finding) => finding.locale === locale)
							.length,
					})).filter((entry) => entry.count > 0);

					return (
						<Card key={group.kind} size="sm">
							<CardContent className="flex flex-col gap-3">
								<button
									type="button"
									className="flex items-center gap-2 text-left"
									onClick={() => {
										setExpanded(isOpen ? null : group.kind);
										setLocaleFilter(null);
									}}
								>
									{isOpen ? (
										<ChevronDown className="size-4 text-muted-foreground" />
									) : (
										<ChevronRight className="size-4 text-muted-foreground" />
									)}
									<span className="font-medium text-sm">
										{KIND_LABEL[group.kind]}
									</span>
									<Badge
										variant={
											group.kind === "contract" ? "destructive" : "secondary"
										}
									>
										{group.findings.length}
									</Badge>
									<span className="ml-auto text-muted-foreground text-xs">
										{group.kind === "contract"
											? "Cannot be approved"
											: group.kind === "missing"
												? "Translate, or approve the English fallback"
												: group.kind === "blank"
													? "Confirm the blank is intended"
													: "Confirm or update"}
									</span>
								</button>

								{isOpen ? (
									<>
										<div className="flex flex-wrap items-center gap-1">
											<Button
												size="xs"
												variant={localeFilter ? "ghost" : "secondary"}
												onClick={() => setLocaleFilter(null)}
											>
												All {group.findings.length}
											</Button>
											{localeCounts.map((entry) => (
												<Button
													key={entry.locale}
													size="xs"
													variant={
														localeFilter === entry.locale ? "secondary" : "ghost"
													}
													onClick={() =>
														setLocaleFilter(
															localeFilter === entry.locale ? null : entry.locale,
														)
													}
												>
													{entry.locale} {entry.count}
												</Button>
											))}
											<Button
												size="xs"
												variant="outline"
												className="ml-auto"
												onClick={() =>
													setSelected((current) => {
														const next = new Set(current);
														for (const finding of visible) next.add(finding.id);
														return next;
													})
												}
											>
												Select these {visible.length}
											</Button>
										</div>

										<div className="divide-y rounded-none border">
											{shown.map((finding) => (
												<label
													key={finding.id}
													className="flex cursor-pointer items-start gap-2 px-2 py-1.5"
												>
													<Checkbox
														className="mt-0.5"
														checked={selected.has(finding.id)}
														onCheckedChange={() => toggle(finding.id)}
													/>
													<span className="w-8 shrink-0 font-mono text-muted-foreground text-xs">
														{finding.locale}
													</span>
													<span className="flex min-w-0 flex-col gap-0.5">
														<span className="truncate font-mono text-xs">
															{finding.key}
														</span>
														<span className="truncate text-muted-foreground text-xs">
															{finding.value
																? finding.value
																: finding.kind === "blank"
																	? "(empty)"
																	: finding.source}
														</span>
														{finding.note ? (
															<span className="text-[11px] text-muted-foreground">
																{finding.note}
															</span>
														) : null}
													</span>
													<span className="ml-auto shrink-0">
														<Fingerprint value={finding.fingerprint} />
													</span>
												</label>
											))}
										</div>
										{visible.length > shown.length ? (
											<span className="text-muted-foreground text-xs">
												Showing {shown.length} of {visible.length}. Filtering
												does not change what a decision covers.
											</span>
										) : null}

										{selectedHere.length > 0 ? (
											<div className="flex items-center gap-2 border-t pt-3">
												<span className="text-xs">
													{selectedHere.length} selected
												</span>
												{group.kind === "missing" ? (
													<Button
														size="sm"
														onClick={() => {
															state.approve(
																selectedHere.map((finding) => finding.id),
															);
															setSelected(new Set());
														}}
													>
														Approve English fallback for {selectedHere.length}
													</Button>
												) : null}
												{group.kind === "blank" || group.kind === "stale" ? (
													<Button
														size="sm"
														onClick={() => {
															state.confirm(
																selectedHere.map((finding) => finding.id),
															);
															setSelected(new Set());
														}}
													>
														Confirm {selectedHere.length}
													</Button>
												) : null}
												{group.kind === "contract" ? (
													<Button
														size="sm"
														variant="outline"
														onClick={() => {
															state.fix(
																selectedHere.map((finding) => finding.id),
															);
															setSelected(new Set());
														}}
													>
														Open in Strings
													</Button>
												) : null}
												<Button
													size="sm"
													variant="ghost"
													onClick={() => setSelected(new Set())}
												>
													Clear
												</Button>
											</div>
										) : null}
									</>
								) : null}
							</CardContent>
						</Card>
					);
				})}
			</div>

			<div className="mt-4 flex flex-col gap-2 border-t pt-4">
				<span className="text-muted-foreground text-xs">
					Also on this record: {IDENTICAL_TOTAL} values deliberately identical to
					English, {INTENTIONAL_BLANK_TOTAL} deliberate blanks. Finished work, no
					disposition needed.
				</span>
				<div className="flex flex-wrap items-center gap-3">
					{HISTORY.map((record) => (
						<span
							key={record.id}
							className="text-muted-foreground text-xs tabular-nums"
						>
							{record.openedAt} ·{" "}
							<span className="font-mono">{record.commit}</span> ·{" "}
							{record.posture}
						</span>
					))}
				</div>
			</div>

			<div className="mt-2">
				<BuildBar state={state} />
			</div>
		</>
	);
}

// ---------------------------------------------------------------- variant B

function VariantB({ state }: { state: ReleaseState }) {
	const [cell, setCell] = useState<{
		locale: string;
		kind: FindingKind;
	} | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const cellFindings = cell
		? state.open.filter(
				(finding) =>
					finding.locale === cell.locale && finding.kind === cell.kind,
			)
		: [];
	const selectedFindings = FINDINGS.filter((finding) =>
		selected.has(finding.id),
	);
	const selectedByKind = KIND_ORDER.map((kind) => ({
		kind,
		count: selectedFindings.filter((finding) => finding.kind === kind).length,
	})).filter((entry) => entry.count > 0);
	const canApprove =
		selectedFindings.length > 0 &&
		selectedFindings.every((finding) => finding.kind === "missing");

	return (
		<>
			<PageHeader title="Release" />
			<div className="mb-6 flex items-baseline justify-between gap-3">
				<div className="flex flex-col gap-1">
					<PostureBadge posture={state.posture} />
					<SnapshotLine />
				</div>
			</div>

			<Card size="sm" className="mb-4">
				<CardContent className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-muted-foreground text-xs">
								<th className="py-1 text-left font-normal">Locale</th>
								{KIND_ORDER.map((kind) => (
									<th key={kind} className="py-1 text-right font-normal">
										{KIND_SHORT[kind]}
									</th>
								))}
								<th className="py-1 pl-6 text-right font-normal opacity-60">
									Identical
								</th>
								<th className="py-1 text-right font-normal opacity-60">
									Blank OK
								</th>
								<th className="py-1 pl-6 text-right font-normal">Current</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{TARGET_LOCALES.map((locale) => {
								const openHere = state.open.filter(
									(finding) => finding.locale === locale,
								).length;
								return (
									<tr key={locale}>
										<td className="py-1.5">
											<span className="font-mono text-xs">{locale}</span>{" "}
											<span className="text-muted-foreground text-xs">
												{LOCALE_LABEL[locale]}
											</span>
										</td>
										{KIND_ORDER.map((kind) => {
											const count = countBy(state.open, kind, locale);
											const isActive =
												cell?.locale === locale && cell?.kind === kind;
											return (
												<td key={kind} className="py-1.5 text-right">
													{count === 0 ? (
														<span className="text-muted-foreground text-xs">
															·
														</span>
													) : (
														<button
															type="button"
															onClick={() =>
																setCell(isActive ? null : { locale, kind })
															}
															className={`rounded-none px-2 py-0.5 text-xs tabular-nums ${
																isActive
																	? "bg-primary text-primary-foreground"
																	: kind === "contract"
																		? "bg-destructive/10 text-destructive"
																		: "bg-muted"
															}`}
														>
															{count}
														</button>
													)}
												</td>
											);
										})}
										<td className="py-1.5 pl-6 text-right text-muted-foreground text-xs tabular-nums">
											{IDENTICAL_BY_LOCALE[locale] || "·"}
										</td>
										<td className="py-1.5 text-right text-muted-foreground text-xs tabular-nums">
											{INTENTIONAL_BLANK_BY_LOCALE[locale] || "·"}
										</td>
										<td className="py-1.5 pl-6 text-right text-muted-foreground text-xs tabular-nums">
											{(
												((SNAPSHOT.keys - openHere) / SNAPSHOT.keys) *
												100
											).toFixed(1)}
											%
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					<p className="pt-2 text-muted-foreground text-xs">
						The two greyed columns are evidence, not findings: values
						deliberately identical to English and blanks already confirmed.
					</p>
				</CardContent>
			</Card>

			<div className="mb-4 flex flex-wrap items-center gap-3">
				{HISTORY.map((record) => (
					<span key={record.id} className="text-muted-foreground text-xs">
						{record.openedAt} · <span className="font-mono">{record.commit}</span>{" "}
						· {record.posture}
						{record.output ? ` · ${record.output}` : ""}
					</span>
				))}
			</div>

			{cell ? (
				<Card size="sm" className="mb-4">
					<CardContent className="flex flex-col gap-2">
						<div className="flex items-center gap-2">
							<span className="font-medium text-sm">
								{LOCALE_LABEL[cell.locale]} · {KIND_LABEL[cell.kind]}
							</span>
							<Badge variant="secondary">{cellFindings.length}</Badge>
							<Button
								size="xs"
								variant="outline"
								className="ml-auto"
								onClick={() =>
									setSelected((current) => {
										const next = new Set(current);
										for (const finding of cellFindings) next.add(finding.id);
										return next;
									})
								}
							>
								Add all {cellFindings.length} to the decision
							</Button>
						</div>
						<div className="max-h-96 divide-y overflow-y-auto border">
							{cellFindings.map((finding) => (
								<label
									key={finding.id}
									className="flex cursor-pointer items-center gap-2 px-2 py-1.5"
								>
									<Checkbox
										checked={selected.has(finding.id)}
										onCheckedChange={() =>
											setSelected((current) => {
												const next = new Set(current);
												if (next.has(finding.id)) next.delete(finding.id);
												else next.add(finding.id);
												return next;
											})
										}
									/>
									<span className="min-w-0 flex-1 truncate font-mono text-xs">
										{finding.key}
									</span>
									<span className="hidden min-w-0 flex-1 truncate text-muted-foreground text-xs sm:block">
										{finding.value || finding.source}
									</span>
									<Fingerprint value={finding.fingerprint} />
								</label>
							))}
						</div>
					</CardContent>
				</Card>
			) : (
				<p className="mb-4 text-muted-foreground text-sm">
					Pick a cell to see its findings. Cells are a way to reach findings;
					what you decide on is the set you collect below.
				</p>
			)}

			<BuildBar state={state} />

			{selected.size > 0 ? (
				<div className="-translate-x-1/2 fixed bottom-20 left-1/2 z-40 w-[min(52rem,calc(100vw-2rem))] rounded-none border bg-background p-3 shadow-lg">
					<div className="flex items-center gap-2">
						<span className="font-medium text-sm tabular-nums">
							{selected.size} findings
						</span>
						<span className="text-muted-foreground text-xs">
							{selectedByKind
								.map((entry) => `${entry.count} ${KIND_SHORT[entry.kind]}`)
								.join(" · ")}{" "}
							· across{" "}
							{new Set(selectedFindings.map((finding) => finding.locale)).size}{" "}
							locales ·{" "}
							{
								new Set(selectedFindings.map((finding) => finding.fingerprint))
									.size
							}{" "}
							source fingerprints
						</span>
						<Button
							size="sm"
							variant="ghost"
							className="ml-auto"
							onClick={() => setSelected(new Set())}
						>
							Clear
						</Button>
						<Button
							size="sm"
							disabled={!canApprove}
							onClick={() => {
								state.approve(selectedFindings.map((finding) => finding.id));
								setSelected(new Set());
							}}
						>
							Approve English fallback
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={selectedFindings.some(
								(finding) =>
									finding.kind === "contract" || finding.kind === "missing",
							)}
							onClick={() => {
								state.confirm(selectedFindings.map((finding) => finding.id));
								setSelected(new Set());
							}}
						>
							Confirm
						</Button>
					</div>
					{!canApprove && selected.size > 0 ? (
						<p className="mt-1.5 text-muted-foreground text-xs">
							A fallback approval covers missing values only. Deselect the rest
							to approve.
						</p>
					) : null}
				</div>
			) : null}
		</>
	);
}

// ---------------------------------------------------------------- variant C

function VariantC({ state }: { state: ReleaseState }) {
	const [kinds, setKinds] = useState<Set<FindingKind>>(new Set());
	const [locales, setLocales] = useState<Set<string>>(new Set());
	const [screen, setScreen] = useState<string | null>(null);
	const [tag, setTag] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const filtered = state.open.filter((finding) => {
		if (kinds.size > 0 && !kinds.has(finding.kind)) return false;
		if (locales.size > 0 && !locales.has(finding.locale)) return false;
		if (screen && finding.screen !== screen) return false;
		if (tag && finding.tag !== tag) return false;
		if (query && !finding.key.includes(query.toLowerCase())) return false;
		return true;
	});
	const shown = filtered.slice(0, 60);
	const selectedFindings = FINDINGS.filter((finding) =>
		selected.has(finding.id),
	);
	const onlyMissing =
		selectedFindings.length > 0 &&
		selectedFindings.every((finding) => finding.kind === "missing");

	const toggleIn = <T,>(set: Set<T>, value: T, apply: (next: Set<T>) => void) => {
		const next = new Set(set);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		apply(next);
	};

	const facet = (
		label: string,
		active: boolean,
		count: number,
		onClick: () => void,
	) => (
		<button
			key={label}
			type="button"
			onClick={onClick}
			className={`flex w-full items-center justify-between rounded-none px-2 py-1 text-left text-xs ${
				active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
			}`}
		>
			<span>{label}</span>
			<span className="tabular-nums opacity-70">{count}</span>
		</button>
	);

	return (
		<>
			<PageHeader title="Release" />
			<div className="mb-4 flex items-baseline justify-between gap-3">
				<div className="flex flex-col gap-1">
					<PostureBadge posture={state.posture} />
					<SnapshotLine />
				</div>
				<Button size="sm" variant="ghost">
					<Clock data-icon="inline-start" />
					{HISTORY.length} earlier records
				</Button>
			</div>

			<div className="grid grid-cols-[11rem_1fr] gap-4">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-0.5">
						<span className="px-2 pb-1 text-muted-foreground text-xs">
							Needs
						</span>
						{KIND_ORDER.map((kind) =>
							facet(
								KIND_SHORT[kind],
								kinds.has(kind),
								countBy(state.open, kind),
								() => toggleIn(kinds, kind, setKinds),
							),
						)}
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="px-2 pb-1 text-muted-foreground text-xs">
							Locale
						</span>
						{TARGET_LOCALES.map((locale) =>
							facet(
								LOCALE_LABEL[locale],
								locales.has(locale),
								state.open.filter((finding) => finding.locale === locale)
									.length,
								() => toggleIn(locales, locale, setLocales),
							),
						)}
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="px-2 pb-1 text-muted-foreground text-xs">
							Screen
						</span>
						{SCREENS.map((entry) =>
							facet(
								entry,
								screen === entry,
								state.open.filter((finding) => finding.screen === entry).length,
								() => setScreen(screen === entry ? null : entry),
							),
						)}
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="px-2 pb-1 text-muted-foreground text-xs">Tag</span>
						{TAGS.map((entry) =>
							facet(
								entry,
								tag === entry,
								state.open.filter((finding) => finding.tag === entry).length,
								() => setTag(tag === entry ? null : entry),
							),
						)}
					</div>
					<div className="flex flex-col gap-0.5 border-t pt-3">
						<span className="px-2 pb-1 text-muted-foreground text-xs">
							Evidence, not findings
						</span>
						<span className="flex justify-between px-2 py-1 text-muted-foreground text-xs">
							Identical to English
							<span className="tabular-nums">{IDENTICAL_TOTAL}</span>
						</span>
						<span className="flex justify-between px-2 py-1 text-muted-foreground text-xs">
							Blank on purpose
							<span className="tabular-nums">{INTENTIONAL_BLANK_TOTAL}</span>
						</span>
					</div>
				</div>

				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex items-center gap-2">
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Filter keys"
							className="h-7 max-w-64"
						/>
						<span className="text-muted-foreground text-xs tabular-nums">
							{filtered.length} findings
						</span>
						<Button
							size="xs"
							variant="outline"
							className="ml-auto"
							onClick={() =>
								setSelected(new Set(filtered.map((finding) => finding.id)))
							}
						>
							Select all {filtered.length}
						</Button>
					</div>

					<Card size="sm">
						<CardContent className="divide-y p-0">
							{shown.map((finding) => (
								<label
									key={finding.id}
									className="flex cursor-pointer items-center gap-2 py-1.5"
								>
									<Checkbox
										checked={selected.has(finding.id)}
										onCheckedChange={() =>
											toggleIn(selected, finding.id, setSelected)
										}
									/>
									<Badge
										variant={
											finding.kind === "contract" ? "destructive" : "outline"
										}
										className="w-16 justify-center"
									>
										{KIND_SHORT[finding.kind]}
									</Badge>
									<span className="w-6 font-mono text-muted-foreground text-xs">
										{finding.locale}
									</span>
									<span className="min-w-0 flex-1 truncate font-mono text-xs">
										{finding.key}
									</span>
									<span className="hidden min-w-0 flex-1 truncate text-muted-foreground text-xs lg:block">
										{finding.kind === "blank"
											? "(empty)"
											: finding.value || finding.source}
									</span>
									<Fingerprint value={finding.fingerprint} />
								</label>
							))}
							{filtered.length === 0 ? (
								<div className="py-6 text-center text-muted-foreground text-sm">
									No findings match.
								</div>
							) : null}
						</CardContent>
					</Card>
					{filtered.length > shown.length ? (
						<span className="text-muted-foreground text-xs">
							Showing {shown.length} of {filtered.length}. Select all covers the
							full filter, not the visible rows.
						</span>
					) : null}

					{selected.size > 0 ? (
						<Card size="sm">
							<CardContent className="flex flex-col gap-2">
								<div className="flex items-center gap-2">
									<span className="font-medium text-sm tabular-nums">
										{selected.size} findings selected
									</span>
									<span className="text-muted-foreground text-xs">
										{
											new Set(
												selectedFindings.map((finding) => finding.fingerprint),
											).size
										}{" "}
										source fingerprints
									</span>
									<Button
										size="sm"
										variant="ghost"
										className="ml-auto"
										onClick={() => setSelected(new Set())}
									>
										Clear
									</Button>
									<Button
										size="sm"
										disabled={!onlyMissing}
										onClick={() => {
											state.approve(
												selectedFindings.map((finding) => finding.id),
											);
											setSelected(new Set());
										}}
									>
										Approve English fallback
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={selectedFindings.some(
											(finding) =>
												finding.kind === "contract" ||
												finding.kind === "missing",
										)}
										onClick={() => {
											state.confirm(
												selectedFindings.map((finding) => finding.id),
											);
											setSelected(new Set());
										}}
									>
										Confirm
									</Button>
								</div>
								<p className="text-muted-foreground text-xs">
									The decision records these exact findings and their source
									fingerprints. Changing a filter afterwards does not change
									what was approved.
								</p>
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>

			<div className="mt-6">
				<BuildBar state={state} />
			</div>
		</>
	);
}

// ---------------------------------------------------------------- variant D

function VariantD({ state }: { state: ReleaseState }) {
	const [approving, setApproving] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const missing = state.open.filter((finding) => finding.kind === "missing");
	const decisions = Object.entries(state.dispositions);
	const approvedIds = decisions
		.filter(([, disposition]) => disposition.kind === "approved-fallback")
		.map(([id]) => id);

	return (
		<>
			<PageHeader title="Release record" />
			<div className="flex max-w-3xl flex-col gap-6 text-sm">
				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<FileText className="size-4 text-muted-foreground" />
						<span className="font-medium">
							Snapshot{" "}
							<span className="font-mono">{SNAPSHOT.commit}</span> · opened{" "}
							{SNAPSHOT.openedAt} by {SNAPSHOT.openedBy}
						</span>
						<PostureBadge posture={state.posture} />
					</div>
					<p className="text-muted-foreground">
						This record assesses every active bound locale on the snapshot —{" "}
						{TARGET_LOCALES.join(", ")} — against{" "}
						{SNAPSHOT.keys.toLocaleString()} English messages. A locale leaves
						this scope only by being unbound in settings.
					</p>
				</section>

				<Separator />

				<section className="flex flex-col gap-3">
					<h3 className="font-medium">What stands in the way</h3>
					{state.open.length === 0 ? (
						<p className="text-muted-foreground">
							Nothing. Every finding on this record has a disposition.
						</p>
					) : (
						<ul className="flex flex-col gap-2">
							{KIND_ORDER.map((kind) => {
								const findings = state.open.filter(
									(finding) => finding.kind === kind,
								);
								if (findings.length === 0) return null;
								const perLocale = TARGET_LOCALES.map((locale) => ({
									locale,
									count: findings.filter((finding) => finding.locale === locale)
										.length,
								})).filter((entry) => entry.count > 0);
								return (
									<li key={kind} className="flex items-start gap-2">
										{kind === "contract" ? (
											<ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
										) : kind === "missing" ? (
											<AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
										) : (
											<CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
										)}
										<span>
											<span className="font-medium">
												{findings.length} {KIND_LABEL[kind].toLowerCase()}
											</span>{" "}
											<span className="text-muted-foreground">
												—{" "}
												{perLocale
													.map((entry) => `${entry.locale} ${entry.count}`)
													.join(", ")}
												{kind === "contract"
													? ". Contract validity cannot be approved away; this must be fixed in Strings."
													: kind === "missing"
														? ". Each ships English unless it is translated or approved as a fallback."
														: kind === "blank"
															? ". Carried in empty at cutover; nobody has confirmed they are meant to render nothing."
															: ". English wording changed under an existing translation."}
											</span>
										</span>
									</li>
								);
							})}
						</ul>
					)}
					{missing.length > 0 ? (
						<div>
							<Button
								size="sm"
								variant="outline"
								onClick={() => setApproving((current) => !current)}
							>
								Approve source fallbacks…
							</Button>
						</div>
					) : null}
					{approving ? (
						<Card size="sm">
							<CardContent className="flex flex-col gap-2">
								<span className="text-muted-foreground text-xs">
									Pick the exact missing values that may ship English this time.
									The approval is recorded against these findings and their
									source fingerprints; it does not cover anything found later.
								</span>
								<div className="max-h-80 divide-y overflow-y-auto border">
									{missing.slice(0, 80).map((finding) => (
										<label
											key={finding.id}
											className="flex cursor-pointer items-center gap-2 px-2 py-1"
										>
											<Checkbox
												checked={selected.has(finding.id)}
												onCheckedChange={() =>
													setSelected((current) => {
														const next = new Set(current);
														if (next.has(finding.id)) next.delete(finding.id);
														else next.add(finding.id);
														return next;
													})
												}
											/>
											<span className="w-6 font-mono text-muted-foreground text-xs">
												{finding.locale}
											</span>
											<span className="min-w-0 flex-1 truncate font-mono text-xs">
												{finding.key}
											</span>
											<Fingerprint value={finding.fingerprint} />
										</label>
									))}
								</div>
								<div className="flex items-center gap-2">
									<Button
										size="xs"
										variant="ghost"
										onClick={() =>
											setSelected(new Set(missing.map((finding) => finding.id)))
										}
									>
										Select all {missing.length}
									</Button>
									<Button
										size="sm"
										className="ml-auto"
										disabled={selected.size === 0}
										onClick={() => {
											state.approve([...selected]);
											setSelected(new Set());
											setApproving(false);
										}}
									>
										Approve {selected.size}
									</Button>
								</div>
							</CardContent>
						</Card>
					) : null}
				</section>

				<Separator />

				<section className="flex flex-col gap-2">
					<h3 className="font-medium">Decisions on this record</h3>
					{decisions.length === 0 ? (
						<p className="text-muted-foreground">None yet.</p>
					) : (
						<ul className="flex flex-col gap-1 text-muted-foreground">
							{approvedIds.length > 0 ? (
								<li>
									<span className="text-foreground">
										Fallback approval · {approvedIds.length} findings
									</span>{" "}
									— {NOW} by {ME}, bound to{" "}
									{
										new Set(
											FINDINGS.filter((finding) =>
												approvedIds.includes(finding.id),
											).map((finding) => finding.fingerprint),
										).size
									}{" "}
									source fingerprints
								</li>
							) : null}
							{decisions.length - approvedIds.length > 0 ? (
								<li>
									<span className="text-foreground">
										Confirmed · {decisions.length - approvedIds.length} findings
									</span>{" "}
									— {NOW} by {ME}
								</li>
							) : null}
						</ul>
					)}
				</section>

				<Separator />

				<section className="flex flex-col gap-2">
					<h3 className="font-medium">Evidence retained</h3>
					<p className="text-muted-foreground">
						{IDENTICAL_TOTAL} target values are deliberately identical to
						English and{" "}
						{EVIDENCE.filter(
							(item) => item.kind === "intentional-blank",
						).reduce((total, item) => total + item.locales.length, 0)}{" "}
						are deliberately blank. They are finished work, not deviations, and
						they stay listed so a later reader does not mistake them for gaps.
					</p>
					<ul className="flex flex-col gap-1">
						{EVIDENCE.map((item) => (
							<li key={item.id} className="flex items-baseline gap-2">
								<span className="font-mono text-xs">{item.key}</span>
								<span className="font-mono text-muted-foreground text-xs">
									{item.locales.join(" ")}
								</span>
								<span className="text-muted-foreground text-xs">
									{item.kind === "identical" ? `“${item.value}”` : "(blank)"} ·{" "}
									{item.why}
								</span>
							</li>
						))}
					</ul>
				</section>

				<Separator />

				<section className="flex flex-col gap-2">
					<h3 className="font-medium">Earlier records</h3>
					<ul className="flex flex-col gap-1">
						{HISTORY.map((record) => (
							<li key={record.id} className="flex items-baseline gap-2">
								<span className="w-12 text-muted-foreground text-xs">
									{record.openedAt}
								</span>
								<span className="font-mono text-xs">{record.commit}</span>
								<span
									className={`text-xs ${POSTURE_TONE[record.posture]} font-medium`}
								>
									{record.posture}
								</span>
								<span className="text-muted-foreground text-xs">
									{record.summary}
									{record.output ? ` · ${record.output}` : ""}
								</span>
							</li>
						))}
					</ul>
				</section>

				<BuildBar state={state} />
			</div>
		</>
	);
}

// ---------------------------------------------------------------- variant E
// Where this landed. No approval ceremony survives: absence is never shipped
// undecided, an empty value ships only where someone said why, and English in
// a target is an ordinary edit. So the release surface stops being a workbench
// and becomes a pre-flight card with one hand-off into Strings.

function VariantE() {
	const invalid = FINDINGS.filter((finding) => finding.kind === "contract");
	const absent = FINDINGS.filter((finding) => finding.kind === "missing");
	const undocumentedBlank = FINDINGS.filter(
		(finding) => finding.kind === "blank",
	);
	const semanticStale = FINDINGS.filter(
		(finding) => finding.kind === "stale" && finding.impact === "semantic",
	);
	const cosmeticStale = FINDINGS.filter(
		(finding) => finding.kind === "stale" && finding.impact === "cosmetic",
	);

	const undecided = [...absent, ...undocumentedBlank, ...semanticStale];
	const blocking = [...invalid, ...undecided];
	const totalValues = SNAPSHOT.keys * TARGET_LOCALES.length;

	const localeSpread = (findings: typeof FINDINGS) =>
		TARGET_LOCALES.map((locale) => ({
			locale,
			count: findings.filter((finding) => finding.locale === locale).length,
		}))
			.filter((entry) => entry.count > 0)
			.map((entry) => `${entry.locale} ${entry.count}`)
			.join(", ");

	const row = (
		icon: typeof ShieldAlert,
		count: number,
		title: string,
		spread: string,
		explain: string,
		tone?: "destructive",
	) => {
		const Icon = icon;
		return count === 0 ? null : (
			<div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
				<Icon
					className={`mt-0.5 size-4 shrink-0 ${tone === "destructive" ? "text-destructive" : "text-muted-foreground"}`}
				/>
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="text-sm">
						<span className="font-medium tabular-nums">{count}</span> {title}{" "}
						<span className="text-muted-foreground">— {spread}</span>
					</span>
					<span className="text-muted-foreground text-xs">{explain}</span>
				</div>
			</div>
		);
	};

	return (
		<>
			<PageHeader title="Release" />
			<div className="mb-4 flex flex-col gap-1">
				<span className="font-medium text-destructive text-sm">Blocked</span>
				<SnapshotLine />
			</div>

			<Card size="sm" className="mb-4 max-w-3xl">
				<CardContent className="flex flex-col gap-3">
					<span className="font-medium text-sm">Before this can be built</span>
					<div className="divide-y">
						{row(
							ShieldAlert,
							invalid.length,
							"invalid for the contract",
							localeSpread(invalid),
							"Cannot be released and cannot be waived. Fix the value or the source.",
							"destructive",
						)}
						{row(
							CircleSlash,
							absent.length + undocumentedBlank.length,
							"values nobody has decided about",
							localeSpread([...absent, ...undocumentedBlank]),
							"Each would render as a blank label. Blabla will not write a blank nobody chose — translate it, write English into it, or say why it is empty.",
						)}
						{row(
							AlertTriangle,
							semanticStale.length,
							"translations whose English changed meaning",
							localeSpread(semanticStale),
							"Confirm or update. A cosmetic English edit would not stop the build.",
						)}
					</div>
					<div>
						<Button size="sm">
							Work through {blocking.length} in Strings
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card size="sm" className="mb-4 max-w-3xl">
				<CardContent className="flex flex-col gap-2">
					<span className="font-medium text-sm">What this build would ship</span>
					<p className="text-muted-foreground text-xs">
						{(totalValues - blocking.length).toLocaleString()} of{" "}
						{totalValues.toLocaleString()} target values, every one of them
						deliberate.
					</p>
					<ul className="flex flex-col gap-1 text-muted-foreground text-xs">
						<li>
							<span className="text-foreground tabular-nums">
								{IDENTICAL_TOTAL}
							</span>{" "}
							deliberately identical to English — a translator typed it, so it is
							finished work, not a fallback
						</li>
						<li>
							<span className="text-foreground tabular-nums">
								{INTENTIONAL_BLANK_TOTAL}
							</span>{" "}
							deliberately empty, each with a recorded reason that carries to the
							next snapshot
						</li>
						<li>
							<span className="text-foreground tabular-nums">
								{cosmeticStale.length}
							</span>{" "}
							carry an English polish that did not change meaning
						</li>
					</ul>
					<div className="flex flex-col gap-1 pt-1">
						{EVIDENCE.filter((item) => item.kind === "intentional-blank").map(
							(item) => (
								<span key={item.id} className="text-xs">
									<span className="font-mono">{item.key}</span>{" "}
									<span className="font-mono text-muted-foreground">
										{item.locales.join(" ")}
									</span>{" "}
									<span className="text-muted-foreground">— {item.why}</span>
								</span>
							),
						)}
					</div>
				</CardContent>
			</Card>

			<Card size="sm" className="mb-4 max-w-3xl">
				<CardContent className="flex flex-col gap-2">
					<span className="font-medium text-sm">Earlier records</span>
					<ul className="flex flex-col gap-1">
						{HISTORY.map((record) => (
							<li key={record.id} className="flex items-baseline gap-2 text-xs">
								<span className="w-10 text-muted-foreground">
									{record.openedAt}
								</span>
								<span className="font-mono">{record.commit}</span>
								<span
									className={
										record.posture === "Blocked"
											? "text-destructive"
											: "text-success"
									}
								>
									{record.posture === "Ready with Deviations"
										? "Ready"
										: record.posture}
								</span>
								<span className="text-muted-foreground">
									{record.output ?? "never built"}
								</span>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<div className="flex max-w-3xl items-center justify-between gap-3 border-t py-3">
				<span className="text-muted-foreground text-xs">
					{blocking.length} values still need a decision. Nothing here can be
					approved away.
				</span>
				<Button size="sm" disabled>
					<Package data-icon="inline-start" />
					Build release
				</Button>
			</div>
		</>
	);
}

// ---------------------------------------------------------------- route

function PrototypeReleaseRoute() {
	const { variant } = Route.useSearch();
	const navigate = Route.useNavigate();
	const state = useReleaseState();

	return (
		<ProjectShell projectId="prototype" title="Brickit">
			{variant === "A" ? (
				<VariantA state={state} />
			) : variant === "B" ? (
				<VariantB state={state} />
			) : variant === "C" ? (
				<VariantC state={state} />
			) : variant === "D" ? (
				<VariantD state={state} />
			) : (
				<VariantE />
			)}
			<PrototypeVariantSwitcher
				variants={VARIANTS}
				current={variant}
				onChange={(key) => {
					state.reset();
					navigate({ search: { variant: key } });
				}}
			/>
		</ProjectShell>
	);
}
