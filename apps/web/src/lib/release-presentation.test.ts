import { describe, expect, test } from "bun:test";

import {
	releaseHistoryStatus,
	releasePresentationFor,
	releaseProgressFor,
} from "./release-presentation";

describe("Release route presentation", () => {
	test("keeps durable preparing progress inside its catalog bounds", () => {
		expect(releaseProgressFor({ cursor: -1, expectedKeyCount: 1434 })).toBe(0);
		expect(releaseProgressFor({ cursor: 63, expectedKeyCount: 1434 })).toBe(64);
		expect(releaseProgressFor({ cursor: 2000, expectedKeyCount: 1434 })).toBe(
			1434,
		);
	});

	test.each([
		["blocked", "Blocked", true, "Before this can be built"],
		["needsDecisions", "Needs decisions", true, "Before this can be built"],
		["ready", "Ready", false, "This release is ready"],
	] as const)(
		"presents the %s posture",
		(posture, label, needsWork, heading) => {
			expect(releasePresentationFor(posture)).toMatchObject({
				posture,
				label,
				needsWork,
				heading,
			});
		},
	);

	test("labels terminal history by posture and in-flight history by status", () => {
		expect(releaseHistoryStatus({ status: "ready", posture: "blocked" })).toBe(
			"Blocked",
		);
		expect(releaseHistoryStatus({ status: "preparing", posture: null })).toBe(
			"preparing",
		);
	});
});
