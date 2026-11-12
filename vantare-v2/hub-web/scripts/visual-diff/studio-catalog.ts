import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { until } from "../wait-for.ts";
import type { VisualScene } from "./scenes.ts";

async function studioDelta(page: Page, expanded: boolean) {
  await page
    .getByRole("button", { name: /^(Studio|Overlays Studio)$/, exact: true })
    .click();
  await page.getByRole("button", { name: /^Delta,/ }).click();
  await page.getByRole("heading", { name: "Delta", exact: true }).waitFor();
  const sidebar = page.locator(".v-sidebar");
  if (
    (await sidebar.evaluate((node) =>
      node.classList.contains("v-sidebar--collapsed"),
    )) === expanded
  )
    await page.keyboard.press("Control+b");
  await until(
    async () => (await sidebar.boundingBox())?.width === (expanded ? 272 : 76),
    5000,
    "sidebar before opening a modal",
  );
}

export const studioCatalogScenes: Record<string, VisualScene> = {};
for (const expanded of [false, true]) {
  const suffix = expanded ? "-abierto" : "";
  studioCatalogScenes[`studio-a-catalogo${suffix}`] = {
    mock: "studio-base",
    async prepare(page) {
      await studioDelta(page, expanded);
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
      await until(
        () =>
          dialog
            .getByRole("searchbox", { name: "Buscar widget", exact: true })
            .evaluate((node) => node === document.activeElement),
        5000,
        "catalogue search focus",
      );
    },
  };
  studioCatalogScenes[`studio-a-menu${suffix}`] = {
    mock: "studio-base",
    async prepare(page) {
      await studioDelta(page, expanded);
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
  };
}
