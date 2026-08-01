/** PROTOTYPE — captured on a throwaway branch; run with `bun run prototype:localization-sync`. */
import { createInterface } from "node:readline";

import {
	buildRelease,
	changedSourceInput,
	confirmTarget,
	ingestSnapshot,
	initialPrototypeState,
	openRelease,
	type PrototypeState,
	recordFallbackApproval,
	removeTarget,
} from "./localization-sync.logic.prototype";

let state = initialPrototypeState();
let lastAction = "Initial state: both target Locales are current.";

function latestRelease(state: PrototypeState) {
	return state.releaseRecords.at(-1);
}

function render() {
	console.clear();
	const baseline = state.snapshots.find(
		(snapshot) => snapshot.id === state.baselineSnapshotId,
	);
	const release = latestRelease(state);
	console.log("\x1b[1mLocalization Sync interface — LOGIC PROTOTYPE\x1b[0m");
	console.log(
		"Question: does an exact fallback decision deserve its own module operation?",
	);
	console.log();
	console.log(
		JSON.stringify(
			{
				baseline: baseline && {
					id: baseline.id,
					commit: baseline.commit,
					messages: Object.fromEntries(
						Object.entries(baseline.messages).map(([key, message]) => [
							key,
							message.fingerprint,
						]),
					),
				},
				catalogRevision: state.catalogRevision,
				targets: state.targets.map((target) => ({
					locale: target.locale,
					key: target.key,
					value: target.value ?? "<missing>",
					sourceFingerprint: target.sourceFingerprint,
				})),
				release: release && {
					id: release.id,
					posture: release.posture,
					findings: release.findings.map((finding) => ({
						id: finding.id,
						kind: finding.kind,
					})),
					fallbackApprovals: release.fallbackApprovals,
				},
			},
			null,
			2,
		),
	);
	console.log();
	console.log(`\x1b[2mLast action: ${lastAction}\x1b[0m`);
	console.log();
	console.log("\x1b[1mModule operations\x1b[0m");
	console.log(
		"[e] open or refresh Release Record   [a] approve all shown fallbacks",
	);
	console.log(
		"[b] build Release Bundle              [i] re-ingest current snapshot",
	);
	console.log("\x1b[1mOutside the module: translator work\x1b[0m");
	console.log(
		"[s] ingest changed English source     [u] confirm stale targets",
	);
	console.log("[m] make French share_label missing   [r] reset   [q] quit");
}

function action(line: string) {
	switch (line.trim().toLowerCase()) {
		case "e": {
			const transition = openRelease(state);
			state = transition.state;
			lastAction = `${transition.result.kind}: ${transition.result.record.id} is ${transition.result.record.posture}.`;
			break;
		}
		case "a": {
			const release = latestRelease(state);
			const fallbacks = release?.findings.filter(
				(finding) => finding.kind === "source_fallback",
			);
			if (!release || !fallbacks || fallbacks.length === 0) {
				lastAction = "Open a release with a Source Fallback first.";
				break;
			}
			const transition = recordFallbackApproval(state, {
				releaseRecordId: release.id,
				findingIds: fallbacks.map((finding) => finding.id),
			});
			state = transition.state;
			lastAction =
				transition.result.kind === "recorded"
					? `recorded: ${transition.result.record.posture}.`
					: `rejected: ${transition.result.reason}`;
			break;
		}
		case "b": {
			const release = latestRelease(state);
			if (!release) {
				lastAction = "Open a Release Record first.";
				break;
			}
			const transition = buildRelease(state, release.id);
			state = transition.state;
			lastAction =
				transition.result.kind === "built"
					? `built ${transition.result.bundle.id} (${transition.result.bundle.posture}).`
					: `rejected: ${transition.result.reason}`;
			break;
		}
		case "i": {
			const baseline = state.snapshots.find(
				(snapshot) => snapshot.id === state.baselineSnapshotId,
			);
			if (!baseline) throw new Error("No baseline to re-ingest.");
			const transition = ingestSnapshot(state, {
				commit: baseline.commit,
				manifestFingerprint: baseline.manifestFingerprint,
				messages: baseline.messages,
				isBaselineDescendant: true,
			});
			state = transition.state;
			lastAction = `${transition.result.kind}: ${
				"snapshotId" in transition.result
					? transition.result.snapshotId
					: transition.result.reason
			}.`;
			break;
		}
		case "s": {
			const transition = ingestSnapshot(state, changedSourceInput(state));
			state = transition.state;
			lastAction =
				transition.result.kind === "published"
					? "published a descendant snapshot; share_label targets are now stale."
					: `${transition.result.kind}: ${
							"reason" in transition.result
								? transition.result.reason
								: transition.result.snapshotId
						}.`;
			break;
		}
		case "u": {
			state = confirmTarget(state, "de", "share_label", "Teile dies");
			state = confirmTarget(state, "fr", "share_label", "Partagez ceci");
			lastAction =
				"translator confirmed both stale share_label values; catalog revision advanced.";
			break;
		}
		case "m": {
			state = removeTarget(state, "fr", "share_label");
			lastAction = "translator state now has one actual Source Fallback.";
			break;
		}
		case "r": {
			state = initialPrototypeState();
			lastAction = "Reset to the clean Baseline Snapshot.";
			break;
		}
		case "q":
			return false;
		default:
			lastAction = "Unknown command.";
	}
	return true;
}

const readline = createInterface({
	input: process.stdin,
	output: process.stdout,
});
render();
readline.setPrompt("> ");
readline.prompt();
readline.on("line", (line) => {
	if (!action(line)) {
		readline.close();
		return;
	}
	render();
	readline.prompt();
});
readline.on("close", () => process.exit(0));
