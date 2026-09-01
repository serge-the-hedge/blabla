import type { Role } from "./lib";

const roleRank: Record<Role, number> = {
	viewer: 0,
	editor: 1,
	owner: 2,
};

export function hasMinimumRole(role: Role, minimumRole: Role): boolean {
	return roleRank[role] >= roleRank[minimumRole];
}
