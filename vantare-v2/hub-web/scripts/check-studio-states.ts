import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import { studioText as t } from "../src/renderer/i18n/studio";
import { until } from "./wait-for";

export async function checkStudioStates(
  parent: Page,
  base: string,
  evidence: string,
) {
  const page = await parent.context().newPage();
  const compact = [];
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const theme of ["dark", "light"]) {
      await page.goto(`${base}?escena=visual-${theme}:studio-a-vacio`);
      await page
        .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
        .click();
      await page
        .getByRole("heading", { name: t.emptyTitle, exact: true })
        .waitFor();
      const nav = page.locator(".v-sidebar");
      if (
        await nav.evaluate((node) =>
          node.classList.contains("v-sidebar--collapsed"),
        )
      )
        await page.keyboard.press("Control+b");
      const strip = page.locator(".v-focus-strip");
      await until(
        async () => (await strip.boundingBox())?.width === 72,
        5000,
        "compact Studio strip",
      );
      const label = strip.locator(".v-focus-add .v-button-label > span");
      assert.equal(
        await label.evaluate((node) => getComputedStyle(node).display),
        "none",
      );
      const add = strip.getByRole("button", { name: t.add, exact: true });
      await add.click();
      await page
        .getByRole("dialog", { name: t.catalog, exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await until(
        () => add.evaluate((node) => node === document.activeElement),
        5000,
        "compact Add focus return",
      );
      compact.push({
        theme,
        viewport: [1280, 720],
        strip: 72,
        labelHiddenByCss: true,
        accessibleAddWorks: true,
      });
    }
    for (const scene of [
      "studio-a-ilegible",
      "studio-a-recargar",
      "studio-a-fallo-lectura",
    ]) {
      await page.goto(`${base}?escena=${scene}`);
      await page
        .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
        .click();
      await page.getByRole("alert").waitFor();
      if (scene === "studio-a-fallo-lectura")
        assert.equal(
          await page.locator('.v-studio-focus [aria-busy="true"]').count(),
          0,
        );
      await page.getByRole("button", { name: t.reload, exact: true }).click();
      const target =
        scene === "studio-a-ilegible"
          ? page.locator(".v-studio-list")
          : page.getByRole("button", { name: /^Standings, / });
      await until(
        () => target.evaluate((node) => node === document.activeElement),
        5000,
        `reload focus ${scene}`,
      );
    }
    await writeFile(
      resolve(evidence, "studio-states.json"),
      JSON.stringify(
        { compact, reloadFocus: true, initialReadRecovery: true },
        null,
        2,
      ),
    );
  } finally {
    await page.close();
  }
}
