import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";
import { analysisQaNow } from "../src/mock/analysis-scenes.ts";
import { writeAnalysisSheet } from "./analysis-sheet.ts";
import { checkAnalysisDensity } from "./check-analysis-density.ts";
import { webQaPreview } from "./web-qa.ts";

const output = "D:/VantareServer/evidence/analisis/p1/p1a/dst-fix";
await mkdir(output, { recursive: true });
const server = await webQaPreview();
const browser = await chromium.launch({
  executablePath: process.env.VANTARE_HUB_BROWSER,
});
const results: { name: string; violations: unknown[] }[] = [];
const figures: string[] = [];
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
  const scenes = {
    catalog: "01-explorador",
    empty: "05a-vacio",
    loading: "05b-cargando",
    "catalog-error": "05c-error",
    recording: "05d-bloqueada",
    denied: "05e-sin-permiso",
    signin: "05e-sin-permiso",
    disabled: "05f-desactivada",
    "disabled-empty": "05f-desactivada",
  };
  for (const width of [1280, 900])
    for (const theme of ["dark", "light"])
      for (const [scene, sheet] of Object.entries(scenes)) {
        console.log(`Captura ${scene} ${theme} ${width}`);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}?escena=analysis-qa-${scene}`);
        await page
          .getByRole("tab", { name: "Grabaciones", exact: true })
          .waitFor();
        if (["catalog", "recording", "disabled"].includes(scene)) {
          await page.getByText("Completa", { exact: true }).first().waitFor();
          for (const label of ["Hoy", "Ayer", "Esta semana", "Antes"])
            await page
              .getByRole("rowgroup")
              .getByText(label, { exact: true })
              .waitFor();
          await page
            .locator("time")
            .getByText("18:42", { exact: true })
            .waitFor();
          await checkAnalysisDensity(page);
        } else if (scene === "loading")
          await page
            .getByText("Buscando grabaciones…", { exact: true })
            .first()
            .waitFor();
        else await page.locator(".v-an-notice h2").waitFor();
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
        // Compare CSS layouts at the mockup's 100% zoom; the existing Hub window
        // policy otherwise scales a 900px client to 90%. Product zoom is unchanged.
        await page.evaluate(async () => {
          document.documentElement.style.zoom = "1";
          await document.fonts.ready;
        });
        if (width === 900)
          await page.locator(".v-context--collapsed").waitFor();
        if (["catalog", "recording", "disabled", "loading"].includes(scene))
          await checkAnalysisDensity(page);
        const name = `${scene}-${theme}-${width}`;
        const audit = await new AxeBuilder({ page })
          .include(".v-shell")
          .analyze();
        results.push({ name, violations: audit.violations });
        await writeFile(
          resolve(output, `${name}.axe.json`),
          JSON.stringify(audit, null, 2),
        );
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
          `<section><h2>${name}</h2><p>Referencia aprobada oscura. ${theme === "light" ? "Variante clara mediante tokens del Hub. " : ""}P1a muestra solo el explorador: apertura e interruptor van en P1b; cuota y borrados, en P1c. Circuito/coche desconocidos y tiempos ≈ por contrato actual.</p><div><figure><figcaption>Maqueta</figcaption><img alt="Maqueta" src="${refName}"></figure><figure><figcaption>P1a · Chromium QA · zoom 100%</figcaption><img alt="Implementación" src="${name}.png"></figure></div></section>`,
        );
      }
  await writeAnalysisSheet(
    output,
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>VANTA-133 · P1a</title><style>body{font:16px system-ui;margin:24px}section>div{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%}section{margin-block:40px}</style><h1>Análisis · P1a frente a maquetas aprobadas</h1>${figures.join("")}</html>`,
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
