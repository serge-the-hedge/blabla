import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { ProjectShell } from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/reviews")({
	component: ReviewsLayoutRoute,
});

function ReviewsLayoutRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/reviews" });
	const project = useQuery(apiAny.projects.get, { projectId });

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<Outlet />
		</ProjectShell>
	);
}
