import { ConvexError } from "convex/values";

import { slugify } from "./lib";

export const MAX_CHANGE_SET_ITEMS = 50;
export const MAX_TAGS_PER_METADATA_CHANGE = 20;

export function isAcceptedForApply(item: { status: string }): boolean {
	return item.status === "accepted";
}

export function assertNoPendingItems(items: Array<{ status: string }>): void {
	if (items.some((item) => item.status === "pending")) {
		throw new ConvexError({
			code: "BAD_STATE",
			message:
				"Accept or reject every pending item before applying the review.",
		});
	}
}

type ChangeItemShape = {
	kind: string;
	keyId?: string;
	localeId?: string;
	nextValue: string | null;
};

type ReferencedDocument = { projectId: string; archivedAt?: number } | null;

export function parseTagMetadataPayload(nextValue: string | null): {
	tagSlugs: string[];
} {
	if (nextValue === null) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "Key metadata items require a value.",
		});
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(nextValue);
	} catch {
		throw new ConvexError({
			code: "VALIDATION",
			message: "Key metadata must be valid JSON.",
		});
	}
	if (
		!parsed ||
		typeof parsed !== "object" ||
		Array.isArray(parsed) ||
		Object.keys(parsed).some((key) => key !== "tagSlugs")
	) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "Key metadata must contain only tagSlugs.",
		});
	}
	const tagSlugs = (parsed as { tagSlugs?: unknown }).tagSlugs;
	if (
		!Array.isArray(tagSlugs) ||
		tagSlugs.length > MAX_TAGS_PER_METADATA_CHANGE ||
		tagSlugs.some(
			(value) =>
				typeof value !== "string" ||
				value.trim().length === 0 ||
				value.length > 64 ||
				slugify(value).length === 0,
		)
	) {
		throw new ConvexError({
			code: "VALIDATION",
			message: `tagSlugs must contain at most ${MAX_TAGS_PER_METADATA_CHANGE} non-empty strings of 64 characters or fewer.`,
		});
	}
	return { tagSlugs: Array.from(new Set(tagSlugs)) };
}

export function assertChangeItemReferencesProject(
	projectId: string,
	item: ChangeItemShape,
	key: ReferencedDocument,
	locale: ReferencedDocument,
): void {
	if (item.kind === "translation_value") {
		if (!item.keyId || !item.localeId || item.nextValue === null) {
			throw new ConvexError({
				code: "VALIDATION",
				message:
					"Translation value items require keyId, localeId, and nextValue.",
			});
		}
		if (
			!key ||
			key.projectId !== projectId ||
			key.archivedAt !== undefined ||
			!locale ||
			locale.projectId !== projectId ||
			locale.archivedAt !== undefined
		) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "Change item references must belong to this project.",
			});
		}
		return;
	}
	if (item.kind === "key_metadata") {
		if (!item.keyId || item.localeId !== undefined) {
			throw new ConvexError({
				code: "VALIDATION",
				message:
					"Key metadata items require keyId and cannot reference a locale.",
			});
		}
		if (!key || key.projectId !== projectId || key.archivedAt !== undefined) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "Change item references must belong to this project.",
			});
		}
		parseTagMetadataPayload(item.nextValue);
		return;
	}
	throw new ConvexError({
		code: "BAD_STATE",
		message: `Cannot add ${item.kind} review items yet.`,
	});
}

export function assertBoundedChangeSetSize(size: number): void {
	if (size > MAX_CHANGE_SET_ITEMS) {
		throw new ConvexError({
			code: "LIMIT_EXCEEDED",
			message: `Change sets support at most ${MAX_CHANGE_SET_ITEMS} items.`,
		});
	}
}
