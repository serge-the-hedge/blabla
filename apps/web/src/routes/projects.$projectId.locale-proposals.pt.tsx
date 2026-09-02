import { Alert, AlertDescription } from "@blabla/ui/components/alert";
import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@blabla/ui/components/card";
import { Checkbox } from "@blabla/ui/components/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@blabla/ui/components/empty";
import { Input } from "@blabla/ui/components/input";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { Textarea } from "@blabla/ui/components/textarea";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import {
	ArrowLeft,
	Check,
	ChevronDown,
	Download,
	Languages,
	Save,
	Search,
	Sparkles,
	TriangleAlert,
	X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { WhitespaceFacts } from "@/components/localization/whitespace-facts";
import { api, convexId } from "@/lib/convex-api";

export const Route = createFileRoute(
	"/projects/$projectId/locale-proposals/pt",
)({
	component: PortugueseLocaleProposalRoute,
});

type ReviewDecision =
	| { kind: "accept" }
	| { kind: "acceptWithEdits"; value: string }
	| { kind: "reject" }
	| { kind: "intentionalBlank"; reason: string };

type ReviewFocus =
	| "awaiting"
	| "attention"
	| "routine"
	| "reviewed"
	| "missing"
	| "all";

function PortugueseLocaleProposalRoute() {
	const { projectId } = useParams({
		from: "/projects/$projectId/locale-proposals/pt",
	});
	return <PortugueseLocaleProposalWorkbench projectId={projectId} />;
}

/** One new-Locale review surface, mounted either from the compatibility Locale
 * route or from a Translation Task whose private adapter is that proposal. */
export function PortugueseLocaleProposalWorkbench({
	projectId,
	initialProposalId,
	taskId,
	title = "New Locale",
	showTaskNavigation = false,
}: {
	projectId: string;
	initialProposalId?: string;
	taskId?: string;
	title?: string;
	showTaskNavigation?: boolean;
}) {
	const convexProjectId = convexId<"projects">(projectId);
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const currentProposalId = useQuery(
		api.localeProposals.currentForReview,
		initialProposalId ? "skip" : { projectId: convexProjectId },
	);
	const ensureForReview = useMutation(api.localeProposals.ensureForReview);
	const stageForReview = useMutation(api.localeProposals.stageForReview);
	const reviewStagedValue = useMutation(api.localeProposals.reviewStagedValue);
	const reviewTaskValue = useMutation(
		api.agentTranslationProposals.reviewTaskValue,
	);
	const acceptTaskCandidates = useMutation(
		api.agentTranslationProposals.acceptTaskCandidates,
	);
	const finalizeForReview = useAction(api.localeProposals.finalizeForReview);
	const finalizeTask = useAction(api.agentTranslationProposals.finalizeTask);
	const artifactForReview = useAction(api.localeProposals.artifactForReview);
	const [proposalId, setProposalId] = useState<string | null>(null);
	const activeProposalId = initialProposalId ?? proposalId ?? currentProposalId;
	const [cursor, setCursor] = useState(0);
	const [cursorHistory, setCursorHistory] = useState<number[]>([]);
	const [focus, setFocus] = useState<ReviewFocus>(taskId ? "awaiting" : "all");
	const [search, setSearch] = useState("");
	const deferredSearch = useDeferredValue(search);
	const detail = useQuery(
		api.localeProposals.getForReview,
		activeProposalId
			? {
					proposalId: convexId<"localeProposals">(activeProposalId),
					...(taskId
						? {
								taskId: convexId<"agentTranslationProposals">(taskId),
							}
						: {}),
					cursor,
					limit: 48,
					focus,
					...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
				}
			: "skip",
	);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [blankReasons, setBlankReasons] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [selectedCandidateTokens, setSelectedCandidateTokens] = useState<
		Record<string, string>
	>({});
	const [expandedMessageId, setExpandedMessageId] = useState<string | null>(
		null,
	);

	// A different proposal is a different editing session, even though this
	// effect only writes local state and the dependency is not read in its body.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on proposal identity
	useEffect(() => {
		setCursor(0);
		setCursorHistory([]);
		setDrafts({});
		setBlankReasons({});
		setSelectedCandidateTokens({});
		setExpandedMessageId(null);
		setBusy(null);
		setError(null);
		setNotice(null);
	}, [activeProposalId]);

	// Review filters are server-backed catalog scans. Reset their cursor so a
	// new question always starts at the beginning of Catalog Order.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on filter identity
	useEffect(() => {
		setCursor(0);
		setCursorHistory([]);
		setSelectedCandidateTokens({});
		setExpandedMessageId(null);
	}, [focus, deferredSearch]);

	const dirtyItems = useMemo(() => {
		if (!detail) return [];
		return detail.messages.flatMap((message) => {
			const draft = drafts[message.messageId];
			const currentValue =
				message.candidate?.value ?? message.value?.value ?? "";
			if (draft === undefined || draft === currentValue) return [];
			if (draft.trim().length === 0) return [];
			return [
				{
					messageId: message.messageId,
					value: draft,
					sourceFingerprint: message.sourceFingerprint,
				},
			];
		});
	}, [detail, drafts]);
	const selectableAgentCandidates = useMemo(() => {
		if (!detail) return [];
		return detail.messages.filter((message) => {
			const taskCandidateValue = message.candidate?.value;
			const legacyAgentValue =
				!taskId && message.value?.updatedBy.kind === "agent"
					? message.value.value
					: undefined;
			const value = taskCandidateValue ?? legacyAgentValue;
			const candidateToken = taskId
				? message.candidate?.revisionId
				: message.value?.reviewToken;
			return (
				message.facts.state === "awaiting" &&
				value !== undefined &&
				value.length > 0 &&
				candidateToken !== undefined &&
				!message.facts.staleSource &&
				(drafts[message.messageId] ?? value) === value
			);
		});
	}, [detail, drafts, taskId]);
	const routineAgentCandidates = selectableAgentCandidates.filter(
		(message) =>
			!message.facts.sourceIdentical &&
			!message.facts.sourceEmpty &&
			!message.facts.blankCandidate &&
			!message.facts.icu &&
			!message.facts.edgeWhitespaceMismatch,
	);
	const selectedAgentCandidates = selectableAgentCandidates.filter(
		(message) => {
			const currentToken = taskId
				? message.candidate?.revisionId
				: message.value?.reviewToken;
			return selectedCandidateTokens[message.messageId] === currentToken;
		},
	);

	const run = async (label: string, task: () => Promise<void>) => {
		setBusy(label);
		setError(null);
		setNotice(null);
		try {
			await task();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "The operation failed.",
			);
		} finally {
			setBusy(null);
		}
	};

	const prepare = () =>
		run("prepare", async () => {
			const result = await ensureForReview({ projectId: convexProjectId });
			setProposalId(result.proposalId);
			setNotice(
				"Portuguese is ready for manual editing or agent-assisted review.",
			);
		});

	const saveVisible = () =>
		run("save", async () => {
			if (!activeProposalId || dirtyItems.length === 0) return;
			for (let offset = 0; offset < dirtyItems.length; offset += 16) {
				await stageForReview({
					projectId: convexProjectId,
					proposalId: convexId<"localeProposals">(activeProposalId),
					items: dirtyItems.slice(offset, offset + 16),
				});
			}
			setNotice(
				`${dirtyItems.length} manual value${dirtyItems.length === 1 ? "" : "s"} saved.`,
			);
		});

	const reviewValue = async (
		messageId: string,
		candidateToken: string,
		decision: ReviewDecision,
	) => {
		if (!activeProposalId) return;
		if (taskId) {
			await reviewTaskValue({
				taskId: convexId<"agentTranslationProposals">(taskId),
				messageId,
				candidateToken,
				decision,
			});
			return;
		}
		await reviewStagedValue({
			projectId: convexProjectId,
			proposalId: convexId<"localeProposals">(activeProposalId),
			messageId,
			expectedValueFingerprint: candidateToken,
			decision,
		});
	};

	const decide = (
		messageId: string,
		candidateToken: string,
		decision: ReviewDecision,
	) =>
		run(`review:${messageId}`, async () => {
			await reviewValue(messageId, candidateToken, decision);
			setNotice("Human review recorded.");
		});

	const acceptSelectedAgentCandidates = () =>
		run("accept-selected", async () => {
			if (!activeProposalId || selectedAgentCandidates.length === 0) return;
			let accepted = 0;
			if (taskId) {
				const candidateRevisionIds = selectedAgentCandidates.flatMap(
					(message) => {
						const selectedToken = selectedCandidateTokens[message.messageId];
						return selectedToken ? [selectedToken] : [];
					},
				);
				if (candidateRevisionIds.length === 0) return;
				for (
					let offset = 0;
					offset < candidateRevisionIds.length;
					offset += 16
				) {
					const result = await acceptTaskCandidates({
						proposalId: convexId<"agentTranslationProposals">(taskId),
						candidateRevisionIds: candidateRevisionIds
							.slice(offset, offset + 16)
							.map((revisionId) =>
								convexId<"agentTranslationCandidateRevisions">(revisionId),
							),
					});
					accepted += result.accepted;
				}
			} else {
				for (const message of selectedAgentCandidates) {
					const selectedToken = selectedCandidateTokens[message.messageId];
					if (!selectedToken) continue;
					await reviewValue(message.messageId, selectedToken, {
						kind: "accept",
					});
					accepted += 1;
				}
			}
			setSelectedCandidateTokens({});
			setNotice(
				`${accepted} selected candidate${accepted === 1 ? "" : "s"} accepted with human confirmation.`,
			);
		});

	const selectRoutinePage = () => {
		setSelectedCandidateTokens(
			Object.fromEntries(
				routineAgentCandidates.flatMap((message) => {
					const token = taskId
						? message.candidate?.revisionId
						: message.value?.reviewToken;
					return token ? [[message.messageId, token]] : [];
				}),
			),
		);
	};

	const goNext = (nextCursor: number) => {
		setCursorHistory((history) => [...history, cursor]);
		setCursor(nextCursor);
		setSelectedCandidateTokens({});
		setExpandedMessageId(null);
	};

	const goPrevious = () => {
		const previousCursor = cursorHistory.at(-1);
		if (previousCursor === undefined) return;
		setCursorHistory((history) => history.slice(0, -1));
		setCursor(previousCursor);
		setSelectedCandidateTokens({});
		setExpandedMessageId(null);
	};

	// Sparse server-side filters can produce an empty bounded scan window. Walk
	// it automatically so search and attention filters feel continuous.
	useEffect(() => {
		if (
			detail &&
			detail.messages.length === 0 &&
			detail.continueCursor !== null &&
			busy === null
		) {
			setCursorHistory((history) => [...history, cursor]);
			setCursor(detail.continueCursor);
			setSelectedCandidateTokens({});
			setExpandedMessageId(null);
		}
	}, [detail, busy, cursor]);

	const markIntentionalBlank = (
		message: NonNullable<typeof detail>["messages"][number],
	) =>
		run(`blank:${message.messageId}`, async () => {
			if (!activeProposalId) return;
			const reason = (
				blankReasons[message.messageId] ??
				message.candidate?.intentionalBlankReason ??
				message.value?.intentionalBlankReason ??
				""
			).trim();
			if (!reason) {
				throw new Error(
					"Add a reason before marking a value intentionally blank.",
				);
			}
			if (!message.value) {
				await stageForReview({
					projectId: convexProjectId,
					proposalId: convexId<"localeProposals">(activeProposalId),
					items: [
						{
							messageId: message.messageId,
							value: "",
							sourceFingerprint: message.sourceFingerprint,
							intentionalBlankReason: reason,
						},
					],
				});
			}
			if (taskId && message.candidate) {
				await reviewValue(message.messageId, message.candidate.revisionId, {
					kind: "intentionalBlank",
					reason,
				});
			} else {
				await reviewStagedValue({
					projectId: convexProjectId,
					proposalId: convexId<"localeProposals">(activeProposalId),
					messageId: message.messageId,
					decision: { kind: "intentionalBlank", reason },
				});
			}
			setNotice("Intentional Blank recorded with human review.");
		});

	const finalize = () =>
		run("finalize", async () => {
			if (!activeProposalId) return;
			if (taskId) {
				await finalizeTask({
					taskId: convexId<"agentTranslationProposals">(taskId),
				});
			} else {
				await finalizeForReview({
					projectId: convexProjectId,
					proposalId: convexId<"localeProposals">(activeProposalId),
				});
			}
			setNotice(
				"The reviewed Locale Proposal is ready as an immutable artifact.",
			);
		});

	const downloadArtifact = () =>
		run("download", async () => {
			if (!activeProposalId) return;
			const artifact = await artifactForReview({
				projectId: convexProjectId,
				proposalId: convexId<"localeProposals">(activeProposalId),
			});
			const blob = new Blob([JSON.stringify(artifact, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = "portuguese-locale-proposal.json";
			anchor.click();
			URL.revokeObjectURL(url);
		});

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title={title}
				description="Prepare a complete Portuguese catalog with the same reviewed delivery seam future Locales will use."
				action={
					<div className="flex flex-wrap items-center gap-2">
						{showTaskNavigation ? (
							<Button
								nativeButton={false}
								size="sm"
								variant="outline"
								render={
									<Link
										to="/projects/$projectId/proposals"
										params={{ projectId }}
									/>
								}
							>
								<ArrowLeft data-icon="inline-start" />
								All tasks
							</Button>
						) : null}
						{detail ? (
							<Badge variant="secondary">{detail.proposal.status}</Badge>
						) : null}
						{detail?.proposal.status === "ready" ? (
							<Button
								size="sm"
								variant="outline"
								onClick={downloadArtifact}
								disabled={busy !== null}
							>
								<Download data-icon="inline-start" />
								Download artifact
							</Button>
						) : null}
					</div>
				}
			/>
			{error ? (
				<Alert variant="destructive" className="mb-4">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}
			{notice ? (
				<Alert className="mb-4">
					<AlertDescription>{notice}</AlertDescription>
				</Alert>
			) : null}
			{initialProposalId === undefined &&
			currentProposalId === undefined &&
			proposalId === null ? (
				<Skeleton className="h-48 w-full" />
			) : !activeProposalId ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Languages />
						</EmptyMedia>
						<EmptyTitle>Prepare Portuguese</EmptyTitle>
						<EmptyDescription>
							Pin the proposal to the accepted Baseline Snapshot. You can then
							fill values manually or have an agent submit candidates for
							review.
						</EmptyDescription>
					</EmptyHeader>
					<Button onClick={() => void prepare()} disabled={busy !== null}>
						<Sparkles data-icon="inline-start" />
						Prepare proposal
					</Button>
				</Empty>
			) : detail === undefined ? (
				<Skeleton className="h-64 w-full" />
			) : detail === null ? (
				<Alert variant="destructive">
					<AlertDescription>Locale Proposal not found.</AlertDescription>
				</Alert>
			) : (
				<div className="flex flex-col gap-4">
					<Card>
						<CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<CardTitle className="text-base">Portuguese · pt-BR</CardTitle>
								<p className="mt-1 text-muted-foreground text-sm">
									Pinned to {detail.proposal.sourceSnapshot.commit}. Agent work
									stays inert until a person confirms exact candidate revisions
									below.
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									size="sm"
									onClick={saveVisible}
									disabled={
										busy !== null ||
										dirtyItems.length === 0 ||
										detail.proposal.status === "ready"
									}
								>
									<Save data-icon="inline-start" />
									Save visible edits
									{dirtyItems.length ? ` (${dirtyItems.length})` : ""}
								</Button>
								<Button
									size="sm"
									variant="secondary"
									onClick={finalize}
									disabled={
										busy !== null ||
										detail.proposal.status === "ready" ||
										!detail.isCurrentBaseline ||
										detail.proposal.progress.remaining !== 0
									}
								>
									<Check data-icon="inline-start" />
									Finalize reviewed catalog
								</Button>
							</div>
						</CardHeader>
						<CardContent className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3">
							<div className="bg-background p-3">
								<p className="text-muted-foreground text-xs">
									Agent candidates
								</p>
								<p className="mt-1 font-medium text-lg tabular-nums">
									{detail.task
										? `${detail.task.candidateCount} / ${detail.task.targetCount}`
										: detail.proposal.progress.staged}
								</p>
							</div>
							<div className="bg-background p-3">
								<p className="text-muted-foreground text-xs">
									Applied to locale draft
								</p>
								<p className="mt-1 font-medium text-lg tabular-nums">
									{detail.proposal.progress.staged} /{" "}
									{detail.proposal.progress.total}
								</p>
							</div>
							<div className="bg-background p-3">
								<p className="text-muted-foreground text-xs">Catalog window</p>
								<p className="mt-1 font-medium text-lg tabular-nums">
									{detail.messages.length === 0
										? "No matches"
										: `${cursor + 1}–${detail.windowEnd + 1}`}
								</p>
							</div>
						</CardContent>
					</Card>

					<Card size="sm">
						<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
							<div className="relative min-w-0 flex-1">
								<Search
									aria-hidden
									className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									aria-label="Search review values"
									placeholder="Search key, source, or candidate"
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									className="pl-9"
								/>
							</div>
							<label className="flex items-center gap-2 text-muted-foreground text-xs">
								Show
								<select
									aria-label="Review focus"
									value={focus}
									onChange={(event) =>
										setFocus(event.currentTarget.value as ReviewFocus)
									}
									className="h-9 rounded-md border bg-background px-3 text-foreground text-sm"
								>
									<option value="awaiting">Awaiting review</option>
									<option value="attention">Needs attention</option>
									<option value="routine">Routine candidates</option>
									<option value="reviewed">Reviewed</option>
									<option value="missing">Missing candidates</option>
									<option value="all">Everything</option>
								</select>
							</label>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									size="sm"
									variant="outline"
									onClick={selectRoutinePage}
									disabled={
										busy !== null || routineAgentCandidates.length === 0
									}
								>
									Select routine ({routineAgentCandidates.length})
								</Button>
								<Button
									size="sm"
									onClick={acceptSelectedAgentCandidates}
									disabled={
										busy !== null ||
										selectedAgentCandidates.length === 0 ||
										detail.proposal.status === "ready"
									}
								>
									<Check data-icon="inline-start" />
									Accept selected ({selectedAgentCandidates.length})
								</Button>
							</div>
						</CardContent>
					</Card>

					<div className="overflow-hidden rounded-lg border bg-background">
						{detail.messages.map((message) => {
							const value =
								message.candidate?.value ?? message.value?.value ?? "";
							const draft = drafts[message.messageId] ?? value;
							const reviewed = message.facts.state === "reviewed";
							const reviewToken = taskId
								? message.candidate?.revisionId
								: message.value?.reviewToken;
							const selectable = selectableAgentCandidates.some(
								(candidate) => candidate.messageId === message.messageId,
							);
							const expanded = expandedMessageId === message.messageId;
							return (
								<div
									key={message.messageId}
									className="border-b last:border-b-0"
								>
									<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-3 py-3">
										<Checkbox
											aria-label={`Select ${message.messageId}`}
											checked={
												reviewToken !== undefined &&
												selectedCandidateTokens[message.messageId] ===
													reviewToken
											}
											disabled={!selectable || busy !== null}
											onCheckedChange={(checked) =>
												setSelectedCandidateTokens((current) => {
													const next = { ...current };
													if (checked === true && reviewToken) {
														next[message.messageId] = reviewToken;
													} else {
														delete next[message.messageId];
													}
													return next;
												})
											}
										/>
										<button
											type="button"
											className="min-w-0 text-left"
											onClick={() =>
												setExpandedMessageId(
													expanded ? null : message.messageId,
												)
											}
											aria-expanded={expanded}
										>
											<div className="flex flex-wrap items-center gap-2">
												<code className="truncate text-sm">
													{message.messageId}
												</code>
												<Badge variant={reviewed ? "default" : "secondary"}>
													{message.facts.state === "humanDraft"
														? "human draft"
														: message.facts.state}
												</Badge>
												{message.facts.sourceIdentical ? (
													<Badge variant="outline">matches Source</Badge>
												) : null}
												{message.facts.icu ? (
													<Badge variant="outline">ICU</Badge>
												) : null}
												{message.facts.blankCandidate ? (
													<Badge variant="outline">blank candidate</Badge>
												) : null}
												{message.facts.sourceEmpty ? (
													<Badge variant="outline">empty Source</Badge>
												) : null}
												{message.facts.edgeWhitespaceMismatch ? (
													<Badge variant="outline">edge whitespace</Badge>
												) : null}
												{message.facts.staleSource ? (
													<Badge variant="destructive">Source changed</Badge>
												) : null}
											</div>
											<div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
												<p className="line-clamp-2 whitespace-pre-wrap text-muted-foreground">
													{message.sourceValue || "Empty Source value"}
												</p>
												<p className="line-clamp-2 whitespace-pre-wrap">
													{value || "No candidate value"}
												</p>
											</div>
										</button>
										<Button
											size="icon-sm"
											variant="ghost"
											aria-label={`${expanded ? "Collapse" : "Expand"} ${message.messageId}`}
											onClick={() =>
												setExpandedMessageId(
													expanded ? null : message.messageId,
												)
											}
										>
											<ChevronDown
												aria-hidden
												className={
													expanded
														? "rotate-180 transition-transform"
														: "transition-transform"
												}
											/>
										</Button>
									</div>
									{expanded ? (
										<div className="grid gap-4 border-t bg-muted/10 p-4 md:grid-cols-2">
											<div className="rounded-md border bg-muted/20 p-3">
												<div className="mb-1 flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
													Source Contract
													{message.sourceIcuType === "icu" ? (
														<Badge variant="outline">ICU</Badge>
													) : null}
												</div>
												<p className="whitespace-pre-wrap text-sm">
													{message.sourceValue}
												</p>
												<WhitespaceFacts value={message.sourceValue} />
											</div>
											<div className="flex flex-col gap-2">
												<div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
													Portuguese candidate
												</div>
												<Textarea
													aria-label={`Portuguese value for ${message.messageId}`}
													value={draft}
													onChange={(event) =>
														setDrafts((previous) => ({
															...previous,
															[message.messageId]: event.target.value,
														}))
													}
													disabled={
														detail.proposal.status === "ready" || busy !== null
													}
													rows={3}
												/>
												<WhitespaceFacts value={draft} />
												<div className="flex flex-col gap-2">
													<div className="flex flex-col gap-2 sm:flex-row">
														<Input
															aria-label={`Reason for intentionally blank ${message.messageId}`}
															placeholder="Reason for an intentional blank"
															value={
																blankReasons[message.messageId] ??
																message.candidate?.intentionalBlankReason ??
																message.value?.intentionalBlankReason ??
																""
															}
															onChange={(event) =>
																setBlankReasons((previous) => ({
																	...previous,
																	[message.messageId]: event.target.value,
																}))
															}
														/>
														{!message.value ||
														message.value.value.length === 0 ? (
															<Button
																size="sm"
																variant="outline"
																onClick={() =>
																	void markIntentionalBlank(message)
																}
																disabled={
																	busy !== null ||
																	reviewed ||
																	message.facts.staleSource ||
																	detail.proposal.status === "ready" ||
																	!(
																		blankReasons[message.messageId] ??
																		message.candidate?.intentionalBlankReason ??
																		message.value?.intentionalBlankReason ??
																		""
																	).trim()
																}
															>
																Mark intentional blank
															</Button>
														) : null}
													</div>
													{reviewToken ? (
														<div className="flex flex-wrap gap-2">
															<Button
																size="sm"
																onClick={() =>
																	void decide(message.messageId, reviewToken, {
																		kind: "accept",
																	})
																}
																disabled={
																	busy !== null ||
																	reviewed ||
																	message.facts.staleSource ||
																	detail.proposal.status === "ready"
																}
															>
																<Check data-icon="inline-start" /> Accept
															</Button>
															<Button
																size="sm"
																variant="secondary"
																onClick={() =>
																	void decide(message.messageId, reviewToken, {
																		kind: "acceptWithEdits",
																		value: draft,
																	})
																}
																disabled={
																	busy !== null ||
																	reviewed ||
																	message.facts.staleSource ||
																	draft.trim().length === 0 ||
																	draft === value ||
																	detail.proposal.status === "ready"
																}
															>
																Accept edited
															</Button>
															<Button
																size="sm"
																variant="outline"
																onClick={() =>
																	void decide(message.messageId, reviewToken, {
																		kind: "reject",
																	})
																}
																disabled={
																	busy !== null ||
																	reviewed ||
																	message.facts.staleSource ||
																	detail.proposal.status === "ready"
																}
															>
																<X data-icon="inline-start" /> Reject
															</Button>
															<Button
																size="sm"
																variant="outline"
																onClick={() =>
																	void markIntentionalBlank(message)
																}
																disabled={
																	busy !== null ||
																	reviewed ||
																	message.facts.staleSource ||
																	detail.proposal.status === "ready" ||
																	!(
																		blankReasons[message.messageId] ??
																		message.candidate?.intentionalBlankReason ??
																		""
																	).trim()
																}
															>
																Mark intentional blank
															</Button>
														</div>
													) : null}
												</div>
												{message.facts.staleSource ? (
													<p className="flex items-center gap-2 text-destructive text-xs">
														<TriangleAlert aria-hidden className="size-4" />
														The Source changed after this candidate. Ask the
														agent for a new revision.
													</p>
												) : null}
											</div>
										</div>
									) : null}
								</div>
							);
						})}
						{detail.messages.length === 0 && detail.continueCursor === null ? (
							<div className="px-4 py-12 text-center">
								<p className="font-medium text-sm">No values match this view</p>
								<p className="mt-1 text-muted-foreground text-xs">
									Try another review focus or clear the search.
								</p>
							</div>
						) : null}
					</div>
					<div className="flex items-center justify-between">
						<Button
							size="sm"
							variant="outline"
							onClick={goPrevious}
							disabled={cursorHistory.length === 0 || busy !== null}
						>
							Previous
						</Button>
						<span className="text-muted-foreground text-xs">
							{detail.messages.length} matching value
							{detail.messages.length === 1 ? "" : "s"} in Catalog positions{" "}
							{cursor + 1}–{detail.windowEnd + 1}
						</span>
						<Button
							size="sm"
							variant="outline"
							onClick={() =>
								detail.continueCursor === null
									? undefined
									: goNext(detail.continueCursor)
							}
							disabled={detail.continueCursor === null || busy !== null}
						>
							Next
						</Button>
					</div>
				</div>
			)}
		</ProjectShell>
	);
}
