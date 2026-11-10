import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { notificationScenes } from "./visual-diff/notifications.ts";

const evidence = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/notifications",
);
await mkdir(evidence, { recursive: true });
const server = await preview({
  configFile: false,
  root: resolve("src/renderer"),
  build: { outDir: resolve("out-qa/renderer") },
  preview: { host: "127.0.0.1", port: 0 },
});
const browser = await chromium.launch({
  executablePath: process.env.VANTARE_HUB_BROWSER,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const scheme of ["dark", "light"]) {
    await page.goto(
      `${server.resolvedUrls?.local[0]}?escena=visual-${scheme}:notificaciones-base`,
    );
    await page.getByRole("tab", { name: "General", exact: true }).waitFor();
    await page.getByRole("button", { name: "Inicio", exact: true }).click();
    await page
      .getByRole("button", { name: "Notificaciones", exact: true })
      .click();
    const panel = page.locator(".v-notifications--compact");
    await panel.getByText("Todo al día", { exact: true }).waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.waitForFunction(
      (scheme) => document.documentElement.dataset.scheme === scheme,
      scheme,
    );
    assert.equal(
      Math.round(
        (
          await page
            .locator(".v-popup:has(.v-notifications--compact)")
            .boundingBox()
        )?.width ?? 0,
      ),
      452,
    );
    await page.screenshot({
      path: resolve(evidence, `shell-notificaciones-abiertas-${scheme}.png`),
    });
    const audit = await new AxeBuilder({ page })
      .include(".v-notifications")
      .analyze();
    await writeFile(
      resolve(evidence, `axe-${scheme}.json`),
      JSON.stringify(audit, null, 2),
    );
    assert.deepEqual(
      audit.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ),
      [],
    );
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "hidden" });
  }
  await page.goto(`${server.resolvedUrls?.local[0]}?escena=ajustes-error`);
  await page.getByRole("tab", { name: "General", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Cambiar tema claro u oscuro", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Notificaciones", exact: true })
    .click();
  await page.getByText("Error local del Hub", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Ver todas las notificaciones", exact: true })
    .click();
  const full = page.locator(".v-notifications--full");
  await full.waitFor();
  const fullHeight = await page.locator(".v-shell-main").evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      element.clientHeight -
      Number.parseFloat(style.paddingTop) -
      Number.parseFloat(style.paddingBottom)
    );
  });
  const fullBounds = await full.boundingBox();
  assert.ok(
    fullBounds && Math.abs(fullBounds.height - fullHeight) <= 1,
    "Full notification view fills the frame content height",
  );
  await page.getByRole("button", { name: "Marcar leído", exact: true }).click();
  await page.getByText("0 sin leer", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await page.getByText("Todo al día", { exact: true }).waitFor();
  const fullEmptyContentHeight: Record<string, number> = {};
  for (const scheme of ["dark", "light"]) {
    await page.goto(
      `${server.resolvedUrls?.local[0]}?escena=visual-${scheme}:notificaciones-base`,
    );
    await page.getByRole("tab", { name: "General", exact: true }).waitFor();
    await notificationScenes["notificaciones-completa-vacio"].prepare(page);
    const card = page.locator(".v-notifications--full");
    await card.getByRole("button", { name: "Todas", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("tab").count(),
      0,
      "Notification filters stay inside the card",
    );
    fullEmptyContentHeight[scheme] = Math.round(
      (await card.locator(".v-notifications-content").boundingBox())?.height ??
        0,
    );
    await page.screenshot({
      path: resolve(evidence, `notificaciones-completa-vacio-${scheme}.png`),
    });
    const audit = await new AxeBuilder({ page })
      .include(".v-notifications")
      .analyze();
    assert.deepEqual(
      audit.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ),
      [],
    );
    await writeFile(
      resolve(evidence, `axe-full-${scheme}.json`),
      JSON.stringify(audit, null, 2),
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(evidence, "browser.json"),
    JSON.stringify(
      {
        viewport: [1440, 900],
        scale: 1,
        panelWidth: 452,
        fullHeight,
        fullEmptyContentHeight,
        fullFiltersInCard: true,
        errors,
        sharedSessionHistory: true,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise<void>((done) => server.httpServer.close(() => done()));
}
