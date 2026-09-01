import { describe, expect, test } from "bun:test";

import { DEFAULT_AUTH_REDIRECT, safeAuthRedirect } from "./auth-redirect";

describe("safeAuthRedirect", () => {
	test("preserves an internal protected destination", () => {
		expect(
			safeAuthRedirect(
				"/projects/project-id/strings?scope=unconfirmedImport#message",
			),
		).toBe("/projects/project-id/strings?scope=unconfirmedImport#message");
	});

	test("never redirects a sign-in route back into itself", () => {
		expect(
			safeAuthRedirect(
				"/sign-in?mode=sign-in&redirect=%2Fprojects%2Fproject-id%2Fstrings",
			),
		).toBe(DEFAULT_AUTH_REDIRECT);
	});
});
