import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@blabla/ui/components/alert";
import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import { Link } from "@tanstack/react-router";
import { Archive, ArrowRight } from "lucide-react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";

export function LegacyRouteNotice({
	projectId,
	projectName,
	title,
	area,
}: {
	projectId: string;
	projectName: string;
	title: string;
	area: string;
}) {
	return (
		<ProjectShell projectId={projectId} title={projectName}>
			<PageHeader
				title={title}
				description={`${area} is now handled from Sync and Strings.`}
			/>
			<Card size="sm">
				<CardContent className="flex flex-col gap-4 py-6">
					<Alert>
						<Archive className="size-4" />
						<AlertTitle>This page is kept for old links</AlertTitle>
						<AlertDescription>
							It is read-only and no longer part of the primary localization
							flow. Use Sync to connect the repository, then Strings for current
							catalog work.
						</AlertDescription>
					</Alert>
					<div className="flex flex-wrap gap-2">
						<Button
							nativeButton={false}
							render={
								<Link to="/projects/$projectId/sync" params={{ projectId }} />
							}
						>
							Open Sync <ArrowRight data-icon="inline-end" />
						</Button>
						<Button
							nativeButton={false}
							variant="outline"
							render={
								<Link
									to="/projects/$projectId/strings"
									params={{ projectId }}
								/>
							}
						>
							Open Strings
						</Button>
					</div>
				</CardContent>
			</Card>
		</ProjectShell>
	);
}
