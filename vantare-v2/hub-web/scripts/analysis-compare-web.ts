import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright-core";
import { analysisQaNow } from "../src/mock/analysis-scenes.ts";
import { analysisText as at } from "../src/renderer/i18n/analysis.es.ts";
import { comparisonText as t } from "../src/renderer/i18n/comparison.es.ts";
import { writeAnalysisSheet } from "./analysis-sheet.ts";
import { webQaPreview } from "./web-qa.ts";

const scenes = [
  "selection",
  "normal",
  "time",
  "gaps-time",
  "gaps",
  "gaps-b",
  "initial-loading",
  "loading",
  "no-delta",
  "error",
  "timeout",
  "cancelled",
  "changed",
  "large",
] as const;
export async function checkAnalysisComparison(
  page: Page,
  base: string,
  output: string,
  references?: Page,
) {
  await mkdir(output, { recursive: true });
  await page.clock.setFixedTime(analysisQaNow);
  const results: { name: string; violations: unknown[] }[] = [];
  const figures: string[] = [];
  for (const width of [1280, 900])
    for (const theme of ["dark", "light"])
      for (const scene of scenes) {
        const name = `${scene}-${theme}-${width}`;
        console.log(`Comparar: ${name}`);
        await page.setViewportSize({
          width,
          height: scene === "selection" ? (width === 1280 ? 1212 : 1355) : 980,
        });
        const fixture = [
          "selection",
          "normal",
          "time",
          "gaps-time",
          "gaps",
          "gaps-b",
        ].includes(scene)
          ? "compare"
          : `compare-${scene}`;
        await page.goto(`${base}?escena=analysis-qa-${fixture}`);
        await page
          .getByRole("tab", { name: at.recordings, exact: true })
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
        await page
          .getByRole("button", { name: /Circuito sin identificar/ })
          .nth(1)
          .click();
        await page.getByText(at.technical, { exact: true }).waitFor();
        await page
          .getByRole("button", {
            name: t.select(
              t.a,
              scene.startsWith("gaps") && scene !== "gaps-b" ? 5 : 9,
            ),
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name: t.select(t.b, scene === "gaps-b" ? 5 : 7),
            exact: true,
          })
          .click();
        const selectedB = page.getByRole("button", {
          name: t.select(t.b, scene === "gaps-b" ? 5 : 7),
          exact: true,
        });
        const hovered = await selectedB.evaluate(
          (node) => getComputedStyle(node).backgroundColor,
        );
        assert.equal(
          await selectedB.evaluate((node) => {
            const cell = node.closest("td");
            return (
              !!cell &&
              node.getBoundingClientRect().right <=
                cell.getBoundingClientRect().right -
                  Number.parseFloat(getComputedStyle(cell).paddingRight) +
                  0.5
            );
          }),
          true,
          "The B control must fit inside its cell padding",
        );
        await page.mouse.move(width - 1, 979);
        assert.equal(
          await selectedB.evaluate(
            (node) => getComputedStyle(node).backgroundColor,
          ),
          hovered,
          "Hover must preserve the selected B mark",
        );
        if (scene !== "selection") {
          await page
            .getByRole("button", { name: t.compare, exact: true })
            .click();
          if (
            [
              "normal",
              "time",
              "gaps-time",
              "gaps",
              "gaps-b",
              "no-delta",
              "loading",
            ].includes(scene)
          ) {
            await page
              .getByRole("img", { name: t.speed, exact: true })
              .waitFor();
            if (scene === "time" || scene === "gaps-time")
              await page
                .getByRole("button", { name: t.time, exact: true })
                .click();
            if (scene === "loading") {
              await page
                .getByRole("button", { name: t.swap, exact: true })
                .click();
              await page
                .getByRole("status", { name: t.updating, exact: true })
                .waitFor();
              assert.equal(
                await page
                  .locator(".v-an-traces")
                  .evaluate((el) => getComputedStyle(el).opacity),
                "0.5",
              );
            }
            const speed = page.getByRole("img", { name: t.speed, exact: true });
            const series = await speed
              .locator(".v-an-trace-line")
              .evaluateAll((nodes) =>
                nodes.map((node) =>
                  node.classList.contains("v-an-series-a") ? "a" : "b",
                ),
              );
            assert.deepEqual(series, ["a", "b"], "B must be painted after A");
            if (scene.startsWith("gaps")) {
              assert.ok(
                (
                  await speed
                    .locator(`.v-an-series-${scene === "gaps-b" ? "b" : "a"}`)
                    .first()
                    .getAttribute("d")
                )?.match(/M/g)?.length === 2,
              );
              assert.ok(
                await page.getByText(t.noDelta, { exact: true }).count(),
              );
            }
          } else if (scene === "initial-loading")
            await page
              .getByRole("status", { name: t.loading, exact: true })
              .waitFor();
          else {
            const title = {
              error: t.incomparable,
              timeout: t.timeout,
              cancelled: t.cancelled,
              changed: at.changedTitle,
              large: at.largeTitle,
            }[scene as "error"];
            await page
              .getByRole("heading", { name: title, exact: true })
              .waitFor();
          }
        }
        await page.evaluate(async () => {
          document.documentElement.style.zoom = "1";
          await document.fonts.ready;
        });
        const report = await new AxeBuilder({ page })
          .include(".v-shell")
          .analyze();
        results.push({ name, violations: report.violations });
        await writeFile(
          resolve(output, `${name}.axe.json`),
          JSON.stringify(report, null, 2),
        );
        await page.screenshot({ path: resolve(output, `${name}.png`) });
        const ref =
          scene === "selection"
            ? "02-grabacion"
            : scene.startsWith("gaps") || scene === "no-delta"
              ? "03b-comparar-huecos"
              : "03-comparar";
        const refName = `${ref}-reference-${width}.png`;
        if (references) {
          try {
            await access(resolve(output, refName));
          } catch {
            await references.setViewportSize({ width: 1400, height: 1000 });
            await references.goto(
              pathToFileURL(
                `D:/VantareServer/evidence/analisis/maquetas/${ref}.html`,
              ).href,
            );
            await references.evaluate(() => document.fonts.ready);
            await references
              .locator(width === 900 ? ".win.narrow" : ".win:not(.narrow)")
              .first()
              .screenshot({ path: resolve(output, refName) });
          }
          figures.push(
            `<section><h2>${name}</h2><p>P1e-1: datos sintéticos del host, nombres sin identificar, tiempos aproximados. La ficha, la tabla de valores y «Dónde cambia más» se entregan en P1e-2, según el corte aprobado. El error y la carga reutilizan los moldes aprobados; la maqueta es la referencia de su marco.</p><div><figure><figcaption>Maqueta aprobada ${ref}</figcaption><img alt="Referencia" src="${refName}"></figure><figure><figcaption>Hub ${theme}</figcaption><img alt="Implementación" src="${name}.png"></figure></div></section>`,
          );
        }
      }
  await writeFile(
    resolve(output, "axe-summary.json"),
    JSON.stringify(results, null, 2),
  );
  if (references)
    await writeAnalysisSheet(
      output,
      `<!doctype html><html lang="es"><meta charset="utf-8"><title>VANTA-133 · P1e-1</title><style>body{font:16px system-ui;margin:24px}section>div{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%}section{margin-block:40px}</style><h1>P1e-1 frente a las maquetas 03 y 03b</h1>${figures.join("")}</html>`,
    );
  assert.ok(
    results.every((r) => r.violations.length === 0),
    "Every comparison state must have zero axe violations",
  );
}
if (import.meta.main) {
  const server = await webQaPreview();
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
    const page = await context.newPage();
    const references = await context.newPage();
    const base = server.resolvedUrls?.local[0];
    assert.ok(base);
    await checkAnalysisComparison(
      page,
      base,
      process.env.VANTARE_ANALYSIS_EVIDENCE ??
        "D:/VantareServer/evidence/analisis/p1/p1e/one",
      references,
    );
  } finally {
    await browser.close();
    await server.close();
  }
}
