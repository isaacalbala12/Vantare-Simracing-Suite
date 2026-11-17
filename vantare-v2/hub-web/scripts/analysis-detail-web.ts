import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";
import { analysisQaNow } from "../src/mock/analysis-scenes.ts";
import { analysisText as t } from "../src/renderer/i18n/analysis.es.ts";
import { writeAnalysisSheet } from "./analysis-sheet.ts";
import { webQaPreview } from "./web-qa.ts";

const output = "D:/VantareServer/evidence/analisis/p1/p1b/dst-fix";
const subset = process.argv.includes("--technical-only")
  ? "technical"
  : process.argv.includes("--settings-only")
    ? "settings"
    : undefined;
await mkdir(output, { recursive: true });
const results: { name: string; violations: unknown[] }[] = subset
  ? JSON.parse(
      await readFile(resolve(output, "axe-summary.json"), "utf8"),
    ).filter(
      (result: { name: string }) => !result.name.startsWith(`${subset}-`),
    )
  : [];
if (subset) assert.equal(results.length, subset === "technical" ? 60 : 52);
const server = await webQaPreview();
const browser = await chromium.launch({
  executablePath: process.env.VANTARE_HUB_BROWSER,
});
const figures: string[] = [];
const scenes = {
  readonly: "01-explorador",
  laps: "02-grabacion",
  technical: "02-grabacion",
  opening: "05b-cargando",
  cancelled: "01-explorador",
  recording: "05d-bloqueada",
  unreadable: "05c-error",
  locked: "05d-bloqueada",
  incompatible: "05c-error",
  missing: "05c-error",
  changed: "05c-error",
  large: "05c-error",
  timeout: "05c-error",
  settings: "06-ajustes-grabacion",
  "settings-off": "06-ajustes-grabacion",
  "settings-denied": "06-ajustes-grabacion",
} as const;
try {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    timezoneId: "UTC",
    locale: "es-ES",
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(analysisQaNow);
  const reference = await context.newPage();
  await reference.setViewportSize({ width: 1400, height: 1000 });
  const base = server.resolvedUrls?.local[0];
  assert.ok(base);
  console.log(`Preview ${base}`);
  for (const width of [1280, 900])
    for (const theme of ["dark", "light"])
      for (const [scene, sheet] of Object.entries(scenes)) {
        if (subset && !scene.startsWith(subset)) continue;
        console.log(`Captura ${scene} ${theme} ${width}`);
        await page.setViewportSize({
          width,
          height:
            scene === "laps" || scene === "technical"
              ? width === 1280
                ? 1196
                : 1355
              : 900,
        });
        const mock =
          scene === "cancelled"
            ? "opening"
            : scene === "settings-denied"
              ? "denied"
              : scene;
        await page.goto(`${base}?escena=analysis-qa-${mock}`);
        const recordings = page.getByRole("tab", {
          name: t.recordings,
          exact: true,
        });
        const laps = page.getByRole("tab", { name: t.laps, exact: true });
        await recordings.waitFor();
        if (scene === "readonly") {
          assert.equal(await laps.getAttribute("aria-disabled"), "true");
          assert.equal(await laps.getAttribute("disabled"), null);
          const description = await laps.getAttribute("aria-describedby");
          assert.ok(description);
          assert.equal(
            await page.locator(`[id="${description}"]`).textContent(),
            t.openFirst,
          );
          await recordings.focus();
          await page.keyboard.press("ArrowRight");
          assert.equal(
            await laps.evaluate(
              (element) => element === document.activeElement,
            ),
            true,
          );
          await page.keyboard.press("Enter");
          await page.keyboard.press("Space");
          assert.equal(await recordings.getAttribute("aria-selected"), "true");
          // Playwright treats aria-disabled as non-actionable. Send the real
          // pointer click anyway to verify the application keeps it inert.
          await laps.click({ force: true });
          assert.equal(await recordings.getAttribute("aria-selected"), "true");
          await page.getByText(t.complete, { exact: true }).first().waitFor();
        } else if (scene.startsWith("settings")) {
          await page
            .getByRole("navigation", { name: "Navegación principal" })
            .getByRole("button", { name: "Ajustes", exact: true })
            .click();
          await page
            .getByRole("tab", { name: "Privacidad", exact: true })
            .click();
          const recording = page.getByRole("switch", {
            name: t.record,
            exact: true,
          });
          await recording.waitFor();
          if (scene === "settings-off") {
            await recording.click();
            await page.getByText(t.pendingOff, { exact: true }).waitFor();
            assert.equal(await recording.getAttribute("aria-checked"), "false");
          }
        } else {
          const row = page
            .getByRole("button", { name: /Circuito sin identificar/ })
            .nth(scene === "recording" ? 0 : 1);
          if (scene === "laps") {
            await row.focus();
            await page.keyboard.press("Enter");
          } else await row.click();
          if (scene === "cancelled") {
            await page
              .getByRole("button", { name: t.cancel, exact: true })
              .click();
            await page.getByText(t.complete, { exact: true }).first().waitFor();
            assert.equal(
              await recordings.getAttribute("aria-selected"),
              "true",
            );
            assert.equal(await page.locator(".v-an-notice").count(), 0);
          } else if (scene === "laps" || scene === "technical") {
            await page.getByText(t.technical, { exact: true }).waitFor();
            assert.equal(await laps.getAttribute("aria-disabled"), null);
            if (scene === "technical") {
              await page.getByText(t.technical, { exact: true }).click();
              await page
                .getByText("18446744073709551615", { exact: true })
                .waitFor();
            } else {
              assert.equal(
                await page.locator("details").getAttribute("open"),
                null,
              );
            }
          } else await page.locator(".v-an-notice h2").waitFor();
        }
        if (theme === "light") {
          await page
            .getByRole("button", {
              name: "Cambiar tema claro u oscuro",
              exact: true,
            })
            .click();
          await page.waitForFunction(
            () => document.documentElement.dataset.scheme === "light",
          );
        }
        // Match the approved sheet's CSS pixels. The Hub's existing autozoom is unchanged.
        await page.evaluate(async () => {
          document.documentElement.style.zoom = "1";
          await document.fonts.ready;
        });
        if (width === 900 && !scene.startsWith("settings"))
          await page.locator(".v-context--collapsed").waitFor();
        if (width === 900 && !scene.startsWith("settings")) {
          await page.locator(".v-an-strip").waitFor();
          assert.ok(
            (await page.locator(".v-an-strip").textContent())?.includes(
              t.automatic,
            ),
          );
        }
        if (scene.startsWith("settings")) {
          if (width === 900) {
            const toggle = page.locator(".v-titlebar").getByRole("button", {
              name: "Contraer o ampliar información",
              exact: true,
            });
            if ((await toggle.getAttribute("aria-expanded")) === "true")
              await toggle.click();
            await page.locator(".v-context--collapsed").waitFor();
          }
          await page
            .getByRole("tab", { name: "Privacidad", exact: true })
            .scrollIntoViewIfNeeded();
          await page
            .getByRole("switch", { name: t.record, exact: true })
            .scrollIntoViewIfNeeded();
        }
        if (scene === "laps" || scene === "technical") {
          assert.equal(await page.locator(".v-an-stats strong").count(), 4);
          assert.equal(await page.locator(".v-an-chart svg").count(), 14);
          assert.equal(
            await page
              .getByRole("button", { name: "Comparar A y B", exact: true })
              .count(),
            0,
          );
          const table = page.locator(".v-an-laps");
          const columns = await table.locator("thead th").all();
          let visible = 0;
          for (const column of columns) if (await column.isVisible()) visible++;
          assert.equal(visible, width === 900 ? 5 : 8);
          if (width === 1280)
            await page.getByText(t.thisRecording, { exact: true }).waitFor();
          if (scene === "laps")
            await page.locator(".v-shell-main").evaluate((element) => {
              element.scrollTop = 0;
            });
        }
        const name = `${scene}-${theme}-${width}`;
        const audit = await new AxeBuilder({ page })
          .include(".v-shell")
          .analyze();
        results.push({ name, violations: audit.violations });
        await writeFile(
          resolve(output, `${name}.axe.json`),
          JSON.stringify(audit, null, 2),
        );
        if (scene === "technical")
          await page
            .locator(".v-an-technical summary")
            .evaluate((summary) => summary.scrollIntoView({ block: "start" }));
        await page.screenshot({ path: resolve(output, `${name}.png`) });
        const refName = `${scene}-reference-${width}.png`;
        if (theme === "dark") {
          await reference.goto(
            pathToFileURL(
              `D:/VantareServer/evidence/analisis/maquetas/${sheet}.html`,
            ).href,
          );
          await reference.evaluate(() => document.fonts.ready);
          await reference
            .locator(width === 900 ? ".win.narrow" : ".win:not(.narrow)")
            .first()
            .screenshot({ path: resolve(output, refName) });
        }
        figures.push(
          `<section><h2>${name}</h2><p>Referencia aprobada oscura (${sheet}). ${theme === "light" ? "Variante clara por tokens del Hub. " : ""}P1b: nombres sin identificar y estadísticas reducidas del contrato. Vueltas usa el alto de referencia (1196/1355 px) para comparar la vista completa; Ajustes estrecho contrae el carril con el control real del Hub. Sin Comparar, mapa, cuota, borrados ni estado futuro. Los errores siguen el molde 05c y los textos aprobados; el detalle técnico se captura también desplegado.</p><div><figure><figcaption>Maqueta</figcaption><img alt="Maqueta" src="${refName}"></figure><figure><figcaption>P1b · Chromium QA · zoom 100%</figcaption><img alt="Implementación" src="${name}.png"></figure></div></section>`,
        );
      }
  if (!subset)
    await writeAnalysisSheet(
      output,
      `<!doctype html><html lang="es"><meta charset="utf-8"><title>VANTA-133 · P1b</title><style>body{font:16px system-ui;margin:24px}section>div{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%}section{margin-block:40px}</style><h1>Análisis · P1b frente a maquetas aprobadas</h1>${figures.join("")}</html>`,
    );
  await writeFile(
    resolve(output, "axe-summary.json"),
    JSON.stringify(results, null, 2),
  );
  assert.ok(
    results.every((r) => r.violations.length === 0),
    "All states must have zero axe violations",
  );
} finally {
  await browser.close();
  await server.close();
}
