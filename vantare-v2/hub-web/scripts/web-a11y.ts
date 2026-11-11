import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Locator } from "playwright-core";
import { checkAccessGate } from "./check-access-gate.ts";
import { checkAccount } from "./check-account.ts";
import { checkNativeAccessLayer } from "./check-native-access-layer.ts";
import {
  checkOnboarding,
  checkOnboardingGuardedExit,
} from "./check-onboarding.ts";
import { checkPrivacyGate } from "./check-privacy-gate.ts";
import { until } from "./wait-for";

async function focused(locator: Locator) {
  await until(
    () => locator.evaluate((node) => document.activeElement === node),
    5000,
    "keyboard focus",
  );
}

import tokens from "../design/tokens.json";
import { webQaPreview } from "./web-qa";

const evidence = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/web",
);
await mkdir(evidence, { recursive: true });
const server = await webQaPreview();
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
  await checkNativeAccessLayer(page);
  await dialog.getByRole("combobox", { name: "Esquema del diálogo" }).click();
  const light = page.getByRole("option", { name: "Claro", exact: true });
  await light.click(); // Playwright checks that the option receives the pointer above the modal.
  await until(
    async () =>
      (await dialog.getByRole("combobox").textContent())?.includes("Claro") ??
      false,
    5000,
    "confirmed content",
  );
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
  await region
    .getByText("qa-999.json", { exact: true })
    .waitFor({ state: "visible" });
  assert.ok((await region.locator("tbody tr").count()) < 100);
  await page.getByRole("button", { name: "Acciones", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await focused(page.getByRole("menuitem", { name: "Guardar cambios" }));
  await page.keyboard.press("Home");
  await focused(page.getByRole("menuitem", { name: "Guardar cambios" }));
  await page.keyboard.press("End");
  const disabledItem = page.getByRole("menuitem", {
    name: "Eliminar",
    exact: true,
  });
  await focused(disabledItem);
  assert.equal(await disabledItem.getAttribute("aria-disabled"), "true");
  await page.keyboard.press("Enter");
  await page.getByRole("menu").waitFor({ state: "visible" });
  await page.keyboard.press("Home");
  await focused(page.getByRole("menuitem", { name: "Guardar cambios" }));
  await page.keyboard.press("Enter");
  await until(
    async () => (await page.getByRole("menu").count()) === 0,
    5000,
    "element removed",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Buscar comandos" }).click();
  await page.getByRole("combobox", { name: "Comandos" }).fill("Ajustes");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await until(
    async () => (await page.getByRole("dialog").count()) === 0,
    5000,
    "element removed",
  );
  await page.getByRole("button", { name: "Mostrar aviso" }).click();
  const toast = page.locator(".v-toast");
  await until(
    async () =>
      (await toast.textContent())?.includes("No se pudo guardar") ?? false,
    5000,
    "confirmed content",
  );
  await page.keyboard.press("F6");
  await toast.getByRole("button", { name: "Cerrar" }).click();
  await until(async () => (await toast.count()) === 0, 5000, "element removed");
  await checkPrivacyGate(page, server.resolvedUrls?.local[0] ?? "", evidence);
  await checkAccessGate(page, server.resolvedUrls?.local[0] ?? "", evidence);
  await checkAccount(page, server.resolvedUrls?.local[0] ?? "", evidence);
  await checkOnboarding(page, server.resolvedUrls?.local[0] ?? "", evidence);
  for (const mode of ["private", "protected"] as const)
    await checkOnboardingGuardedExit(
      page,
      server.resolvedUrls?.local[0] ?? "",
      evidence,
      mode,
    );
  await writeFile(
    resolve(evidence, "interactions.json"),
    JSON.stringify({
      nestedSelect: true,
      sliderKeyboardFocus: true,
      virtualTable: true,
      menuKeyboard: true,
      commandPalette: true,
      toast: true,
      privacyGate: true,
      accessGate: true,
      onboarding: true,
    }),
  );
} finally {
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : done())),
  );
}
