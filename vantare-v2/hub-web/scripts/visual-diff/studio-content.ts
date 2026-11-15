import assert from "node:assert/strict";
import { studioText } from "../../src/renderer/i18n/studio.ts";
import { until } from "../wait-for.ts";
import type { VisualScene } from "./scenes.ts";
import { studioScenes } from "./studio.ts";

export const studioContentScenes: Record<string, VisualScene> = {};
for (const [id, session] of [
  ["studio-contenido-carrera", "Carrera"],
  ["studio-contenido-practica", "Práctica"],
] as const) {
  studioContentScenes[id] = {
    mock: "studio-base",
    async prepare(page) {
      await studioScenes["studio-base"].prepare(page);
      await page.getByRole("tab", { name: "Contenido", exact: true }).click();
      const tab = page.getByRole("tab", { name: session, exact: true });
      await tab.click();
      assert.equal(await tab.getAttribute("aria-selected"), "true");
      assert.equal(
        await page
          .getByRole("switch", { name: "Piloto", exact: true })
          .isDisabled(),
        true,
      );
      await page
        .getByRole("combobox", { name: "Formato de columna", exact: true })
        .waitFor();
    },
  };
}

studioContentScenes["studio-contenido-filas"] = {
  mock: "studio-base",
  async prepare(page) {
    await studioContentScenes["studio-contenido-carrera"].prepare(page);
    const rows = page.getByRole("textbox", { name: "Filas", exact: true });
    await rows.scrollIntoViewIfNeeded();
    await rows.fill("8");
    await rows.press("Enter");
    await until(
      async () =>
        (await rows.inputValue()) === "8" &&
        (await page.locator(".v-step-save").textContent()) ===
          studioText.autoSaved &&
        (await page.locator(".v-step-save").getAttribute("data-failed")) ===
          "false",
      10000,
      "confirmed Studio row count save",
    );
    await rows.scrollIntoViewIfNeeded();
  },
};
