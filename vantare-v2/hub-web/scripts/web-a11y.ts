import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import tokens from "../design/tokens.json";

const evidence = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/web",
);
await mkdir(evidence, { recursive: true });
const server = await preview({
  configFile: false,
  root: resolve("src/renderer"),
  build: { outDir: resolve("out/renderer") },
  preview: { host: "127.0.0.1", port: 0 },
});
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`${server.resolvedUrls?.local[0]}?escena=specimen`);
  await page.getByRole("heading", { name: "Componentes Vantare" }).waitFor();
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
  });
  const results = [];
  for (const palette of Object.keys(tokens.themes)) {
    for (const scheme of ["light", "dark"]) {
      await page.evaluate(
        ({ palette, scheme }) => {
          document.documentElement.dataset.palette = palette;
          document.documentElement.dataset.scheme = scheme;
        },
        { palette, scheme },
      );
      await page.evaluate(() => document.fonts.ready);
      const report = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      results.push({ palette, scheme, violations: report.violations });
      await writeFile(
        resolve(evidence, "axe.json"),
        JSON.stringify(results, null, 2),
      );
      assert.deepEqual(
        report.violations,
        [],
        `${palette}/${scheme}: accessibility violations`,
      );
    }
  }
  await page
    .getByRole("button", { name: "Abrir diálogo", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Esquema del diálogo" }).click();
  const light = page.getByRole("option", { name: "Claro", exact: true });
  await light.click(); // Playwright checks that the option receives the pointer above the modal.
  await expect(dialog.getByRole("combobox")).toContainText("Claro");
  await page.screenshot({ path: resolve(evidence, "dialog-select.png") });
  await page.keyboard.press("Escape");
  const slider = page.getByRole("slider", { name: "Contraste" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await slider.evaluate(
      (input) =>
        getComputedStyle(input.closest(".v-slider-thumb") ?? input)
          .outlineStyle,
    ),
    "solid",
  );
  const region = page.locator(".v-table-scroll").last();
  await region.scrollIntoViewIfNeeded();
  assert.ok((await region.locator("tbody tr").count()) < 100);
  await region.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(region.getByText("qa-999.json", { exact: true })).toBeVisible();
  assert.ok((await region.locator("tbody tr").count()) < 100);
  await page.getByRole("button", { name: "Acciones", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Guardar cambios" }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("menuitem", { name: "Guardar cambios" }),
  ).toBeFocused();
  await page.keyboard.press("End");
  const disabledItem = page.getByRole("menuitem", {
    name: "Eliminar",
    exact: true,
  });
  await expect(disabledItem).toBeFocused();
  await expect(disabledItem).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("menuitem", { name: "Guardar cambios" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Buscar comandos" }).click();
  await page.getByRole("combobox", { name: "Comandos" }).fill("Ajustes");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar aviso" }).click();
  const toast = page.locator(".v-toast");
  await expect(toast).toContainText("No se pudo guardar");
  await page.keyboard.press("F6");
  await toast.getByRole("button", { name: "Cerrar" }).click();
  await expect(toast).toHaveCount(0);
  await writeFile(
    resolve(evidence, "interactions.json"),
    JSON.stringify({
      nestedSelect: true,
      sliderKeyboardFocus: true,
      virtualTable: true,
      menuKeyboard: true,
      commandPalette: true,
      toast: true,
    }),
  );
} finally {
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : done())),
  );
}
