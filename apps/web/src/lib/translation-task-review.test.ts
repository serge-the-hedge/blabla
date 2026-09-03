import { describe, expect, test } from "bun:test";

import {
	convexApplicationErrorMessage,
	exactTaskBatchRevisionIds,
} from "./translation-task-review";

describe("Translation Task review", () => {
	test("batch acceptance includes only exact candidates on a current basis", () => {
		const candidates = [
			{ revision: { _id: "current", value: "Aktuell" }, reviews: [] },
			{ revision: { _id: "stale", value: "Veraltet" }, reviews: [] },
			{ revision: { _id: "loading", value: "Lädt" }, reviews: [] },
		];
		expect(
			exactTaskBatchRevisionIds({
				candidates,
				drafts: {},
				blankReasons: {},
				basisState: {
					current: "current",
					stale: "changed",
				},
			}),
		).toEqual(["current"]);
	});

	test("shows an expected Convex application error instead of its wrapper", () => {
		expect(
			convexApplicationErrorMessage(
				{
					data: {
						code: "STALE_BASIS",
						message: "The Source Contract changed. Ask for a new revision.",
					},
				},
				"Review failed.",
			),
		).toBe("The Source Contract changed. Ask for a new revision.");
	});
});
