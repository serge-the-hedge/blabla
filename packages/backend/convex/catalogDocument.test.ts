import { describe, expect, test } from "vitest";

import de from "../fixtures/arb/intl_de.arb?raw";
import en from "../fixtures/arb/intl_en.arb?raw";
import es from "../fixtures/arb/intl_es.arb?raw";
import fr from "../fixtures/arb/intl_fr.arb?raw";
import ru from "../fixtures/arb/intl_ru.arb?raw";
import zh from "../fixtures/arb/intl_zh.arb?raw";
import {
	diffValues,
	parse,
	serialize,
	withMessage,
	withoutMessage,
	withValue,
} from "./catalogDocument";

const catalogs = { en, de, es, fr, ru, zh } as const;
type LocaleCode = keyof typeof catalogs;
const localeCodes = Object.keys(catalogs) as LocaleCode[];

/**
 * A round-trip failure on a 150 KB file is useless as a raw string diff, so
 * report where it broke and which message owns that position instead.
 */
function expectByteIdentical(actual: string, expected: string, label: string) {
	if (actual === expected) return;

	let index = 0;
	while (
		index < actual.length &&
		index < expected.length &&
		actual[index] === expected[index]
	) {
		index++;
	}

	const byteOffset = new TextEncoder().encode(expected.slice(0, index)).length;
	const preceding = expected.slice(0, index);
	const memberStart = preceding.lastIndexOf('\n  "');
	const owner =
		memberStart === -1
			? "(before the first member)"
			: (preceding.slice(memberStart + 4).split('"')[0] ?? "(unknown member)");

	throw new Error(
		[
			`${label}: round trip differs at character ${index} (byte ${byteOffset}), in member "${owner}".`,
			`  expected: ${JSON.stringify(expected.slice(index, index + 60))}`,
			`  actual:   ${JSON.stringify(actual.slice(index, index + 60))}`,
		].join("\n"),
	);
}

describe("catalog document round trip", () => {
	test.each(localeCodes)(
		"reproduces intl_%s.arb byte for byte",
		(code: LocaleCode) => {
			const text = catalogs[code];
			expectByteIdentical(serialize(parse(text)), text, `intl_${code}.arb`);
		},
	);

	test.each(localeCodes)(
		"parsing its own output yields the same document for intl_%s.arb",
		(code: LocaleCode) => {
			const document = parse(catalogs[code]);
			expect(parse(serialize(document))).toEqual(document);
		},
	);

	test.each(localeCodes)(
		"emits no trailing newline for intl_%s.arb, and does not invent one",
		(code: LocaleCode) => {
			expect(catalogs[code].endsWith("\n")).toBe(false);
			expect(serialize(parse(catalogs[code])).endsWith("\n")).toBe(false);
		},
	);
});

describe("catalog document fidelity", () => {
	test("keeps document globals, in order", () => {
		const document = parse(en);
		expect(document.globals).toEqual([{ name: "@@locale", value: "en" }]);
	});

	test("leaves a global where it sits rather than hoisting it to the top", () => {
		// Nothing obliges an ARB global to lead, and moving one is silent data
		// movement. Every Brickit catalog happens to put @@locale first, so the
		// corpus alone would never catch this.
		const text = `{
  "alpha": "a",
  "@@last_modified": "2020-01-01",
  "beta": "b"
}`;
		expect(serialize(parse(text))).toBe(text);
	});

	test("keeps an integer-like identifier in its place", () => {
		// JavaScript orders array-index keys ahead of string keys, so reading
		// member order from the parsed object would reorder this document.
		const text = `{
  "@@locale": "en",
  "zebra": "z",
  "42": "answer",
  "alpha": "a"
}`;
		const document = parse(text);
		expect(document.messages.map((message) => message.id)).toEqual([
			"zebra",
			"42",
			"alpha",
		]);
		expect(serialize(document)).toBe(text);
	});

	test("keeps message order as the file holds it", () => {
		const document = parse(en);
		const ids = document.messages.map((message) => message.id);
		expect(ids.slice(0, 4)).toEqual([
			"aboutapp_brickit",
			"about_app_disclaimer",
			"aboutapp_insta",
			"aboutapp_license",
		]);
		expect(ids).toHaveLength(1434);
		expect(new Set(ids).size).toBe(1434);
	});

	test("preserves message identifiers exactly, with no normalization", () => {
		const text = `{
  "@@locale": "en",
  "Mixed_Case.Key-42": "value",
  "@Mixed_Case.Key-42": {}
}`;
		const document = parse(text);
		expect(document.messages[0]?.id).toBe("Mixed_Case.Key-42");
		expect(serialize(document)).toBe(text);
	});

	test("keeps an empty metadata block as an empty object", () => {
		const document = parse(en);
		const message = document.messages.find(
			(candidate) => candidate.id === "aboutapp_brickit",
		);
		expect(message?.metadata).toEqual({});
		expect(serialize(parse(en))).toContain('"@aboutapp_brickit": {}');
	});

	test("carries unknown metadata fields and placeholder attributes through untouched", () => {
		const text = `{
  "@@locale": "en",
  "greeting": "Hello {name}",
  "@greeting": {
    "description": "A greeting",
    "someFutureField": {
      "nested": [
        1,
        true,
        null
      ]
    },
    "placeholders": {
      "name": {
        "type": "String",
        "format": "compact",
        "unknownAttribute": "kept"
      }
    }
  }
}`;
		const document = parse(text);
		expect(serialize(document)).toBe(text);
	});

	test("keeps a message whose metadata is absent", () => {
		const text = `{
  "@@locale": "en",
  "bare": "no metadata here"
}`;
		const document = parse(text);
		expect(document.messages[0]?.metadata).toBeUndefined();
		expect(serialize(document)).toBe(text);
	});

	test("distinguishes an explicitly empty value from an absent message", () => {
		const text = `{
  "@@locale": "en",
  "blank": ""
}`;
		const document = parse(text);
		expect(document.messages).toHaveLength(1);
		expect(document.messages[0]?.value).toBe("");
		expect(serialize(document)).toBe(text);
	});
});

describe("catalog document escaping", () => {
	test("re-escapes an astral character as an uppercase surrogate pair", () => {
		const document = parse(en);
		const serialized = serialize(document);
		expect(en).toContain("\\uD83E\\uDD84");
		expect(serialized).toContain("\\uD83E\\uDD84");
		expect(serialized).not.toContain("\u{1F984}");
	});

	test("escapes an astral character that arrived literal", () => {
		const document = parse(`{
  "@@locale": "en",
  "unicorn": "a \u{1F984} here"
}`);
		expect(serialize(document)).toContain('"a \\uD83E\\uDD84 here"');
	});

	test("writes BMP characters literally rather than escaping them", () => {
		expect(serialize(parse(ru))).toContain("Ваш");
		const chinese = serialize(parse(zh));
		expect(chinese).toContain("工作坊");
		// The surrogate pair is the only escape of its kind in the file; no
		// Cyrillic or CJK character is ever written as \uXXXX.
		expect(chinese.match(/\\u[0-9A-Fa-f]{4}/g)).toEqual(["\\uD83E", "\\uDD84"]);
	});

	test("uppercases a lone surrogate escape rather than lowercasing it", () => {
		// JSON.stringify writes a lone surrogate as lowercase \ud83e, so a
		// serializer that post-processes its output cannot reach this case.
		const text = `{
  "@@locale": "en",
  "lone": "\\uD83E"
}`;
		expect(serialize(parse(text))).toBe(text);
	});

	test("reproduces the escape sequences the corpus actually uses", () => {
		const text = `{
  "@@locale": "en",
  "multiline": "first\\nsecond",
  "quoted": "say \\"hello\\""
}`;
		expect(serialize(parse(text))).toBe(text);
	});
});

describe("catalog document scale", () => {
	test("imposes no ceiling on message count or value length", () => {
		const messages: string[] = [];
		for (let index = 0; index < 5000; index++) {
			messages.push(`  "key_${index}": "${"x".repeat(200)}"`);
		}
		const text = `{\n  "@@locale": "en",\n${messages.join(",\n")}\n}`;
		const document = parse(text);
		expect(document.messages).toHaveLength(5000);
		expect(serialize(document)).toBe(text);
	});

	test("round-trips the largest catalog well inside a unit-test budget", () => {
		// Generous on purpose: this guards against a codec that turns
		// quadratic, not against a slow CI box. It runs in tens of
		// milliseconds when healthy.
		const started = Date.now();
		expect(serialize(parse(ru))).toBe(ru);
		expect(Date.now() - started).toBeLessThan(10_000);
	});
});

/**
 * Rejections carry the same shape as every other validation failure in this
 * package, so assert that shape once here and return the message for the
 * specifics. A rejection that is not a typed validation error fails loudly
 * rather than being read as a bare string.
 */
function rejectionOf(text: string): string {
	let thrown: unknown;
	try {
		parse(text);
	} catch (error) {
		thrown = error;
	}
	if (thrown === undefined) {
		throw new Error("Expected parse to reject, but it returned a document.");
	}
	const data = (thrown as { data?: { code?: string; message?: string } }).data;
	expect(data?.code).toBe("VALIDATION");
	expect(typeof data?.message).toBe("string");
	return data?.message as string;
}

describe("catalog document rejections", () => {
	test("refuses malformed JSON, naming where it broke", () => {
		expect(
			rejectionOf(`{
  "@@locale": "en",
  "broken": "value"
  "next": "value"
}`),
		).toContain("line 4 column 3");
	});

	test.each([
		["an empty file", "", "line 1 column 1"],
		// Whitespace alone runs out of input rather than hitting a bad
		// character, so the fault is where the text ends.
		["whitespace alone", "   \n  ", "line 2 column 3"],
		[
			"HTML uploaded by mistake",
			"<!DOCTYPE html>\n<html></html>",
			"line 1 column 1",
		],
		[
			"an unterminated string",
			'{\n  "greeting": "unclosed\n}',
			"line 3 column 2",
		],
	])("locates the fault in %s", (_label, text, expected) => {
		expect(rejectionOf(text)).toContain(expected);
	});

	test("never reads a position out of the document's own text", () => {
		// V8 echoes the start of the input into its SyntaxError message, so a
		// position scraped from that message can be the file talking about
		// itself. This input claims to be at position 12345; it is at the start.
		expect(rejectionOf("position 12345 nonsense")).toContain("line 1 column 1");
	});

	test("refuses a duplicated message identifier, naming it", () => {
		expect(
			rejectionOf(`{
  "@@locale": "en",
  "greeting": "first",
  "greeting": "second"
}`),
		).toContain("greeting");
	});

	test("refuses a duplicated metadata block", () => {
		expect(
			rejectionOf(`{
  "@@locale": "en",
  "greeting": "hello",
  "@greeting": {},
  "@greeting": { "description": "second" }
}`),
		).toContain("@greeting");
	});

	test("refuses a message value that is not a string", () => {
		expect(
			rejectionOf(`{
  "@@locale": "en",
  "count": 3
}`),
		).toContain("count");
	});

	test("refuses metadata with no matching message", () => {
		expect(
			rejectionOf(`{
  "@@locale": "en",
  "@orphan": { "description": "nothing owns this" }
}`),
		).toContain("orphan");
	});

	test("refuses metadata that is not an object", () => {
		expect(
			rejectionOf(`{
  "@@locale": "en",
  "greeting": "hello",
  "@greeting": "not an object"
}`),
		).toContain("greeting");
	});

	test("refuses a leading byte-order mark rather than stripping it", () => {
		expect(
			rejectionOf(`﻿{
  "@@locale": "en",
  "greeting": "hello"
}`),
		).toMatch(/byte[- ]order mark/i);
	});

	test("refuses a document that is not a JSON object", () => {
		expect(rejectionOf('["not", "an", "object"]')).toContain(
			"must be a JSON object",
		);
		expect(rejectionOf('"a bare string"')).toContain("must be a JSON object");
	});

	test("refuses a document whose only fault is at the very end", () => {
		// The good prefix is never handed back: a lesser parser would have
		// three valid messages in hand by the time it reaches the bad one.
		expect(
			rejectionOf(`{
  "@@locale": "en",
  "one": "1",
  "two": "2",
  "three": "3",
  "four": 4
}`),
		).toContain("four");
	});

	test.each(localeCodes)(
		"leaves intl_%s.arb unaffected",
		(code: LocaleCode) => {
			expect(() => parse(catalogs[code])).not.toThrow();
		},
	);
});

/**
 * Which lines a change added and removed, as a multiset difference — the shape
 * a reviewer sees in a pull request, which is the property these operations
 * exist to protect.
 */
function lineDelta(before: string, after: string) {
	const counts = new Map<string, number>();
	for (const line of before.split("\n")) {
		counts.set(line, (counts.get(line) ?? 0) + 1);
	}
	const added: string[] = [];
	for (const line of after.split("\n")) {
		const remaining = counts.get(line) ?? 0;
		if (remaining > 0) counts.set(line, remaining - 1);
		else added.push(line);
	}
	const removed: string[] = [];
	for (const [line, remaining] of counts) {
		for (let index = 0; index < remaining; index++) removed.push(line);
	}
	return { added, removed };
}

describe("catalog document edit operations", () => {
	test("changing one value is a one-line diff", () => {
		const before = serialize(parse(en));
		const after = serialize(
			withValue(parse(en), "aboutapp_brickit", "Brickit!"),
		);
		const delta = lineDelta(before, after);
		expect(delta.removed).toEqual(['  "aboutapp_brickit": "Brickit",']);
		expect(delta.added).toEqual(['  "aboutapp_brickit": "Brickit!",']);
	});

	test("changing five German values is a five-line diff", () => {
		// The motivating case: a translation release has to read as translation
		// work, not as a rewrite of the file it lands in.
		const document = parse(de);
		const edited = document.messages
			.slice(0, 5)
			.reduce(
				(carry, message) => withValue(carry, message.id, "neu"),
				document,
			);
		const delta = lineDelta(serialize(document), serialize(edited));
		expect(delta.added).toHaveLength(5);
		expect(delta.removed).toHaveLength(5);
	});

	test("withValue replaces rather than upserts", () => {
		expect(() => withValue(parse(en), "no_such_key", "x")).toThrow(
			"no_such_key",
		);
	});

	test("every operation leaves its input untouched", () => {
		const document = parse(en);
		const before = serialize(document);
		withValue(document, "aboutapp_brickit", "changed");
		withMessage(document, "aaa_new", "added");
		withoutMessage(document, "aboutapp_brickit");
		expect(serialize(document)).toBe(before);
	});

	test("withMessage inserts at the position catalog order implies", () => {
		const document = parse(`{
  "@@locale": "en",
  "alpha": "a",
  "charlie": "c"
}`);
		expect(serialize(withMessage(document, "bravo", "b"))).toBe(`{
  "@@locale": "en",
  "alpha": "a",
  "bravo": "b",
  "charlie": "c"
}`);
	});

	test("withMessage ignores underscores when placing, as catalog order does", () => {
		// `aboutapp_insta` sorts after `about_app_disclaimer` only once
		// underscores are ignored, which is the order the real catalogs hold.
		const document = parse(en);
		const inserted = withMessage(document, "about_app_extra", "x");
		const ids = inserted.messages.map((message) => message.id);
		expect(ids.slice(0, 4)).toEqual([
			"aboutapp_brickit",
			"about_app_disclaimer",
			"about_app_extra",
			"aboutapp_insta",
		]);
	});

	test("withMessage refuses an identifier that would not survive a round trip", () => {
		// "@name" is metadata and "@@name" a global, so either would serialize
		// into a slot parse reads differently — the message would come back as
		// a global, or the document stop parsing at all.
		const document = parse(en);
		expect(() => withMessage(document, "@aboutapp_brickit", "x")).toThrow(
			"cannot begin with",
		);
		expect(() => withMessage(document, "@@locale", "de")).toThrow(
			"cannot begin with",
		);
	});

	test("withMessage appends rather than rearranging a document not in catalog order", () => {
		const document = parse(`{
  "zebra": "z",
  "alpha": "a"
}`);
		expect(serialize(withMessage(document, "bravo", "b"))).toBe(`{
  "zebra": "z",
  "alpha": "a",
  "bravo": "b"
}`);
	});

	test("withMessage writes metadata immediately after its value", () => {
		const document = parse('{\n  "@@locale": "en"\n}');
		expect(
			serialize(withMessage(document, "greeting", "Hi", { description: "A" })),
		).toBe(`{
  "@@locale": "en",
  "greeting": "Hi",
  "@greeting": {
    "description": "A"
  }
}`);
	});

	test("withMessage inserts rather than overwriting", () => {
		expect(() => withMessage(parse(en), "aboutapp_brickit", "x")).toThrow(
			"aboutapp_brickit",
		);
	});

	test("withoutMessage removes the message and its metadata entirely", () => {
		const after = serialize(withoutMessage(parse(en), "aboutapp_brickit"));
		expect(after).not.toContain('"aboutapp_brickit"');
		expect(after).not.toContain('"@aboutapp_brickit"');
	});

	test("withoutMessage produces absence, never an empty value", () => {
		const document = parse(`{
  "@@locale": "en",
  "gone": "value",
  "kept": "value"
}`);
		expect(serialize(withoutMessage(document, "gone"))).toBe(`{
  "@@locale": "en",
  "kept": "value"
}`);
	});

	test("an emptied message stays present, a removed one does not", () => {
		// Asserted through a re-parse, not just the bytes: the two states have
		// to stay distinguishable in both directions.
		const document = parse(`{
  "@@locale": "en",
  "subject": "text"
}`);

		const emptied = parse(serialize(withValue(document, "subject", "")));
		expect(emptied.messages).toHaveLength(1);
		expect(emptied.messages[0]?.value).toBe("");

		const removed = parse(serialize(withoutMessage(document, "subject")));
		expect(removed.messages).toHaveLength(0);
	});

	test("operations compose to the same bytes as one edit set", () => {
		const document = parse(en);
		const stepwise = withoutMessage(
			withMessage(
				withValue(document, "aboutapp_brickit", "one"),
				"aaa_new",
				"two",
			),
			"about_app_disclaimer",
		);
		const direct = withValue(
			withoutMessage(
				withMessage(document, "aaa_new", "two"),
				"about_app_disclaimer",
			),
			"aboutapp_brickit",
			"one",
		);
		expect(serialize(stepwise)).toBe(serialize(direct));
	});

	test("insert order decides placement only where catalog order does not", () => {
		// Composition is order-independent in a document that is in catalog
		// order, because every insert has a computed home. In one that is not,
		// inserts append — so the sequence is the placement, and that is the
		// append rule working rather than a wobble in it.
		const ordered = parse('{\n  "alpha": "a",\n  "delta": "d"\n}');
		expect(
			serialize(
				withMessage(withMessage(ordered, "charlie", "c"), "bravo", "b"),
			),
		).toBe(
			serialize(
				withMessage(withMessage(ordered, "bravo", "b"), "charlie", "c"),
			),
		);

		const unordered = parse('{\n  "zebra": "z",\n  "alpha": "a"\n}');
		expect(
			serialize(
				withMessage(withMessage(unordered, "charlie", "c"), "bravo", "b"),
			),
		).not.toBe(
			serialize(
				withMessage(withMessage(unordered, "bravo", "b"), "charlie", "c"),
			),
		);
	});
});

describe("catalog document value diff", () => {
	const base = parse(`{
  "@@locale": "en",
  "one": "1",
  "two": "2",
  "three": "3"
}`);

	test("reports only the identifiers whose values differ", () => {
		expect(diffValues(base, withValue(base, "two", "changed"))).toEqual([
			"two",
		]);
	});

	test("ignores metadata", () => {
		const withMeta = parse(`{
  "@@locale": "en",
  "one": "1",
  "@one": { "description": "added" },
  "two": "2",
  "three": "3"
}`);
		expect(diffValues(base, withMeta)).toEqual([]);
	});

	test("ignores member order", () => {
		const reordered = parse(`{
  "@@locale": "en",
  "three": "3",
  "two": "2",
  "one": "1"
}`);
		expect(diffValues(base, reordered)).toEqual([]);
	});

	test("reports an identifier present on only one side", () => {
		expect(diffValues(base, withoutMessage(base, "two"))).toEqual(["two"]);
		expect(diffValues(base, withMessage(base, "four", "4"))).toEqual(["four"]);
	});

	test("is empty for a document against itself", () => {
		expect(diffValues(parse(en), parse(en))).toEqual([]);
	});
});

describe("round-trip failure reporting", () => {
	test("names the offending member and byte offset rather than dumping the file", () => {
		const broken = en.replace('"Brickit"', '"Brickit "');
		let message = "";
		try {
			expectByteIdentical(broken, en, "intl_en.arb");
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain("aboutapp_brickit");
		expect(message).toContain("byte ");
		expect(message.length).toBeLessThan(500);
	});
});
