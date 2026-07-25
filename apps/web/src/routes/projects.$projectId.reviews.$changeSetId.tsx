import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@blabla/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@blabla/ui/components/alert-dialog";
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
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@blabla/ui/components/select";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { Textarea } from "@blabla/ui/components/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@blabla/ui/components/tooltip";
import { cn } from "@blabla/ui/lib/utils";
import {
	createFileRoute,
	useNavigate,
	useParams,
	useSearch,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Check, Download, Inbox, Sparkles, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";
import {
	buildExportFileName,
	downloadExportFile,
	type ExportFormat,
} from "@/lib/export-download";

export const Route = createFileRoute(
	"/projects/$projectId/reviews/$changeSetId",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		status:
			typeof search.status === "string" &&
			["pending", "accepted", "rejected", "conflicted"].includes(search.status)
				? (search.status as StatusFilter)
				: undefined,
	}),
	component: ReviewDetailRoute,
});

type ReviewItemStatus = "pending" | "accepted" | "rejected" | "conflicted";
type SourceMissingReason =
	| "no_key"
	| "no_project_source_locale"
	| "source_locale_missing"
	| "source_value_missing";

type ReviewItem = {
	_id: string;
	fieldPath: string;
	kind: string;
	status: ReviewItemStatus;
	previousValue: string | null;
	nextValue: string | null;
	originalNextValue?: string;
	key?: {
		id: string;
		key: string;
		description?: string;
		placeholders?: Array<{ name: string; type?: string; example?: string }>;
	} | null;
	locale?: { id: string; code: string; label: string } | null;
	sourceLocale?: { id: string; code: string; label: string } | null;
	sourceValue?: string | null;
	sourceMissingReason?: SourceMissingReason | null;
};

type ReviewChangeSet = {
	_id: string;
	title: string;
	description?: string;
	status: string;
	items: ReviewItem[];
};

type StatusFilter = "all" | ReviewItemStatus;

type PendingAction =
	| { kind: "idle" }
	| { kind: "applying" }
	| { kind: "rejecting" }
	| { kind: "bulk-marking"; action: "accept" | "reject" }
	| { kind: "exporting" }
	| { kind: "group-bulk"; keyId: string; action: "accept" | "reject" }
	| {
			kind: "item";
			itemId: string;
			action: "accept" | "reject" | "save" | "revert";
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

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "accepted", label: "Accepted" },
	{ value: "rejected", label: "Rejected" },
	{ value: "conflicted", label: "Conflicted" },
];

type ReviewGroup = {
	groupKey: string;
	keyId: string | null;
	label: string;
	description?: string;
	placeholders?: Array<{ name: string; type?: string; example?: string }>;
	sourceLocaleId: string | null;
	sourceLocaleCode: string;
	sourceLocaleLabel: string;
	sourceValue: string | null;
	sourceMissingReason: SourceMissingReason | null;
	items: ReviewItem[];
};

function ReviewDetailRoute() {
	const { changeSetId } = useParams({
		from: "/projects/$projectId/reviews/$changeSetId",
	});
	const search = useSearch({
		from: "/projects/$projectId/reviews/$changeSetId",
	});
	const navigate = useNavigate({
		from: "/projects/$projectId/reviews/$changeSetId",
	});
	const convexChangeSetId = convexId<"changeSets">(changeSetId);
	const changeSet = useQuery(api.changeSets.get, {
		changeSetId: convexChangeSetId,
	}) as ReviewChangeSet | undefined;
	const acceptItem = useMutation(api.changeSets.acceptItem);
	const rejectItem = useMutation(api.changeSets.rejectItem);
	const updateItem = useMutation(api.changeSets.updateItem);
	const revertItem = useMutation(api.changeSets.revertItem);
	const acceptUnmarkedItems = useMutation(api.changeSets.acceptUnmarkedItems);
	const rejectUnmarkedItems = useMutation(api.changeSets.rejectUnmarkedItems);
	const acceptItemsInGroup = useMutation(api.changeSets.acceptItemsInGroup);
	const rejectItemsInGroup = useMutation(api.changeSets.rejectItemsInGroup);
	const exportAcceptedByLocale = useMutation(
		api.changeSets.exportAcceptedByLocale,
	);
	const reviewAndApply = useMutation(api.changeSets.reviewAndApply);
	const reject = useMutation(api.changeSets.reject);

	const [pendingAction, setPendingAction] = useState<PendingAction>({
		kind: "idle",
	});
	const statusFilter: StatusFilter = search.status ?? "all";
	const [acceptedExportFormat, setAcceptedExportFormat] =
		useState<ExportFormat>("json");

	const items = changeSet?.items ?? [];

	const counts = useMemo(() => {
		const tally: Record<ReviewItemStatus, number> = {
			pending: 0,
			accepted: 0,
			rejected: 0,
			conflicted: 0,
		};
		for (const item of items) tally[item.status] += 1;
		return tally;
	}, [items]);

	const groupedItems = useMemo(() => groupReviewItemsByKey(items), [items]);

	const visibleGroups = useMemo(() => {
		if (statusFilter === "all") return groupedItems;
		return groupedItems
			.map((group) => ({
				...group,
				items: group.items.filter((item) => item.status === statusFilter),
			}))
			.filter((group) => group.items.length > 0);
	}, [groupedItems, statusFilter]);

	const canReview =
		changeSet?.status === "open" || changeSet?.status === "draft";
	const applicableCount = counts.accepted;
	const allItemsRejected = items.length > 0 && counts.rejected === items.length;
	const busy = pendingAction.kind !== "idle";
	const canApply =
		canReview &&
		applicableCount > 0 &&
		!allItemsRejected &&
		counts.pending === 0 &&
		counts.conflicted === 0;
	const canUseReviewControls = canReview && !busy;

	async function applyReview() {
		setPendingAction({ kind: "applying" });
		try {
			const result = await reviewAndApply({ changeSetId: convexChangeSetId });
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
			setPendingAction({ kind: "idle" });
		}
	}

	async function rejectChangeSet() {
		setPendingAction({ kind: "rejecting" });
		try {
			await reject({ changeSetId: convexChangeSetId });
			toast.success("Review rejected");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not reject review",
			);
		} finally {
			setPendingAction({ kind: "idle" });
		}
	}

	async function markPending(action: "accept" | "reject") {
		setPendingAction({ kind: "bulk-marking", action });
		try {
			const result =
				action === "accept"
					? await acceptUnmarkedItems({ changeSetId: convexChangeSetId })
					: await rejectUnmarkedItems({ changeSetId: convexChangeSetId });
			toast.success(
				action === "accept"
					? `Accepted ${result.updated} pending items`
					: `Rejected ${result.updated} pending items`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not update items",
			);
		} finally {
			setPendingAction({ kind: "idle" });
		}
	}

	async function handleItemAction(
		item: ReviewItem,
		action: "accept" | "reject",
	) {
		setPendingAction({ kind: "item", itemId: item._id, action });
		try {
			if (action === "accept")
				await acceptItem({ itemId: convexId<"changeSetItems">(item._id) });
			else await rejectItem({ itemId: convexId<"changeSetItems">(item._id) });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not update item",
			);
		} finally {
			setPendingAction({ kind: "idle" });
		}
	}

	async function handleItemSave(item: ReviewItem, value: string) {
		setPendingAction({ kind: "item", itemId: item._id, action: "save" });
		try {
			await updateItem({
				itemId: convexId<"changeSetItems">(item._id),
				nextValue: value,
			});
			toast.success(`${item.locale?.code ?? "Item"} updated`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save edit",
			);
		} finally {
			setPendingAction({ kind: "idle" });
		}
	}

	async function handleItemRevert(item: ReviewItem) {
		setPendingAction({ kind: "item", itemId: item._id, action: "revert" });
		try {
			await revertItem({ itemId: convexId<"changeSetItems">(item._id) });
			toast.success("Restored original proposal");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not revert item",
			);
		} finally {
			setPendingAction({ kind: "idle" });
		}
	}

	async function handleGroupBulk(keyId: string, action: "accept" | "reject") {
		setPendingAction({ kind: "group-bulk", keyId, action });
		try {
			const result =
				action === "accept"
					? await acceptItemsInGroup({
							changeSetId: convexChangeSetId,
							keyId: convexId<"translationKeys">(keyId),
						})
					: await rejectItemsInGroup({
							changeSetId: convexChangeSetId,
							keyId: convexId<"translationKeys">(keyId),
						});
			toast.success(
				action === "accept"
					? `Accepted ${result.updated} items in this key`
					: `Rejected ${result.updated} items in this key`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not update group",
			);
		} finally {
			setPendingAction({ kind: "idle" });
		}
	}

	async function downloadAcceptedChanges() {
		setPendingAction({ kind: "exporting" });
		try {
			const result = await exportAcceptedByLocale({
				changeSetId: convexChangeSetId,
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
					scope: "accepted-by-locale",
					format: acceptedExportFormat,
				}),
				format: acceptedExportFormat,
			});
			toast.success("Accepted changes downloaded");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not export changes",
			);
		} finally {
			setPendingAction({ kind: "idle" });
		}
	}

	return (
		<TooltipProvider>
			<PageHeader
				title={changeSet?.title ?? "Review"}
				description={
					changeSet?.description ?? "Inspect proposed changes before applying."
				}
				action={
					changeSet ? (
						<>
							<AlertDialog>
								<AlertDialogTrigger
									render={
										<Button
											variant="outline"
											disabled={!canUseReviewControls}
										/>
									}
								>
									<X data-icon="inline-start" />
									{pendingAction.kind === "rejecting"
										? "Rejecting…"
										: "Reject change set"}
								</AlertDialogTrigger>
								<AlertDialogContent size="sm">
									<AlertDialogHeader>
										<AlertDialogTitle>Reject this change set?</AlertDialogTitle>
										<AlertDialogDescription>
											This closes the review without applying any accepted
											items. You cannot reopen it.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Keep reviewing</AlertDialogCancel>
										<AlertDialogAction
											variant="destructive"
											onClick={rejectChangeSet}
										>
											Reject change set
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
							<AlertDialog>
								<AlertDialogTrigger
									render={
										<Button disabled={!canApply || !canUseReviewControls} />
									}
								>
									<Check data-icon="inline-start" />
									{pendingAction.kind === "applying"
										? "Applying…"
										: `Apply ${applicableCount} accepted`}
								</AlertDialogTrigger>
								<AlertDialogContent size="sm">
									<AlertDialogHeader>
										<AlertDialogTitle>
											Apply {applicableCount} accepted{" "}
											{applicableCount === 1 ? "item" : "items"}?
										</AlertDialogTitle>
										<AlertDialogDescription>
											Accepted changes will update the live project.{" "}
											{counts.rejected}{" "}
											{counts.rejected === 1
												? "rejected item is"
												: "rejected items are"}{" "}
											excluded.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Review again</AlertDialogCancel>
										<AlertDialogAction onClick={applyReview}>
											Apply accepted changes
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</>
					) : null
				}
			/>
			{changeSet === undefined ? (
				<ReviewSkeleton />
			) : (
				<div className="flex flex-col gap-4">
					<ReviewToolbar
						counts={counts}
						totalCount={items.length}
						statusFilter={statusFilter}
						onStatusFilterChange={(status) =>
							void navigate({
								search: { status: status === "all" ? undefined : status },
								replace: true,
							})
						}
						canReview={canReview}
						pendingAction={pendingAction}
						onMarkPending={markPending}
						onDownloadAccepted={downloadAcceptedChanges}
						acceptedExportFormat={acceptedExportFormat}
						onExportFormatChange={setAcceptedExportFormat}
					/>
					{visibleGroups.length === 0 ? (
						<Empty className="border">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Inbox />
								</EmptyMedia>
								<EmptyTitle>
									{groupedItems.length === 0
										? "No items in this review"
										: "No items match this filter"}
								</EmptyTitle>
								<EmptyDescription>
									{groupedItems.length === 0
										? "This change set is empty."
										: "Try selecting another status above."}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="flex flex-col gap-3">
							{visibleGroups.map((group) => (
								<KeyGroupCard
									key={group.groupKey}
									group={group}
									canReview={canReview}
									pendingAction={pendingAction}
									onAcceptItem={(item) => handleItemAction(item, "accept")}
									onRejectItem={(item) => handleItemAction(item, "reject")}
									onSaveItem={handleItemSave}
									onRevertItem={handleItemRevert}
									onAcceptGroup={(keyId) => handleGroupBulk(keyId, "accept")}
									onRejectGroup={(keyId) => handleGroupBulk(keyId, "reject")}
								/>
							))}
						</div>
					)}
				</div>
			)}
		</TooltipProvider>
	);
}

function ReviewToolbar({
	counts,
	totalCount,
	statusFilter,
	onStatusFilterChange,
	canReview,
	pendingAction,
	onMarkPending,
	onDownloadAccepted,
	acceptedExportFormat,
	onExportFormatChange,
}: {
	counts: Record<ReviewItemStatus, number>;
	totalCount: number;
	statusFilter: StatusFilter;
	onStatusFilterChange: (next: StatusFilter) => void;
	canReview: boolean;
	pendingAction: PendingAction;
	onMarkPending: (action: "accept" | "reject") => void;
	onDownloadAccepted: () => void;
	acceptedExportFormat: ExportFormat;
	onExportFormatChange: (format: ExportFormat) => void;
}) {
	const busy = pendingAction.kind !== "idle";
	const isBulkAccepting =
		pendingAction.kind === "bulk-marking" && pendingAction.action === "accept";
	const isBulkRejecting =
		pendingAction.kind === "bulk-marking" && pendingAction.action === "reject";
	const isExporting = pendingAction.kind === "exporting";

	return (
		<div className="sticky top-0 z-10 -mx-6 flex flex-col gap-2 border-b bg-background/95 px-6 py-3 backdrop-blur">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium text-xs">
					{totalCount} {totalCount === 1 ? "item" : "items"}
				</span>
				<div className="flex flex-wrap gap-1">
					{STATUS_FILTERS.map((filter) => {
						const value =
							filter.value === "all" ? totalCount : counts[filter.value];
						const active = statusFilter === filter.value;
						return (
							<Button
								key={filter.value}
								size="xs"
								type="button"
								variant={active ? "default" : "outline"}
								onClick={() => onStatusFilterChange(filter.value)}
							>
								{filter.label}
								<span
									className={cn(
										"ml-1 rounded-sm px-1 font-mono text-[10px]",
										active
											? "bg-primary-foreground/15 text-primary-foreground"
											: "bg-muted text-muted-foreground",
									)}
								>
									{value}
								</span>
							</Button>
						);
					})}
				</div>
			</div>
			<Alert
				variant={counts.conflicted > 0 ? "destructive" : "default"}
				aria-live="polite"
			>
				<AlertTitle>
					{counts.conflicted > 0
						? "Apply blocked"
						: counts.pending > 0
							? "Review every item"
							: counts.accepted > 0
								? "Ready to apply"
								: "No accepted items"}
				</AlertTitle>
				<AlertDescription>
					{counts.conflicted > 0
						? `${counts.conflicted} conflicted ${counts.conflicted === 1 ? "item blocks" : "items block"} apply. Reject them or ask for new proposals.`
						: counts.pending > 0
							? `Accept or reject all ${counts.pending} pending ${counts.pending === 1 ? "item" : "items"} before applying.`
							: counts.accepted > 0
								? `${counts.accepted} accepted ${counts.accepted === 1 ? "item will" : "items will"} update the live project. Rejected items are excluded.`
								: "Accept at least 1 item to enable apply."}
				</AlertDescription>
			</Alert>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap gap-1.5">
					<Button
						size="xs"
						type="button"
						onClick={() => onMarkPending("accept")}
						disabled={!canReview || busy || counts.pending === 0}
					>
						<Check data-icon="inline-start" />
						{isBulkAccepting ? "Accepting…" : "Accept pending"}
					</Button>
					<Button
						size="xs"
						type="button"
						variant="outline"
						onClick={() => onMarkPending("reject")}
						disabled={!canReview || busy || counts.pending === 0}
					>
						<X data-icon="inline-start" />
						{isBulkRejecting ? "Rejecting…" : "Reject pending"}
					</Button>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Select
						value={acceptedExportFormat}
						onValueChange={(value) =>
							onExportFormatChange(value as ExportFormat)
						}
					>
						<SelectTrigger size="sm" className="w-24">
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
						onClick={onDownloadAccepted}
						disabled={counts.accepted === 0 || busy}
					>
						<Download data-icon="inline-start" />
						{isExporting ? "Exporting…" : "Download accepted"}
					</Button>
				</div>
			</div>
		</div>
	);
}

function KeyGroupCard({
	group,
	canReview,
	pendingAction,
	onAcceptItem,
	onRejectItem,
	onSaveItem,
	onRevertItem,
	onAcceptGroup,
	onRejectGroup,
}: {
	group: ReviewGroup;
	canReview: boolean;
	pendingAction: PendingAction;
	onAcceptItem: (item: ReviewItem) => void;
	onRejectItem: (item: ReviewItem) => void;
	onSaveItem: (item: ReviewItem, value: string) => Promise<void>;
	onRevertItem: (item: ReviewItem) => void;
	onAcceptGroup: (keyId: string) => void;
	onRejectGroup: (keyId: string) => void;
}) {
	const sourceInItems = group.items.some(
		(item) => item.locale?.id === group.sourceLocaleId,
	);
	const busy = pendingAction.kind !== "idle";
	const groupBusy =
		pendingAction.kind === "group-bulk" &&
		group.keyId !== null &&
		pendingAction.keyId === group.keyId;
	const isAcceptingGroup = groupBusy && pendingAction.action === "accept";
	const isRejectingGroup = groupBusy && pendingAction.action === "reject";

	const canAcceptGroup = group.items.some(
		(item) => item.status !== "accepted" && item.status !== "conflicted",
	);
	const canRejectGroup = group.items.some((item) => item.status !== "rejected");

	const placeholderText =
		group.placeholders && group.placeholders.length > 0
			? group.placeholders
					.map((p) =>
						p.type && p.type !== "string" ? `${p.name} (${p.type})` : p.name,
					)
					.join(", ")
			: null;

	return (
		<Card>
			<div className="flex flex-col gap-1 px-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<code className="break-all font-mono text-sm">{group.label}</code>
					<span className="text-[11px] text-muted-foreground">
						{group.items.length}{" "}
						{group.items.length === 1 ? "locale" : "locales"}
					</span>
				</div>
				{group.description ? (
					<p className="text-muted-foreground text-xs">{group.description}</p>
				) : null}
				{placeholderText ? (
					<p className="text-[11px] text-muted-foreground">
						<span className="font-medium">ICU placeholders:</span>{" "}
						<span className="font-mono">{placeholderText}</span>
					</p>
				) : null}
			</div>
			<CardContent>
				<div className="-mx-1 flex flex-col items-stretch gap-2 px-1 pb-1 sm:flex-row sm:overflow-x-auto">
					{!sourceInItems ? (
						<SourceLocaleColumn
							sourceLocaleCode={group.sourceLocaleCode}
							sourceLocaleLabel={group.sourceLocaleLabel}
							sourceValue={group.sourceValue}
							sourceMissingReason={group.sourceMissingReason}
						/>
					) : null}
					{group.items.map((item) => (
						<ReviewItemEditor
							key={item._id}
							item={item}
							isSource={item.locale?.id === group.sourceLocaleId}
							canReview={canReview}
							pendingAction={pendingAction}
							onAccept={onAcceptItem}
							onReject={onRejectItem}
							onSave={onSaveItem}
							onRevert={onRevertItem}
						/>
					))}
				</div>
			</CardContent>
			{group.keyId ? (
				<div className="flex flex-wrap justify-end gap-1.5 border-t px-4 pt-3">
					<Button
						size="xs"
						type="button"
						onClick={() => group.keyId && onAcceptGroup(group.keyId)}
						disabled={!canReview || busy || !canAcceptGroup}
					>
						<Check data-icon="inline-start" />
						{isAcceptingGroup ? "Accepting…" : "Accept all in key"}
					</Button>
					<Button
						size="xs"
						type="button"
						variant="outline"
						onClick={() => group.keyId && onRejectGroup(group.keyId)}
						disabled={!canReview || busy || !canRejectGroup}
					>
						<X data-icon="inline-start" />
						{isRejectingGroup ? "Rejecting…" : "Reject all in key"}
					</Button>
				</div>
			) : null}
		</Card>
	);
}

function ReviewItemEditor({
	item,
	isSource,
	canReview,
	pendingAction,
	onAccept,
	onReject,
	onSave,
	onRevert,
}: {
	item: ReviewItem;
	isSource: boolean;
	canReview: boolean;
	pendingAction: PendingAction;
	onAccept: (item: ReviewItem) => void;
	onReject: (item: ReviewItem) => void;
	onSave: (item: ReviewItem, value: string) => Promise<void>;
	onRevert: (item: ReviewItem) => void;
}) {
	const initialValue = item.nextValue ?? "";
	const [draft, setDraft] = useState(initialValue);

	useEffect(() => {
		setDraft(initialValue);
	}, [initialValue]);

	const dirty = draft !== initialValue;
	const hasOriginal = item.originalNextValue !== undefined;
	const hasBeenEdited =
		hasOriginal && item.nextValue !== item.originalNextValue;
	const showUndo = hasBeenEdited && !dirty;

	const isThisItemBusy =
		pendingAction.kind === "item" && pendingAction.itemId === item._id;
	const isSaving =
		isThisItemBusy &&
		pendingAction.kind === "item" &&
		pendingAction.action === "save";
	const isReverting =
		isThisItemBusy &&
		pendingAction.kind === "item" &&
		pendingAction.action === "revert";
	const isAccepting =
		isThisItemBusy &&
		pendingAction.kind === "item" &&
		pendingAction.action === "accept";
	const isRejecting =
		isThisItemBusy &&
		pendingAction.kind === "item" &&
		pendingAction.action === "reject";

	const trimmedEmpty = draft.trim().length === 0;
	const saveDisabled = !canReview || isThisItemBusy || trimmedEmpty;
	const editorDisabled = !canReview || isThisItemBusy;
	const acceptDisabled =
		!canReview ||
		isThisItemBusy ||
		dirty ||
		item.status === "conflicted" ||
		item.status === "accepted";
	const rejectDisabled =
		!canReview || isThisItemBusy || dirty || item.status === "rejected";

	const hasPrevious = item.previousValue !== null;
	const previousDiffers = hasPrevious && item.previousValue !== item.nextValue;

	return (
		<div
			className={cn(
				"flex w-full shrink-0 flex-col gap-1.5 rounded-md border bg-background p-2 transition-colors sm:w-80",
				item.status === "rejected" && "opacity-60",
				dirty && "border-ring/50 ring-1 ring-ring/20",
				item.status === "conflicted" &&
					"border-destructive/40 bg-destructive/5",
				isSource && "border-brand/30 bg-brand/5",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					{isSource ? (
						<Sparkles
							role="img"
							aria-label="Source locale"
							className="size-3 shrink-0 text-brand"
						/>
					) : null}
					<span className="font-medium font-mono text-[11px]">
						{item.locale?.code ?? "?"}
					</span>
					<span className="truncate text-[10px] text-muted-foreground">
						{item.locale?.label ?? item.fieldPath}
					</span>
				</div>
				<Badge
					variant={ITEM_STATUS_VARIANT[item.status] ?? "outline"}
					className="shrink-0 capitalize"
				>
					{item.status}
				</Badge>
			</div>

			<div className="flex flex-col gap-0.5">
				<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
					Before
				</span>
				<div
					className={cn(
						"min-h-7 rounded-sm border-l-2 px-2 py-1 text-[11px]",
						previousDiffers
							? "border-destructive/30 bg-destructive/5 text-muted-foreground line-through"
							: "border-muted bg-muted/30 text-muted-foreground",
					)}
					dir="auto"
				>
					{hasPrevious ? (
						item.previousValue
					) : (
						<span className="italic">(no previous value)</span>
					)}
				</div>
			</div>

			<div className="flex flex-col gap-0.5">
				<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
					After
				</span>
				<Textarea
					className="min-h-16 text-xs leading-relaxed"
					aria-label={`Proposed value for ${item.locale?.label ?? item.fieldPath}`}
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="—"
					dir="auto"
					disabled={editorDisabled}
				/>
			</div>

			{item.status === "conflicted" ? (
				<div className="text-[10px] text-destructive">
					The live value changed. Reject this item, then ask for a new proposal.
				</div>
			) : null}

			{dirty ? (
				<p className="text-[10px] text-muted-foreground">
					Save or reset your edit before accepting or rejecting.
				</p>
			) : null}

			<div className="flex flex-wrap items-center justify-between gap-1.5">
				<div className="flex flex-wrap gap-1">
					{dirty ? (
						<>
							<Button
								size="xs"
								variant="ghost"
								type="button"
								onClick={() => setDraft(initialValue)}
								disabled={isThisItemBusy}
							>
								Reset
							</Button>
							<Button
								size="xs"
								type="button"
								onClick={() => onSave(item, draft)}
								disabled={saveDisabled}
							>
								{isSaving ? "Saving…" : "Save"}
							</Button>
						</>
					) : showUndo ? (
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										size="xs"
										variant="outline"
										type="button"
										onClick={() => onRevert(item)}
										disabled={!canReview || isThisItemBusy}
									>
										<Undo2 data-icon="inline-start" />
										{isReverting ? "Reverting…" : "Edited"}
									</Button>
								}
							/>
							<TooltipContent>
								Restore agent proposal:{" "}
								<em className="not-italic">{item.originalNextValue}</em>
							</TooltipContent>
						</Tooltip>
					) : null}
				</div>
				<div className="flex items-center gap-1">
					<Button
						size="xs"
						type="button"
						onClick={() => onAccept(item)}
						disabled={acceptDisabled}
						aria-label={`Accept ${item.locale?.code ?? "item"}`}
						title={dirty ? "Save your edit first" : undefined}
					>
						<Check data-icon="inline-start" />
						{isAccepting ? "…" : "Accept"}
					</Button>
					<Button
						size="xs"
						type="button"
						variant="outline"
						onClick={() => onReject(item)}
						disabled={rejectDisabled}
						aria-label={`Reject ${item.locale?.code ?? "item"}`}
						title={dirty ? "Save your edit first" : undefined}
					>
						<X data-icon="inline-start" />
						{isRejecting ? "…" : "Reject"}
					</Button>
				</div>
			</div>
		</div>
	);
}

function SourceLocaleColumn({
	sourceLocaleCode,
	sourceLocaleLabel,
	sourceValue,
	sourceMissingReason,
}: {
	sourceLocaleCode: string;
	sourceLocaleLabel: string;
	sourceValue: string | null;
	sourceMissingReason: SourceMissingReason | null;
}) {
	const missingLabel = sourceMissingReason
		? sourceMissingReasonLabel(sourceMissingReason)
		: null;
	return (
		<div className="flex w-full shrink-0 flex-col gap-1.5 rounded-md border border-brand/30 bg-background p-2 shadow-sm sm:sticky sm:left-0 sm:z-[1] sm:w-72">
			<div className="flex items-center gap-1.5">
				<Sparkles aria-label="Source locale" className="size-3 text-brand" />
				<span className="font-medium font-mono text-[11px]">
					{sourceLocaleCode}
				</span>
				<span className="truncate text-[10px] text-muted-foreground">
					{sourceLocaleLabel}
				</span>
				<span className="ml-auto shrink-0 text-[9px] text-muted-foreground uppercase tracking-wider">
					Source · reference
				</span>
			</div>
			<div
				className="min-h-16 whitespace-pre-wrap rounded-sm bg-muted px-2 py-1.5 text-xs leading-relaxed"
				dir="auto"
			>
				{sourceValue && sourceValue.trim().length > 0 ? (
					sourceValue
				) : (
					<span className="text-muted-foreground">
						{missingLabel ?? "No source value"}
					</span>
				)}
			</div>
		</div>
	);
}

function sourceMissingReasonLabel(reason: SourceMissingReason) {
	switch (reason) {
		case "no_key":
			return "No string key";
		case "no_project_source_locale":
			return "No project source locale";
		case "source_locale_missing":
			return "Source locale unavailable";
		case "source_value_missing":
			return "No source value";
	}
}

function ReviewSkeleton() {
	return (
		<div className="flex flex-col gap-3">
			<Skeleton className="h-16 w-full" />
			<Skeleton className="h-48 w-full" />
			<Skeleton className="h-48 w-full" />
		</div>
	);
}

function groupReviewItemsByKey(items: ReviewItem[]): ReviewGroup[] {
	const groups = new Map<string, ReviewGroup>();
	for (const item of items) {
		const normalizedFieldPath = normalizeReviewFieldPath(item.fieldPath);
		const groupKey = item.key?.key ?? normalizedFieldPath;
		const existing = groups.get(groupKey);
		if (existing) {
			existing.items.push(item);
			continue;
		}
		groups.set(groupKey, {
			groupKey,
			keyId: item.key?.id ?? null,
			label: item.key?.key ?? normalizedFieldPath,
			description: item.key?.description,
			placeholders: item.key?.placeholders,
			sourceLocaleId: item.sourceLocale?.id ?? null,
			sourceLocaleCode: item.sourceLocale?.code ?? "source",
			sourceLocaleLabel: item.sourceLocale?.label ?? "Source",
			sourceValue: item.sourceValue ?? null,
			sourceMissingReason: item.sourceMissingReason ?? null,
			items: [item],
		});
	}
	for (const group of groups.values()) {
		group.items.sort((a, b) => {
			const aIsSource = a.locale?.id === group.sourceLocaleId;
			const bIsSource = b.locale?.id === group.sourceLocaleId;
			if (aIsSource && !bIsSource) return -1;
			if (bIsSource && !aIsSource) return 1;
			const codeA = a.locale?.code ?? "";
			const codeB = b.locale?.code ?? "";
			return codeA.localeCompare(codeB);
		});
	}
	return Array.from(groups.values());
}

function normalizeReviewFieldPath(fieldPath: string) {
	const localeMatch = fieldPath.match(/^locales\/[^/]+\/(.+)\.json$/);
	if (localeMatch?.[1]) return localeMatch[1];
	const metadataMatch = fieldPath.match(/^keys\/(.+)\.tags\.json$/);
	if (metadataMatch?.[1]) return metadataMatch[1];
	return fieldPath;
}
