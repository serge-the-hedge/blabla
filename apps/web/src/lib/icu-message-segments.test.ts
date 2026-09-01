import { describe, expect, test } from "bun:test";

import {
	addPluralArm,
	readMessageSegments,
	removePluralArm,
	writePluralRepresentativeArm,
	writeTextSegment,
} from "./icu-message-segments";

describe("Message Segments", () => {
	test("keeps every top-level plural and select block in reading order", () => {
		const message = readMessageSegments({
			localeCode: "de",
			value:
				"Hello {name}. {count, plural, one{One task} other{{count} tasks}} {gender, select, male{His} other{Their}} list.",
		});

		expect(message).toMatchObject({ kind: "structured" });
		if (message.kind !== "structured") return;
		expect(message.segments).toEqual([
			{ kind: "text", value: "Hello {name}. " },
			{
				kind: "plural",
				argument: "count",
				arms: [
					{ selector: "one", label: "= 1", value: "One task" },
					{
						selector: "other",
						label: "Other",
						value: "{count} tasks",
						required: true,
					},
				],
			},
			{ kind: "text", value: " " },
			{
				kind: "select",
				argument: "gender",
				arms: [
					{ selector: "male", value: "His" },
					{ selector: "other", value: "Their", required: true },
				],
			},
			{ kind: "text", value: " list." },
		]);
	});

	test("shows exact-number cases and missing target-language plural arms", () => {
		const message = readMessageSegments({
			localeCode: "ru",
			value:
				"{count, plural, zero{Nothing} one{One item} other{{count} items}}",
		});

		expect(message).toMatchObject({ kind: "structured" });
		if (message.kind !== "structured") return;
		const plural = message.segments[0];
		expect(plural).toMatchObject({ kind: "plural" });
		if (plural?.kind !== "plural") return;
		expect(plural.arms).toEqual([
			{ selector: "zero", label: "= 0", value: "Nothing" },
			{ selector: "one", label: "= 1", value: "One item" },
			{
				selector: "other",
				label: "Other",
				value: "{count} items",
				required: true,
			},
			{ selector: "few", label: "Few", value: "", present: false },
			{ selector: "many", label: "Many", value: "", present: false },
		]);
	});

	test("edits the Representative Arm across every arm without losing endings", () => {
		const changed = writePluralRepresentativeArm({
			value: "{count, plural, one{Open setting} other{Open settings}}",
			segmentIndex: 0,
			valueForRepresentativeArm: "Show settings",
		});

		expect(changed.value).toBe(
			"{count, plural, one{Show setting} other{Show settings}}",
		);
		expect(changed.highlights).toEqual([
			{ selector: "one", start: 0, end: 4 },
			{ selector: "other", start: 0, end: 4 },
		]);
	});

	test("changes literal text without reserializing its surrounding ICU", () => {
		expect(
			writeTextSegment({
				value:
					"Before {count, plural, one{One item} other{{count} items}} after",
				segmentIndex: 0,
				text: "Nach ",
			}),
		).toBe("Nach {count, plural, one{One item} other{{count} items}} after");
	});

	test("adds only supported plural arms and never removes other", () => {
		const value = "{count, plural, one{One} other{Many}}";
		expect(
			addPluralArm({
				value,
				segmentIndex: 0,
				selector: "few",
				armValue: "A few",
			}),
		).toBe("{count, plural, one{One} other{Many} few{A few}}");
		expect(() =>
			removePluralArm({ value, segmentIndex: 0, selector: "other" }),
		).toThrow("other");
	});

	test("builds blank target arms from the source and lets a target drop the block", () => {
		const source =
			"{count, plural, =0{No items} one{One item} other{{count} items}}";
		const emptyTarget = readMessageSegments({
			localeCode: "ru",
			value: "",
			sourceValue: source,
		});
		expect(emptyTarget).toMatchObject({ kind: "structured", template: true });
		if (emptyTarget.kind !== "structured") return;
		const plural = emptyTarget.segments[0];
		expect(plural).toMatchObject({ kind: "plural" });
		if (plural?.kind !== "plural") return;
		expect(plural.arms.map((arm) => arm.selector)).toEqual([
			"zero",
			"one",
			"other",
			"few",
			"many",
		]);

		const plainTarget = readMessageSegments({
			localeCode: "zh",
			value: "项目",
			sourceValue: source,
		});
		expect(plainTarget).toEqual({
			kind: "structured",
			value: "项目",
			template: false,
			segments: [{ kind: "text", value: "项目" }],
		});
	});

	test("uses raw ICU for nested, unsupported, or malformed input", () => {
		expect(
			readMessageSegments({
				localeCode: "de",
				value:
					"{count, plural, one{{gender, select, male{He} other{They}}} other{Many}}",
			}),
		).toMatchObject({ kind: "raw", reason: "nested" });
		expect(
			readMessageSegments({
				localeCode: "de",
				value: "Updated {date, date, short}",
			}),
		).toMatchObject({ kind: "raw", reason: "unsupported" });
		expect(
			readMessageSegments({
				localeCode: "de",
				value:
					"{count, plural, one{{price, number} item} other{{price, number} items}}",
			}),
		).toMatchObject({ kind: "raw", reason: "unsupported" });
		expect(
			readMessageSegments({ localeCode: "de", value: "{count, plural" }),
		).toMatchObject({ kind: "raw", reason: "invalid" });
	});
});
