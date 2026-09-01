import { Alert, AlertDescription } from "@blabla/ui/components/alert";
import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@blabla/ui/components/card";
import { Input } from "@blabla/ui/components/input";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { Textarea } from "@blabla/ui/components/textarea";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Bot, Check, X } from "lucide-react";
import { useState } from "react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";

export const Route = createFileRoute(
	"/projects/$projectId/proposals/$proposalId",
)({
	component: ProposalDetailRoute,
});

function CandidateReviewContext({ revisionId }: { revisionId: string }) {
	const context = useQuery(api.agentTranslationProposals.contextForReview, {
		revisionId: convexId<"agentTranslationCandidateRevisions">(revisionId),
	});
	if (context === undefined) {
		return <Skeleton className="h-28 w-full" />;
	}
	if (context === null || !context.available) {
		return (
			<Alert>
				<AlertDescription>
					The live source or target is no longer available. The candidate is
					kept as evidence, but it cannot be accepted against this stale basis.
				</AlertDescription>
			</Alert>
		);
	}
	const argumentsLabel = context.source.argumentNames.length
		? context.source.argumentNames.join(", ")
		: "none";
	const placeholdersLabel = context.source.declaredPlaceholderNames.length
		? context.source.declaredPlaceholderNames.join(", ")
		: "none";
	return (
		<div className="flex flex-col gap-2">
			<div className="grid gap-3 md:grid-cols-2">
				<div className="rounded-md border bg-muted/20 p-3">
					<div className="mb-1 flex flex-wrap items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Source Contract
						<Badge variant="outline" className="normal-case tracking-normal">
							{context.source.icuType === "icu" ? "ICU" : "Plain text"}
						</Badge>
					</div>
					<p className="whitespace-pre-wrap text-sm">{context.source.value}</p>
				</div>
				<div className="rounded-md border bg-muted/20 p-3">
					<div className="mb-1 flex flex-wrap items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Current {context.localeCode} value
						<Badge
							variant={context.basisIsCurrent ? "outline" : "destructive"}
							className="normal-case tracking-normal"
						>
							{context.basisIsCurrent ? "Basis current" : "Basis changed"}
						</Badge>
					</div>
					<p className="whitespace-pre-wrap text-sm">
						{context.target.value || "No value yet"}
					</p>
					<code className="mt-2 block break-all text-[11px] text-muted-foreground">
						{context.target.catalogPath}
					</code>
				</div>
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
				<span>Arguments: {argumentsLabel}</span>
				<span>Declared placeholders: {placeholdersLabel}</span>
				{!context.source.argumentNamesComplete ||
				!context.source.declaredPlaceholderNamesComplete ? (
					<span>
						Facts are truncated; server validation remains authoritative.
					</span>
				) : null}
			</div>
		</div>
	);
}

function reviewDecisionLabel(kind: string) {
	if (kind === "accept") return "accepted";
	if (kind === "acceptWithEdits") return "accepted with edits";
	if (kind === "reject") return "rejected";
	if (kind === "intentionalBlank") return "intentional blank";
	return kind;
}

function ProposalDetailRoute() {
	const { projectId, proposalId } = useParams({
		from: "/projects/$projectId/proposals/$proposalId",
	});
	const project = useQuery(api.projects.get, {
		projectId: convexId<"projects">(projectId),
	});
	const detail = useQuery(api.agentTranslationProposals.getForReview, {
		proposalId: convexId<"agentTranslationProposals">(proposalId),
	});
	const reviewCandidate = useMutation(
		api.agentTranslationProposals.reviewCandidate,
	);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [blankReasons, setBlankReasons] = useState<Record<string, string>>({});
	const [rejectArmed, setRejectArmed] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	if (detail === undefined) {
		return (
			<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
				<Skeleton className="h-48 w-full" />
			</ProjectShell>
		);
	}
	if (detail === null) {
		return (
			<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
				<Alert variant="destructive">
					<AlertDescription>Proposal not found.</AlertDescription>
				</Alert>
			</ProjectShell>
		);
	}

	const proposal = detail.proposal;
	const canReview =
		proposal.status === "open" &&
		(project?.role === "owner" || project?.role === "editor");
	const decide = async (
		revisionId: string,
		decision:
			| { kind: "accept" }
			| { kind: "acceptWithEdits"; value: string }
			| { kind: "reject"; reason?: string }
			| { kind: "intentionalBlank"; reason: string },
	) => {
		setError(null);
		try {
			await reviewCandidate({
				candidateRevisionId:
					convexId<"agentTranslationCandidateRevisions">(revisionId),
				decision,
			});
			setRejectArmed(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Review failed.");
		}
	};
	const blankReasonFor = (revisionId: string) =>
		blankReasons[revisionId]?.trim() ?? "";
	const candidateMessageIds = new Set(
		detail.candidates.map(({ candidate }) => candidate.messageId),
	);
	const waitingTaskTargets = detail.taskTargets.filter(
		(target) => !candidateMessageIds.has(target.messageId),
	);
	const taskScope = proposal.taskScope;

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title={proposal.clientProposalKey}
				description={
					taskScope
						? `${taskScope.localeCode} · ${proposal.candidateCount} of ${taskScope.targetCount} candidates prepared · ${proposal.revisionCount} immutable revision${proposal.revisionCount === 1 ? "" : "s"}`
						: `${proposal.candidateCount} target${proposal.candidateCount === 1 ? "" : "s"} · ${proposal.revisionCount} immutable revision${proposal.revisionCount === 1 ? "" : "s"}`
				}
				action={
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
				}
			/>
			{error ? (
				<Alert variant="destructive" className="mb-4">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}
			{taskScope && proposal.status === "open" ? (
				<Alert className="mb-4">
					<AlertDescription>
						This task has a frozen {taskScope.localeCode} scope. Give an agent
						with this project’s read/propose token the task id{" "}
						<code className="break-all">{proposal._id}</code>. Agent candidates
						remain inert until you decide them below.
					</AlertDescription>
				</Alert>
			) : null}
			<div className="flex flex-col gap-4">
				{waitingTaskTargets.map((target) => (
					<Card key={target._id} className="border-dashed">
						<CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
							<CardTitle className="truncate text-sm">
								{target.messageId}
							</CardTitle>
							<Badge variant="outline">awaiting candidate</Badge>
						</CardHeader>
						<CardContent className="grid gap-3 md:grid-cols-2">
							<div className="rounded-md border bg-muted/20 p-3">
								<div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
									Source Contract
								</div>
								<p className="whitespace-pre-wrap text-sm">
									{target.sourceValue}
								</p>
							</div>
							<div className="rounded-md border bg-muted/20 p-3">
								<div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
									Current {target.localeCode} value
								</div>
								<p className="whitespace-pre-wrap text-sm">
									{target.targetValue || "No value yet"}
								</p>
							</div>
						</CardContent>
					</Card>
				))}
				{detail.candidates.map(({ candidate, revision, reviews }) => {
					if (!revision) return null;
					const review = reviews[0];
					const draft = drafts[revision._id] ?? revision.value;
					const isReviewed = review !== undefined;
					return (
						<Card key={candidate._id}>
							<CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
								<div className="flex min-w-0 items-center gap-2">
									<Bot aria-hidden className="size-4 text-muted-foreground" />
									<CardTitle className="truncate text-sm">
										{revision.messageId}
									</CardTitle>
								</div>
								<Badge variant={isReviewed ? "default" : "secondary"}>
									{review
										? reviewDecisionLabel(review.decision.kind)
										: "waiting"}
								</Badge>
							</CardHeader>
							<CardContent className="flex flex-col gap-3">
								<CandidateReviewContext revisionId={revision._id} />
								<div className="grid gap-3 md:grid-cols-2">
									<div className="rounded-md border bg-muted/20 p-3">
										<div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Agent candidate · revision {revision.revision}
										</div>
										<p className="whitespace-pre-wrap text-sm">
											{revision.value}
										</p>
									</div>
									<div className="rounded-md border p-3">
										<div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Your final value
										</div>
										<Textarea
											aria-label={`Final value for ${revision.messageId}`}
											value={draft}
											onChange={(event) =>
												setDrafts((previous) => ({
													...previous,
													[revision._id]: event.target.value,
												}))
											}
											disabled={isReviewed || !canReview}
											rows={3}
										/>
										<Input
											aria-label={`Reason for intentionally blank ${revision.messageId}`}
											placeholder="Reason for an intentional blank"
											value={blankReasons[revision._id] ?? ""}
											onChange={(event) =>
												setBlankReasons((previous) => ({
													...previous,
													[revision._id]: event.target.value,
												}))
											}
											disabled={isReviewed || !canReview}
										/>
									</div>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										size="sm"
										disabled={
											isReviewed || !canReview || draft !== revision.value
										}
										onClick={() =>
											void decide(revision._id, { kind: "accept" })
										}
									>
										<Check data-icon="inline-start" />
										Accept exact
									</Button>
									<Button
										size="sm"
										variant="secondary"
										disabled={isReviewed || !canReview || draft.length === 0}
										onClick={() =>
											void decide(revision._id, {
												kind: "acceptWithEdits",
												value: draft,
											})
										}
									>
										Accept edited
									</Button>
									{rejectArmed === revision._id ? (
										<>
											<Button
												size="sm"
												variant="destructive"
												disabled={isReviewed || !canReview}
												onClick={() =>
													void decide(revision._id, { kind: "reject" })
												}
											>
												<X data-icon="inline-start" />
												Confirm reject
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setRejectArmed(null)}
											>
												Keep
											</Button>
										</>
									) : (
										<Button
											size="sm"
											variant="outline"
											disabled={isReviewed || !canReview}
											onClick={() => setRejectArmed(revision._id)}
										>
											Reject
										</Button>
									)}
									<Button
										size="sm"
										variant="outline"
										disabled={
											isReviewed ||
											!canReview ||
											blankReasonFor(revision._id).length === 0
										}
										onClick={() =>
											void decide(revision._id, {
												kind: "intentionalBlank",
												reason: blankReasonFor(revision._id),
											})
										}
									>
										Mark intentional blank
									</Button>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</ProjectShell>
	);
}
