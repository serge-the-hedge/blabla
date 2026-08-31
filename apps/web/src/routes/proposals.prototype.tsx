import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";

import {
	isProposalSelection,
	isPrototypeView,
	isQueueState,
	type ProposalSelection,
	ProposalWorkbenchPrototype,
	type PrototypeView,
	type QueueState,
} from "./projects.$projectId.proposals.prototype";

type PrototypeSearch = {
	view?: PrototypeView;
	state?: QueueState;
	selection?: ProposalSelection;
};
type ExistingTargetDecision =
	| "pending"
	| "accepted"
	| "accepted-with-edit"
	| "rejected";
type PortugueseState = "review" | "ready";

export const Route = createFileRoute("/proposals/prototype")({
	validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
		view: isPrototypeView(search.view) ? search.view : undefined,
		state: isQueueState(search.state) ? search.state : undefined,
		selection: isProposalSelection(search.selection)
			? search.selection
			: undefined,
	}),
	component: PublicProposalWorkbenchPrototypeRoute,
});

function PublicProposalWorkbenchPrototypeRoute() {
	const search = useSearch({ from: "/proposals/prototype" });
	const navigate = useNavigate({ from: "/proposals/prototype" });
	const [decision, setDecision] = useState<ExistingTargetDecision>("pending");
	const [editedValue, setEditedValue] = useState("Eine Gruppe starten");
	const [portugueseState, setPortugueseState] =
		useState<PortugueseState>("review");
	const view = search.view ?? "workbench";
	const queueState = search.state ?? "open";
	const selection = search.selection ?? "german";
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
			projectId="prototype"
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
