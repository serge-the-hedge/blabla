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
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { AlertTriangle, GitCommitHorizontal, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import {
	PreparingCard,
	ReleaseRecordView,
} from "@/components/localization/release-record-view";
import { api, convexId } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/release")({
	component: ReleaseRoute,
});

function ReleaseRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/release" });
	const project = useQuery(api.projects.get, {
		projectId: convexId<"projects">(projectId),
	});
	const release = useQuery(api.releaseRecords.current, {
		projectId: convexId<"projects">(projectId),
	});
	const prepare = useMutation(api.releaseRecords.prepare);
	const [starting, setStarting] = useState(false);
	const record = release?.kind === "available" ? release.current : null;
	const history = useQuery(
		api.releaseRecords.history,
		release?.kind === "available" && record
			? {
					projectId: convexId<"projects">(projectId),
					paginationOpts: { cursor: release.historyCursor, numItems: 7 },
				}
			: "skip",
	);
	const evidence = usePaginatedQuery(
		api.releaseRecords.evidence,
		record?.status === "ready" ? { recordId: record.recordId } : "skip",
		{ initialNumItems: 50 },
	);

	const start = async () => {
		setStarting(true);
		try {
			await prepare({ projectId: convexId<"projects">(projectId) });
			toast.success("Release assessment started.");
		} catch (cause) {
			toast.error(
				cause instanceof Error
					? cause.message
					: "Could not prepare the Release Record.",
			);
		} finally {
			setStarting(false);
		}
	};

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader title="Release" />
			{release === undefined ? (
				<div className="flex max-w-3xl flex-col gap-3">
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-40 w-full" />
				</div>
			) : release.kind === "noBaseline" ? (
				<Empty className="max-w-3xl border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<GitCommitHorizontal aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No Baseline to assess</EmptyTitle>
						<EmptyDescription>
							Sync and accept the checkout before preparing a Release Record.
						</EmptyDescription>
						<Button
							nativeButton={false}
							render={
								<Link to="/projects/$projectId/sync" params={{ projectId }} />
							}
						>
							Open Sync
						</Button>
					</EmptyHeader>
				</Empty>
			) : record?.status === "preparing" ? (
				<PreparingCard record={record} />
			) : record?.status === "ready" && release.basisCurrent ? (
				<ReleaseRecordView
					record={record}
					history={history?.records}
					evidence={evidence.results}
					evidenceStatus={evidence.status}
					onLoadMoreEvidence={() => evidence.loadMore(50)}
					workAction={
						<Button
							nativeButton={false}
							size="sm"
							render={
								<Link
									to="/projects/$projectId/strings"
									params={{ projectId }}
									search={{ release: record.recordId }}
								/>
							}
						>
							Work through in Strings
						</Button>
					}
				/>
			) : (
				<Card size="sm" className="max-w-3xl">
					<CardContent className="flex flex-col gap-3">
						<div className="flex items-start gap-2">
							<AlertTriangle
								aria-hidden="true"
								className="mt-0.5 size-4 text-muted-foreground"
							/>
							<div className="flex flex-col gap-0.5">
								<span className="font-medium text-sm">
									{record?.status === "failed"
										? "Release assessment stopped"
										: record
											? "The Workspace changed"
											: "Prepare a Release Record"}
								</span>
								<p className="text-muted-foreground text-xs">
									{record?.failure?.message ??
										"Assess the exact current Baseline and Workspace before building a release."}
								</p>
							</div>
						</div>
						{release.canPrepare ? (
							<div>
								<Button size="sm" disabled={starting} onClick={start}>
									{starting ? (
										<LoaderCircle aria-hidden="true" className="animate-spin" />
									) : null}
									Prepare current release
								</Button>
							</div>
						) : (
							<p className="text-muted-foreground text-xs">
								An editor must finish Catalog preparation in Strings first.
							</p>
						)}
					</CardContent>
				</Card>
			)}
		</ProjectShell>
	);
}
