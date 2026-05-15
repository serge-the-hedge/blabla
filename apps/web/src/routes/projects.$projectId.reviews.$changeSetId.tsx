import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@blabla/ui/components/select";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { cn } from "@blabla/ui/lib/utils";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Check, Download, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DiffPanel } from "@/components/diff/DiffPanel";
import { PageHeader } from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";
import {
	buildExportFileName,
	downloadExportFile,
	type ExportFormat,
} from "@/lib/export-download";

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
	key?: { key: string; description?: string } | null;
	locale?: { code: string; label: string } | null;
	sourceLocale?: { code: string; label: string } | null;
	sourceValue?: string | null;
	nextValue?: string | null;
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
	const acceptUnmarkedItems = useMutation(
		apiAny.changeSets.acceptUnmarkedItems,
	);
	const rejectUnmarkedItems = useMutation(
		apiAny.changeSets.rejectUnmarkedItems,
	);
	const exportAcceptedByLocale = useMutation(
		apiAny.changeSets.exportAcceptedByLocale,
	);
	const reviewAndApply = useMutation(apiAny.changeSets.reviewAndApply);
	const reject = useMutation(apiAny.changeSets.reject);
	const [isApplying, setIsApplying] = useState(false);
	const [isRejecting, setIsRejecting] = useState(false);
	const [isBulkMarking, setIsBulkMarking] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [showAllChanges, setShowAllChanges] = useState(false);
	const [acceptedExportFormat, setAcceptedExportFormat] =
		useState<ExportFormat>("json");

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
	const canUseReviewControls =
		canReview && !isApplying && !isRejecting && !isBulkMarking && !isExporting;
	const patch = showAllChanges
		? (changeSet?.patch ?? "")
		: (changeSet?.applicablePatch ?? "");
	const groupedItems = groupReviewItemsByKey(changeSet?.items ?? []);

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

	async function markPending(status: "accepted" | "rejected") {
		setIsBulkMarking(true);
		try {
			const result =
				status === "accepted"
					? await acceptUnmarkedItems({ changeSetId })
					: await rejectUnmarkedItems({ changeSetId });
			toast.success(
				status === "accepted"
					? `Accepted ${result.updated} unmarked items`
					: `Rejected ${result.updated} unmarked items`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not update items",
			);
		} finally {
			setIsBulkMarking(false);
		}
	}

	async function downloadAcceptedChanges() {
		setIsExporting(true);
		try {
			const result = await exportAcceptedByLocale({
				changeSetId,
				format: acceptedExportFormat,
			});
			if (result.count === 0) {
				toast.warning("No accepted translation changes to export");
				return;
			}
			downloadExportFile({
				content: result.content,
				fileName: buildExportFileName({
					projectSlug: result.projectSlug,
					scope: "approved-by-locale",
					format: acceptedExportFormat,
				}),
				format: acceptedExportFormat,
			});
			toast.success("Approved changes downloaded");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not export changes",
			);
		} finally {
			setIsExporting(false);
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
								disabled={!canUseReviewControls}
							>
								<X data-icon="inline-start" />
								{isRejecting ? "Rejecting..." : "Reject"}
							</Button>
							<Button
								onClick={applyReview}
								disabled={!canApply || !canUseReviewControls}
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
							<div className="mt-3 flex flex-wrap gap-1.5">
								<Button
									size="xs"
									type="button"
									onClick={() => markPending("accepted")}
									disabled={!canUseReviewControls || counts.pending === 0}
								>
									<Check data-icon="inline-start" />
									Accept unmarked
								</Button>
								<Button
									size="xs"
									type="button"
									variant="outline"
									onClick={() => markPending("rejected")}
									disabled={!canUseReviewControls || counts.pending === 0}
								>
									<X data-icon="inline-start" />
									Reject unmarked
								</Button>
							</div>
						</div>
						<div className="min-h-0 flex-1 divide-y overflow-auto">
							{groupedItems.map((group) => (
								<div key={group.key} className="flex flex-col gap-2 p-3">
									<div className="flex flex-col gap-1">
										<div className="break-all font-mono text-xs">
											{group.label}
										</div>
										<div className="text-[11px] text-muted-foreground">
											Source {group.sourceLocaleCode}:{" "}
											<span className="text-foreground">
												{group.sourceValue ?? "—"}
											</span>
										</div>
									</div>
									<div className="flex flex-col gap-2">
										{group.items.map((item) => {
											const itemControlsDisabled = !canUseReviewControls;
											return (
												<div
													key={item._id}
													className={cn(
														"flex flex-col gap-2 rounded-md border bg-background p-2 text-xs",
														item.status === "rejected" && "opacity-60",
													)}
												>
													<div className="flex items-start justify-between gap-2">
														<div className="min-w-0">
															<div className="font-mono text-[11px]">
																{item.locale?.code ?? "unknown locale"}
															</div>
															<div className="break-all text-[11px] text-muted-foreground">
																{item.fieldPath}
															</div>
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
													{item.nextValue !== undefined ? (
														<div className="rounded-sm bg-muted px-2 py-1 text-[11px]">
															{item.nextValue ?? "—"}
														</div>
													) : null}
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
																itemControlsDisabled ||
																item.status === "rejected"
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
								</div>
							))}
						</div>
					</aside>
					<div className="flex min-w-0 flex-col gap-2">
						<div className="flex flex-wrap justify-end gap-2">
							<Select
								value={acceptedExportFormat}
								onValueChange={(value) =>
									setAcceptedExportFormat(value as ExportFormat)
								}
							>
								<SelectTrigger size="sm" className="w-28">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="json">JSON</SelectItem>
										<SelectItem value="arb">ARB</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							<Button
								size="sm"
								variant="outline"
								onClick={downloadAcceptedChanges}
								disabled={counts.accepted === 0 || isExporting}
							>
								<Download data-icon="inline-start" />
								Download approved
							</Button>
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

function groupReviewItemsByKey(items: ReviewItem[]) {
	const groups = new Map<
		string,
		{
			key: string;
			label: string;
			sourceLocaleCode: string;
			sourceValue: string | null;
			items: ReviewItem[];
		}
	>();
	for (const item of items) {
		const key = item.key?.key ?? item.fieldPath;
		const group = groups.get(key) ?? {
			key,
			label: item.key?.key ?? item.fieldPath,
			sourceLocaleCode: item.sourceLocale?.code ?? "source",
			sourceValue: item.sourceValue ?? null,
			items: [],
		};
		group.items.push(item);
		groups.set(key, group);
	}
	return Array.from(groups.values());
}

function ReviewCount({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md bg-muted px-2 py-1">
			<div className="text-muted-foreground">{label}</div>
			<div className="font-medium text-foreground">{value}</div>
		</div>
	);
}
