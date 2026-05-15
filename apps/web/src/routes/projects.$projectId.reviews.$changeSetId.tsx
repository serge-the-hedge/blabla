import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { cn } from "@blabla/ui/lib/utils";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Check, X } from "lucide-react";
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

const ITEM_STATUS_VARIANT: Record<
	string,
	"default" | "secondary" | "outline" | "destructive"
> = {
	accepted: "default",
	pending: "secondary",
	rejected: "destructive",
};

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
					changeSet ? (
						<>
							<Button variant="outline" onClick={() => reject({ changeSetId })}>
								<X data-icon="inline-start" />
								Reject
							</Button>
							<Button onClick={approveAndApply}>
								<Check data-icon="inline-start" />
								Approve & apply
							</Button>
						</>
					) : null
				}
			/>
			{changeSet ? (
				<div className="grid grid-cols-[320px_1fr] gap-4">
					<aside className="flex min-h-[520px] min-h-0 flex-col overflow-hidden rounded-md border bg-card">
						<div className="border-b px-3 py-2 font-medium text-sm">
							Items ({changeSet.items.length})
						</div>
						<div className="min-h-0 flex-1 overflow-auto divide-y">
							{changeSet.items.map((item: any) => (
								<div
									key={item._id}
									className={cn(
										"flex flex-col gap-2 p-3 text-xs",
										item.status === "rejected" && "opacity-60",
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0 font-mono text-xs break-all">
											{item.fieldPath}
										</div>
										<Badge
											variant={
												ITEM_STATUS_VARIANT[item.status] ?? "outline"
											}
											className="capitalize"
										>
											{item.status}
										</Badge>
									</div>
									<div className="flex gap-1">
										<Button
											size="xs"
											onClick={() => acceptItem({ itemId: item._id })}
										>
											<Check data-icon="inline-start" />
											Accept
										</Button>
										<Button
											size="xs"
											variant="outline"
											onClick={() => rejectItem({ itemId: item._id })}
										>
											<X data-icon="inline-start" />
											Reject
										</Button>
									</div>
								</div>
							))}
						</div>
					</aside>
					<DiffPanel patch={changeSet.patch ?? ""} />
				</div>
			) : (
				<div className="grid grid-cols-[320px_1fr] gap-4">
					<Skeleton className="h-[520px] w-full" />
					<Skeleton className="h-[520px] w-full" />
				</div>
			)}
		</ProjectShell>
	);
}
