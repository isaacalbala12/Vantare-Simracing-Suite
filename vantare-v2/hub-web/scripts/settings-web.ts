import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";
import { until } from "./wait-for.ts";
import { webQaPreview } from "./web-qa";

const evidence = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/settings",
);
await mkdir(evidence, { recursive: true });
const server = await webQaPreview();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function open(scene: string) {
    await page.goto(`${server.resolvedUrls?.local[0]}?escena=${scene}`);
    await page
      .getByRole("switch", { name: "Empezar minimizado", exact: true })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  await open("ajustes-base");
  const minimized = page.getByRole("switch", {
    name: "Empezar minimizado",
    exact: true,
  });
  await minimized.click();
  await until(
    async () => (await minimized.getAttribute("aria-checked")) === "true",
    5000,
    "confirmed minimized setting",
  );
  await page.getByRole("heading", { name: "General", exact: true }).focus();
  await page.keyboard.press("Control+=");
  await until(
    async () =>
      (
        await page
          .getByRole("button", { name: "Restablecer tamaño de la interfaz" })
          .textContent()
      )?.includes("110") ?? false,
    5000,
    "zoom confirmation",
  );
  await page
    .getByRole("button", { name: "Restablecer tamaño de la interfaz" })
    .click();
  await until(
    async () =>
      (await page.evaluate(() => document.documentElement.style.zoom)) === "1",
    5000,
    "zoom reset",
  );
  await page.keyboard.press("Control+Alt+b");
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Buscar o ejecutar un comando" })
    .fill("Cambiar tema");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await until(
    async () =>
      (await page.evaluate(() => document.documentElement.dataset.scheme)) ===
      "light",
    5000,
    "command works with rail collapsed",
  );
  await page.keyboard.press("Control+Alt+b");
  const reports = [];
  for (const scheme of ["light", "dark"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.scheme)) !==
      scheme
    )
      await page
        .getByRole("button", {
          name: "Cambiar tema claro u oscuro",
          exact: true,
        })
        .click();
    await until(
      async () =>
        (await page.evaluate(() => document.documentElement.dataset.scheme)) ===
        scheme,
      5000,
      "scheme confirmed",
    );
    await page.evaluate(() => document.fonts.ready);
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    reports.push({ screen: "general", scheme, violations: report.violations });
    await page.screenshot({ path: resolve(evidence, `general-${scheme}.png`) });
    assert.deepEqual(report.violations, [], `General/${scheme}`);
  }
  await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
  await page.getByRole("radio", { name: "Iris", exact: true }).click();
  await until(
    async () =>
      (await page.evaluate(() => document.documentElement.dataset.palette)) ===
      "iris",
    5000,
    "palette confirmation",
  );
  await page.getByRole("radio", { name: "Claro", exact: true }).click();
  await until(
    async () =>
      (await page.evaluate(() => document.documentElement.dataset.scheme)) ===
      "light",
    5000,
    "light confirmation",
  );
  const slider = page.getByRole("slider", { name: "Contraste", exact: true });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await until(
    async () => (await slider.getAttribute("aria-valuenow")) === "101",
    5000,
    "slider commit",
  );
  await page
    .getByRole("group", { name: "Fuente de interfaz", exact: true })
    .getByRole("button", { name: "Arial", exact: true })
    .click();
  await until(
    async () =>
      await page.evaluate(() =>
        document.documentElement.style
          .getPropertyValue("--font-sans")
          .startsWith("Arial"),
      ),
    5000,
    "font confirmation",
  );
  await page.screenshot({ path: resolve(evidence, "appearance-light.png") });
  const appearance = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  reports.push({
    screen: "appearance",
    scheme: "light",
    violations: appearance.violations,
  });
  await writeFile(
    resolve(evidence, "axe.json"),
    JSON.stringify(reports, null, 2),
  );
  assert.deepEqual(appearance.violations, [], "Appearance");
  await open("ajustes-con-diseno");
  await page
    .getByRole("tab", { name: "Rendimiento en pista", exact: true })
    .click();
  await page.getByRole("radio", { name: "Ahorro", exact: true }).click();
  await until(
    async () =>
      (await page
        .getByRole("radio", { name: "Ahorro", exact: true })
        .getAttribute("aria-checked")) === "true",
    5000,
    "performance saved",
  );
  for (const scheme of ["light", "dark"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.scheme)) !==
      scheme
    )
      await page
        .getByRole("button", {
          name: "Cambiar tema claro u oscuro",
          exact: true,
        })
        .click();
    await until(
      async () =>
        (await page.evaluate(() => document.documentElement.dataset.scheme)) ===
        scheme,
      5000,
      "scheme saved",
    );
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    reports.push({
      screen: "performance",
      scheme,
      violations: report.violations,
    });
    assert.deepEqual(report.violations, []);
    await page.screenshot({
      path: resolve(evidence, `performance-${scheme}.png`),
    });
  }
  await page.getByRole("tab", { name: "Atajos", exact: true }).click();
  await page.getByText("Ctrl Alt F8", { exact: true }).waitFor();
  for (const scheme of ["dark", "light"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.scheme)) !==
      scheme
    )
      await page
        .getByRole("button", {
          name: "Cambiar tema claro u oscuro",
          exact: true,
        })
        .click();
    await until(
      async () =>
        (await page.evaluate(() => document.documentElement.dataset.scheme)) ===
        scheme,
      5000,
      "scheme saved",
    );
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    reports.push({
      screen: "shortcuts",
      scheme,
      violations: report.violations,
    });
    assert.deepEqual(report.violations, []);
    await page.screenshot({
      path: resolve(evidence, `shortcuts-${scheme}.png`),
    });
  }
  await writeFile(
    resolve(evidence, "axe.json"),
    JSON.stringify(reports, null, 2),
  );
  await page.getByRole("tab", { name: "Actualizaciones", exact: true }).click();
  await page.getByText("Entorno de desarrollo", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Instalar y reiniciar", exact: true })
      .count(),
    0,
  );
  await page.screenshot({ path: resolve(evidence, "updates-development.png") });
  await open("actualizacion-lista");
  await page.getByRole("tab", { name: "Actualizaciones", exact: true }).click();
  await page
    .getByRole("button", { name: "Instalar y reiniciar", exact: true })
    .waitFor();
  const updateReport = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(updateReport.violations, []);
  reports.push({
    screen: "updates",
    scheme: "dark",
    violations: updateReport.violations,
  });
  await page.screenshot({ path: resolve(evidence, "updates-ready.png") });
  await page
    .getByRole("button", { name: "Instalar y reiniciar", exact: true })
    .click();
  await writeFile(
    resolve(evidence, "axe.json"),
    JSON.stringify(reports, null, 2),
  );
  await open("ajustes-conflicto");
  await minimized.click();
  const conflict = page
    .getByRole("alert")
    .filter({ hasText: "Los ajustes han cambiado" });
  await conflict.waitFor();
  assert.equal(await minimized.isDisabled(), true);
  assert.equal(
    await page
      .getByRole("switch", { name: "Avisos de actualización", exact: true })
      .getAttribute("aria-checked"),
    "false",
  );
  await page
    .getByRole("button", { name: "Reintentar guardado", exact: true })
    .click();
  await conflict.waitFor({ state: "hidden" });
  assert.equal(await minimized.getAttribute("aria-checked"), "true");
  assert.equal(
    await page
      .getByRole("switch", { name: "Avisos de actualización", exact: true })
      .getAttribute("aria-checked"),
    "false",
  );
  await open("ajustes-error");
  await minimized.click();
  const failure = page
    .getByRole("alert")
    .filter({ hasText: "No se pudo guardar" });
  await failure.waitFor();
  assert.equal(await minimized.getAttribute("aria-checked"), "false");
  await page
    .getByRole("button", { name: "Descartar cambio pendiente", exact: true })
    .click();
  await failure.waitFor({ state: "hidden" });
  await open("ajustes-protegidos");
  await page.getByText("Documento protegido", { exact: true }).waitFor();
  assert.equal(await minimized.isDisabled(), true);
  assert.equal(
    await page
      .getByRole("button", { name: "Aumentar tamaño de la interfaz" })
      .isDisabled(),
    true,
  );
  await page.screenshot({ path: resolve(evidence, "protected.png") });
  await page.goto(
    `${server.resolvedUrls?.local[0]}?escena=componentes-incompatibles`,
  );
  await page
    .getByRole("alert")
    .filter({ hasText: "Componentes incompatibles" })
    .waitFor();
  assert.equal(await page.getByRole("switch").count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(evidence, "settings.json"),
    JSON.stringify(
      {
        passed: true,
        save: true,
        zoom: true,
        theme: true,
        commandWithCollapsedRail: true,
        updates: true,
        performance: true,
        shortcuts: true,
        conflictRetry: true,
        discard: true,
        protected: true,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : done())),
  );
}
