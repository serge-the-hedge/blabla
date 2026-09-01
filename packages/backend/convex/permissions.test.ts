import { describe, expect, test } from "vitest";

import { hasMinimumRole } from "./accessControl";
import type { Role } from "./lib";

const roles: Role[] = ["viewer", "editor", "owner"];

const expectedAccess: Record<Role, Record<Role, boolean>> = {
	viewer: { viewer: true, editor: false, owner: false },
	editor: { viewer: true, editor: true, owner: false },
	owner: { viewer: true, editor: true, owner: true },
};

describe("project role hierarchy", () => {
	for (const role of roles) {
		for (const minimumRole of roles) {
			test(`${role} access when ${minimumRole} is required`, () => {
				expect(hasMinimumRole(role, minimumRole)).toBe(
					expectedAccess[role][minimumRole],
				);
			});
		}
	}
});
