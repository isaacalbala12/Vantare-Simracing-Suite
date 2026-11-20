import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { analysisQaNow } from "../src/mock/analysis-scenes.ts";
import { analysisText as t } from "../src/renderer/i18n/analysis.es.ts";
import { comparisonText as c } from "../src/renderer/i18n/comparison.es.ts";

type Scene = "con" | "mezcla" | "v1";
export type Case = {
  scene: Scene;
  view: "vueltas" | "comparar";
  width: 1280 | 900;
  theme: "dark" | "light";
  rail?: "collapsed";
};
/** Pares A/B de Comparar por escena: números de vuelta de la tabla. */
const pairs = { con: [6, 3], mezcla: [6, 3], v1: [6, 2] } as const;

export async function open(page: Page, base: string, test: Case) {
  await page.setViewportSize({ width: test.width, height: 1400 });
  await page.goto(`${base}?escena=analysis-qa-sectors-${test.scene}`);
  await page.getByRole("tab", { name: t.recordings, exact: true }).waitFor();
  if (test.theme === "light") {
    await page
      .getByRole("button", { name: "Cambiar tema claro u oscuro", exact: true })
      .click();
    await page.waitForFunction(
      () => document.documentElement.dataset.scheme === "light",
    );
  }
  await page
    .getByRole("button", { name: /Circuito sin identificar/ })
    .nth(1)
    .click();
  await page.locator(".v-an-laps").waitFor();
  if (test.rail)
    await page
      .getByRole("button", { name: "Contraer o ampliar información" })
      .click();
  if (test.view === "comparar") {
    const [a, b] = pairs[test.scene];
    // En «mezcla» hay dos vueltas con el mismo número: la de la última sesión es la última.
    await page
      .getByRole("button", { name: c.select("A", a) })
      .last()
      .click();
    await page
      .getByRole("button", { name: c.select("B", b) })
      .last()
      .click();
    await page.getByRole("tab", { name: c.tab, exact: true }).click();
    await page.locator(".v-an-trace").first().waitFor();
  }
}

export async function checkVueltas(page: Page, test: Case) {
  const table = page.locator(".v-an-laps");
  const headings = await table.locator("thead th:visible").allTextContents();
  const sectors = test.scene !== "v1";
  const wide = test.rail === "collapsed";
  // Reparto exacto: con sectores se ocultan Vel. máx., Vel. media, Acelerador y
  // Freno (salvo con la barra recogida); sin sectores, las 9 de siempre.
  const speeds = [t.speedMax, t.speedMean, t.throttleColumn, t.brakeColumn];
  assert.deepEqual(
    headings,
    sectors
      ? [
          t.lap,
          t.time,
          "S1",
          "S2",
          "S3",
          t.delta,
          ...(wide ? speeds : []),
          t.data,
          c.choices,
        ]
      : [t.lap, t.time, t.delta, ...speeds, t.data, c.choices],
  );
  if (test.scene === "mezcla")
    assert.deepEqual(
      await table
        .locator('th[scope="rowgroup"]:visible')
        .evaluateAll((cells) =>
          cells.map((cell) => (cell as HTMLTableCellElement).colSpan),
        ),
      [wide ? 12 : 8, wide ? 12 : 8],
    );
  assert.equal(
    await table.evaluate(
      (el) => el.scrollWidth <= (el.parentElement?.clientWidth ?? 0) + 1,
    ),
    true,
    "la tabla cabe en su contenedor",
  );
  const boxes = table.locator(".v-an-sector-best");
  assert.equal(await boxes.count(), sectors ? 3 : 0);
  // El recuadro es una forma, no solo color: su borde computado es visible
  // (el ancho puede salir fraccionario si el Hub aplica zoom).
  if (sectors) {
    const [style, width] = await boxes
      .first()
      .evaluate((el) => [
        getComputedStyle(el).borderTopStyle,
        getComputedStyle(el).borderTopWidth,
      ]);
    assert.equal(style, "solid");
    assert.ok(Number.parseFloat(width) >= 1, `borde del recuadro ${width}`);
  }
  if (test.scene === "con") {
    for (const n of [1, 2, 3])
      assert.equal(await table.getByText(t.bestSectorHidden(n)).count(), 1);
    await table.getByText("41.096", { exact: true }).waitFor();
    await table.getByText("1:02.091", { exact: true }).waitFor();
  }
  if (test.scene === "mezcla") {
    await table.getByText(t.noSectorsGiven).waitFor();
    await page.getByText(t.approximateNoSectors).waitFor();
  }
  if (test.scene === "v1")
    await page.getByText(t.recordingWithoutSectors).waitFor();
  else await page.getByText(t.sectorLegend(false)).waitFor();
}

export async function checkComparar(page: Page, test: Case) {
  const table = page.locator(".v-an-sectors");
  if (test.scene === "v1") {
    assert.equal(await table.count(), 0);
    await page.getByText(c.recordingWithoutSectors).waitFor();
    return;
  }
  const rows = await table.locator("tbody tr").allTextContents();
  assert.equal(rows.length, 3);
  if (test.scene === "con") {
    for (const word of [c.sectorLoses, c.sectorWins])
      assert.ok(rows.join("|").includes(word), word);
    await table.locator(".v-an-compare-loss").first().waitFor();
    await table.locator(".v-an-compare-gain").first().waitFor();
  } else {
    assert.ok(rows.every((row) => row.endsWith(t.dash)));
    await page.getByText(c.sectorsWhy("A", 6, "approximate")).waitFor();
  }
  assert.equal(
    await page
      .locator(".v-an-comparison")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    true,
    "Comparar no desborda",
  );
}

const ci: Case[] = [
  { scene: "con", view: "vueltas", width: 1280, theme: "dark" },
  { scene: "con", view: "vueltas", width: 900, theme: "dark" },
  { scene: "mezcla", view: "vueltas", width: 1280, theme: "light" },
  { scene: "v1", view: "vueltas", width: 900, theme: "dark" },
  { scene: "con", view: "comparar", width: 1280, theme: "light" },
  { scene: "mezcla", view: "comparar", width: 900, theme: "dark" },
];
/** Sectores por vuelta (VANTA-138): columnas, marca, notas y «Por sector». Pocos casos: la matriz completa vive en el runner de evidencias. */
export async function checkAnalysisSectors(page: Page, base: string) {
  await page.clock.setFixedTime(analysisQaNow);
  for (const test of ci) {
    const name = [test.view, test.scene, test.theme, test.width, test.rail]
      .filter(Boolean)
      .join("-");
    console.log(name);
    await open(page, base, test);
    await (test.view === "vueltas"
      ? checkVueltas(page, test)
      : checkComparar(page, test));
    const report = await new AxeBuilder({ page }).include(".v-shell").analyze();
    assert.deepEqual(report.violations, [], name);
  }
}
