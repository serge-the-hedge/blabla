import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
	TranslationReviewEditor,
	translationReviewDraftState,
} from "./translation-review-value-editor";

describe("Translation review editor", () => {
	test("uses one save decision for an exact candidate and a changed draft", () => {
		expect(
			translationReviewDraftState({
				draftValue: "Olá",
				savedValue: "Olá",
				phase: "needsReview",
				disabled: false,
				isSaving: false,
			}),
		).toMatchObject({ dirty: false, canSave: true, status: "needsReview" });
		expect(
			translationReviewDraftState({
				draftValue: "Olá!",
				savedValue: "Olá",
				phase: "needsReview",
				disabled: false,
				isSaving: false,
			}),
		).toMatchObject({ dirty: true, canSave: true, status: "unsaved" });
	});

	test("a clean saved review is quiet until it changes", () => {
		expect(
			translationReviewDraftState({
				draftValue: "Pronto",
				savedValue: "Pronto",
				phase: "saved",
				disabled: false,
				isSaving: false,
			}),
		).toEqual({ dirty: false, canSave: false, status: "saved" });
	});

	test("renders one save action and adds revert only for unsaved edits", () => {
		const render = (draftValue: string) =>
			renderToStaticMarkup(
				<TranslationReviewEditor.Provider
					state={{
						draftValue,
						savedValue: "Olá",
						phase: "needsReview",
						disabled: false,
						isSaving: false,
					}}
					actions={{ update: () => undefined, save: () => undefined }}
					meta={{
						messageId: "hello",
						localeId: "pt",
						localeCode: "pt-BR",
						sourceValue: "Hello",
					}}
				>
					<TranslationReviewEditor.Actions>
						<TranslationReviewEditor.SaveReview />
						<TranslationReviewEditor.RevertChanges />
					</TranslationReviewEditor.Actions>
				</TranslationReviewEditor.Provider>,
			);
		expect(render("Olá")).toContain("Save review");
		expect(render("Olá")).not.toContain("Revert changes");
		expect(render("Olá!")).toContain("Revert changes");
		expect(render("Olá!")).not.toContain("Accept exact");
	});
});
