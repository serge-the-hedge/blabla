import { Button } from "@blabla/ui/components/button";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/reviews")({
	component: ReviewsRoute,
});

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
			<div className="divide-y border">
				{(changeSets ?? []).map((changeSet: any) => (
					<div
						key={changeSet._id}
						className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-3"
					>
						<div>
							<div className="font-medium">{changeSet.title}</div>
							<div className="text-muted-foreground text-xs">
								{changeSet.status} · {changeSet.summary.fieldsChanged} fields ·
								+{changeSet.summary.additions}/-
								{changeSet.summary.deletions}
							</div>
						</div>
						<span className="text-muted-foreground text-xs">
							{changeSet.author.kind}
						</span>
						<a href={`/projects/${projectId}/reviews/${changeSet._id}`}>
							<Button size="sm" variant="outline">
								Review
							</Button>
						</a>
					</div>
				))}
				{changeSets?.length === 0 ? (
					<div className="p-6 text-muted-foreground text-sm">
						No change sets yet.
					</div>
				) : null}
			</div>
		</ProjectShell>
	);
}
