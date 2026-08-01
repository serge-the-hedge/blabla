/**
 * PROTOTYPE — not production code.
 *
 * Captured on the throwaway prototype branch after the interface decision.
 * Question: does a Localization Sync Module need an explicit operation for a
 * Batch Decision, in addition to snapshot ingestion, opening a Release Record,
 * and building a Release Bundle? The state below is intentionally in-memory and
 * tiny so a person can push through the consequential transitions by hand.
 */

export type ReleasePosture =
	| "Blocked"
	| "Requires Approval"
	| "Ready with Deviations"
	| "Ready";

type SourceMessage = {
	source: string;
	fingerprint: string;
	contractValid: boolean;
};

export type SourceSnapshot = {
	id: string;
	commit: string;
	manifestFingerprint: string;
	messages: Record<string, SourceMessage>;
};

type TargetValue = {
	locale: "de" | "fr";
	key: string;
	value: string | undefined;
	sourceFingerprint: string | undefined;
	intentionalBlank?: boolean;
	awaitingReview?: boolean;
};

export type ReleaseFinding = {
	id: string;
	locale: string;
	key: string;
	sourceFingerprint: string;
	kind:
		| "contract_invalid"
		| "source_fallback"
		| "stale_translation"
		| "unconfirmed_blank"
		| "unreviewed_translation";
};

type FallbackApproval = {
	findingId: string;
	sourceFingerprint: string;
};

export type ReleaseRecord = {
	id: string;
	snapshotId: string;
	catalogRevision: number;
	findings: ReleaseFinding[];
	fallbackApprovals: FallbackApproval[];
	posture: ReleasePosture;
};

export type ReleaseBundle = {
	id: string;
	snapshotId: string;
	catalogRevision: number;
	posture: Extract<ReleasePosture, "Ready" | "Ready with Deviations">;
	manifest: {
		localeCodes: string[];
		fallbackFindingIds: string[];
	};
};

export type PrototypeState = {
	snapshots: SourceSnapshot[];
	baselineSnapshotId: string;
	targets: TargetValue[];
	catalogRevision: number;
	releaseRecords: ReleaseRecord[];
	nextSnapshot: number;
	nextReleaseRecord: number;
};

export type Transition<T> = {
	state: PrototypeState;
	result: T;
};

export type IngestSnapshotInput = Omit<SourceSnapshot, "id"> & {
	isBaselineDescendant: boolean;
};

export type IngestSnapshotResult =
	| { kind: "published"; snapshotId: string }
	| { kind: "idempotent"; snapshotId: string }
	| { kind: "rejected"; reason: string };

export type OpenReleaseResult =
	| { kind: "opened"; record: ReleaseRecord }
	| { kind: "reused"; record: ReleaseRecord };

export type DecideFallbackResult =
	| { kind: "recorded"; record: ReleaseRecord }
	| { kind: "rejected"; reason: string };

export type BuildReleaseResult =
	| { kind: "built"; bundle: ReleaseBundle }
	| { kind: "rejected"; reason: string };

const clone = <T>(value: T): T => structuredClone(value);

const snapshotById = (state: PrototypeState, snapshotId: string) =>
	state.snapshots.find((snapshot) => snapshot.id === snapshotId);

const activeSnapshot = (state: PrototypeState) => {
	const snapshot = snapshotById(state, state.baselineSnapshotId);
	if (!snapshot) throw new Error("Prototype state has no Baseline Snapshot.");
	return snapshot;
};

const targetFor = (
	state: PrototypeState,
	locale: TargetValue["locale"],
	key: string,
) =>
	state.targets.find(
		(target) => target.locale === locale && target.key === key,
	);

function findingsFor(
	state: PrototypeState,
	snapshot: SourceSnapshot,
): ReleaseFinding[] {
	const findings: ReleaseFinding[] = [];
	for (const [key, source] of Object.entries(snapshot.messages)) {
		for (const locale of ["de", "fr"] as const) {
			const base = {
				id: `${snapshot.id}:${locale}:${key}`,
				locale,
				key,
				sourceFingerprint: source.fingerprint,
			};
			if (!source.contractValid) {
				findings.push({ ...base, kind: "contract_invalid" });
				continue;
			}
			const target = targetFor(state, locale, key);
			if (!target || target.value === undefined) {
				findings.push({ ...base, kind: "source_fallback" });
				continue;
			}
			if (target.value === "" && !target.intentionalBlank) {
				findings.push({ ...base, kind: "unconfirmed_blank" });
				continue;
			}
			if (target.awaitingReview) {
				findings.push({ ...base, kind: "unreviewed_translation" });
				continue;
			}
			if (target.sourceFingerprint !== source.fingerprint) {
				findings.push({ ...base, kind: "stale_translation" });
			}
		}
	}
	return findings;
}

function postureFor(
	findings: ReleaseFinding[],
	approvals: FallbackApproval[],
): ReleasePosture {
	if (findings.some((finding) => finding.kind === "contract_invalid")) {
		return "Blocked";
	}
	const approvedFallbackIds = new Set(
		approvals.map(
			(approval) => `${approval.findingId}:${approval.sourceFingerprint}`,
		),
	);
	const unapproved = findings.filter(
		(finding) =>
			finding.kind !== "source_fallback" ||
			!approvedFallbackIds.has(`${finding.id}:${finding.sourceFingerprint}`),
	);
	if (unapproved.length > 0) return "Requires Approval";
	if (findings.some((finding) => finding.kind === "source_fallback")) {
		return "Ready with Deviations";
	}
	return "Ready";
}

function refreshRecord(
	state: PrototypeState,
	record: ReleaseRecord,
): ReleaseRecord {
	const snapshot = snapshotById(state, record.snapshotId);
	if (!snapshot)
		throw new Error("Release Record references an unknown snapshot.");
	const findings = findingsFor(state, snapshot);
	return {
		...record,
		findings,
		posture: postureFor(findings, record.fallbackApprovals),
	};
}

/** Candidate external Interface: snapshot synchronization. */
export function ingestSnapshot(
	state: PrototypeState,
	input: IngestSnapshotInput,
): Transition<IngestSnapshotResult> {
	const existing = state.snapshots.find(
		(snapshot) =>
			snapshot.commit === input.commit &&
			snapshot.manifestFingerprint === input.manifestFingerprint,
	);
	if (existing) {
		return { state, result: { kind: "idempotent", snapshotId: existing.id } };
	}
	if (!input.isBaselineDescendant) {
		return {
			state,
			result: {
				kind: "rejected",
				reason: "A Baseline Snapshot must descend from the current baseline.",
			},
		};
	}
	if (Object.values(input.messages).some((message) => !message.contractValid)) {
		return {
			state,
			result: {
				kind: "rejected",
				reason:
					"The Source Contract is invalid; no partial snapshot was published.",
			},
		};
	}
	const next = clone(state);
	const snapshot: SourceSnapshot = {
		id: `snapshot-${next.nextSnapshot++}`,
		commit: input.commit,
		manifestFingerprint: input.manifestFingerprint,
		messages: input.messages,
	};
	next.snapshots.push(snapshot);
	next.baselineSnapshotId = snapshot.id;
	return {
		state: next,
		result: { kind: "published", snapshotId: snapshot.id },
	};
}

/** Candidate external Interface: create or reuse a durable Release Record. */
export function openRelease(
	state: PrototypeState,
): Transition<OpenReleaseResult> {
	const matching = state.releaseRecords.find(
		(record) =>
			record.snapshotId === state.baselineSnapshotId &&
			record.catalogRevision === state.catalogRevision,
	);
	if (matching) {
		const refreshed = refreshRecord(state, matching);
		const next = clone(state);
		next.releaseRecords = next.releaseRecords.map((record) =>
			record.id === matching.id ? refreshed : record,
		);
		return { state: next, result: { kind: "reused", record: refreshed } };
	}
	const next = clone(state);
	const record: ReleaseRecord = {
		id: `release-${next.nextReleaseRecord++}`,
		snapshotId: next.baselineSnapshotId,
		catalogRevision: next.catalogRevision,
		findings: [],
		fallbackApprovals: [],
		posture: "Requires Approval",
	};
	const refreshed = refreshRecord(next, record);
	next.releaseRecords.push(refreshed);
	return { state: next, result: { kind: "opened", record: refreshed } };
}

/**
 * Candidate external Interface: the explicit decision that binds an exact
 * Source Fallback finding and source fingerprint to a Release Record.
 */
export function recordFallbackApproval(
	state: PrototypeState,
	args: { releaseRecordId: string; findingIds: string[] },
): Transition<DecideFallbackResult> {
	const record = state.releaseRecords.find(
		(item) => item.id === args.releaseRecordId,
	);
	if (!record) {
		return {
			state,
			result: { kind: "rejected", reason: "Release Record not found." },
		};
	}
	if (
		record.snapshotId !== state.baselineSnapshotId ||
		record.catalogRevision !== state.catalogRevision
	) {
		return {
			state,
			result: {
				kind: "rejected",
				reason: "The Release Record is no longer current; open a new release.",
			},
		};
	}
	const current = refreshRecord(state, record);
	const selected = args.findingIds.map((findingId) =>
		current.findings.find((item) => item.id === findingId),
	);
	if (
		selected.length === 0 ||
		selected.some((finding) => finding?.kind !== "source_fallback")
	) {
		return {
			state,
			result: {
				kind: "rejected",
				reason: "Every selected finding must be a current Source Fallback.",
			},
		};
	}
	const fallbacks = selected as ReleaseFinding[];
	const next = clone(state);
	const updated = refreshRecord(next, {
		...record,
		fallbackApprovals: [
			...record.fallbackApprovals.filter(
				(approval) => !args.findingIds.includes(approval.findingId),
			),
			...fallbacks.map((finding) => ({
				findingId: finding.id,
				sourceFingerprint: finding.sourceFingerprint,
			})),
		],
	});
	next.releaseRecords = next.releaseRecords.map((item) =>
		item.id === record.id ? updated : item,
	);
	return { state: next, result: { kind: "recorded", record: updated } };
}

/** Candidate external Interface: deterministic, side-effect-free bundle build. */
export function buildRelease(
	state: PrototypeState,
	releaseRecordId: string,
): Transition<BuildReleaseResult> {
	const record = state.releaseRecords.find(
		(item) => item.id === releaseRecordId,
	);
	if (!record) {
		return {
			state,
			result: { kind: "rejected", reason: "Release Record not found." },
		};
	}
	if (
		record.snapshotId !== state.baselineSnapshotId ||
		record.catalogRevision !== state.catalogRevision
	) {
		return {
			state,
			result: {
				kind: "rejected",
				reason:
					"The Release Record is stale; open a release for the current catalog.",
			},
		};
	}
	const current = refreshRecord(state, record);
	if (
		current.posture !== "Ready" &&
		current.posture !== "Ready with Deviations"
	) {
		return {
			state,
			result: {
				kind: "rejected",
				reason: `Cannot build while posture is ${current.posture}.`,
			},
		};
	}
	const fallbackFindingIds = current.findings
		.filter((finding) => finding.kind === "source_fallback")
		.map((finding) => finding.id);
	return {
		state,
		result: {
			kind: "built",
			bundle: {
				id: `bundle:${current.snapshotId}:${current.catalogRevision}`,
				snapshotId: current.snapshotId,
				catalogRevision: current.catalogRevision,
				posture: current.posture,
				manifest: { localeCodes: ["de", "fr"], fallbackFindingIds },
			},
		},
	};
}

/**
 * Translator work is outside the candidate Localization Sync Module. The TUI
 * uses this helper only to model a catalog revision arriving from Blabla's
 * existing translation workflow.
 */
export function confirmTarget(
	state: PrototypeState,
	locale: TargetValue["locale"],
	key: string,
	value?: string,
): PrototypeState {
	const next = clone(state);
	const source = activeSnapshot(next).messages[key];
	if (!source) throw new Error(`Unknown source key: ${key}`);
	const target = targetFor(next, locale, key);
	if (!target) throw new Error(`Unknown target: ${locale}:${key}`);
	target.value = value ?? target.value;
	target.sourceFingerprint = source.fingerprint;
	target.awaitingReview = false;
	next.catalogRevision += 1;
	return next;
}

export function removeTarget(
	state: PrototypeState,
	locale: TargetValue["locale"],
	key: string,
): PrototypeState {
	const next = clone(state);
	const target = targetFor(next, locale, key);
	if (!target) throw new Error(`Unknown target: ${locale}:${key}`);
	target.value = undefined;
	target.intentionalBlank = false;
	next.catalogRevision += 1;
	return next;
}

export function initialPrototypeState(): PrototypeState {
	const snapshot: SourceSnapshot = {
		id: "snapshot-1",
		commit: "1111111",
		manifestFingerprint: "manifest-v1",
		messages: {
			share_label: {
				source: "Share",
				fingerprint: "share-v1",
				contractValid: true,
			},
			brand_name: {
				source: "Brickit",
				fingerprint: "brand-v1",
				contractValid: true,
			},
		},
	};
	return {
		snapshots: [snapshot],
		baselineSnapshotId: snapshot.id,
		targets: [
			{
				locale: "de",
				key: "share_label",
				value: "Teilen",
				sourceFingerprint: "share-v1",
			},
			{
				locale: "fr",
				key: "share_label",
				value: "Partager",
				sourceFingerprint: "share-v1",
			},
			{
				locale: "de",
				key: "brand_name",
				value: "Brickit",
				sourceFingerprint: "brand-v1",
			},
			{
				locale: "fr",
				key: "brand_name",
				value: "Brickit",
				sourceFingerprint: "brand-v1",
			},
		],
		catalogRevision: 1,
		releaseRecords: [],
		nextSnapshot: 2,
		nextReleaseRecord: 1,
	};
}

export function changedSourceInput(state: PrototypeState): IngestSnapshotInput {
	const current = activeSnapshot(state);
	return {
		commit: "2222222",
		manifestFingerprint: "manifest-v2",
		isBaselineDescendant: true,
		messages: {
			...current.messages,
			share_label: {
				source: "Share this",
				fingerprint: "share-v2",
				contractValid: true,
			},
		},
	};
}
