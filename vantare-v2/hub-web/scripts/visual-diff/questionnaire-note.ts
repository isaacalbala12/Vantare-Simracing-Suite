import assert from "node:assert/strict";
import { testingQuestionnairesText as text } from "../../src/renderer/i18n/testing-questionnaires.ts";
import type { VisualScene } from "./scenes.ts";

export const questionnaireNoteScenes: Record<string, VisualScene> = {
  "testing-cuestionario-nota": {
    mock: "testing-tester-questionnaire-note",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page
        .getByRole("tab", { name: "Cuestionarios", exact: true })
        .click();
      await page.getByRole("button", { name: "Recargar", exact: true }).click();
      await page
        .getByRole("button", { name: /Cuestionario local de QA.*Respondido/ })
        .click();
      const note = page.getByRole("textbox", { name: text.note, exact: true });
      assert.equal(
        await note.inputValue(),
        "Comentario guardado anteriormente.",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "4 ✓", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await page.getByText(text.help, { exact: true }).waitFor();
      await note.blur();
    },
  },
};
