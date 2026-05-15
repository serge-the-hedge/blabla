import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@blabla/ui/components/empty";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Bot, GitPullRequestArrow, User } from "lucide-react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/reviews")({
	component: ReviewsRoute,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
	approved: "default",
	pending: "secondary",
	rejected: "destructive",
	applied: "default",
	draft: "outline",
};

function ReviewsRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/reviews" });
	const project = useQuery(apiAny.projects.get, { projectId });
	const changeSets = useQuery(apiAny.changeSets.list, { projectId });

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Reviews"
				description="Agent and user change sets awaiting review."
			/>
			{changeSets === undefined ? (
				<Skeleton className="h-40 w-full" />
			) : changeSets.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<GitPullRequestArrow />
						</EmptyMedia>
						<EmptyTitle>No change sets yet</EmptyTitle>
						<EmptyDescription>
							Edits proposed by agents or users will appear here for review.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<Card size="sm">
					<CardContent className="divide-y">
						{changeSets.map((changeSet: any) => {
							const isAgent = changeSet.author?.kind === "agent";
							return (
								<div
									key={changeSet._id}
									className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
								>
									<span
										aria-hidden
										className="inline-flex size-7 items-center justify-center rounded-md bg-muted text-foreground"
									>
										{isAgent ? <Bot className="size-4" /> : <User className="size-4" />}
									</span>
									<div className="flex min-w-0 flex-col gap-1">
										<div className="flex items-center gap-2">
											<span className="truncate font-medium text-sm">
												{changeSet.title}
											</span>
											<Badge
												variant={
													STATUS_VARIANT[changeSet.status] ?? "outline"
												}
												className="capitalize"
											>
												{changeSet.status}
											</Badge>
										</div>
										<div className="text-muted-foreground text-xs">
											{changeSet.summary.fieldsChanged} fields ·{" "}
											<span className="text-success">
												+{changeSet.summary.additions}
											</span>{" "}
											/{" "}
											<span className="text-destructive">
												−{changeSet.summary.deletions}
											</span>{" "}
											· {changeSet.author?.kind}
										</div>
									</div>
									<Link
										to="/projects/$projectId/reviews/$changeSetId"
										params={{ projectId, changeSetId: changeSet._id }}
									>
										<Button size="sm" variant="outline">
											Review
										</Button>
									</Link>
								</div>
							);
						})}
					</CardContent>
				</Card>
			)}
		</ProjectShell>
	);
}
