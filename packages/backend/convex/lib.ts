import type { Doc, Id } from "./_generated/dataModel";

/** The branch the Brickit team uses as the localization integration target. */
export const DEFAULT_INTEGRATION_BRANCH = "develop";

export type Role = "owner" | "editor" | "viewer";
export type TranslationStatus =
	| "missing"
	| "translated"
	| "needs_review"
	| "stale";
export type Actor = {
	kind: "user" | "agent" | "system" | "repositoryAdapter";
	id: string;
};
export type HumanActor = {
	kind: "user" | "agent" | "system";
	id: string;
};
export type TokenScope =
	| "read"
	| "search"
	| "propose"
	| "export"
	| "snapshot-submission";

export function slugify(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

export function normalizeLocaleCode(input: string): string {
	const parts = input.trim().replaceAll("_", "-").split("-").filter(Boolean);
	return parts
		.map((part, index) =>
			index === 0 ? part.toLowerCase() : part.toUpperCase(),
		)
		.join("-");
}

export function now(): number {
	return Date.now();
}

/** The same byte-exact SHA-256 identity used by Snapshot evidence and
 * Catalog Workspace decision provenance. */
export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export function makeSearchText(input: {
	key: string;
	description?: string;
	screen?: Doc<"screens"> | null;
	tags?: Doc<"tags">[];
}): string {
	return [input.key, input.description, input.screen?.name, input.screen?.slug]
		.concat((input.tags ?? []).flatMap((tag) => [tag.name, tag.slug]))
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

export function statusForValue(value: string): TranslationStatus {
	return value.trim().length === 0 ? "missing" : "translated";
}

export function toArbKey(key: string): string {
	const parts = key
		.split(/[^a-zA-Z0-9]+/)
		.map((part) => part.replace(/^[0-9]+/, ""))
		.filter(Boolean);
	if (parts.length === 0) return "message";
	return parts
		.map((part, index) => {
			if (index === 0) return part.charAt(0).toLowerCase() + part.slice(1);
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join("");
}

export function normalizeSelection(input?: {
	type?: string;
	keys?: string[];
	tag?: string;
	screen?: string;
}) {
	return { type: "all", ...(input ?? {}) };
}

export function buildReviewUrl(
	projectId: Id<"projects">,
	changeSetId: Id<"changeSets">,
): string {
	return `/projects/${projectId}/reviews/${changeSetId}`;
}
