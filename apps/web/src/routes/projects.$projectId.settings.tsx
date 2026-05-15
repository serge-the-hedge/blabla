import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/settings")({
	component: SettingsRoute,
});

function SettingsRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/settings" });
	const project = useQuery(apiAny.projects.get, { projectId });
	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader title="Settings" description="Project administration." />
			<div className="grid gap-3 md:grid-cols-2">
				<a
					className="border p-4 hover:bg-muted/40"
					href={`/projects/${projectId}/settings/api-tokens`}
				>
					API tokens
				</a>
				<a
					className="border p-4 hover:bg-muted/40"
					href={`/projects/${projectId}/settings/members`}
				>
					Members
				</a>
			</div>
		</ProjectShell>
	);
}
