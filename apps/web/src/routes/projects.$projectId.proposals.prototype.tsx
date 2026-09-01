import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@blabla/ui/components/alert";
import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@blabla/ui/components/card";
import { Textarea } from "@blabla/ui/components/textarea";
import { cn } from "@blabla/ui/lib/utils";
import {
	createFileRoute,
	useNavigate,
	useParams,
	useSearch,
} from "@tanstack/react-router";
import {
	ArrowLeft,
	ArrowRight,
	Bot,
	Check,
	CircleAlert,
	ClipboardCheck,
	FileCheck2,
	FlaskConical,
	Languages,
	PenLine,
	Send,
	ShieldCheck,
	Sparkles,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";

/**
 * THROWAWAY UI PROTOTYPE for #64.
 *
 * It deliberately has no Convex reads, writes, or domain imports. Its three
 * views make the review hierarchy testable before we choose the final module
 * interface and persistence model.
 */

export const prototypeViews = [
	{
		id: "workbench",
		label: "Workbench",
		description: "Queue, evidence, and decision in one editor surface.",
	},
	{
		id: "queue",
		label: "Triage queue",
		description: "An inbox for deciding what deserves attention first.",
	},
	{
		id: "review",
		label: "Focused review",
		description: "One target, its evidence, and an explicit human decision.",
	},
	{
		id: "delivery",
		label: "Portuguese delivery",
		description: "Coverage and the handoff without pretending it is active.",
	},
] as const;

export type PrototypeView = (typeof prototypeViews)[number]["id"];
export type QueueState = "open" | "empty" | "stale";
export type ProposalSelection = "german" | "portuguese" | "stale";
type ExistingTargetDecision =
	| "pending"
	| "accepted"
	| "accepted-with-edit"
	| "rejected";
type PortugueseState = "review" | "ready";

type PrototypeSearch = {
	view?: PrototypeView;
	state?: QueueState;
	selection?: ProposalSelection;
};

export function isPrototypeView(value: unknown): value is PrototypeView {
	return prototypeViews.some((view) => view.id === value);
}

export function isQueueState(value: unknown): value is QueueState {
	return value === "open" || value === "empty" || value === "stale";
}

export function isProposalSelection(
	value: unknown,
): value is ProposalSelection {
	return value === "german" || value === "portuguese" || value === "stale";
}

export const Route = createFileRoute(
	"/projects/$projectId/proposals/prototype",
)({
	validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
		view: isPrototypeView(search.view) ? search.view : undefined,
		state: isQueueState(search.state) ? search.state : undefined,
		selection: isProposalSelection(search.selection)
			? search.selection
			: undefined,
	}),
	component: ProposalWorkbenchPrototypeRoute,
});

function ProposalWorkbenchPrototypeRoute() {
	const { projectId } = useParams({
		from: "/projects/$projectId/proposals/prototype",
	});
	const search = useSearch({
		from: "/projects/$projectId/proposals/prototype",
	});
	const navigate = useNavigate({
		from: "/projects/$projectId/proposals/prototype",
	});
	const view = search.view ?? "workbench";
	const queueState = search.state ?? "open";
	const selection = search.selection ?? "german";
	const [decision, setDecision] = useState<ExistingTargetDecision>("pending");
	const [editedValue, setEditedValue] = useState("Eine Gruppe starten");
	const [portugueseState, setPortugueseState] =
		useState<PortugueseState>("review");

	const setView = useCallback(
		(nextView: PrototypeView) => {
			void navigate({
				search: (previous) => ({ ...previous, view: nextView }),
				replace: true,
			});
		},
		[navigate],
	);
	const setQueueState = useCallback(
		(nextState: QueueState) => {
			void navigate({
				search: (previous) => ({ ...previous, state: nextState }),
				replace: true,
			});
		},
		[navigate],
	);
	const setSelection = useCallback(
		(nextSelection: ProposalSelection) => {
			void navigate({
				search: (previous) => ({ ...previous, selection: nextSelection }),
				replace: true,
			});
		},
		[navigate],
	);

	return (
		<ProposalWorkbenchPrototype
			projectId={projectId}
			view={view}
			queueState={queueState}
			selection={selection}
			onViewChange={setView}
			onQueueStateChange={setQueueState}
			onSelectionChange={setSelection}
			decision={decision}
			editedValue={editedValue}
			portugueseState={portugueseState}
			onDecision={setDecision}
			onEditedValueChange={setEditedValue}
			onPortugueseStateChange={setPortugueseState}
		/>
	);
}

export function ProposalWorkbenchPrototype({
	projectId,
	view,
	queueState,
	selection,
	onViewChange,
	onQueueStateChange,
	onSelectionChange,
	decision,
	editedValue,
	portugueseState,
	onDecision,
	onEditedValueChange,
	onPortugueseStateChange,
}: {
	projectId: string;
	view: PrototypeView;
	queueState: QueueState;
	selection: ProposalSelection;
	onViewChange: (view: PrototypeView) => void;
	onQueueStateChange: (state: QueueState) => void;
	onSelectionChange: (selection: ProposalSelection) => void;
	decision: ExistingTargetDecision;
	editedValue: string;
	portugueseState: PortugueseState;
	onDecision: (decision: ExistingTargetDecision) => void;
	onEditedValueChange: (value: string) => void;
	onPortugueseStateChange: (state: PortugueseState) => void;
}) {
	return (
		<ProjectShell projectId={projectId} title="Brickit · prototype">
			<PageHeader
				title="Proposals"
				description="A local, disposable exploration of the unified human review workbench."
				action={<Badge variant="outline">No saved data</Badge>}
			/>
			<div className="flex flex-col gap-5 pb-24">
				<Alert>
					<FlaskConical aria-hidden="true" />
					<AlertTitle>Prototype only</AlertTitle>
					<AlertDescription>
						Everything on this page is in memory. Buttons reveal the proposed
						human decision moments; they do not contact an agent, change a
						catalog, or deliver Portuguese.
					</AlertDescription>
				</Alert>

				{view === "workbench" ? (
					<WorkbenchView
						queueState={queueState}
						selection={selection}
						decision={decision}
						editedValue={editedValue}
						portugueseState={portugueseState}
						onQueueStateChange={onQueueStateChange}
						onSelectionChange={onSelectionChange}
						onDecision={onDecision}
						onEditedValueChange={onEditedValueChange}
						onPortugueseStateChange={onPortugueseStateChange}
					/>
				) : null}
				{view === "queue" ? (
					<TriageQueue
						queueState={queueState}
						decision={decision}
						onQueueStateChange={onQueueStateChange}
						onOpenReview={() => onViewChange("review")}
						onOpenDelivery={() => onViewChange("delivery")}
					/>
				) : null}
				{view === "review" ? (
					<FocusedReview
						queueState={queueState}
						decision={decision}
						editedValue={editedValue}
						onBack={() => onViewChange("queue")}
						onDecision={onDecision}
						onEditedValueChange={onEditedValueChange}
					/>
				) : null}
				{view === "delivery" ? (
					<PortugueseDelivery
						state={portugueseState}
						onStateChange={onPortugueseStateChange}
					/>
				) : null}
			</div>
			<PrototypeModeBar activeView={view} onViewChange={onViewChange} />
		</ProjectShell>
	);
}

function WorkbenchView({
	queueState,
	selection,
	decision,
	editedValue,
	portugueseState,
	onQueueStateChange,
	onSelectionChange,
	onDecision,
	onEditedValueChange,
	onPortugueseStateChange,
}: {
	queueState: QueueState;
	selection: ProposalSelection;
	decision: ExistingTargetDecision;
	editedValue: string;
	portugueseState: PortugueseState;
	onQueueStateChange: (state: QueueState) => void;
	onSelectionChange: (selection: ProposalSelection) => void;
	onDecision: (decision: ExistingTargetDecision) => void;
	onEditedValueChange: (value: string) => void;
	onPortugueseStateChange: (state: PortugueseState) => void;
}) {
	useEffect(() => {
		const proposalOrder: ProposalSelection[] = [
			"german",
			"portuguese",
			"stale",
		];
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				target.closest("input, textarea, select, [contenteditable='true']")
			) {
				return;
			}
			const currentIndex = proposalOrder.indexOf(selection);
			if (event.key === "j" || event.key === "ArrowDown") {
				event.preventDefault();
				onSelectionChange(
					proposalOrder[(currentIndex + 1) % proposalOrder.length] ?? "german",
				);
			}
			if (event.key === "k" || event.key === "ArrowUp") {
				event.preventDefault();
				onSelectionChange(
					proposalOrder[
						(currentIndex - 1 + proposalOrder.length) % proposalOrder.length
					] ?? "german",
				);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onSelectionChange, selection]);

	const empty = queueState === "empty";
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p className="font-medium text-sm">One review canvas</p>
					<p className="text-muted-foreground text-xs">
						Keep the queue, immutable evidence, and human decision visible at
						the same time.
					</p>
				</div>
				<label className="flex items-center gap-2 text-muted-foreground text-xs">
					Scenario
					<select
						value={queueState}
						onChange={(event) =>
							onQueueStateChange(event.currentTarget.value as QueueState)
						}
						className="h-7 border bg-background px-2 text-foreground text-xs"
					>
						<option value="open">Open proposals</option>
						<option value="empty">Empty queue</option>
						<option value="stale">Stale source</option>
					</select>
				</label>
			</div>

			<div className="grid gap-3 xl:grid-cols-[15rem_minmax(0,1fr)_17rem]">
				<WorkbenchQueue
					queueState={queueState}
					selection={selection}
					decision={decision}
					onSelectionChange={onSelectionChange}
				/>
				{empty ? (
					<WorkbenchEmpty />
				) : (
					<WorkbenchEvidence
						selection={selection}
						queueState={queueState}
						decision={decision}
						editedValue={editedValue}
						portugueseState={portugueseState}
						onEditedValueChange={onEditedValueChange}
					/>
				)}
				<WorkbenchDecisionDock
					key={`${selection}:${decision}`}
					selection={selection}
					queueState={queueState}
					decision={decision}
					editedValue={editedValue}
					portugueseState={portugueseState}
					onDecision={onDecision}
					onPortugueseStateChange={onPortugueseStateChange}
				/>
			</div>
			<p className="text-[11px] text-muted-foreground">
				Keyboard: <kbd className="border px-1">J</kbd> /{" "}
				<kbd className="border px-1">K</kbd> move between proposals. Editing
				fields keeps their normal text navigation.
			</p>
		</div>
	);
}

function WorkbenchQueue({
	queueState,
	selection,
	decision,
	onSelectionChange,
}: {
	queueState: QueueState;
	selection: ProposalSelection;
	decision: ExistingTargetDecision;
	onSelectionChange: (selection: ProposalSelection) => void;
}) {
	const items: Array<{
		id: ProposalSelection;
		kind: string;
		title: string;
		detail: string;
		status: string;
		icon: typeof Bot;
	}> = [
		{
			id: "german",
			kind: "Existing target",
			title: "German onboarding",
			detail: "3 values · translatebot",
			status: decision === "pending" ? "Needs review" : decisionLabel(decision),
			icon: Bot,
		},
		{
			id: "portuguese",
			kind: "Portuguese locale",
			title: "Portuguese (Brazil)",
			detail: "1,428 / 1,434 covered",
			status: "Coverage review",
			icon: Languages,
		},
		{
			id: "stale",
			kind: "Existing target",
			title: "German empty states",
			detail: "Source changed after proposal",
			status: "Stale",
			icon: CircleAlert,
		},
	];

	return (
		<Card size="sm" className="h-fit min-w-0">
			<CardHeader className="border-b">
				<CardTitle>Review queue</CardTitle>
				<CardDescription>
					{queueState === "empty"
						? "No open decisions"
						: "3 items · sorted by action"}
				</CardDescription>
			</CardHeader>
			<CardContent className="p-0">
				{queueState === "empty" ? (
					<p className="p-3 text-muted-foreground text-xs">
						Nothing needs your judgment right now.
					</p>
				) : (
					<div
						className="flex flex-col"
						role="listbox"
						aria-label="Proposal queue"
					>
						{items.map((item) => {
							const Icon = item.icon;
							const active = selection === item.id;
							return (
								<button
									key={item.id}
									type="button"
									role="option"
									aria-selected={active}
									onClick={() => onSelectionChange(item.id)}
									className={cn(
										"flex min-w-0 flex-col gap-2 border-b px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
										active && "bg-muted/60",
									)}
								>
									<div className="flex min-w-0 items-start justify-between gap-2">
										<div className="flex min-w-0 items-center gap-1.5">
											<Icon aria-hidden="true" className="size-3.5 shrink-0" />
											<span className="truncate font-medium text-xs">
												{item.title}
											</span>
										</div>
										<Badge
											variant={item.id === "stale" ? "destructive" : "outline"}
											className="shrink-0"
										>
											{item.status}
										</Badge>
									</div>
									<span className="text-[11px] text-muted-foreground">
										{item.kind}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{item.detail}
									</span>
								</button>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function WorkbenchEmpty() {
	return (
		<Card className="min-h-80 place-content-center border-dashed bg-muted/15">
			<CardContent className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
				<div className="grid size-10 place-items-center border bg-background">
					<ClipboardCheck
						aria-hidden="true"
						className="size-5 text-muted-foreground"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<p className="font-medium text-sm">The queue is clear</p>
					<p className="text-muted-foreground text-xs">
						New agent work will appear with its source snapshot and exact next
						decision.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

function WorkbenchEvidence({
	selection,
	queueState,
	decision,
	editedValue,
	portugueseState,
	onEditedValueChange,
}: {
	selection: ProposalSelection;
	queueState: QueueState;
	decision: ExistingTargetDecision;
	editedValue: string;
	portugueseState: PortugueseState;
	onEditedValueChange: (value: string) => void;
}) {
	if (selection === "portuguese") {
		return <PortugueseWorkbenchEvidence state={portugueseState} />;
	}
	return (
		<ExistingWorkbenchEvidence
			stale={selection === "stale" || queueState === "stale"}
			decision={decision}
			editedValue={editedValue}
			onEditedValueChange={onEditedValueChange}
		/>
	);
}

function ExistingWorkbenchEvidence({
	stale,
	decision,
	editedValue,
	onEditedValueChange,
}: {
	stale: boolean;
	decision: ExistingTargetDecision;
	editedValue: string;
	onEditedValueChange: (value: string) => void;
}) {
	const values = [
		{
			key: "onboarding.startGroup",
			source: stale ? "Create a group" : "Start a group",
			current: "Gruppe starten",
			proposal: editedValue,
		},
		{
			key: "onboarding.groupHint",
			source: "Invite people to your group",
			current: "Lade Personen in deine Gruppe ein",
			proposal: "Lade Menschen in deine Gruppe ein",
		},
		{
			key: "onboarding.groupEmpty",
			source: "Your group is empty",
			current: "Deine Gruppe ist leer",
			proposal: "Deine Gruppe ist noch leer",
		},
	];
	return (
		<Card className="min-w-0">
			<CardHeader className="border-b">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<CardTitle className="flex items-center gap-2">
							<Bot
								aria-hidden="true"
								className="size-4 text-muted-foreground"
							/>
							German onboarding copy
						</CardTitle>
						<CardDescription>
							3 values · translatebot · Work Hand-off “onboarding empty states”
						</CardDescription>
					</div>
					<Badge variant="outline" translate="no">
						Snapshot 9f3c…b71
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 pt-4">
				{stale ? (
					<Alert variant="destructive">
						<CircleAlert aria-hidden="true" />
						<AlertTitle>Source changed after this proposal</AlertTitle>
						<AlertDescription>
							The evidence remains readable, but all acceptance actions stay
							disabled until a new candidate is proposed.
						</AlertDescription>
					</Alert>
				) : null}
				<div className="hidden grid-cols-[minmax(6rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 border-b pb-2 text-[11px] text-muted-foreground sm:grid">
					<span>Key</span>
					<span>Current German</span>
					<span>Agent proposal</span>
				</div>
				<div className="flex flex-col divide-y">
					{values.map((value, index) => (
						<div
							key={value.key}
							className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(6rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3"
						>
							<div className="min-w-0">
								<code className="break-words font-medium text-[11px]">
									{value.key}
								</code>
								<p className="mt-1 text-[11px] text-muted-foreground">
									Source: {value.source}
								</p>
							</div>
							<p dir="auto" className="break-words text-xs leading-relaxed">
								{value.current}
							</p>
							{index === 0 ? (
								<Textarea
									aria-label={`Edit proposal for ${value.key}`}
									value={value.proposal}
									disabled={stale || decision !== "pending"}
									onChange={(event) =>
										onEditedValueChange(event.currentTarget.value)
									}
									className="min-h-14"
								/>
							) : (
								<p dir="auto" className="break-words text-xs leading-relaxed">
									{value.proposal}
								</p>
							)}
						</div>
					))}
				</div>
				<p className="text-[11px] text-muted-foreground" aria-live="polite">
					{decision === "pending"
						? "Reviewing all 3 values together keeps the source context in view."
						: decision === "rejected"
							? "Rejected — no workspace value changes."
							: "Human confirmation recorded for this proposal set."}
				</p>
			</CardContent>
		</Card>
	);
}

function PortugueseWorkbenchEvidence({ state }: { state: PortugueseState }) {
	return (
		<Card className="min-w-0">
			<CardHeader className="border-b">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<CardTitle className="flex items-center gap-2">
							<Languages
								aria-hidden="true"
								className="size-4 text-muted-foreground"
							/>
							Portuguese (Brazil)
						</CardTitle>
						<CardDescription>
							A candidate locale pinned to the accepted Baseline Snapshot.
						</CardDescription>
					</div>
					<Badge variant="outline">Not active</Badge>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4 pt-4">
				<div className="grid gap-2 sm:grid-cols-3">
					<Metric
						label="Covered"
						value="1,428 / 1,434"
						detail="Agent candidates"
					/>
					<Metric
						label="Open decisions"
						value="6"
						detail="Direct human review"
					/>
					<Metric label="Basis" value="9f3c…b71" detail="Accepted snapshot" />
				</div>
				<div className="h-2 bg-muted">
					<div className="h-full w-[99.6%] bg-primary" />
				</div>
				<div className="flex flex-col divide-y border">
					{[
						["home.emptyTitle", "Título da tela inicial", "Agent value"],
						["home.emptyBody", "Ainda não há itens aqui", "Agent value"],
						["profile.nickname", "", "Intentional blank · needs confirmation"],
					].map(([key, value, status]) => (
						<div
							key={key}
							className="grid grid-cols-1 items-start gap-1.5 px-3 py-2.5 sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
						>
							<code className="break-words font-medium text-[11px]">{key}</code>
							<span
								className={cn(
									"break-words text-xs",
									!value && "text-muted-foreground italic",
								)}
							>
								{value || "No value"}
							</span>
							<span className="text-right text-[11px] text-muted-foreground">
								{status}
							</span>
						</div>
					))}
				</div>
				{state === "review" ? (
					<Alert>
						<Sparkles aria-hidden="true" />
						<AlertTitle>Ready after 6 direct decisions</AlertTitle>
						<AlertDescription>
							The ready artifact is evidence for delivery. It does not create a
							Locale Binding or activate Portuguese.
						</AlertDescription>
					</Alert>
				) : (
					<DeliveryHandoff />
				)}
			</CardContent>
		</Card>
	);
}

function WorkbenchDecisionDock({
	selection,
	queueState,
	decision,
	editedValue,
	portugueseState,
	onDecision,
	onPortugueseStateChange,
}: {
	selection: ProposalSelection;
	queueState: QueueState;
	decision: ExistingTargetDecision;
	editedValue: string;
	portugueseState: PortugueseState;
	onDecision: (decision: ExistingTargetDecision) => void;
	onPortugueseStateChange: (state: PortugueseState) => void;
}) {
	const [rejectArmed, setRejectArmed] = useState(false);
	if (queueState === "empty") {
		return (
			<Card size="sm" className="h-fit bg-muted/25 xl:sticky xl:top-4">
				<CardHeader>
					<CardTitle>Nothing to decide</CardTitle>
					<CardDescription>
						New work will arrive here with its basis attached.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}
	if (selection === "portuguese") {
		return (
			<Card size="sm" className="h-fit bg-muted/25 xl:sticky xl:top-4">
				<CardHeader>
					<CardTitle>
						{portugueseState === "review"
							? "Finish Portuguese"
							: "Deliver Portuguese"}
					</CardTitle>
					<CardDescription>
						{portugueseState === "review"
							? "Complete the 6 direct decisions, then create one immutable artifact."
							: "The developer can now deliver the exact reviewed artifact."}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<ChecklistRow checked text="1,428 candidate values reviewed" />
					<ChecklistRow checked={false} text="6 intentional blanks confirmed" />
					<ChecklistRow checked text="Source evidence is pinned" />
					{portugueseState === "review" ? (
						<Button size="sm" onClick={() => onPortugueseStateChange("ready")}>
							<FileCheck2 aria-hidden="true" />
							Create ready artifact
						</Button>
					) : (
						<>
							<Badge variant="secondary">Artifact #pt-042 · immutable</Badge>
							<Button
								variant="outline"
								size="sm"
								onClick={() => onPortugueseStateChange("review")}
							>
								Back to open decisions
							</Button>
						</>
					)}
				</CardContent>
			</Card>
		);
	}

	const stale = selection === "stale" || queueState === "stale";
	return (
		<Card size="sm" className="h-fit bg-muted/25 xl:sticky xl:top-4">
			<CardHeader>
				<CardTitle>Decide for 3 values</CardTitle>
				<CardDescription>
					Accepting writes 3 human Translator Confirmations together.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				<Button
					disabled={stale || decision !== "pending"}
					onClick={() => onDecision("accepted")}
				>
					<Check aria-hidden="true" />
					Accept exact values
				</Button>
				<Button
					variant="outline"
					disabled={stale || decision !== "pending"}
					onClick={() => onDecision("accepted-with-edit")}
				>
					<PenLine aria-hidden="true" />
					Accept edited values
				</Button>
				<Button
					variant="ghost"
					disabled={decision !== "pending"}
					onClick={() => {
						if (rejectArmed) {
							onDecision("rejected");
							setRejectArmed(false);
							return;
						}
						setRejectArmed(true);
					}}
				>
					<X aria-hidden="true" />
					{rejectArmed ? "Confirm reject" : "Reject proposal"}
				</Button>
				{rejectArmed ? (
					<Button
						variant="link"
						size="xs"
						onClick={() => setRejectArmed(false)}
					>
						Keep proposal
					</Button>
				) : null}
				{stale ? (
					<p className="text-[11px] text-destructive" role="alert">
						Acceptance is disabled because the source changed.
					</p>
				) : null}
				{decision !== "pending" ? (
					<DecisionReceipt decision={decision} value={editedValue} />
				) : null}
			</CardContent>
		</Card>
	);
}

function TriageQueue({
	queueState,
	decision,
	onQueueStateChange,
	onOpenReview,
	onOpenDelivery,
}: {
	queueState: QueueState;
	decision: ExistingTargetDecision;
	onQueueStateChange: (state: QueueState) => void;
	onOpenReview: () => void;
	onOpenDelivery: () => void;
}) {
	const resolved = decision !== "pending";
	return (
		<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<p className="font-medium text-sm">A deliberate inbox</p>
						<p className="text-muted-foreground text-xs">
							A proposal is evidence to inspect, never a change waiting to be
							applied.
						</p>
					</div>
					<label className="flex items-center gap-2 text-muted-foreground text-xs">
						Show
						<select
							value={queueState}
							onChange={(event) =>
								onQueueStateChange(event.currentTarget.value as QueueState)
							}
							className="h-7 border bg-background px-2 text-foreground text-xs"
						>
							<option value="open">Incoming work</option>
							<option value="empty">An empty queue</option>
							<option value="stale">A stale candidate</option>
						</select>
					</label>
				</div>

				{queueState === "empty" ? <EmptyQueue /> : null}
				{queueState === "open" ? (
					<>
						<ProposalQueueCard
							kind="Existing target"
							title="German onboarding copy"
							description="3 values proposed by translatebot after the same Baseline Snapshot."
							status={resolved ? decisionLabel(decision) : "Needs review"}
							statusVariant={resolved ? "secondary" : "default"}
							actionLabel={resolved ? "Open decision" : "Review 3 values"}
							onAction={onOpenReview}
						/>
						<ProposalQueueCard
							kind="Portuguese locale"
							title="Portuguese (Brazil)"
							description="1,428 of 1,434 values covered · 6 intentional blanks need a person."
							status="Coverage review"
							statusVariant="outline"
							actionLabel="Inspect coverage"
							onAction={onOpenDelivery}
						/>
						<ProposalQueueCard
							kind="Existing target"
							title="German empty-state copy"
							description="1 proposal from a Work Hand-off: “onboarding empty states”."
							status="Needs review"
							statusVariant="default"
							actionLabel="Review value"
							onAction={onOpenReview}
						/>
					</>
				) : null}
				{queueState === "stale" ? (
					<StaleQueue onOpenReview={onOpenReview} />
				) : null}
			</div>

			<Card size="sm" className="h-fit bg-muted/25">
				<CardHeader>
					<CardTitle>What a decision means</CardTitle>
					<CardDescription>
						The queue is intentionally small: it contains only values with a
						human action.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 text-muted-foreground text-xs">
					<QueueRule
						icon={ShieldCheck}
						text="Accepting an existing target writes a human Translator Confirmation."
					/>
					<QueueRule
						icon={CircleAlert}
						text="A stale proposal remains readable but cannot become current."
					/>
					<QueueRule
						icon={Languages}
						text="Portuguese can become ready to deliver; it is not active here."
					/>
				</CardContent>
			</Card>
		</div>
	);
}

function ProposalQueueCard({
	kind,
	title,
	description,
	status,
	statusVariant,
	actionLabel,
	onAction,
}: {
	kind: string;
	title: string;
	description: string;
	status: string;
	statusVariant: "default" | "secondary" | "outline";
	actionLabel: string;
	onAction: () => void;
}) {
	return (
		<Card size="sm" className="transition-colors hover:bg-muted/25">
			<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">{kind}</Badge>
						<Badge variant={statusVariant}>{status}</Badge>
					</div>
					<p className="font-medium text-sm">{title}</p>
					<p className="text-muted-foreground text-xs">{description}</p>
				</div>
				<Button variant="outline" size="sm" onClick={onAction}>
					{actionLabel}
					<ArrowRight aria-hidden="true" />
				</Button>
			</CardContent>
		</Card>
	);
}

function EmptyQueue() {
	return (
		<Card className="min-h-72 place-content-center border-dashed bg-muted/15">
			<CardContent className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
				<div className="grid size-10 place-items-center border bg-background">
					<ClipboardCheck
						aria-hidden="true"
						className="size-5 text-muted-foreground"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<p className="font-medium text-sm">Nothing asks for your judgment</p>
					<p className="text-muted-foreground text-xs">
						New agent work and Portuguese coverage will appear here only when
						there is a decision to make.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

function StaleQueue({ onOpenReview }: { onOpenReview: () => void }) {
	return (
		<Card size="sm" className="border-destructive/40 bg-destructive/5">
			<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<Badge variant="destructive">Stale</Badge>
						<span className="font-medium text-sm">German onboarding copy</span>
					</div>
					<p className="text-muted-foreground text-xs">
						The English source changed after translatebot proposed this value.
						Read it for context; start a new proposal to accept anything.
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={onOpenReview}>
					Inspect evidence
					<ArrowRight aria-hidden="true" />
				</Button>
			</CardContent>
		</Card>
	);
}

function FocusedReview({
	queueState,
	decision,
	editedValue,
	onBack,
	onDecision,
	onEditedValueChange,
}: {
	queueState: QueueState;
	decision: ExistingTargetDecision;
	editedValue: string;
	onBack: () => void;
	onDecision: (decision: ExistingTargetDecision) => void;
	onEditedValueChange: (value: string) => void;
}) {
	const stale = queueState === "stale";
	const decisionPending = decision === "pending";
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<Button variant="ghost" size="sm" onClick={onBack}>
					<ArrowLeft aria-hidden="true" />
					All proposals
				</Button>
				<Badge variant={stale ? "destructive" : "outline"}>
					{stale ? "Stale candidate" : "Existing target"}
				</Badge>
			</div>

			{stale ? (
				<Alert variant="destructive">
					<CircleAlert aria-hidden="true" />
					<AlertTitle>Acceptance is safely unavailable</AlertTitle>
					<AlertDescription>
						The source now says “Create a group”. This candidate was made from
						“Start a group”, so it can be inspected but cannot write a
						Translator Confirmation.
					</AlertDescription>
				</Alert>
			) : null}

			<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
				<Card>
					<CardHeader className="border-b">
						<CardTitle className="flex items-center gap-2">
							<Bot
								aria-hidden="true"
								className="size-4 text-muted-foreground"
							/>
							German onboarding copy
						</CardTitle>
						<CardDescription>
							translatebot · candidate 2 of 3 · proposed from snapshot
							`9f3c…b71`.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-5 pt-4">
						<ComparisonBlock
							label="English source"
							value={stale ? "Create a group" : "Start a group"}
							detail={
								stale
									? "Changed after this candidate was staged"
									: "Current Baseline Snapshot"
							}
							variant={stale ? "warning" : "source"}
						/>
						<ComparisonBlock
							label="Current German value"
							value="Gruppe starten"
							detail="Accepted Git value"
							variant="current"
						/>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between gap-3">
								<label htmlFor="proposed-value" className="font-medium text-xs">
									Agent’s proposed German
								</label>
								<Badge variant="secondary">ICU contract holds</Badge>
							</div>
							<Textarea
								id="proposed-value"
								value={editedValue}
								onChange={(event) =>
									onEditedValueChange(event.currentTarget.value)
								}
								disabled={stale || !decisionPending}
							/>
							<p className="text-muted-foreground text-xs">
								Editing makes the exact value you accept yours; the agent
								proposal remains visible as evidence.
							</p>
						</div>
						{decision !== "pending" ? (
							<DecisionReceipt decision={decision} value={editedValue} />
						) : null}
					</CardContent>
				</Card>

				<div className="flex flex-col gap-3">
					<Card size="sm" className="bg-muted/25">
						<CardHeader>
							<CardTitle>Human decision</CardTitle>
							<CardDescription>
								This is the only moment an agent value can become current.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<Button
								variant="default"
								disabled={stale || !decisionPending}
								onClick={() => onDecision("accepted")}
							>
								<Check aria-hidden="true" />
								Accept agent value
							</Button>
							<Button
								variant="outline"
								disabled={stale || !decisionPending}
								onClick={() => onDecision("accepted-with-edit")}
							>
								<PenLine aria-hidden="true" />
								Accept my edited value
							</Button>
							<Button
								variant="ghost"
								disabled={!decisionPending}
								onClick={() => onDecision("rejected")}
							>
								<X aria-hidden="true" />
								Reject proposal
							</Button>
						</CardContent>
					</Card>
					<Card size="sm">
						<CardHeader>
							<CardTitle>Basis</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-2 text-muted-foreground text-xs">
							<Definition term="Source" value="onboarding.startGroup" />
							<Definition term="Target" value="de-DE · intl_de.arb" />
							<Definition term="Work" value="Onboarding empty states" />
							<Definition
								term="Agent"
								value="translatebot · proposal revision 4"
							/>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

function ComparisonBlock({
	label,
	value,
	detail,
	variant,
}: {
	label: string;
	value: string;
	detail: string;
	variant: "source" | "current" | "warning";
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1 border-l-2 px-3 py-1.5",
				variant === "source" && "border-primary/70 bg-primary/5",
				variant === "current" && "border-border bg-muted/30",
				variant === "warning" && "border-destructive/70 bg-destructive/5",
			)}
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="font-medium text-xs">{label}</span>
				<span className="text-muted-foreground text-xs">{detail}</span>
			</div>
			<p className="font-medium text-sm">{value}</p>
		</div>
	);
}

function DecisionReceipt({
	decision,
	value,
}: {
	decision: Exclude<ExistingTargetDecision, "pending">;
	value: string;
}) {
	const accepted = decision !== "rejected";
	return (
		<Alert variant={accepted ? "default" : "destructive"}>
			{accepted ? <ShieldCheck aria-hidden="true" /> : <X aria-hidden="true" />}
			<AlertTitle>
				{accepted
					? "Human Translator Confirmation recorded"
					: "Proposal rejected"}
			</AlertTitle>
			<AlertDescription>
				{decision === "accepted"
					? "The current Catalog Workspace value would now be “Eine Gruppe starten”."
					: decision === "accepted-with-edit"
						? `The current Catalog Workspace value would now be “${value}”.`
						: "The agent candidate stays in review history but changes no workspace value."}
			</AlertDescription>
		</Alert>
	);
}

function PortugueseDelivery({
	state,
	onStateChange,
}: {
	state: PortugueseState;
	onStateChange: (state: PortugueseState) => void;
}) {
	return (
		<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
			<div className="flex flex-col gap-4">
				<Card>
					<CardHeader className="border-b">
						<CardTitle className="flex items-center gap-2">
							<Languages
								aria-hidden="true"
								className="size-4 text-muted-foreground"
							/>
							Portuguese (Brazil) candidate
						</CardTitle>
						<CardDescription>
							Pinned to the accepted source snapshot. This is a potential
							locale, not an active Locale Binding.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-5 pt-4">
						<div className="grid gap-3 sm:grid-cols-3">
							<Metric
								label="Covered"
								value="1,428 / 1,434"
								detail="Agent candidates"
							/>
							<Metric
								label="Needs a person"
								value="6"
								detail="Intentional blanks"
							/>
							<Metric
								label="Basis"
								value="9f3c…b71"
								detail="Accepted snapshot"
							/>
						</div>
						<div className="h-2 bg-muted">
							<div className="h-full w-[99.6%] bg-primary" />
						</div>
						<div className="border p-3">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p className="font-medium text-sm">Focused coverage review</p>
									<p className="text-muted-foreground text-xs">
										Six candidate values need direct human decisions before this
										can become a complete artifact.
									</p>
								</div>
								<Badge variant="outline">6 direct decisions</Badge>
							</div>
						</div>

						{state === "review" ? (
							<Alert>
								<Sparkles aria-hidden="true" />
								<AlertTitle>One deliberate release point</AlertTitle>
								<AlertDescription>
									When every value has human review, create an immutable
									Portuguese artifact. That proves the candidate is ready for
									the developer; it does not activate Portuguese in the product.
								</AlertDescription>
							</Alert>
						) : (
							<DeliveryHandoff />
						)}
					</CardContent>
				</Card>
			</div>

			<Card size="sm" className="h-fit bg-muted/25">
				<CardHeader>
					<CardTitle>
						{state === "review" ? "Ready when" : "Ready to hand off"}
					</CardTitle>
					<CardDescription>
						{state === "review"
							? "A locale candidate gets no shortcut around human review."
							: "The developer now has a single safe next step."}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{state === "review" ? (
						<>
							<ChecklistRow
								checked
								text="1,428 proposed values have human review"
							/>
							<ChecklistRow
								checked={false}
								text="6 intentional blanks are directly confirmed"
							/>
							<ChecklistRow checked text="Artifact has exact source evidence" />
							<Button size="sm" onClick={() => onStateChange("ready")}>
								<FileCheck2 aria-hidden="true" />
								Create ready artifact
							</Button>
						</>
					) : (
						<>
							<Badge variant="secondary">Artifact #pt-042 · immutable</Badge>
							<p className="text-muted-foreground text-xs">
								Review is complete. Delivery stays observable and deliberately
								separate from activation.
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => onStateChange("review")}
							>
								Back to review state
							</Button>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function DeliveryHandoff() {
	return (
		<div className="flex flex-col gap-3 border border-primary/30 bg-primary/5 p-3">
			<div className="flex items-center gap-2">
				<Send aria-hidden="true" className="size-4 text-primary" />
				<p className="font-medium text-sm">Hand off to the developer</p>
			</div>
			<p className="text-muted-foreground text-xs">
				The developer delivers this exact artifact in a pull request. A later
				Snapshot observes it; an editor explicitly binds it before Portuguese
				appears in Strings.
			</p>
			<code className="border bg-background px-2 py-1.5 font-mono text-[11px]">
				blabla deliver-portuguese --proposal pt-042
			</code>
		</div>
	);
}

function PrototypeModeBar({
	activeView,
	onViewChange,
}: {
	activeView: PrototypeView;
	onViewChange: (view: PrototypeView) => void;
}) {
	return (
		<div className="fixed right-4 bottom-4 left-4 z-10 mx-auto flex max-w-3xl flex-col gap-2 border bg-background/95 p-2 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-2 px-1">
				<FlaskConical
					aria-hidden="true"
					className="size-3.5 text-muted-foreground"
				/>
				<span className="font-medium text-xs">Compare hierarchy</span>
			</div>
			<div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
				{prototypeViews.map((view) => (
					<Button
						key={view.id}
						variant={activeView === view.id ? "default" : "ghost"}
						size="xs"
						aria-pressed={activeView === view.id}
						onClick={() => onViewChange(view.id)}
						title={view.description}
					>
						{view.label}
					</Button>
				))}
			</div>
		</div>
	);
}

function QueueRule({
	icon: Icon,
	text,
}: {
	icon: typeof ShieldCheck;
	text: string;
}) {
	return (
		<div className="flex gap-2">
			<Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
			<span>{text}</span>
		</div>
	);
}

function Definition({ term, value }: { term: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="font-medium text-foreground">{term}</span>
			<span>{value}</span>
		</div>
	);
}

function Metric({
	label,
	value,
	detail,
}: {
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<div className="border bg-muted/20 p-3">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="mt-1 font-medium text-base">{value}</p>
			<p className="text-muted-foreground text-xs">{detail}</p>
		</div>
	);
}

function ChecklistRow({ checked, text }: { checked: boolean; text: string }) {
	return (
		<div className="flex items-start gap-2 text-xs">
			{checked ? (
				<Check aria-hidden="true" className="mt-0.5 size-3.5 text-primary" />
			) : (
				<span className="mt-0.5 size-3.5 border" aria-hidden="true" />
			)}
			<span className={checked ? "text-muted-foreground" : "font-medium"}>
				{text}
			</span>
		</div>
	);
}

function decisionLabel(decision: Exclude<ExistingTargetDecision, "pending">) {
	if (decision === "accepted") {
		return "Accepted exact";
	}
	if (decision === "accepted-with-edit") {
		return "Accepted with edit";
	}
	return "Rejected";
}
