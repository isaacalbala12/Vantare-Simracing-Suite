import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Locator, type Page } from "playwright-core";
import { analysisQaNow } from "../src/mock/analysis-scenes.ts";
import { analysisText as t } from "../src/renderer/i18n/analysis.es.ts";
import { comparisonText } from "../src/renderer/i18n/comparison.es.ts";
import { writeAnalysisSheet } from "./analysis-sheet.ts";
import { webQaPreview } from "./web-qa.ts";

async function assertSessionColumns(table: Locator, columns: number) {
  const headings = table.locator("thead th:visible");
  const groups = table.locator('th[scope="rowgroup"]:visible');
  assert.equal(await headings.count(), columns);
  assert.deepEqual(
    await groups.evaluateAll((cells) =>
      cells.map((cell) => (cell as HTMLTableCellElement).colSpan),
    ),
    [columns, columns],
  );
  const lastColumn = await headings.last().boundingBox();
  const firstGroup = await groups.first().boundingBox();
  assert.ok(lastColumn && firstGroup);
  assert.ok(
    Math.abs(
      firstGroup.x + firstGroup.width - lastColumn.x - lastColumn.width,
    ) < 1,
    "session heading reaches the last visible column",
  );
}

export async function checkAnalysisSessions(
  page: Page,
  base: string,
  output: string,
  reference?: Page,
) {
  await mkdir(output, { recursive: true });
  await page.clock.setFixedTime(analysisQaNow);
  const results = [];
  const figures = [];
  for (const width of [1280, 900])
    for (const theme of ["dark", "light"])
      for (const scene of ["catalog", "sessions", "legacy", "cross-session"]) {
        const name = `${scene}-${theme}-${width}`;
        console.log(name);
        await page.setViewportSize({
          width,
          height: scene === "catalog" ? 980 : 1400,
        });
        await page.goto(
          `${base}?escena=analysis-qa-sessions${scene === "cross-session" ? "-cross" : ""}`,
        );
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
        const real = page.getByRole("button", {
          name: /Spa.*Porsche.*GT3.*\+1 sesión$/,
        });
        await real.waitFor();
        const legacy = page
          .locator(".v-an-catalog tbody tr")
          .filter({ hasText: "15:20" })
          .getByRole("button", { name: /Circuito sin identificar/ });
        await legacy.waitFor();
        if (scene === "catalog") {
          assert.match(
            (await real.getAttribute("aria-description")) ?? "",
            /1 sesión más/,
          );
          assert.match(
            (await real
              .locator("xpath=ancestor::tr")
              .getByText("1:51.625", { exact: true })
              .getAttribute("aria-description")) ?? "",
            /^Mejor vuelta de la grabación$/,
          );
        } else {
          await (scene === "legacy" ? legacy : real).click();
          const table = page.locator(".v-an-laps");
          await table.waitFor();
          if (scene === "cross-session") {
            await table
              .getByRole("button", { name: comparisonText.select("a", 1) })
              .click();
            await table
              .getByRole("button", { name: comparisonText.select("b", 2) })
              .click();
            await page
              .getByRole("tab", { name: comparisonText.tab, exact: true })
              .click();
            await page
              .getByText(/Spa.*Warm-up \(A\) \/ Clasificación \(B\)/)
              .waitFor();
            await page.locator(".v-an-trace").first().waitFor();
          } else if (scene === "sessions") {
            await page
              .getByRole("heading", { name: "Spa · Porsche 911 GT3 R · GT3" })
              .waitFor();
            await assertSessionColumns(table, 8);
            await page
              .locator(".v-an-stats")
              .getByText("1:51.625", { exact: true })
              .waitFor();
            await table
              .getByText("Warm-up", { exact: false })
              .first()
              .waitFor();
            await table.getByText("1:51.625", { exact: true }).waitFor();
            await table.getByText("≈1:52.4", { exact: true }).waitFor();
          } else {
            await page
              .getByRole("heading", { name: `${t.track} · ${t.car}` })
              .waitFor();
            assert.equal(
              await table.locator('th[scope="rowgroup"]').count(),
              0,
            );
            await table.getByText("≈1:51.6", { exact: true }).waitFor();
            await page.getByText(t.approximate, { exact: true }).waitFor();
          }
        }
        if (name === "sessions-dark-900") {
          await page.setViewportSize({ width: 720, height: 1400 });
          await assertSessionColumns(page.locator(".v-an-laps"), 8);
          await page.setViewportSize({ width, height: 1400 });
        }
        const report = await new AxeBuilder({ page })
          .include(".v-shell")
          .analyze();
        results.push({ name, violations: report.violations });
        assert.deepEqual(report.violations, [], name);
        if (reference) {
          const ref =
            scene === "cross-session"
              ? "03-comparar"
              : scene === "catalog"
                ? "01-explorador"
                : "02-grabacion";
          const refName = `${ref}-reference-${width}.png`;
          try {
            await access(resolve(output, refName));
          } catch {
            await reference.setViewportSize({ width: 1400, height: 1500 });
            await reference.goto(
              pathToFileURL(
                `D:/VantareServer/evidence/analisis/maquetas/${ref}.html`,
              ).href,
            );
            await reference.evaluate(() => document.fonts.ready);
            await reference
              .locator(width === 900 ? ".win.narrow" : ".win:not(.narrow)")
              .first()
              .screenshot({ path: resolve(output, refName) });
          }
          await page.screenshot({ path: resolve(output, `${name}.png`) });
          figures.push(
            `<section><h2>${name}</h2><div><figure><figcaption>Maqueta aprobada ${ref}</figcaption><img alt="Referencia" src="${refName}"></figure><figure><figcaption>Hub ${theme}</figcaption><img alt="Implementación" src="${name}.png"></figure></div></section>`,
          );
        }
      }
  await writeFile(
    resolve(output, "axe-summary.json"),
    JSON.stringify(results, null, 2),
  );
  if (reference)
    await writeAnalysisSheet(
      output,
      `<!doctype html><html lang="es"><meta charset="utf-8"><title>P1f · sesiones</title><style>body{font:16px system-ui;margin:24px}section>div{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%}section{margin-block:40px}</style><h1>P1f frente a las maquetas 01, 02 y 03</h1>${figures.join("")}</html>`,
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
        timezoneId: "UTC",
        locale: "es-ES",
        reducedMotion: "reduce",
        deviceScaleFactor: 1,
      });
      const base = server.resolvedUrls?.local[0];
      assert.ok(base);
      await checkAnalysisSessions(
        await context.newPage(),
        base,
        process.env.VANTARE_ANALYSIS_EVIDENCE ??
          "D:/VantareServer/evidence/analisis/p1/p1f/entrega-final",
        await context.newPage(),
      );
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}
