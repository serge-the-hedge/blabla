import { Badge } from "@blabla/ui/components/badge";

function edgeWhitespaceFact(value: string, edge: "leading" | "trailing") {
	const whitespace =
		edge === "leading"
			? /^[\t ]+/.exec(value)?.[0]
			: /[\t ]+$/.exec(value)?.[0];
	if (!whitespace) return null;

	const spaces = [...whitespace].filter(
		(character) => character === " ",
	).length;
	const tabs = whitespace.length - spaces;
	const parts = [
		spaces > 0 ? `${spaces} space${spaces === 1 ? "" : "s"}` : null,
		tabs > 0 ? `${tabs} tab${tabs === 1 ? "" : "s"}` : null,
	].filter((part): part is string => part !== null);

	return `${edge}: ${parts.join(", ")}`;
}

export function translationWhitespaceFacts(value: string) {
	const lineBreaks = value.match(/\n/g)?.length ?? 0;
	return [
		edgeWhitespaceFact(value, "leading"),
		edgeWhitespaceFact(value, "trailing"),
		lineBreaks > 0
			? `${lineBreaks} line break${lineBreaks === 1 ? "" : "s"}`
			: null,
	].filter((fact): fact is string => fact !== null);
}

/** Makes invisible, translation-significant whitespace visible during review. */
export function WhitespaceFacts({ value }: { value: string }) {
	const facts = translationWhitespaceFacts(value);
	if (facts.length === 0) return null;

	return (
		<fieldset className="mt-2 flex flex-wrap gap-1">
			<legend className="sr-only">Whitespace facts</legend>
			{facts.map((fact) => (
				<Badge key={fact} variant="outline" className="font-mono normal-case">
					{fact}
				</Badge>
			))}
		</fieldset>
	);
}
