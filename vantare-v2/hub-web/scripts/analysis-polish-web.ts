import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";
import { analysisQaNow } from "../src/mock/analysis-scenes.ts";
import { analysisText as t } from "../src/renderer/i18n/analysis.es.ts";
import { writeAnalysisSheet } from "./analysis-sheet.ts";
import { checkAnalysisDensity } from "./check-analysis-density.ts";
import { webQaPreview } from "./web-qa.ts";

const output = "D:/VantareServer/evidence/analisis/p1/p1d";
await mkdir(output, { recursive: true });
const server = await webQaPreview();
const browser = await chromium.launch({
  executablePath: process.env.VANTARE_HUB_BROWSER,
});
const results: { name: string; violations: unknown[] }[] = [];
const figures: string[] = [];
const scenes = {
  catalog: "01-explorador",
  laps: "02-grabacion",
  technical: "02-grabacion",
  settings: "06-ajustes-grabacion",
  "settings-return": "06-ajustes-grabacion",
  "settings-protected": "06-ajustes-grabacion",
};
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
        console.log(`Captura ${scene} ${theme} ${width}`);
        await page.setViewportSize({
          width,
          height: ["laps", "technical"].includes(scene)
            ? width === 1280
              ? 1212
              : 1355
            : 900,
        });
        await page.goto(`${base}?escena=analysis-qa-${scene}`);
        await page
          .getByRole("tab", { name: t.recordings, exact: true })
          .waitFor();
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
        if (scene.startsWith("settings")) {
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
          if (scene !== "settings") {
            await recording.click();
            await page.getByText(t.pendingOff, { exact: true }).waitFor();
            if (scene === "settings-return") {
              await page
                .getByRole("tab", { name: "General", exact: true })
                .click();
              assert.equal(
                await page.getByText(t.pendingOff, { exact: true }).count(),
                0,
              );
              await page
                .getByRole("tab", { name: "Privacidad", exact: true })
                .click();
              await page.getByText(t.pendingOff, { exact: true }).waitFor();
            }
            assert.equal(
              await page
                .getByRole("button", { name: t.undo, exact: true })
                .isDisabled(),
              scene === "settings-protected",
            );
          }
          if (width === 900) {
            const toggle = page.getByRole("button", {
              name: /^(Contraer|Expandir) panel derecho$/,
            });
            if ((await toggle.getAttribute("aria-expanded")) === "true")
              await toggle.click();
            await page
              .getByRole("tab", { name: "Privacidad", exact: true })
              .scrollIntoViewIfNeeded();
            await recording.scrollIntoViewIfNeeded();
          }
        } else if (scene !== "catalog") {
          await page
            .getByRole("button", { name: /Circuito sin identificar/ })
            .nth(1)
            .click();
          await page.getByText(t.technical, { exact: true }).waitFor();
          assert.equal(
            await page.locator(".v-an-technical").getAttribute("open"),
            null,
          );
          if (scene === "technical") {
            await page.getByText(t.technical, { exact: true }).click();
            await page
              .getByText("18446744073709551615", { exact: true })
              .waitFor();
          }
        } else
          await page.getByText(t.complete, { exact: true }).first().waitFor();
        await page.evaluate(async () => {
          document.documentElement.style.zoom = "1";
          await document.fonts.ready;
        });
        if (scene === "catalog") {
          await checkAnalysisDensity(page);
          assert.equal(
            await page
              .locator(".v-an-catalog")
              .evaluate((table) =>
                [...table.querySelectorAll("tr")].every(
                  (row) =>
                    getComputedStyle(row).borderBottomWidth === "1px" &&
                    [...row.cells].every(
                      (cell) =>
                        getComputedStyle(cell).borderBottomWidth === "0px",
                    ),
                ),
              ),
            true,
          );
        }
        if (scene === "laps") {
          const footer = page.getByText(t.lapCounts(10, 1, 3), { exact: true });
          const fits = await footer.evaluate((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return (
              range.getClientRects().length <= 2 &&
              node.scrollWidth <= node.clientWidth &&
              getComputedStyle(node).textOverflow !== "ellipsis"
            );
          });
          assert.equal(
            fits,
            true,
            "Whole lap counts must fit within two lines",
          );
          const tops = await page
            .locator(".v-an-stats strong")
            .evaluateAll((nodes) =>
              nodes.map((node) => node.getBoundingClientRect().top),
            );
          const columns = width === 900 ? 2 : 4;
          for (let i = 0; i < tops.length; i++)
            assert.ok(
              Math.abs(tops[i] - tops[i - (i % columns)]) < 1,
              "Summary values must stay aligned",
            );
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
            .evaluate((node) => node.scrollIntoView({ block: "start" }));
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
          `<section><h2>${name}</h2><p>Referencia ${sheet}. P1d conserva los tokens del Hub; el recuento de vueltas usa hasta dos líneas autorizadas. Privacidad prueba también el retorno y Deshacer protegido. El detalle técnico aprobado sigue plegado inicialmente; aquí se muestra además su despliegue. Vueltas a 1280 se captura con 16 px más de alto para incluir la segunda línea; no cambia el zoom del producto.</p><div><figure><figcaption>Maqueta aprobada (oscura)</figcaption><img alt="Maqueta" src="${refName}"></figure><figure><figcaption>P1d ${theme}</figcaption><img alt="Implementación" src="${name}.png"></figure></div></section>`,
        );
        if (scene === "settings-return") {
          await page.getByRole("button", { name: t.undo, exact: true }).click();
          await page
            .getByText(t.pendingOff, { exact: true })
            .waitFor({ state: "hidden" });
        }
      }
  await writeAnalysisSheet(
    output,
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>VANTA-133 P1d</title><style>body{font:16px system-ui;margin:24px}section>div{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%}section{margin-block:40px}</style><h1>P1d frente a las maquetas aprobadas</h1>${figures.join("")}</html>`,
  );
  await writeFile(
    resolve(output, "axe-summary.json"),
    JSON.stringify(results, null, 2),
  );
  assert.ok(
    results.every((r) => !r.violations.length),
    "Every state must have zero axe violations",
  );
} finally {
  await browser.close();
  await server.close();
}
