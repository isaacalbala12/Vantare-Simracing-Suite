import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright-core";
import { analysisQaNow } from "../src/mock/analysis-scenes";
import { analysisText as a } from "../src/renderer/i18n/analysis.es";
import { recordingStatusText as t } from "../src/renderer/i18n/recording-status.es";
import { writeAnalysisSheet } from "./analysis-sheet";
import { webQaPreview } from "./web-qa";

const scenes = [
  "idle",
  "recording",
  "degraded",
  "stopped",
  "limit",
  "disabled",
  "unavailable",
  "pendingOff",
  "pendingOn",
] as const;

export async function checkRecordingStatus(
  page: Page,
  base: string,
  output: string,
  reference?: Page,
) {
  await mkdir(output, { recursive: true });
  await page.clock.setFixedTime(analysisQaNow);
  const results = [];
  const figures = [];
  for (const width of [1280, 900]) {
    const ref = `07-reference-${width}.png`;
    if (reference) {
      await reference.setViewportSize({ width: 1400, height: 1000 });
      await reference.goto(
        pathToFileURL(
          "D:/VantareServer/evidence/analisis/maquetas/07-estado-y-borrado.html",
        ).href,
      );
      await reference.evaluate(() => document.fonts.ready);
      await reference
        .locator(width === 900 ? ".win.narrow" : ".win:not(.narrow)")
        .screenshot({ path: resolve(output, ref) });
    }
    for (const scheme of ["dark", "light"]) {
      for (const scene of scenes) {
        const name = `${scene}-${scheme}-${width}`;
        console.log(name);
        await page.setViewportSize({ width, height: 980 });
        await page.goto(`${base}?escena=analysis-qa-status-${scene}`);
        await page
          .getByRole("tab", { name: a.recordings, exact: true })
          .waitFor();
        if (scheme === "light") {
          await page
            .getByRole("button", { name: "Cambiar tema claro u oscuro" })
            .click();
          await page.waitForFunction(
            () => document.documentElement.dataset.scheme === "light",
          );
        }
        const indicator = page.locator(
          width === 900
            ? ".v-an-status-strip .v-an-status-message"
            : ".v-context .v-an-status-message",
        );
        await indicator.getByText(t[scene], { exact: true }).waitFor();
        if (scene === "pendingOff" || scene === "pendingOn") {
          await indicator
            .locator("..")
            .getByRole("button", { name: a.undo })
            .waitFor();
          assert.equal(await page.getByText(a.off, { exact: true }).count(), 0);
        }
        if (scene === "limit") {
          await page.getByText(t.pruneTitle(3), { exact: true }).waitFor();
          await indicator.getByText(t.limitHelp, { exact: true }).waitFor();
        }
        const report = await new AxeBuilder({ page })
          .include(".v-shell")
          .analyze();
        results.push({ name, violations: report.violations });
        assert.deepEqual(report.violations, [], name);
        if (reference)
          await page.screenshot({ path: resolve(output, `${name}.png`) });
        if (scene === "limit") {
          const see = page.getByRole("button", { name: t.seePrune });
          await see.focus();
          await page.keyboard.press("Enter");
          await page.waitForFunction(() =>
            document.activeElement?.parentElement?.querySelector(
              ".v-an-prune-list",
            ),
          );
          assert.equal(
            await page.locator(".v-an-prune-list li:visible").count(),
            3,
          );
          assert.equal(
            await page
              .getByRole("meter", { name: a.recordings })
              .getAttribute("aria-valuetext"),
            t.count(200, 200),
          );
          assert.equal(
            await page
              .getByRole("meter", { name: a.size })
              .getAttribute("aria-valuetext"),
            t.bytes(4_900_000_000, 5_000_000_000),
          );
          await page.getByRole("button", { name: t.acknowledge }).click();
          await page
            .getByText(t.pruneTitle(3), { exact: true })
            .waitFor({ state: "hidden" });
          assert.equal(
            await page.locator(".v-an-prune-list li:visible").count(),
            3,
          );
          await page.locator(".v-notification-bell").click();
          await page.getByText(t.notification, { exact: true }).waitFor();
          await page.getByText(t.notice(3), { exact: true }).waitFor();
          if (reference)
            await page.screenshot({
              path: resolve(output, `notification-${scheme}-${width}.png`),
            });
          await page.keyboard.press("Escape");
        }
        figures.push(
          `<section><h2>${name}</h2><div><figure><figcaption>Maqueta 07</figcaption><img alt="Maqueta 07" src="${ref}"></figure><figure><figcaption>Hub</figcaption><img alt="${name}" src="${name}.png"></figure></div></section>`,
        );
      }
    }
  }
  await writeFile(
    resolve(output, "axe-summary.json"),
    JSON.stringify(results, null, 2),
  );
  if (reference)
    await writeAnalysisSheet(
      output,
      `<!doctype html><html lang="es"><meta charset="utf-8"><title>P1c · Grabación</title><style>body{font:16px system-ui;margin:24px}section>div{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%}section{margin-block:40px}</style><h1>P1c frente a la maqueta 07</h1>${figures.join("")}</html>`,
    );
}

if (import.meta.main) {
  const server = await webQaPreview();
  try {
    const browser = await chromium.launch({
      executablePath: process.env.VANTARE_HUB_BROWSER,
    });
    try {
      const context = await browser.newContext({
        reducedMotion: "reduce",
        deviceScaleFactor: 1,
        timezoneId: "UTC",
        locale: "es-ES",
      });
      const base = server.resolvedUrls?.local[0];
      assert.ok(base);
      await checkRecordingStatus(
        await context.newPage(),
        base,
        process.env.VANTARE_ANALYSIS_EVIDENCE ??
          "D:/VantareServer/evidence/analisis/p1/p1c",
        await context.newPage(),
      );
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}
