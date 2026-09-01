/**
 * This module owns the structured Message Segment interface used by Strings.
 * It deliberately keeps ICU parsing, safe span replacement, plural-arm shape,
 * and Representative Arm alignment behind plain value-in/value-out operations.
 * The Catalog Workspace remains the only persistence and validation seam.
 */

const PLURAL_ARM_SELECTORS = [
	"zero",
	"one",
	"two",
	"few",
	"many",
	"other",
] as const;

export type PluralArmSelector = (typeof PLURAL_ARM_SELECTORS)[number];

export type MessageArm = {
	selector: string;
	value: string;
	required?: true;
};

export type PluralArm = MessageArm & {
	label: string;
	/** False means this target Locale needs the arm but its saved value lacks it. */
	present?: false;
};

export type MessageSegment =
	| { kind: "text"; value: string }
	| {
			kind: "plural";
			argument: string;
			arms: readonly PluralArm[];
	  }
	| {
			kind: "select";
			argument: string;
			arms: readonly MessageArm[];
	  };

export type StructuredMessageSegments = {
	kind: "structured";
	value: string;
	template: boolean;
	segments: readonly MessageSegment[];
};

export type RawIcuMessage = {
	kind: "raw";
	value: string;
	reason: "nested" | "unsupported" | "invalid";
};

export type MessageSegments = StructuredMessageSegments | RawIcuMessage;

export type RepresentativeArmHighlight = {
	selector: string;
	start: number;
	end: number;
};

type ControlKind = "plural" | "select";

type ParsedArm = {
	selector: string;
	start: number;
	end: number;
	contentStart: number;
	contentEnd: number;
};

type ParsedArgument = {
	start: number;
	end: number;
	name: string;
	format: string | null;
	controlDepth: number;
	arms: ParsedArm[];
};

type ParsedControl = ParsedArgument & { kind: ControlKind };

type InternalSegment =
	| { kind: "text"; start: number; end: number }
	| { kind: "control"; control: ParsedControl };

type InternalStructuredMessage = {
	kind: "structured";
	value: string;
	segments: InternalSegment[];
};

type InternalRead = InternalStructuredMessage | RawIcuMessage;

class IcuSyntaxError extends Error {}

function skipWhitespace(value: string, start: number): number {
	let index = start;
	while (/\s/.test(value[index] ?? "")) index++;
	return index;
}

function readToken(value: string, start: number): [string, number] {
	let index = start;
	while (index < value.length && !/[\s,{}]/.test(value[index] ?? "")) index++;
	return [value.slice(start, index), index];
}

function consumeQuoted(value: string, start: number): number | null {
	if (value[start + 1] === "'") return start + 2;
	if (!"{}#".includes(value[start + 1] ?? "")) return start + 1;
	let index = start + 1;
	while (index < value.length) {
		if (value[index] !== "'") {
			index++;
			continue;
		}
		if (value[index + 1] === "'") {
			index += 2;
			continue;
		}
		return index + 1;
	}
	return null;
}

function isControlFormat(format: string | null): format is string {
	return (
		format === "plural" || format === "select" || format === "selectordinal"
	);
}

class IcuMessageParser {
	readonly arguments: ParsedArgument[] = [];

	constructor(private readonly value: string) {}

	parse(): ParsedArgument[] {
		const next = this.parseMessage(0, false, 0);
		if (next !== this.value.length) {
			throw new IcuSyntaxError("Unexpected trailing ICU input.");
		}
		return this.arguments;
	}

	private parseMessage(
		start: number,
		stopsAtClosingBrace: boolean,
		controlDepth: number,
	): number {
		let index = start;
		while (index < this.value.length) {
			const char = this.value[index];
			if (char === "'") {
				const next = consumeQuoted(this.value, index);
				if (next === null) {
					throw new IcuSyntaxError("An ICU apostrophe escape is not closed.");
				}
				index = next;
				continue;
			}
			if (char === "{") {
				index = this.parseArgument(index, controlDepth);
				continue;
			}
			if (char === "}") {
				if (!stopsAtClosingBrace) {
					throw new IcuSyntaxError(
						"An ICU closing brace has no opening brace.",
					);
				}
				return index + 1;
			}
			index++;
		}
		if (stopsAtClosingBrace) {
			throw new IcuSyntaxError("An ICU plural or select arm is not closed.");
		}
		return index;
	}

	private parseArgument(start: number, controlDepth: number): number {
		let index = skipWhitespace(this.value, start + 1);
		const [name, afterName] = readToken(this.value, index);
		if (name.length === 0) {
			throw new IcuSyntaxError("An ICU argument has no name.");
		}
		index = skipWhitespace(this.value, afterName);
		if (this.value[index] === "}") {
			this.arguments.push({
				start,
				end: index + 1,
				name,
				format: null,
				controlDepth,
				arms: [],
			});
			return index + 1;
		}
		if (this.value[index] !== ",") {
			throw new IcuSyntaxError("An ICU argument must end or name a format.");
		}
		index = skipWhitespace(this.value, index + 1);
		const [format, afterFormat] = readToken(this.value, index);
		if (format.length === 0) {
			throw new IcuSyntaxError("An ICU argument has no format name.");
		}
		index = skipWhitespace(this.value, afterFormat);
		const argument: ParsedArgument = {
			start,
			end: 0,
			name,
			format,
			controlDepth,
			arms: [],
		};
		this.arguments.push(argument);
		if (this.value[index] === "}") {
			argument.end = index + 1;
			return argument.end;
		}
		if (this.value[index] !== ",") {
			throw new IcuSyntaxError("An ICU format must end or include a style.");
		}
		index = skipWhitespace(this.value, index + 1);
		if (!isControlFormat(format)) {
			argument.end = this.skipStyle(index);
			return argument.end;
		}
		for (;;) {
			index = skipWhitespace(this.value, index);
			if (this.value[index] === "}") {
				argument.end = index + 1;
				return argument.end;
			}
			const selectorStart = index;
			const [selector, afterSelector] = readToken(this.value, index);
			if (selector.length === 0) {
				throw new IcuSyntaxError(
					"An ICU plural or select arm has no selector.",
				);
			}
			index = skipWhitespace(this.value, afterSelector);
			if (selector.startsWith("offset:")) continue;
			if (this.value[index] !== "{") {
				throw new IcuSyntaxError(
					"An ICU plural or select arm must contain a message.",
				);
			}
			const contentStart = index + 1;
			const next = this.parseMessage(contentStart, true, controlDepth + 1);
			argument.arms.push({
				selector,
				start: selectorStart,
				end: next,
				contentStart,
				contentEnd: next - 1,
			});
			index = next;
		}
	}

	private skipStyle(start: number): number {
		let index = start;
		let depth = 0;
		while (index < this.value.length) {
			const char = this.value[index];
			if (char === "'") {
				const next = consumeQuoted(this.value, index);
				if (next === null) {
					throw new IcuSyntaxError("An ICU apostrophe escape is not closed.");
				}
				index = next;
				continue;
			}
			if (char === "{") depth++;
			if (char === "}") {
				if (depth === 0) return index + 1;
				depth--;
			}
			index++;
		}
		throw new IcuSyntaxError("An ICU format style is not closed.");
	}
}

function controlKind(argument: ParsedArgument): ControlKind | null {
	if (argument.format === "select") return "select";
	if (argument.format === "plural" || argument.format === "selectordinal") {
		return "plural";
	}
	return null;
}

function readInternal(value: string): InternalRead {
	try {
		const arguments_ = new IcuMessageParser(value).parse();
		if (
			arguments_.some(
				(argument) =>
					argument.format !== null && !isControlFormat(argument.format),
			)
		) {
			return { kind: "raw", value, reason: "unsupported" };
		}
		const controls = arguments_
			.map((argument) => {
				const kind = controlKind(argument);
				return kind ? ({ ...argument, kind } as ParsedControl) : null;
			})
			.filter((argument): argument is ParsedControl => argument !== null);
		if (controls.some((control) => control.controlDepth > 0)) {
			return { kind: "raw", value, reason: "nested" };
		}
		const topLevelControls = controls.filter(
			(control) => control.controlDepth === 0,
		);
		const segments: InternalSegment[] = [];
		let cursor = 0;
		for (const control of topLevelControls) {
			if (cursor < control.start) {
				segments.push({ kind: "text", start: cursor, end: control.start });
			}
			segments.push({ kind: "control", control });
			cursor = control.end;
		}
		if (cursor < value.length || segments.length === 0) {
			segments.push({ kind: "text", start: cursor, end: value.length });
		}
		return { kind: "structured", value, segments };
	} catch {
		return { kind: "raw", value, reason: "invalid" };
	}
}

function normalizedPluralSelector(
	selector: string,
): PluralArmSelector | undefined {
	if (selector === "=0") return "zero";
	if (selector === "=1") return "one";
	if (selector === "=2") return "two";
	return (PLURAL_ARM_SELECTORS as readonly string[]).includes(selector)
		? (selector as PluralArmSelector)
		: undefined;
}

function pluralArmLabel(selector: string): string {
	switch (normalizedPluralSelector(selector)) {
		case "zero":
			return "= 0";
		case "one":
			return "= 1";
		case "two":
			return "= 2";
		case "few":
			return "Few";
		case "many":
			return "Many";
		case "other":
			return "Other";
		default:
			return selector;
	}
}

function targetPluralCategories(
	localeCode: string,
): readonly PluralArmSelector[] {
	try {
		const categories = new Set(
			new Intl.PluralRules(localeCode).resolvedOptions().pluralCategories,
		);
		return PLURAL_ARM_SELECTORS.filter((selector) => categories.has(selector));
	} catch {
		return ["other"];
	}
}

function messageArms(
	value: string,
	control: ParsedControl,
	localeCode: string,
): readonly MessageArm[] | readonly PluralArm[] {
	if (control.kind === "select") {
		return control.arms.map((arm) => ({
			selector: arm.selector,
			value: value.slice(arm.contentStart, arm.contentEnd),
			...(arm.selector === "other" ? { required: true as const } : {}),
		}));
	}
	const presentSelectors = new Set(
		control.arms
			.map((arm) => normalizedPluralSelector(arm.selector))
			.filter(
				(selector): selector is PluralArmSelector => selector !== undefined,
			),
	);
	const existing = control.arms.map((arm) => ({
		selector: arm.selector,
		label: pluralArmLabel(arm.selector),
		value: value.slice(arm.contentStart, arm.contentEnd),
		...(normalizedPluralSelector(arm.selector) === "other"
			? { required: true as const }
			: {}),
	}));
	const missing = targetPluralCategories(localeCode)
		.filter((selector) => !presentSelectors.has(selector))
		.map((selector) => ({
			selector,
			label: pluralArmLabel(selector),
			value: "",
			present: false as const,
		}));
	return [...existing, ...missing];
}

function toPublic(
	message: InternalStructuredMessage,
	localeCode: string,
	template: boolean,
): StructuredMessageSegments {
	return {
		kind: "structured",
		value: message.value,
		template,
		segments: message.segments.map((segment) => {
			if (segment.kind === "text") {
				return {
					kind: "text" as const,
					value: message.value.slice(segment.start, segment.end),
				};
			}
			const { control } = segment;
			if (control.kind === "plural") {
				return {
					kind: "plural" as const,
					argument: control.name,
					arms: messageArms(
						message.value,
						control,
						localeCode,
					) as readonly PluralArm[],
				};
			}
			return {
				kind: "select" as const,
				argument: control.name,
				arms: messageArms(
					message.value,
					control,
					localeCode,
				) as readonly MessageArm[],
			};
		}),
	};
}

function blankTemplate(value: string, localeCode: string): string | null {
	const source = readInternal(value);
	if (source.kind !== "structured") return null;
	const controls = source.segments.flatMap((segment) =>
		segment.kind === "control" ? [segment.control] : [],
	);
	if (controls.length === 0) return null;
	return controls
		.map((control) => {
			if (control.kind === "select") {
				return `{${control.name}, ${control.format}, ${control.arms
					.map((arm) => `${arm.selector}{}`)
					.join(" ")}}`;
			}
			const selectors = [
				...control.arms.map(
					(arm) => normalizedPluralSelector(arm.selector) ?? arm.selector,
				),
				...targetPluralCategories(localeCode),
			];
			const uniqueSelectors = Array.from(new Set(selectors));
			return `{${control.name}, ${control.format}, ${uniqueSelectors
				.map((selector) => `${selector}{}`)
				.join(" ")}}`;
		})
		.join("");
}

/** Read a Locale value as ordered Message Segments. Nested, unsupported, or
 * invalid ICU keeps its exact value in raw mode. An empty target can borrow
 * only a blank arm scaffold from its source; it never copies source wording. */
export function readMessageSegments(input: {
	value: string;
	localeCode: string;
	sourceValue?: string;
}): MessageSegments {
	if (input.value.length === 0 && input.sourceValue !== undefined) {
		const templateValue = blankTemplate(input.sourceValue, input.localeCode);
		if (templateValue !== null) {
			const template = readInternal(templateValue);
			if (template.kind === "structured") {
				return toPublic(template, input.localeCode, true);
			}
		}
	}
	const message = readInternal(input.value);
	return message.kind === "structured"
		? toPublic(message, input.localeCode, false)
		: message;
}

function structuredForWrite(value: string): InternalStructuredMessage {
	const message = readInternal(value);
	if (message.kind !== "structured") {
		throw new Error("This ICU value can only be changed in raw mode.");
	}
	return message;
}

function segmentAt(
	value: string,
	segmentIndex: number,
): InternalSegment | undefined {
	return structuredForWrite(value).segments[segmentIndex];
}

function controlAt(value: string, segmentIndex: number): ParsedControl {
	const segment = segmentAt(value, segmentIndex);
	if (segment?.kind !== "control") {
		throw new Error("The requested Message Segment is not an ICU block.");
	}
	return segment.control;
}

function replaceRange(
	value: string,
	start: number,
	end: number,
	replacement: string,
): string {
	return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

/** Replace one literal Message Segment without rebuilding surrounding ICU. */
export function writeTextSegment(input: {
	value: string;
	segmentIndex: number;
	text: string;
}): string {
	const segment = segmentAt(input.value, input.segmentIndex);
	if (segment?.kind !== "text") {
		throw new Error("The requested Message Segment is not literal text.");
	}
	return replaceRange(input.value, segment.start, segment.end, input.text);
}

function armFor(
	control: ParsedControl,
	selector: string,
): ParsedArm | undefined {
	return control.arms.find((arm) => arm.selector === selector);
}

/** Add one of Flutter's six supported plural arms. Existing aliases (`=0`,
 * `=1`, `=2`) count as their corresponding arm and are never duplicated. */
export function addPluralArm(input: {
	value: string;
	segmentIndex: number;
	selector: PluralArmSelector;
	armValue?: string;
}): string {
	const control = controlAt(input.value, input.segmentIndex);
	if (control.kind !== "plural") {
		throw new Error("Only plural Message Segments can add an arm.");
	}
	if (
		control.arms.some(
			(arm) => normalizedPluralSelector(arm.selector) === input.selector,
		)
	) {
		return input.value;
	}
	const separator = control.arms.length === 0 ? "" : " ";
	return replaceRange(
		input.value,
		control.end - 1,
		control.end - 1,
		`${separator}${input.selector}{${input.armValue ?? ""}}`,
	);
}

/** Update one existing arm. A missing target-language plural arm is materialized
 * only when its author writes it. */
export function writeMessageArm(input: {
	value: string;
	segmentIndex: number;
	selector: string;
	armValue: string;
}): string {
	const control = controlAt(input.value, input.segmentIndex);
	const arm = armFor(control, input.selector);
	if (arm) {
		return replaceRange(
			input.value,
			arm.contentStart,
			arm.contentEnd,
			input.armValue,
		);
	}
	const selector = normalizedPluralSelector(input.selector);
	if (control.kind === "plural" && selector) {
		return addPluralArm({
			value: input.value,
			segmentIndex: input.segmentIndex,
			selector,
			armValue: input.armValue,
		});
	}
	throw new Error("The requested ICU arm is not available.");
}

function armRemovalRange(
	value: string,
	control: ParsedControl,
	arm: ParsedArm,
) {
	let start = arm.start;
	let end = arm.end;
	while (start > control.start + 1 && /\s/.test(value[start - 1] ?? "")) {
		start--;
	}
	if (start === arm.start) {
		while (end < control.end - 1 && /\s/.test(value[end] ?? "")) end++;
	}
	return { start, end };
}

/** Remove one non-`other` arm while preserving the rest of the ICU block. */
export function removeMessageArm(input: {
	value: string;
	segmentIndex: number;
	selector: string;
}): string {
	const control = controlAt(input.value, input.segmentIndex);
	if (
		normalizedPluralSelector(input.selector) === "other" ||
		input.selector === "other"
	) {
		throw new Error("The required other arm cannot be removed.");
	}
	const arm = armFor(control, input.selector);
	if (!arm) return input.value;
	const range = armRemovalRange(input.value, control, arm);
	return replaceRange(input.value, range.start, range.end, "");
}

export function removePluralArm(input: {
	value: string;
	segmentIndex: number;
	selector: string;
}): string {
	const control = controlAt(input.value, input.segmentIndex);
	if (control.kind !== "plural") {
		throw new Error("Only plural Message Segments can remove an arm.");
	}
	return removeMessageArm(input);
}

/** Return the closed add-arm menu for one plural block. */
export function availablePluralArms(input: {
	value: string;
	segmentIndex: number;
}): readonly PluralArmSelector[] {
	const control = controlAt(input.value, input.segmentIndex);
	if (control.kind !== "plural") return [];
	const present = new Set(
		control.arms
			.map((arm) => normalizedPluralSelector(arm.selector))
			.filter(
				(selector): selector is PluralArmSelector => selector !== undefined,
			),
	);
	return PLURAL_ARM_SELECTORS.filter((selector) => !present.has(selector));
}

type CharacterPair = { reference: number; target: number };

const MAX_ALIGNMENT_MATRIX_CELLS = 262_144;

function conservativeCharacterPairs(
	reference: string,
	target: string,
): CharacterPair[] {
	const prefix: CharacterPair[] = [];
	let referenceIndex = 0;
	let targetIndex = 0;
	while (
		referenceIndex < reference.length &&
		targetIndex < target.length &&
		reference[referenceIndex] === target[targetIndex]
	) {
		prefix.push({ reference: referenceIndex, target: targetIndex });
		referenceIndex++;
		targetIndex++;
	}
	const suffix: CharacterPair[] = [];
	let referenceEnd = reference.length - 1;
	let targetEnd = target.length - 1;
	while (
		referenceEnd >= referenceIndex &&
		targetEnd >= targetIndex &&
		reference[referenceEnd] === target[targetEnd]
	) {
		suffix.push({ reference: referenceEnd, target: targetEnd });
		referenceEnd--;
		targetEnd--;
	}
	return [...prefix, ...suffix.reverse()];
}

/** A bounded LCS gives character-level anchors for normal message sizes. Long
 * values retain only common prefix/suffix anchors rather than risking an
 * unbounded interactive matrix. */
function alignedCharacterPairs(
	reference: string,
	target: string,
): CharacterPair[] {
	if (reference.length * target.length > MAX_ALIGNMENT_MATRIX_CELLS) {
		return conservativeCharacterPairs(reference, target);
	}
	const rows = Array.from(
		{ length: reference.length + 1 },
		() => new Uint16Array(target.length + 1),
	);
	for (
		let referenceIndex = reference.length - 1;
		referenceIndex >= 0;
		referenceIndex--
	) {
		const row = rows[referenceIndex];
		if (!row) continue;
		for (let targetIndex = target.length - 1; targetIndex >= 0; targetIndex--) {
			row[targetIndex] =
				reference[referenceIndex] === target[targetIndex]
					? 1 + (rows[referenceIndex + 1]?.[targetIndex + 1] ?? 0)
					: Math.max(
							rows[referenceIndex + 1]?.[targetIndex] ?? 0,
							rows[referenceIndex]?.[targetIndex + 1] ?? 0,
						);
		}
	}
	const pairs: CharacterPair[] = [];
	let referenceIndex = 0;
	let targetIndex = 0;
	while (referenceIndex < reference.length && targetIndex < target.length) {
		if (reference[referenceIndex] === target[targetIndex]) {
			pairs.push({ reference: referenceIndex, target: targetIndex });
			referenceIndex++;
			targetIndex++;
			continue;
		}
		const skipReference = rows[referenceIndex + 1]?.[targetIndex] ?? 0;
		const skipTarget = rows[referenceIndex]?.[targetIndex + 1] ?? 0;
		if (skipReference >= skipTarget) referenceIndex++;
		else targetIndex++;
	}
	return pairs;
}

function mappedRange(
	reference: string,
	target: string,
	start: number,
	end: number,
): { start: number; end: number } {
	const pairs = alignedCharacterPairs(reference, target);
	const left = [...pairs].reverse().find((pair) => pair.reference < start);
	const right = pairs.find((pair) => pair.reference >= end);
	if (start === end) {
		const edge = right?.target ?? target.length;
		return { start: edge, end: edge };
	}
	const mappedStart = left ? left.target + 1 : 0;
	const mappedEnd = right?.target ?? target.length;
	return {
		start: Math.min(mappedStart, mappedEnd),
		end: Math.max(mappedStart, mappedEnd),
	};
}

function changedRange(
	previous: string,
	next: string,
): {
	start: number;
	end: number;
	replacement: string;
} {
	let start = 0;
	while (
		start < previous.length &&
		start < next.length &&
		previous[start] === next[start]
	) {
		start++;
	}
	let previousEnd = previous.length;
	let nextEnd = next.length;
	while (
		previousEnd > start &&
		nextEnd > start &&
		previous[previousEnd - 1] === next[nextEnd - 1]
	) {
		previousEnd--;
		nextEnd--;
	}
	return { start, end: previousEnd, replacement: next.slice(start, nextEnd) };
}

function pluralRepresentative(
	value: string,
	segmentIndex: number,
): {
	control: ParsedControl;
	other: ParsedArm;
} {
	const control = controlAt(value, segmentIndex);
	if (control.kind !== "plural") {
		throw new Error("Only plural Message Segments have a Representative Arm.");
	}
	const other = control.arms.find(
		(arm) => normalizedPluralSelector(arm.selector) === "other",
	);
	if (!other) throw new Error("A Representative Arm requires other.");
	return { control, other };
}

/** Read the mirror-layer ranges for the current Representative Arm selection. */
export function representativeArmHighlights(input: {
	value: string;
	segmentIndex: number;
	selectionStart: number;
	selectionEnd: number;
}): readonly RepresentativeArmHighlight[] {
	const { control, other } = pluralRepresentative(
		input.value,
		input.segmentIndex,
	);
	const representative = input.value.slice(
		other.contentStart,
		other.contentEnd,
	);
	return control.arms.map((arm) => {
		const value = input.value.slice(arm.contentStart, arm.contentEnd);
		const range =
			arm === other
				? { start: input.selectionStart, end: input.selectionEnd }
				: mappedRange(
						representative,
						value,
						input.selectionStart,
						input.selectionEnd,
					);
		return { selector: arm.selector, ...range };
	});
}

/** Apply the Representative Arm's text change to every arm using its
 * character-level mapping. The returned ranges describe the visible effect in
 * each arm before the caller persists the draft. */
export function writePluralRepresentativeArm(input: {
	value: string;
	segmentIndex: number;
	valueForRepresentativeArm: string;
}): { value: string; highlights: readonly RepresentativeArmHighlight[] } {
	const { control, other } = pluralRepresentative(
		input.value,
		input.segmentIndex,
	);
	const representative = input.value.slice(
		other.contentStart,
		other.contentEnd,
	);
	const change = changedRange(representative, input.valueForRepresentativeArm);
	const replacements = control.arms.map((arm) => {
		const armValue = input.value.slice(arm.contentStart, arm.contentEnd);
		const range =
			arm === other
				? { start: change.start, end: change.end }
				: mappedRange(representative, armValue, change.start, change.end);
		return {
			arm,
			value: `${armValue.slice(0, range.start)}${change.replacement}${armValue.slice(range.end)}`,
			highlight: {
				selector: arm.selector,
				start: range.start,
				end: range.start + change.replacement.length,
			},
		};
	});
	const value = [...replacements]
		.sort((left, right) => right.arm.contentStart - left.arm.contentStart)
		.reduce(
			(current, replacement) =>
				replaceRange(
					current,
					replacement.arm.contentStart,
					replacement.arm.contentEnd,
					replacement.value,
				),
			input.value,
		);
	return {
		value,
		highlights: replacements.map((replacement) => replacement.highlight),
	};
}
