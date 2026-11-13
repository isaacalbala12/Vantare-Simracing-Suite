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
      const search = dialog.getByRole("searchbox", {
        name: "Buscar widget",
        exact: true,
      });
      assert.equal(await search.getAttribute("placeholder"), "Buscar widget");
      const field = await search.boundingBox();
      const icon = await dialog
        .locator(".v-studio-catalog-search > svg")
        .boundingBox();
      assert.ok(
        field &&
          icon &&
          field.height >= 38 &&
          icon.x >= field.x &&
          icon.x + icon.width < field.x + 38,
        "Search icon stays left of the placeholder in the full-height field",
      );
      const keys = dialog.locator(".v-studio-catalog-keys");
      assert.equal(
        await keys.evaluate((node) => getComputedStyle(node).whiteSpace),
        "nowrap",
      );
      assert.ok(
        await keys.evaluate((node) => node.scrollWidth <= node.clientWidth),
        "Keyboard footer fits on one line",
      );
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
      await page.keyboard.press("End");
      const popup = await menu.boundingBox();
      const actions = await page.locator(".v-focus-actions").boundingBox();
      assert.ok(
        popup &&
          actions &&
          Math.abs(popup.x + popup.width - actions.x - actions.width) <= 2,
        "More aligns with the header actions edge",
      );
    },
  };
}
