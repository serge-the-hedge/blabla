export type ReleasePosture = "blocked" | "needsDecisions" | "ready";
export type ReleaseStatus = "preparing" | "ready" | "superseded" | "failed";

export function postureLabel(posture: ReleasePosture | null) {
	if (posture === "blocked") return "Blocked";
	if (posture === "needsDecisions") return "Needs decisions";
	return "Ready";
}

export function releasePresentationFor(posture: ReleasePosture | null) {
	const normalizedPosture = posture ?? "ready";
	const needsWork = normalizedPosture !== "ready";
	return {
		posture: normalizedPosture,
		label: postureLabel(normalizedPosture),
		needsWork,
		heading: needsWork ? "Before this can be built" : "This release is ready",
	};
}

export function releaseProgressFor(progress: {
	cursor: number;
	expectedKeyCount: number;
}) {
	return Math.max(0, Math.min(progress.cursor + 1, progress.expectedKeyCount));
}

export function releaseHistoryStatus(record: {
	status: ReleaseStatus;
	posture: ReleasePosture | null;
}) {
	return record.status === "ready"
		? postureLabel(record.posture)
		: record.status;
}
