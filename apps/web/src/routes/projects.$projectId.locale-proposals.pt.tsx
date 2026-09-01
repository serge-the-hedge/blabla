import { Alert, AlertDescription } from "@blabla/ui/components/alert";
import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@blabla/ui/components/card";
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
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { Check, Download, Languages, Save, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
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

function PortugueseLocaleProposalRoute() {
	const { projectId } = useParams({
		from: "/projects/$projectId/locale-proposals/pt",
	});
	const convexProjectId = convexId<"projects">(projectId);
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const currentProposalId = useQuery(api.localeProposals.currentForReview, {
		projectId: convexProjectId,
	});
	const ensureForReview = useMutation(api.localeProposals.ensureForReview);
	const stageForReview = useMutation(api.localeProposals.stageForReview);
	const reviewStagedValue = useMutation(api.localeProposals.reviewStagedValue);
	const finalizeForReview = useAction(api.localeProposals.finalizeForReview);
	const artifactForReview = useAction(api.localeProposals.artifactForReview);
	const [proposalId, setProposalId] = useState<string | null>(null);
	const activeProposalId = proposalId ?? currentProposalId;
	const [cursor, setCursor] = useState(0);
	const detail = useQuery(
		api.localeProposals.getForReview,
		activeProposalId
			? {
					proposalId: convexId<"localeProposals">(activeProposalId),
					cursor,
					limit: 16,
				}
			: "skip",
	);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [blankReasons, setBlankReasons] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const dirtyItems = useMemo(() => {
		if (!detail) return [];
		return detail.messages.flatMap((message) => {
			const draft = drafts[message.messageId];
			if (draft === undefined || draft === (message.value?.value ?? ""))
				return [];
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
	const visibleAgentCandidates = useMemo(() => {
		if (!detail) return [];
		return detail.messages.filter((message) => {
			const value = message.value?.value;
			return (
				message.review === null &&
				message.value?.updatedBy.kind === "agent" &&
				value !== undefined &&
				value.length > 0 &&
				(drafts[message.messageId] ?? value) === value
			);
		});
	}, [detail, drafts]);
	const visibleAgentBlanks = useMemo(
		() =>
			detail?.messages.some(
				(message) =>
					message.review === null &&
					message.value?.updatedBy.kind === "agent" &&
					message.value.value.length === 0,
			) ?? false,
		[detail],
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
			await stageForReview({
				projectId: convexProjectId,
				proposalId: convexId<"localeProposals">(activeProposalId),
				items: dirtyItems,
			});
			setNotice(
				`${dirtyItems.length} manual value${dirtyItems.length === 1 ? "" : "s"} saved.`,
			);
		});

	const decide = (messageId: string, decision: ReviewDecision) =>
		run(`review:${messageId}`, async () => {
			if (!activeProposalId) return;
			await reviewStagedValue({
				projectId: convexProjectId,
				proposalId: convexId<"localeProposals">(activeProposalId),
				messageId,
				decision,
			});
			setNotice("Human review recorded.");
		});

	const acceptVisibleAgentCandidates = () =>
		run("accept-visible", async () => {
			if (!activeProposalId || visibleAgentCandidates.length === 0) return;
			for (const message of visibleAgentCandidates) {
				await reviewStagedValue({
					projectId: convexProjectId,
					proposalId: convexId<"localeProposals">(activeProposalId),
					messageId: message.messageId,
					decision: { kind: "accept" },
				});
			}
			const nextCursor = detail?.continueCursor;
			if (
				!visibleAgentBlanks &&
				nextCursor !== null &&
				nextCursor !== undefined
			) {
				setCursor(nextCursor);
			}
			setNotice(
				`${visibleAgentCandidates.length} visible agent candidate${visibleAgentCandidates.length === 1 ? "" : "s"} accepted.`,
			);
		});

	const markIntentionalBlank = (
		message: NonNullable<typeof detail>["messages"][number],
	) =>
		run(`blank:${message.messageId}`, async () => {
			if (!activeProposalId) return;
			const reason = blankReasons[message.messageId]?.trim();
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
			await reviewStagedValue({
				projectId: convexProjectId,
				proposalId: convexId<"localeProposals">(activeProposalId),
				messageId: message.messageId,
				decision: { kind: "intentionalBlank", reason },
			});
			setNotice("Intentional Blank recorded with human review.");
		});

	const finalize = () =>
		run("finalize", async () => {
			if (!activeProposalId) return;
			await finalizeForReview({
				projectId: convexProjectId,
				proposalId: convexId<"localeProposals">(activeProposalId),
			});
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
				title="New Locale"
				description="Prepare a complete Portuguese catalog with the same reviewed delivery seam future Locales will use."
				action={
					<div className="flex flex-wrap items-center gap-2">
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
			{currentProposalId === undefined && proposalId === null ? (
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
						<CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<CardTitle className="text-base">Portuguese · pt-BR</CardTitle>
								<p className="mt-1 text-muted-foreground text-sm">
									{detail.proposal.progress.staged} of{" "}
									{detail.proposal.progress.total} source messages prepared ·{" "}
									{detail.proposal.sourceSnapshot.commit}
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
									variant="outline"
									onClick={acceptVisibleAgentCandidates}
									disabled={
										busy !== null ||
										visibleAgentCandidates.length === 0 ||
										detail.proposal.status === "ready"
									}
								>
									<Check data-icon="inline-start" />
									{!visibleAgentBlanks && detail.continueCursor !== null
										? "Accept visible & next"
										: "Accept visible"}
									{visibleAgentCandidates.length
										? ` (${visibleAgentCandidates.length})`
										: ""}
								</Button>
								<Button
									size="sm"
									variant="secondary"
									onClick={finalize}
									disabled={
										busy !== null ||
										detail.proposal.status === "ready" ||
										!detail.isCurrentBaseline
									}
								>
									<Check data-icon="inline-start" />
									Finalize reviewed catalog
								</Button>
							</div>
						</CardHeader>
					</Card>
					{detail.messages.map((message) => {
						const value = message.value?.value ?? "";
						const draft = drafts[message.messageId] ?? value;
						const reviewed = message.review !== null;
						const agentOwned = message.value?.updatedBy.kind === "agent";
						return (
							<Card key={message.messageId}>
								<CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
									<CardTitle className="truncate text-sm">
										{message.messageId}
									</CardTitle>
									<div className="flex flex-wrap gap-2">
										<Badge
											variant={
												reviewed
													? "default"
													: agentOwned
														? "secondary"
														: "outline"
											}
										>
											{reviewed
												? "reviewed"
												: agentOwned
													? "awaiting review"
													: value
														? "human draft"
														: "missing"}
										</Badge>
									</div>
								</CardHeader>
								<CardContent className="grid gap-3 md:grid-cols-2">
									<div className="rounded-md border bg-muted/20 p-3">
										<div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Source
										</div>
										<p className="whitespace-pre-wrap text-sm">
											{message.sourceValue}
										</p>
									</div>
									<div className="flex flex-col gap-2">
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
										<div className="flex flex-col gap-2">
											<div className="flex flex-col gap-2 sm:flex-row">
												<Input
													aria-label={`Reason for intentionally blank ${message.messageId}`}
													placeholder="Reason for an intentional blank"
													value={
														blankReasons[message.messageId] ??
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
												{!message.value || message.value.value.length === 0 ? (
													<Button
														size="sm"
														variant="outline"
														onClick={() => void markIntentionalBlank(message)}
														disabled={
															busy !== null ||
															reviewed ||
															detail.proposal.status === "ready" ||
															!(
																blankReasons[message.messageId] ??
																message.value?.intentionalBlankReason ??
																""
															).trim()
														}
													>
														Mark intentional blank
													</Button>
												) : null}
											</div>
											{message.value ? (
												<div className="flex flex-wrap gap-2">
													<Button
														size="sm"
														onClick={() =>
															void decide(message.messageId, { kind: "accept" })
														}
														disabled={
															busy !== null ||
															reviewed ||
															detail.proposal.status === "ready"
														}
													>
														<Check data-icon="inline-start" /> Accept
													</Button>
													<Button
														size="sm"
														variant="secondary"
														onClick={() =>
															void decide(message.messageId, {
																kind: "acceptWithEdits",
																value: draft,
															})
														}
														disabled={
															busy !== null ||
															reviewed ||
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
															void decide(message.messageId, { kind: "reject" })
														}
														disabled={
															busy !== null ||
															reviewed ||
															detail.proposal.status === "ready"
														}
													>
														<X data-icon="inline-start" /> Reject
													</Button>
													<Button
														size="sm"
														variant="outline"
														onClick={() => void markIntentionalBlank(message)}
														disabled={
															busy !== null ||
															reviewed ||
															detail.proposal.status === "ready" ||
															!(blankReasons[message.messageId] ?? "").trim()
														}
													>
														Mark intentional blank
													</Button>
												</div>
											) : null}
										</div>
									</div>
								</CardContent>
							</Card>
						);
					})}
					<div className="flex items-center justify-between">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setCursor(Math.max(0, cursor - 16))}
							disabled={cursor === 0 || busy !== null}
						>
							Previous
						</Button>
						<span className="text-muted-foreground text-xs">
							Messages {cursor + 1}–{cursor + detail.messages.length}
						</span>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setCursor(detail.continueCursor ?? cursor)}
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
