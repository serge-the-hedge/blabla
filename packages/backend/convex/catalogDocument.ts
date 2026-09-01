import { ConvexError } from "convex/values";

/**
 * The Catalog Document: the complete, ordered, lossless representation of one
 * ARB file, and a serializer that reproduces the original bytes exactly.
 *
 * A message's value is an opaque string here. This module does not parse ICU,
 * does not decompose plural blocks, and does not know what a placeholder is —
 * which is what makes arm-level byte fidelity free, since a value is never
 * reinterpreted. Metadata is the raw parsed `@key` object rather than a
 * normalized shape, so unknown fields and unknown placeholder attributes
 * survive without needing a schema.
 *
 * Pure by construction: no Convex context, no database, no file system, no
 * network. The existing ARB import and export path is untouched and keeps its
 * own limits; none of them apply here.
 */

export type JsonObject = { readonly [key: string]: unknown };

export type CatalogGlobal = {
	readonly name: string;
	readonly value: unknown;
};

export type CatalogMessage = {
	readonly id: string;
	readonly value: string;
	readonly metadata: JsonObject | undefined;
};

export type CatalogDocument = {
	readonly globals: readonly CatalogGlobal[];
	readonly messages: readonly CatalogMessage[];
	/**
	 * Top-level member names — global names and message identifiers — in the
	 * order the document holds them. Serialization walks this rather than
	 * emitting globals first, because a global is not obliged to lead: relying
	 * on `Object.entries` would also hoist an integer-like identifier such as
	 * `"42"` ahead of its neighbours, which JavaScript orders before string
	 * keys. Metadata is not listed; it is written immediately after the message
	 * it belongs to, the arrangement every Brickit catalog holds with zero
	 * exceptions across all six files.
	 */
	readonly memberOrder: readonly string[];
};

const INDENT = "  ";

function indentAt(depth: number): string {
	return INDENT.repeat(depth);
}

function invalid(message: string): never {
	throw new ConvexError({ code: "VALIDATION", message });
}

function describePosition(text: string, offset: number): string {
	const preceding = text.slice(0, offset);
	const line = preceding.split("\n").length;
	const column = offset - preceding.lastIndexOf("\n");
	return `line ${line} column ${column}`;
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/**
 * The offset of the first place the text stops being valid JSON.
 *
 * `JSON.parse` is the authority on *whether* a document is valid; this only
 * has to say *where* it broke, and it must do that itself. Reading the offset
 * out of the engine's message looks tempting and is not safe: V8 echoes the
 * start of the input into that message, so a file beginning `position 12345`
 * hands back its own text as a location. It also omits the offset entirely for
 * the most common real failures — an empty file, or HTML uploaded by mistake —
 * where the answer is plainly zero. And the wording is the runtime's business,
 * so anything scraped from it is engine-locked.
 *
 * Returns undefined when the text is in fact valid JSON.
 */
function locateJsonFault(text: string): number | undefined {
	let index = 0;

	const skipWhitespace = () => {
		while (index < text.length && /\s/.test(text[index] as string)) index++;
	};

	const literal = (word: string): boolean => {
		if (text.startsWith(word, index)) {
			index += word.length;
			return true;
		}
		return false;
	};

	const string = (): boolean => {
		if (text[index] !== '"') return false;
		index++;
		while (index < text.length) {
			const char = text[index];
			if (char === "\\") {
				index += 2;
				continue;
			}
			index++;
			if (char === '"') return true;
		}
		return false;
	};

	const value = (): boolean => {
		skipWhitespace();
		const char = text[index];

		if (char === "{") {
			index++;
			skipWhitespace();
			if (text[index] === "}") {
				index++;
				return true;
			}
			for (;;) {
				skipWhitespace();
				if (!string()) return false;
				skipWhitespace();
				if (text[index] !== ":") return false;
				index++;
				if (!value()) return false;
				skipWhitespace();
				if (text[index] === ",") {
					index++;
					continue;
				}
				if (text[index] === "}") {
					index++;
					return true;
				}
				return false;
			}
		}

		if (char === "[") {
			index++;
			skipWhitespace();
			if (text[index] === "]") {
				index++;
				return true;
			}
			for (;;) {
				if (!value()) return false;
				skipWhitespace();
				if (text[index] === ",") {
					index++;
					continue;
				}
				if (text[index] === "]") {
					index++;
					return true;
				}
				return false;
			}
		}

		if (char === '"') return string();
		if (char === "t") return literal("true");
		if (char === "f") return literal("false");
		if (char === "n") return literal("null");

		NUMBER.lastIndex = index;
		const number = NUMBER.exec(text);
		if (number !== null && number.index === index) {
			index += number[0].length;
			return true;
		}

		return false;
	};

	if (!value()) return index;
	skipWhitespace();
	if (index !== text.length) return index;
	return undefined;
}

/**
 * `JSON.parse` reports a character offset, which is useless to someone looking
 * at a 3,000-line catalog, and it throws a `SyntaxError` rather than the shape
 * the rest of this package throws. Translate both.
 */
function parseDocumentJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		const offset = locateJsonFault(text) ?? 0;
		invalid(
			`ARB document is not valid JSON at ${describePosition(text, offset)}. ${reason}`,
		);
	}
}

/**
 * `JSON.parse` keeps only the last occurrence of a repeated member and says
 * nothing, so a catalog that declares a message twice would lose one silently.
 * The member scan sees both.
 */
function assertNoDuplicates(names: readonly string[]): void {
	const seen = new Set<string>();
	for (const name of names) {
		if (seen.has(name)) {
			invalid(
				`ARB document declares "${name}" more than once. JSON keeps only the last, so the earlier one would be discarded without a trace.`,
			);
		}
		seen.add(name);
	}
}

/**
 * Standard JSON escaping, plus one rule the corpus forces: a surrogate code
 * unit is written as `\uXXXX` with uppercase hex digits. Every Brickit catalog
 * carries exactly one astral character — a unicorn — already escaped that way,
 * and a literal-output writer turns it into a raw character.
 *
 * Built from the source string rather than by post-processing
 * `JSON.stringify`, which has already lowercased any escape it emitted by the
 * time a caller could see it. BMP characters stay literal, which is why the
 * Cyrillic and CJK catalogs read as themselves.
 */
function escapeString(value: string): string {
	let escaped = '"';
	for (let index = 0; index < value.length; index++) {
		const char = value[index] as string;
		const code = value.charCodeAt(index);
		if (char === '"') {
			escaped += '\\"';
		} else if (char === "\\") {
			escaped += "\\\\";
		} else if (char === "\n") {
			escaped += "\\n";
		} else if (char === "\r") {
			escaped += "\\r";
		} else if (char === "\t") {
			escaped += "\\t";
		} else if (char === "\b") {
			escaped += "\\b";
		} else if (char === "\f") {
			escaped += "\\f";
		} else if (code < 0x20) {
			escaped += `\\u${code.toString(16).padStart(4, "0")}`;
		} else if (code >= 0xd800 && code <= 0xdfff) {
			escaped += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
		} else {
			escaped += char;
		}
	}
	return `${escaped}"`;
}

function member(name: string, value: string, depth: number): string {
	return `${indentAt(depth)}${escapeString(name)}: ${value}`;
}

function writeValue(value: unknown, depth: number): string {
	if (typeof value === "string") return escapeString(value);

	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value.map(
			(item) => `${indentAt(depth + 1)}${writeValue(item, depth + 1)}`,
		);
		return `[\n${items.join(",\n")}\n${indentAt(depth)}]`;
	}

	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return "{}";
		const members = entries.map(([name, nested]) =>
			member(name, writeValue(nested, depth + 1), depth + 1),
		);
		return `{\n${members.join(",\n")}\n${indentAt(depth)}}`;
	}

	return JSON.stringify(value);
}

function readStringLiteral(
	text: string,
	start: number,
): { value: string; next: number } {
	let index = start + 1;
	while (index < text.length) {
		const char = text[index];
		if (char === "\\") {
			index += 2;
			continue;
		}
		index++;
		if (char === '"') break;
	}
	return { value: JSON.parse(text.slice(start, index)) as string, next: index };
}

/**
 * The top-level member names, in the order the text holds them.
 *
 * `Object.entries(JSON.parse(text))` cannot supply this: JavaScript hoists
 * integer-like keys ahead of string keys, so a catalog containing `"42"` would
 * silently reorder. Scanning the text costs one pass and keeps the order the
 * file actually has.
 */
function readMemberNames(text: string): string[] {
	const names: string[] = [];
	let depth = 0;
	let index = 0;

	while (index < text.length) {
		const char = text[index];

		if (char === '"') {
			const { value, next } = readStringLiteral(text, index);
			let probe = next;
			while (probe < text.length && /\s/.test(text[probe] as string)) probe++;
			if (depth === 1 && text[probe] === ":") names.push(value);
			index = next;
			continue;
		}

		if (char === "{" || char === "[") depth++;
		else if (char === "}" || char === "]") depth--;
		index++;
	}

	return names;
}

/**
 * Turn an ARB file's text into a Catalog Document.
 *
 * A name beginning `@@` is a document global; a name beginning with a single
 * `@` is metadata for the message named after it; anything else is a message,
 * whose value must be a string.
 *
 * Message identifiers are preserved exactly — no slugging, case folding, or
 * normalization of any kind — because they are generated Dart API identity.
 */
export function parse(text: string): CatalogDocument {
	if (text.charCodeAt(0) === 0xfeff) {
		invalid(
			"ARB document begins with a byte-order mark. It is rejected rather than stripped, because a document carrying one cannot round-trip.",
		);
	}

	const parsed = parseDocumentJson(text);
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		invalid("An ARB document must be a JSON object.");
	}

	const document = parsed as Record<string, unknown>;
	const names = readMemberNames(text);
	assertNoDuplicates(names);

	const globals: CatalogGlobal[] = [];
	const messages: CatalogMessage[] = [];
	const memberOrder: string[] = [];
	const metadata = new Map<string, JsonObject>();
	const messageIds = new Set<string>();

	for (const name of names) {
		if (!name.startsWith("@")) continue;
		if (name.startsWith("@@")) continue;
		const id = name.slice(1);
		const block = document[name];
		if (block === null || typeof block !== "object" || Array.isArray(block)) {
			invalid(`ARB metadata for "${id}" must be an object.`);
		}
		metadata.set(id, block as JsonObject);
	}

	for (const name of names) {
		const value = document[name];

		if (name.startsWith("@@")) {
			globals.push({ name, value });
			memberOrder.push(name);
			continue;
		}

		if (name.startsWith("@")) continue;

		if (typeof value !== "string") {
			invalid(`ARB message "${name}" must be a string.`);
		}

		messages.push({ id: name, value, metadata: metadata.get(name) });
		messageIds.add(name);
		memberOrder.push(name);
	}

	for (const id of metadata.keys()) {
		if (!messageIds.has(id)) {
			invalid(`ARB metadata "@${id}" has no matching message.`);
		}
	}

	return { globals, messages, memberOrder };
}

/**
 * The key a message is placed by in Catalog Order: its identifier with
 * underscores removed, compared by code unit. Not a convention imposed here —
 * it is the order Brickit's catalogs already hold exactly, across all 1,433
 * adjacencies, maintained by nobody.
 */
function catalogOrderKey(id: string): string {
	return id.replaceAll("_", "");
}

function messageIndex(document: CatalogDocument, id: string): number {
	return document.messages.findIndex((message) => message.id === id);
}

function requireMessageIndex(document: CatalogDocument, id: string): number {
	const index = messageIndex(document, id);
	if (index === -1) {
		invalid(`No message "${id}" in this catalog.`);
	}
	return index;
}

/**
 * Where a new identifier belongs among the messages, as an index to insert
 * before — the end of the list when it sorts last, and also when the document
 * is not in Catalog Order, since guessing a position in an arrangement we do
 * not understand would rearrange someone else's.
 *
 * One pass settles both questions: the first message that sorts after the new
 * identifier, and whether the document is ordered at all.
 */
function insertionPoint(document: CatalogDocument, id: string): number {
	const append = document.messages.length;
	const key = catalogOrderKey(id);
	let successor = append;
	let previous = "";

	for (const [index, message] of document.messages.entries()) {
		const current = catalogOrderKey(message.id);
		if (current < previous) return append;
		previous = current;
		if (successor === append && current > key) successor = index;
	}

	return successor;
}

/**
 * Replace one message's value. A replacement, not an upsert: an identifier the
 * document lacks is a mistake worth hearing about rather than a silent insert.
 */
export function withValue(
	document: CatalogDocument,
	id: string,
	value: string,
): CatalogDocument {
	const index = requireMessageIndex(document, id);
	const messages = document.messages.map((message, at) =>
		at === index ? { ...message, value } : message,
	);
	return { ...document, messages };
}

/**
 * Add a message the document does not have, at the position its own order
 * implies. An insert, not an upsert, for the same reason `withValue` is not.
 */
export function withMessage(
	document: CatalogDocument,
	id: string,
	value: string,
	metadata?: JsonObject,
): CatalogDocument {
	if (id.startsWith("@")) {
		// `@name` is metadata and `@@name` a global, so serializing one as a
		// message writes it into a slot parse reads differently — the message
		// would come back as a global, or the document stop parsing at all.
		invalid(`A message identifier cannot begin with "@": "${id}".`);
	}
	if (messageIndex(document, id) !== -1) {
		invalid(`This catalog already has a message "${id}".`);
	}

	const messageAt = insertionPoint(document, id);
	const successor = document.messages[messageAt]?.id;
	const memberAt =
		successor === undefined
			? document.memberOrder.length
			: document.memberOrder.indexOf(successor);

	return {
		...document,
		messages: [
			...document.messages.slice(0, messageAt),
			{ id, value, metadata },
			...document.messages.slice(messageAt),
		],
		memberOrder: [
			...document.memberOrder.slice(0, memberAt),
			id,
			...document.memberOrder.slice(memberAt),
		],
	};
}

/**
 * Remove a message and its metadata outright. The result is absence: the
 * member is gone from the serialized document rather than present and empty,
 * which are different facts about a translation.
 */
export function withoutMessage(
	document: CatalogDocument,
	id: string,
): CatalogDocument {
	const index = requireMessageIndex(document, id);
	return {
		...document,
		messages: document.messages.filter((_, at) => at !== index),
		memberOrder: document.memberOrder.filter((name) => name !== id),
	};
}

/**
 * The identifiers whose values differ between two catalogs, ignoring metadata
 * and member order. An identifier present in only one of them counts as a
 * difference — no value and some value are not the same thing — which is what
 * makes this usable for the key set a release intends to change.
 *
 * Reported in the first document's order, then any identifier only the second
 * has, in its own.
 */
export function diffValues(
	before: CatalogDocument,
	after: CatalogDocument,
): readonly string[] {
	const beforeIds = new Set(before.messages.map((message) => message.id));
	const afterValues = new Map(
		after.messages.map((message) => [message.id, message.value] as const),
	);

	const changed = before.messages
		.filter((message) => afterValues.get(message.id) !== message.value)
		.map((message) => message.id);
	const added = after.messages
		.filter((message) => !beforeIds.has(message.id))
		.map((message) => message.id);

	return [...changed, ...added];
}

/**
 * Turn a Catalog Document back into ARB text.
 *
 * Members are written in the document's own order, each message followed
 * immediately by its metadata block. Indentation is two spaces and there is no
 * trailing newline: every catalog ends on its closing brace, and inventing one
 * would make a no-op release produce a diff.
 */
export function serialize(document: CatalogDocument): string {
	const globals = new Map(
		document.globals.map((global) => [global.name, global] as const),
	);
	const messages = new Map(
		document.messages.map((message) => [message.id, message] as const),
	);
	const lines: string[] = [];

	for (const name of document.memberOrder) {
		const global = globals.get(name);
		if (global !== undefined) {
			lines.push(member(name, writeValue(global.value, 1), 1));
			continue;
		}

		const message = messages.get(name);
		if (message === undefined) continue;

		lines.push(member(name, escapeString(message.value), 1));
		if (message.metadata !== undefined) {
			lines.push(member(`@${name}`, writeValue(message.metadata, 1), 1));
		}
	}

	if (lines.length === 0) return "{}";
	return `{\n${lines.join(",\n")}\n}`;
}
