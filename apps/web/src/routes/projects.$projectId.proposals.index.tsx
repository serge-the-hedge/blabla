import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@blabla/ui/components/empty";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowRight, Bot, KeyRound, Languages, PenLine } from "lucide-react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/proposals/")({
	component: ProposalsIndexRoute,
});

function ProposalsIndexRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/proposals/" });
	const convexProjectId = convexId<"projects">(projectId);
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const page = useQuery(api.agentTranslationProposals.listForReview, {
		projectId: convexProjectId,
		paginationOpts: { numItems: 50, cursor: null },
	});

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Translation tasks"
				description="One review queue for manual work, agent candidates, and the next Locale."
				action={
					<Badge variant="secondary">
						{page?.page.length ?? 0} recent agent task
						{page?.page.length === 1 ? "" : "s"}
					</Badge>
				}
			/>
			<Card size="sm">
				<CardContent className="flex flex-col gap-3 py-4">
					<div>
						<p className="font-medium text-sm">Start a translation</p>
						<p className="text-muted-foreground text-xs">
							Choose the smallest useful task. Every agent result remains a
							candidate until you review it here.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							nativeButton={false}
							size="sm"
							variant="outline"
							render={
								<Link
									to="/projects/$projectId/strings"
									params={{ projectId }}
								/>
							}
						>
							<PenLine data-icon="inline-start" />
							Edit current values
						</Button>
						<Button
							nativeButton={false}
							size="sm"
							render={
								<Link
									to="/projects/$projectId/locale-proposals/pt"
									params={{ projectId }}
								/>
							}
						>
							<Languages data-icon="inline-start" />
							Prepare Portuguese
						</Button>
						<Button
							nativeButton={false}
							size="sm"
							variant="ghost"
							render={
								<Link
									to="/projects/$projectId/settings/api-tokens"
									params={{ projectId }}
								/>
							}
						>
							Ask an agent <ArrowRight data-icon="inline-end" />
						</Button>
					</div>
				</CardContent>
			</Card>
			{page === undefined ? (
				<div
					className="flex flex-col gap-3"
					role="status"
					aria-label="Loading proposals"
				>
					<Skeleton className="h-24 w-full" />
					<Skeleton className="h-24 w-full" />
				</div>
			) : page.page.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Bot />
						</EmptyMedia>
						<EmptyTitle>No agent tasks yet</EmptyTitle>
						<EmptyDescription>
							Give an agent a scoped token and ask it to propose focused edits.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button
							nativeButton={false}
							variant="outline"
							render={
								<Link
									to="/projects/$projectId/settings/api-tokens"
									params={{ projectId }}
								/>
							}
						>
							<KeyRound data-icon="inline-start" />
							Create API token
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<Card size="sm">
					<CardContent className="divide-y">
						{page.page.map((proposal) => (
							<div
								key={proposal._id}
								className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
							>
								<span
									aria-hidden
									className="inline-flex size-7 items-center justify-center rounded-md bg-muted text-foreground"
								>
									<Bot className="size-4" />
								</span>
								<div className="flex min-w-0 flex-col gap-1">
									<div className="flex flex-wrap items-center gap-2">
										<span className="truncate font-medium text-sm">
											{proposal.clientProposalKey}
										</span>
										<Badge variant="secondary">{proposal.status}</Badge>
									</div>
									<div className="text-muted-foreground text-xs">
										{proposal.candidateCount} target
										{proposal.candidateCount === 1 ? "" : "s"} ·{" "}
										{proposal.revisionCount} revision
										{proposal.revisionCount === 1 ? "" : "s"} ·{" "}
										{proposal.target.kind}
									</div>
								</div>
								<Button
									nativeButton={false}
									size="sm"
									variant="outline"
									render={
										<Link
											to="/projects/$projectId/proposals/$proposalId"
											params={{ projectId, proposalId: proposal._id }}
										/>
									}
								>
									Review
								</Button>
							</div>
						))}
					</CardContent>
				</Card>
			)}
		</ProjectShell>
	);
}
