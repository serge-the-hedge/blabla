/** Keep the product command short after release while making the exact same
 * workflow runnable from an unpublished local checkout. */
export const blablaCommandPrefix = import.meta.env.DEV
	? "bun run blabla --"
	: "blabla";

export function blablaCommand(argumentsText: string) {
	return `${blablaCommandPrefix} ${argumentsText}`;
}
