import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import type { VisualScene } from "./scenes.ts";

async function studioDelta(page: Page) {
  await page
    .getByRole("button", { name: /^(Studio|Overlays Studio)$/, exact: true })
    .click();
  await page.getByRole("button", { name: /^Delta,/ }).click();
  await page.getByRole("heading", { name: "Delta", exact: true }).waitFor();
  const sidebar = page.locator(".v-sidebar");
  if (
    !(await sidebar.evaluate((node) =>
      node.classList.contains("v-sidebar--collapsed"),
    ))
  )
    await page.keyboard.press("Control+b");
}

export const studioCatalogScenes: Record<string, VisualScene> = {
  "studio-a-catalogo": {
    mock: "studio-base",
    async prepare(page) {
      await studioDelta(page);
      await page
        .getByRole("button", { name: "Añadir widget", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Añadir widget",
        exact: true,
      });
      await dialog.waitFor();
      await dialog
        .getByRole("button", { name: "Añadir Delta", exact: true })
        .waitFor();
      assert.ok(
        await dialog
          .getByRole("searchbox", { name: "Buscar widget", exact: true })
          .evaluate((node) => node === document.activeElement),
      );
    },
  },
  "studio-a-menu": {
    mock: "studio-base",
    async prepare(page) {
      await studioDelta(page);
      await page
        .getByRole("button", { name: "Más acciones", exact: true })
        .click();
      const menu = page.getByRole("menu");
      await menu.waitFor();
      assert.equal(
        await menu
          .getByRole("menuitem", { name: /^Publicar en OBS/ })
          .getAttribute("aria-disabled"),
        "true",
      );
      await menu.getByRole("menuitem", { name: /^Eliminar Delta/ }).waitFor();
    },
  },
};
