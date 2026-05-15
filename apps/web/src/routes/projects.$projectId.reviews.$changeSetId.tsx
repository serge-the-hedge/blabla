import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { cn } from "@blabla/ui/lib/utils";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DiffPanel } from "@/components/diff/DiffPanel";
import { PageHeader } from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute(
	"/projects/$projectId/reviews/$changeSetId",
)({
	component: ReviewDetailRoute,
});

type ReviewItemStatus = "pending" | "accepted" | "rejected" | "conflicted";

type ReviewItem = {
	_id: string;
	fieldPath: string;
	status: ReviewItemStatus;
};

type ReviewChangeSet = {
	title: string;
	description?: string;
	status: string;
	items: ReviewItem[];
	patch?: string;
	applicablePatch?: string;
};

const ITEM_STATUS_VARIANT: Record<
	ReviewItemStatus,
	"default" | "secondary" | "outline" | "destructive"
> = {
	accepted: "default",
	conflicted: "destructive",
	pending: "secondary",
	rejected: "destructive",
};

function ReviewDetailRoute() {
	const { changeSetId } = useParams({
		from: "/projects/$projectId/reviews/$changeSetId",
	});
	const changeSet = useQuery(apiAny.changeSets.get, { changeSetId }) as
		| ReviewChangeSet
		| undefined;
	const acceptItem = useMutation(apiAny.changeSets.acceptItem);
	const rejectItem = useMutation(apiAny.changeSets.rejectItem);
	const reviewAndApply = useMutation(apiAny.changeSets.reviewAndApply);
	const reject = useMutation(apiAny.changeSets.reject);
	const [isApplying, setIsApplying] = useState(false);
	const [isRejecting, setIsRejecting] = useState(false);
	const [showAllChanges, setShowAllChanges] = useState(false);

	const counts = { accepted: 0, conflicted: 0, pending: 0, rejected: 0 };
	for (const item of changeSet?.items ?? []) {
		counts[item.status] += 1;
	}

	const canReview =
		changeSet?.status === "open" || changeSet?.status === "draft";
	const applicableCount = counts.accepted + counts.pending;
	const allItemsRejected =
		Boolean(changeSet?.items.length) &&
		counts.rejected === changeSet?.items.length;
	const canApply =
		canReview &&
		applicableCount > 0 &&
		!allItemsRejected &&
		counts.conflicted === 0;
	const patch = showAllChanges
		? (changeSet?.patch ?? "")
		: (changeSet?.applicablePatch ?? "");

	async function applyReview() {
		setIsApplying(true);
		try {
			const result = await reviewAndApply({ changeSetId });
			if (result.status === "applied") {
				toast.success("Review applied");
			} else if (result.conflicted > 0) {
				toast.warning("Review has conflicts. No keys were updated.");
			} else {
				toast.warning("Review has no applicable changes.");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not apply review",
			);
		} finally {
			setIsApplying(false);
		}
	}

	async function rejectChangeSet() {
		setIsRejecting(true);
		try {
			await reject({ changeSetId });
			toast.success("Review rejected");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not reject review",
			);
		} finally {
			setIsRejecting(false);
		}
	}

	async function setItemStatus(
		item: ReviewItem,
		status: "accepted" | "rejected",
	) {
		try {
			if (status === "accepted") {
				await acceptItem({ itemId: item._id });
			} else {
				await rejectItem({ itemId: item._id });
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not update item",
			);
		}
	}

	return (
		<>
			<PageHeader
				title={changeSet?.title ?? "Review"}
				description={
					changeSet?.description ?? "Inspect proposed changes before applying."
				}
				action={
					changeSet ? (
						<>
							<Button
								variant="outline"
								onClick={rejectChangeSet}
								disabled={!canReview || isApplying || isRejecting}
							>
								<X data-icon="inline-start" />
								{isRejecting ? "Rejecting..." : "Reject"}
							</Button>
							<Button
								onClick={applyReview}
								disabled={!canApply || isApplying || isRejecting}
							>
								<Check data-icon="inline-start" />
								{isApplying ? "Applying..." : "Apply review"}
							</Button>
						</>
					) : null
				}
			/>
			{changeSet ? (
				<div className="grid grid-cols-[320px_1fr] gap-4">
					<aside className="flex min-h-0 min-h-[520px] flex-col overflow-hidden rounded-md border bg-card">
						<div className="border-b px-3 py-2">
							<div className="font-medium text-sm">
								Items ({changeSet.items.length})
							</div>
							<div className="mt-2 grid grid-cols-2 gap-1 text-xs">
								<ReviewCount label="Pending" value={counts.pending} />
								<ReviewCount label="Accepted" value={counts.accepted} />
								<ReviewCount label="Rejected" value={counts.rejected} />
								<ReviewCount label="Conflicted" value={counts.conflicted} />
							</div>
						</div>
						<div className="min-h-0 flex-1 divide-y overflow-auto">
							{changeSet.items.map((item) => {
								const itemControlsDisabled =
									!canReview || isApplying || isRejecting;
								return (
									<div
										key={item._id}
										className={cn(
											"flex flex-col gap-2 p-3 text-xs",
											item.status === "rejected" && "opacity-60",
										)}
									>
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0 break-all font-mono text-xs">
												{item.fieldPath}
											</div>
											<Badge
												variant={ITEM_STATUS_VARIANT[item.status] ?? "outline"}
												className="capitalize"
											>
												{item.status}
											</Badge>
										</div>
										{item.status === "conflicted" ? (
											<div className="text-muted-foreground">
												Resolve conflict by rejecting or resubmitting.
											</div>
										) : null}
										<div className="flex gap-1">
											<Button
												size="xs"
												onClick={() => setItemStatus(item, "accepted")}
												disabled={
													itemControlsDisabled ||
													item.status === "conflicted" ||
													item.status === "accepted"
												}
											>
												<Check data-icon="inline-start" />
												Accept
											</Button>
											<Button
												size="xs"
												variant="outline"
												onClick={() => setItemStatus(item, "rejected")}
												disabled={
													itemControlsDisabled || item.status === "rejected"
												}
											>
												<X data-icon="inline-start" />
												Reject
											</Button>
										</div>
									</div>
								);
							})}
						</div>
					</aside>
					<div className="flex min-w-0 flex-col gap-2">
						<div className="flex justify-end">
							<Button
								size="sm"
								variant="outline"
								onClick={() => setShowAllChanges((value) => !value)}
							>
								{showAllChanges ? "Apply preview" : "All proposed changes"}
							</Button>
						</div>
						<DiffPanel patch={patch} />
					</div>
				</div>
			) : (
				<div className="grid grid-cols-[320px_1fr] gap-4">
					<Skeleton className="h-[520px] w-full" />
					<Skeleton className="h-[520px] w-full" />
				</div>
			)}
		</>
	);
}

function ReviewCount({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md bg-muted px-2 py-1">
			<div className="text-muted-foreground">{label}</div>
			<div className="font-medium text-foreground">{value}</div>
		</div>
	);
}
