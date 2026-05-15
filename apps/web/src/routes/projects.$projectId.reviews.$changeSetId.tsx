import { Button } from "@blabla/ui/components/button";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { DiffPanel } from "@/components/diff/DiffPanel";
import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute(
	"/projects/$projectId/reviews/$changeSetId",
)({
	component: ReviewDetailRoute,
});

function ReviewDetailRoute() {
	const { projectId, changeSetId } = useParams({
		from: "/projects/$projectId/reviews/$changeSetId",
	});
	const project = useQuery(apiAny.projects.get, { projectId });
	const changeSet = useQuery(apiAny.changeSets.get, { changeSetId });
	const acceptItem = useMutation(apiAny.changeSets.acceptItem);
	const rejectItem = useMutation(apiAny.changeSets.rejectItem);
	const approve = useMutation(apiAny.changeSets.approve);
	const apply = useMutation(apiAny.changeSets.apply);
	const reject = useMutation(apiAny.changeSets.reject);

	async function approveAndApply() {
		await approve({ changeSetId });
		const result = await apply({ changeSetId });
		toast.success(
			result.conflicted ? "Applied with conflicts" : "Change set applied",
		);
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title={changeSet?.title ?? "Review"}
				description={
					changeSet?.description ?? "Inspect proposed changes before applying."
				}
				action={
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => reject({ changeSetId })}>
							Reject
						</Button>
						<Button onClick={approveAndApply}>Approve and apply</Button>
					</div>
				}
			/>
			{changeSet ? (
				<div className="grid grid-cols-[320px_1fr] gap-4">
					<aside className="min-h-0 overflow-auto border">
						{changeSet.items.map((item: any) => (
							<div key={item._id} className="border-b p-3 text-xs">
								<div className="font-mono">{item.fieldPath}</div>
								<div className="mt-1 text-muted-foreground">{item.status}</div>
								<div className="mt-3 flex gap-2">
									<Button
										size="xs"
										onClick={() => acceptItem({ itemId: item._id })}
									>
										Accept
									</Button>
									<Button
										size="xs"
										variant="outline"
										onClick={() => rejectItem({ itemId: item._id })}
									>
										Reject
									</Button>
								</div>
							</div>
						))}
					</aside>
					<DiffPanel patch={changeSet.patch ?? ""} />
				</div>
			) : (
				<div className="text-muted-foreground text-sm">Loading review...</div>
			)}
		</ProjectShell>
	);
}
