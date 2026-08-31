import { ConvexError } from "convex/values";

import { slugify } from "./lib";

export const MAX_IMPORT_BYTES = 256 * 1024;
export const MAX_IMPORT_MESSAGES = 50;
export const MAX_IMPORT_TAGS = 20;
export const MAX_IMPORT_KEY_LENGTH = 256;
export const MAX_IMPORT_VALUE_LENGTH = 32_000;

export type FlatMessages = Record<string, string>;

function assertImportContentSize(content: string) {
	if (new TextEncoder().encode(content).byteLength > MAX_IMPORT_BYTES) {
		throw new ConvexError({
			code: "LIMIT_EXCEEDED",
			message: `Import payloads must be ${MAX_IMPORT_BYTES / 1024} KiB or smaller.`,
		});
	}
}

function addMessage(messages: FlatMessages, key: string, value: string) {
	if (!key || key.length > MAX_IMPORT_KEY_LENGTH) {
		throw new ConvexError({
			code: "VALIDATION",
			message: `Import keys must be ${MAX_IMPORT_KEY_LENGTH} characters or fewer.`,
		});
	}
	if (value.length > MAX_IMPORT_VALUE_LENGTH) {
		throw new ConvexError({
			code: "VALIDATION",
			message: `Import values must be ${MAX_IMPORT_VALUE_LENGTH} characters or fewer.`,
		});
	}
	if (key in messages) {
		throw new ConvexError({
			code: "VALIDATION",
			message: `Import contains the duplicate flattened key: ${key}.`,
		});
	}
	messages[key] = value;
	if (Object.keys(messages).length > MAX_IMPORT_MESSAGES) {
		throw new ConvexError({
			code: "LIMIT_EXCEEDED",
			message: `Imports support at most ${MAX_IMPORT_MESSAGES} messages per request.`,
		});
	}
}

function flattenInto(
	value: unknown,
	prefix: string,
	messages: FlatMessages,
	depth = 0,
) {
	if (depth > 20) {
		throw new ConvexError({
			code: "LIMIT_EXCEEDED",
			message: "JSON imports support at most 20 levels of nesting.",
		});
	}
	if (typeof value === "string") {
		if (!prefix) {
			throw new ConvexError({
				code: "VALIDATION",
				message: "JSON import must be an object with message keys.",
			});
		}
		addMessage(messages, prefix, value);
		return;
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new ConvexError({
			code: "VALIDATION",
			message: `Import value at ${prefix || "the document root"} must be a string or nested object.`,
		});
	}
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		flattenInto(child, prefix ? `${prefix}.${key}` : key, messages, depth + 1);
	}
}

function parseJson(content: string): unknown {
	assertImportContentSize(content);
	try {
		return JSON.parse(content);
	} catch {
		throw new ConvexError({
			code: "VALIDATION",
			message: "Import payload is not valid JSON.",
		});
	}
}

export function parseJsonMessages(content: string): FlatMessages {
	const messages: FlatMessages = {};
	flattenInto(parseJson(content), "", messages);
	if (Object.keys(messages).length === 0) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "Import payload does not contain any messages.",
		});
	}
	return messages;
}

export function parseArbMessages(content: string): {
	messages: FlatMessages;
	metadata: Map<string, { description?: string; placeholders?: unknown }>;
} {
	const parsed = parseJson(content);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "ARB import must be an object.",
		});
	}
	const messages: FlatMessages = {};
	const metadata = new Map<
		string,
		{ description?: string; placeholders?: unknown }
	>();
	for (const [key, value] of Object.entries(parsed)) {
		if (key.startsWith("@@")) continue;
		if (key.startsWith("@")) {
			if (!value || typeof value !== "object" || Array.isArray(value)) {
				throw new ConvexError({
					code: "VALIDATION",
					message: `ARB metadata for ${key.slice(1)} must be an object.`,
				});
			}
			const meta = value as {
				description?: unknown;
				placeholders?: unknown;
			};
			if (
				meta.placeholders !== undefined &&
				(!meta.placeholders ||
					typeof meta.placeholders !== "object" ||
					Array.isArray(meta.placeholders) ||
					Object.keys(meta.placeholders).length > 50 ||
					Object.keys(meta.placeholders).some(
						(name) => name.length === 0 || name.length > 64,
					))
			) {
				throw new ConvexError({
					code: "VALIDATION",
					message: `ARB placeholders for ${key.slice(1)} must be an object with at most 50 named entries.`,
				});
			}
			if (
				meta.description !== undefined &&
				typeof meta.description !== "string"
			) {
				throw new ConvexError({
					code: "VALIDATION",
					message: `ARB description for ${key.slice(1)} must be a string.`,
				});
			}
			metadata.set(key.slice(1), {
				description: meta.description as string | undefined,
				placeholders: meta.placeholders,
			});
		} else if (typeof value === "string") {
			addMessage(messages, key, value);
		} else {
			throw new ConvexError({
				code: "VALIDATION",
				message: `ARB message ${key} must be a string.`,
			});
		}
	}
	if (Object.keys(messages).length === 0) {
		throw new ConvexError({
			code: "VALIDATION",
			message: "ARB payload does not contain any messages.",
		});
	}
	return { messages, metadata };
}

export function validateImportTags(tagSlugs: string[] | undefined): void {
	if (
		(tagSlugs?.length ?? 0) > MAX_IMPORT_TAGS ||
		tagSlugs?.some(
			(tag) =>
				tag.trim().length === 0 || tag.length > 64 || slugify(tag).length === 0,
		)
	) {
		throw new ConvexError({
			code: "VALIDATION",
			message: `Imports support at most ${MAX_IMPORT_TAGS} valid, non-empty tags of 64 characters or fewer.`,
		});
	}
}
