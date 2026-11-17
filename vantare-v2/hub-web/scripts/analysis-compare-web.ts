import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright-core";
import { analysisQaNow } from "../src/mock/analysis-scenes.ts";
import { analysisText as at } from "../src/renderer/i18n/analysis.es.ts";
import { comparisonText as t } from "../src/renderer/i18n/comparison.es.ts";
import { t as shellText } from "../src/renderer/i18n/es.ts";
import { writeAnalysisSheet } from "./analysis-sheet.ts";
import { webQaPreview } from "./web-qa.ts";

const scenes = [
  "rail",
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
  includeCase?: (name: string) => boolean,
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
        if (includeCase && !includeCase(name)) continue;
        console.log(`Comparar: ${name}`);
        await page.setViewportSize({
          width,
          height: scene.endsWith("table")
            ? 1400
            : scene === "selection"
              ? width === 1280
                ? 1212
                : 1355
              : 980,
        });
        const fixture = [
          "rail",
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
              scene === "rail"
                ? 7
                : scene.startsWith("gaps") && scene !== "gaps-b"
                  ? 5
                  : 9,
            ),
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name: t.select(
              t.b,
              scene === "rail" ? 9 : scene === "gaps-b" ? 5 : 7,
            ),
            exact: true,
          })
          .click();
        const selectedB = page.getByRole("button", {
          name: t.select(
            t.b,
            scene === "rail" ? 9 : scene === "gaps-b" ? 5 : 7,
          ),
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
              "rail",
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
            const railToggle = page.locator(".v-titlebar").getByRole("button", {
              name: shellText("shell.railToggle"),
              exact: true,
            });
            if (scene === "rail" || scene.startsWith("zoom")) {
              if ((await railToggle.getAttribute("aria-expanded")) === "false")
                await railToggle.click();
              await page.locator(".v-an-change").first().waitFor();
            }
            if (scene.startsWith("zoom")) {
              assert.equal(await page.locator(".v-an-change").count(), 3);
              await page.locator(".v-an-change").first().focus();
              await page.keyboard.press("Enter");
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
            if (scene.startsWith("zoom") && width === 900) {
              await railToggle.click();
              await page.waitForFunction(
                () => !document.querySelector(".v-an-change"),
              );
            }
            if (scene.startsWith("zoom") && scene !== "zoom-time") {
              assert.deepEqual(
                await page
                  .getByRole("img", { name: t.delta, exact: true })
                  .locator(":scope > text[text-anchor=middle]")
                  .allTextContents(),
                ["0 m", "250 m"],
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
          const summary = page.locator(".v-an-values-table summary");
          await page.getByRole("slider", { name: t.cursor }).focus();
          await page.keyboard.press("Tab");
          assert.equal(
            await summary.evaluate((el) => document.activeElement === el),
            true,
          );
          await summary.press("Enter");
          await page.keyboard.press("Tab");
          const region = page.getByRole("region", { name: t.table });
          assert.equal(
            await region.evaluate((el) => document.activeElement === el),
            true,
          );
          const table = page.getByRole("table", { name: t.table });
          assert.equal(await table.getByRole("columnheader").count(), 8);
          assert.equal(await table.getByRole("rowheader").count(), 6);
          assert.equal(
            await table
              .getByRole("columnheader")
              .evaluateAll((cells) =>
                cells.every((el) => el.getAttribute("scope") === "col"),
              ),
            true,
          );
          assert.equal(
            await table
              .getByRole("rowheader")
              .evaluateAll((cells) =>
                cells.every((el) => el.getAttribute("scope") === "row"),
              ),
            true,
          );
          if (scene === "gaps-table") {
            assert.ok(
              await table
                .getByRole("cell", { name: t.noData, exact: true })
                .count(),
            );
            assert.ok(await region.getAttribute("aria-describedby"));
          }
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
        if (scene === "rail") {
          const viewport = page.viewportSize();
          assert.ok(viewport);
          await page.setViewportSize({
            ...viewport,
            height: viewport.height + 1,
          });
          await page.evaluate(
            () =>
              new Promise<void>((done) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => done()),
                ),
              ),
          );
          await page.setViewportSize(viewport);
          await page.evaluate(
            () =>
              new Promise<void>((done) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => done()),
                ),
              ),
          );
          assert.equal(
            await page
              .locator(".v-titlebar")
              .getByRole("button", {
                name: shellText("shell.railToggle"),
                exact: true,
              })
              .getAttribute("aria-expanded"),
            "true",
            "Content resizing must preserve manual rail expansion",
          );
          assert.equal(await page.locator(".v-an-change").count(), 3);
          const rows = page.locator(".v-an-change");
          assert.equal(
            await rows.evaluateAll((nodes) => {
              const height = Number.parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue(
                  "--chip-h",
                ),
              );
              return nodes.every(
                (node, i) =>
                  node.getBoundingClientRect().height >= 24 &&
                  node.getBoundingClientRect().height <= height + 1 &&
                  (i === 0 ||
                    node.getBoundingClientRect().top -
                      nodes[i - 1].getBoundingClientRect().top <=
                      height + 1),
              );
            }),
            true,
            "Change rows must be compact and retain a 24 px minimum target",
          );
          assert.match((await rows.first().textContent()) ?? "", /−0\.01 s/);
          assert.equal(await rows.locator(".v-an-compare-gain").count(), 3);
          assert.equal(
            await rows
              .locator(".v-an-compare-gain")
              .first()
              .evaluate((node) => {
                const probe = document.createElement("span");
                probe.style.color = "var(--analysis-gain)";
                node.append(probe);
                const expected = getComputedStyle(probe).color;
                probe.remove();
                return getComputedStyle(node).color === expected;
              }),
            true,
            "A gain must use the Hub blue token",
          );
          const normal = await rows
            .first()
            .evaluate((node) => getComputedStyle(node).backgroundColor);
          await rows.first().hover();
          assert.notEqual(
            await rows
              .first()
              .evaluate((node) => getComputedStyle(node).backgroundColor),
            normal,
            "Hover must visibly identify the change row",
          );
          await rows.first().focus();
          await page.keyboard.press("Tab");
          assert.equal(
            await rows
              .nth(1)
              .evaluate(
                (node) =>
                  document.activeElement === node &&
                  node.matches(":focus-visible") &&
                  getComputedStyle(node).outlineStyle !== "none" &&
                  Number.parseFloat(getComputedStyle(node).outlineWidth) >= 2,
              ),
            true,
            "Change rows need visible keyboard focus",
          );
          await rows.first().hover();
        }
        if (scene.startsWith("gaps")) {
          const side = scene === "gaps-b" ? "B" : "A";
          const note = page.locator(".v-an-gap-notes");
          assert.ok(
            (await note.textContent())?.includes(
              `Sin datos entre 2 323 m y 2 520 m en ${side}`,
            ),
          );
          assert.equal(await note.evaluate((el) => !el.closest("svg")), true);
        }
        if (scene !== "selection")
          assert.equal(
            await page
              .getByRole("combobox", { name: t.a, exact: true })
              .evaluate((node) => {
                const value = node.firstElementChild;
                const icon = node.lastElementChild;
                const style = getComputedStyle(node);
                const available =
                  node.clientWidth -
                  Number.parseFloat(style.paddingLeft) -
                  Number.parseFloat(style.paddingRight) -
                  (Number.parseFloat(style.columnGap) || 0) -
                  (icon && icon !== value
                    ? icon.getBoundingClientRect().width
                    : 0);
                return (
                  !!value &&
                  value.getBoundingClientRect().width >= available - 1 &&
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
