import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { WidgetVisualViewport } from "../../core/WidgetVisualViewport";
import { standingsDefinition } from "../../widget-types/standings/standings-definition";
import { createDefaultStandingsContent } from "../../widget-types/standings/standings-content";
import { buildStandingsViewModelV2 } from "../../widget-types/standings/standings-view-model-v2";
import type { OverlayFrameV2 } from "../../../generated/telemetry";
import { applyStudioCommand } from "../../../hub/overlay-studio/state/studio-command";
import { RelativeCrystal } from "./relative/RelativeCrystal";
import { createDefaultRelativeContent } from "../../widget-types/relative/relative-content";
import { buildRelativeViewModelV2 } from "../../widget-types/relative/relative-view-model-v2";
import { StandingsCrystal } from "./standings/StandingsCrystal";

function goldenFrame(): OverlayFrameV2 {
  return (JSON.parse(readFileSync(resolve(process.cwd(),
    "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json"),
  "utf8")) as { frame: OverlayFrameV2 }).frame;
}

function productiveCss(): string {
  return ["tokens.css", "isa93-parity-overrides.css"].map(file =>
    readFileSync(resolve(import.meta.dirname, file), "utf8").replace(/url\("(.*?)"\)/g, (_match, asset: string) => {
      if (!asset.endsWith(".woff2")) return `url("${asset}")`;
      const data = readFileSync(resolve(import.meta.dirname, asset)).toString("base64");
      return `url("data:font/woff2;base64,${data}")`;
    }),
  ).join("\n");
}

it("contains five complete rows after a persisted 20-to-5 edit at tester widths", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const css = productiveCss();
    const frame = goldenFrame();
    for (const compactRows of [false, true]) for (const w of [340, 420, 520]) {
      const widget = standingsDefinition.createDefault("table");
      widget.visual.systemId = "vantare-crystal";
      widget.visual.appearanceOverrides.compactRows = compactRows;
      widget.layout = { ...widget.layout, w, h: 600 };
      widget.content = { ...createDefaultStandingsContent(), rowCount: 20 };
      const next = applyStudioCommand({ schemaVersion: 3, id: "test", name: "test", displayMode: "edit", monitorIndex: 0, layouts: { general: { type: "general", widgets: [widget] } } }, { type: "widget/content", session: "general", widgetIds: [widget.id], content: { ...widget.content, rowCount: 5 } });
      const layout = next.layouts.general!.widgets[0]!.layout;
      const model = buildStandingsViewModelV2({ ...frame, standings: frame.standings.map(row => ({ ...row, driver: "Julien Andlauer" })) }, { state: "live" }, { ...createDefaultStandingsContent(), classScope: "all-classes", rowCount: 5 });
      for (const row of model.rows) { row.lastLapText = "1:38.621"; row.gapText = "+12.345"; }
      await page.setContent(`<style>${css}</style>` + renderToStaticMarkup(<div id="frame" style={{ width: layout.w, height: layout.h }}><WidgetVisualViewport widgetType="standings" layout={layout} visual={widget.visual} testId="viewport"><StandingsCrystal model={model} settings={{ compactRows }} renderMode="harness" /></WidgetVisualViewport></div>));
      await page.evaluate(() => document.fonts.ready);
      const measured = await page.evaluate(() => {
        const frame = document.querySelector('#frame')!.getBoundingClientRect();
        const rows = [...document.querySelectorAll('[data-standings-row]')];
        return { cells: [...rows[0]!.querySelectorAll<HTMLElement>('[data-metric="driverName"], [data-metric="lastLap"], [data-metric="gap"]')].map(cell => ({ metric: cell.dataset.metric, scroll: cell.scrollWidth, width: cell.clientWidth })), width: frame.width, height: frame.height, rows: rows.map(row => { const rect = row.getBoundingClientRect(); return { bottom: rect.bottom, right: rect.right, height: rect.height }; }), bottom: frame.bottom, right: frame.right, font: parseFloat(getComputedStyle(rows[0]!.querySelector('[data-metric="driverName"]')!).fontSize) * frame.width / 520 };
      });
      expect(measured.width).toBe(w);
      expect(measured.height).toBeLessThan(600);
      expect(measured.rows).toHaveLength(5);
      for (const row of measured.rows) { expect(row.bottom).toBeLessThanOrEqual(measured.bottom); expect(row.right).toBeLessThanOrEqual(measured.right + 1); expect(row.height).toBeCloseTo((compactRows ? 28 : 34) * w / 520, 0); }
      expect(measured.font).toBeGreaterThanOrEqual(11.7);
      for (const cell of measured.cells) expect(cell.scroll, cell.metric).toBeLessThanOrEqual(cell.width + 1);
    }
  } finally { await browser.close(); }
}, 30_000);

it("Relative widths change physical tracks and align headers with all selected cells", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const css = productiveCss();
    const frame = goldenFrame();
    const content = createDefaultRelativeContent();
    const model = buildRelativeViewModelV2(frame, { state: "live" }, content);
    const widths: number[] = [];
    for (const preset of ["sm", "lg"] as const) {
      const columns = content.columns.filter(c => ["position", "driverName", "lastLap"].includes(c.metricId)).map(c => ({ ...c, enabled: true, widthPreset: c.metricId === "driverName" ? preset : c.widthPreset, style: { align: "right" as const } }));
      await page.setContent(`<style>${css}</style>` + renderToStaticMarkup(<div style={{ width: 340, height: 260 }}><WidgetVisualViewport widgetType="relative" layout={{ w: 340, h: 260 }} testId="viewport"><RelativeCrystal model={{ ...model, columns }} settings={{}} renderMode="harness" /></WidgetVisualViewport></div>));
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() => {
        const header = document.querySelector('.vc-relative-table-header')!;
        const row = document.querySelector('[data-relative-row]')!;
        return [...row.querySelectorAll('[data-metric]')].map(cell => {
          const heading = header.querySelector(`[data-metric="${cell.getAttribute('data-metric')}"]`)!;
          return { metric: cell.getAttribute('data-metric'), left: cell.getBoundingClientRect().left, headerLeft: heading.getBoundingClientRect().left, width: cell.getBoundingClientRect().width, align: getComputedStyle(cell).textAlign };
        });
      });
      expect(result.map(c => c.metric)).toEqual(["position", "driverName", "lastLap"]);
      for (const cell of result) { expect(cell.left).toBeCloseTo(cell.headerLeft, 1); expect(cell.align).toBe("right"); }
      widths.push(result.find(c => c.metric === "driverName")!.width);
    }
    expect(widths[1]).toBeGreaterThan(widths[0]! + 30);
  } finally { await browser.close(); }
}, 30_000);
