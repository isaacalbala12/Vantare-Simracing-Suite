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
  "cursor",
  "keyboard",
  "table",
  "gaps-table",
  "gaps-cursor",
  "zoom",
  "zoom-time",
  "zoom-loading",
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
  await page.emulateMedia({ reducedMotion: "reduce" });
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
          "cursor",
          "keyboard",
          "table",
          "gaps-table",
          "gaps-cursor",
          "zoom",
          "zoom-time",
          "selection",
          "normal",
          "time",
          "gaps-time",
          "gaps",
          "gaps-b",
        ].includes(scene)
          ? "compare"
          : `compare-${scene === "zoom-loading" ? "loading" : scene}`;
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
              "cursor",
              "keyboard",
              "table",
              "gaps-table",
              "gaps-cursor",
              "zoom",
              "zoom-time",
              "zoom-loading",
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
            if (scene === "time" || scene.endsWith("-time"))
              await page
                .getByRole("button", { name: t.time, exact: true })
                .click();
            if (scene.startsWith("zoom")) {
              assert.equal(await page.locator(".v-an-change").count(), 3);
              await page.locator(".v-an-change").first().click();
              const slider = page.getByRole("slider", { name: t.cursor });
              assert.equal(
                (await slider.evaluate(
                  (el) =>
                    Number(el.getAttribute("max")) -
                    Number(el.getAttribute("min")),
                )) > 0,
                true,
              );
              await page.getByRole("button", { name: t.whole }).waitFor();
              if (scene !== "zoom-time")
                assert.equal(
                  await slider.evaluate(
                    (el) =>
                      Number(el.getAttribute("max")) -
                      Number(el.getAttribute("min")),
                  ),
                  250,
                );
            }
            const priorPaths = await page
              .locator(".v-an-trace-line")
              .evaluateAll((nodes) =>
                nodes.map((node) => node.getAttribute("d")),
              );
            const priorBounds = await page
              .getByRole("slider", { name: t.cursor })
              .evaluate((el) => [
                el.getAttribute("min"),
                el.getAttribute("max"),
              ]);
            if (scene === "loading" || scene === "zoom-loading") {
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
              assert.deepEqual(
                await page
                  .locator(".v-an-trace-line")
                  .evaluateAll((nodes) =>
                    nodes.map((node) => node.getAttribute("d")),
                  ),
                priorPaths,
              );
              assert.deepEqual(
                await page
                  .getByRole("slider", { name: t.cursor })
                  .evaluate((el) => [
                    el.getAttribute("min"),
                    el.getAttribute("max"),
                  ]),
                priorBounds,
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
            assert.equal(
              await page.locator(".v-an-trace").evaluateAll((plots) =>
                plots.every(
                  (plot) =>
                    plot instanceof SVGSVGElement &&
                    [
                      ...plot.querySelectorAll(
                        "text.v-an-series-a, text.v-an-series-b",
                      ),
                    ].every((label) => {
                      if (!(label instanceof SVGGraphicsElement)) return false;
                      const box = label.getBBox();
                      return (
                        box.y >= 0 &&
                        box.y + box.height <= plot.viewBox.baseVal.height
                      );
                    }),
                ),
              ),
              true,
              "End labels must remain visible at signal limits",
            );
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
        await page.mouse.move(
          width - 1,
          (page.viewportSize()?.height ?? 980) - 1,
        );
        if (scene === "table" || scene === "gaps-table") {
          await page.locator(".v-an-values-table summary").click();
          const table = page.getByRole("table", { name: t.table });
          assert.equal(await table.getByRole("columnheader").count(), 8);
          assert.equal(await table.getByRole("rowheader").count(), 6);
          assert.equal(
            await table.evaluate((el) =>
              el.parentElement
                ? el.getBoundingClientRect().width <=
                  el.parentElement.getBoundingClientRect().width + 1
                : false,
            ),
            true,
            "Values table must fit its scroll container",
          );
        }
        if (scene === "cursor" || scene === "gaps-cursor") {
          const box = await page
            .getByRole("slider", { name: t.cursor })
            .boundingBox();
          assert.ok(box);
          await page.mouse.move(
            box.x +
              (box.width *
                (112 + 640 * (scene === "gaps-cursor" ? 0.485 : 0.3))) /
                800,
            box.y + 30,
          );
          assert.equal(await page.locator(".v-an-cursor-values dd").count(), 7);
          if (scene === "gaps-cursor")
            assert.ok(
              (
                await page
                  .getByRole("slider", { name: t.cursor })
                  .getAttribute("aria-valuetext")
              )?.includes(t.noData),
            );
        }
        if (scene === "keyboard") {
          const slider = page.getByRole("slider", { name: t.cursor });
          await slider.focus();
          await slider.press("ArrowRight");
          assert.equal(await slider.inputValue(), "1");
          assert.ok(
            (await slider.getAttribute("aria-valuetext"))?.includes("Freno B"),
          );
          assert.equal(
            await page
              .locator(".v-an-traces")
              .evaluate((el) => getComputedStyle(el).outlineStyle),
            "solid",
          );
        }
        if (scene !== "selection")
          assert.equal(
            await page
              .getByRole("combobox", { name: t.a, exact: true })
              .evaluate((node) => {
                const value = node.firstElementChild;
                return (
                  !!value &&
                  value.getBoundingClientRect().width >
                    node.getBoundingClientRect().width * 0.7 &&
                  getComputedStyle(value).textAlign === "center"
                );
              }),
            true,
            "A/B captions must occupy and center in the selector",
          );
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
            `<section><h2>${name}</h2><p>P1e-2: datos sintéticos del host, nombres sin identificar, tiempos aproximados. Ficha con todos los valores, tabla cada 1 000 m y tres tramos de 250 m; durante la carga se conserva el encuadre. El error y la carga reutilizan los moldes aprobados; la maqueta es la referencia de su marco.</p><div><figure><figcaption>Maqueta aprobada ${ref}</figcaption><img alt="Referencia" src="${refName}"></figure><figure><figcaption>Hub ${theme}</figcaption><img alt="Implementación" src="${name}.png"></figure></div></section>`,
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
      `<!doctype html><html lang="es"><meta charset="utf-8"><title>VANTA-133 · P1e-2</title><style>body{font:16px system-ui;margin:24px}section>div{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%}section{margin-block:40px}</style><h1>P1e-2 frente a las maquetas 03 y 03b</h1>${figures.join("")}</html>`,
    );
  await page.emulateMedia({ reducedMotion: null });
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
        "D:/VantareServer/evidence/analisis/p1/p1e2/one",
      references,
    );
  } finally {
    await browser.close();
    await server.close();
  }
}
