import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Page } from "playwright";
import { expect, it } from "vitest";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { createDefaultStandingsContent } from "../widget-types/standings/standings-content";
import { buildStandingsViewModelV2 } from "../widget-types/standings/standings-view-model-v2";
import { resolveFunctionalStandingsSize } from "../widget-types/standings/functional-standings-layout";
import type { OverlayFrameV2 } from "../../generated/telemetry";
import { createDefaultRelativeContent } from "../widget-types/relative/relative-content";
import { buildRelativeViewModelV2 } from "../widget-types/relative/relative-view-model-v2";
import { StandingsCrystal } from "./vantare-crystal/standings/StandingsCrystal";
import { RelativeCrystal } from "./vantare-crystal/relative/RelativeCrystal";
import { PedalsCrystal } from "./vantare-crystal/pedals/PedalsCrystal";
import { StandingsFunctional } from "./vantare-functional/StandingsFunctional";
import type { PedalsViewModel } from "../widget-types/pedals/pedals-view-model";

function goldenFrame(): OverlayFrameV2 {
  return (JSON.parse(readFileSync(resolve(process.cwd(),
    "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json"),
  "utf8")) as { frame: OverlayFrameV2 }).frame;
}

function crystalCss(): string {
  const reset = "html,body{margin:0;background:transparent}*,*::before,*::after{box-sizing:border-box}";
  return reset + ["tokens.css", "isa93-parity-overrides.css"].map(file =>
    readFileSync(resolve(import.meta.dirname, "vantare-crystal", file), "utf8").replace(/url\("(.*?)"\)/g, (_match, asset: string) => {
      if (!asset.endsWith(".woff2")) return `url("${asset}")`;
      const data = readFileSync(resolve(import.meta.dirname, "vantare-crystal", asset)).toString("base64");
      return `url("data:font/woff2;base64,${data}")`;
    }),
  ).join("\n");
}

function functionalCss(): string {
  const inter = readFileSync(
    resolve(import.meta.dirname, "../../assets/fonts/orbit/Inter-Variable.woff2"),
  ).toString("base64");
  const reset = "html,body{margin:0;background:transparent}*,*::before,*::after{box-sizing:border-box}";
  const font = `@font-face{font-family:"Inter";font-style:normal;font-weight:400 800;font-display:block;src:url("data:font/woff2;base64,${inter}") format("woff2");}`;
  return `${reset}${font}${readFileSync(resolve(import.meta.dirname, "vantare-functional", "tokens.css"), "utf8")}`;
}

type Box = { top: number; bottom: number; left: number; right: number };

// Faithful product document: the app index.html declares doctype (CSS1Compat).
// Without it Chromium falls to BackCompat/quirks, where tables neither
// inherit text color nor measure like production.
function doc(css: string, body: string): string {
  return `<!DOCTYPE html><html><head><style>${css}</style></head><body>${body}</body></html>`;
}

async function containment(page: Page, frameSelector: string, itemSelector: string) {
  return page.evaluate(({ frameSelector, itemSelector }) => {
    const frame = document.querySelector(frameSelector) as HTMLElement;
    const box = (element: Element): Box => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    };
    const frameBox = box(frame);
    const items = [...document.querySelectorAll(itemSelector)].map(box);
    const band = document.querySelector(".vf-brand-band, .vc-brand-band");
    const footer = document.querySelector(".vf-session-footer");
    // Real brand content bounds (logo img/svg + wordmark), not just the band box.
    const bandInner = band
      ? [...band.querySelectorAll("img, svg, span")].map(box).reduce<Box | null>(
        (union, current) => union === null ? current : {
          top: Math.min(union.top, current.top),
          bottom: Math.max(union.bottom, current.bottom),
          left: Math.min(union.left, current.left),
          right: Math.max(union.right, current.right),
        }, null)
      : null;
    return {
      frameBox,
      items,
      bandBox: band ? box(band) : null,
      bandInnerBox: bandInner,
      footerBox: footer ? box(footer) : null,
    };
  }, { frameSelector, itemSelector });
}

function expectInside(frameBox: Box, box: Box, label: string, tolerance = 1) {
  expect(box.top, `${label} top`).toBeGreaterThanOrEqual(frameBox.top - tolerance);
  expect(box.bottom, `${label} bottom`).toBeLessThanOrEqual(frameBox.bottom + tolerance);
  expect(box.left, `${label} left`).toBeGreaterThanOrEqual(frameBox.left - tolerance);
  expect(box.right, `${label} right`).toBeLessThanOrEqual(frameBox.right + tolerance);
}

it("mandatory brand band fits the calculated frame with hidden header/footer", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    const frame = goldenFrame();

    for (const templateId of ["signature", "broadcast"] as const) {
      const content = { ...createDefaultStandingsContent(), rowCount: 5 };
      const model = buildStandingsViewModelV2(frame, { state: "live" }, { ...content, classScope: "all-classes" });
      const widget = standingsDefinition.createDefault(`functional-${templateId}`);
      widget.visual.systemId = "vantare-functional";

      async function renderFunctional(settings: Record<string, unknown>, w: number, h: number) {
        const layout = { ...widget.layout, w, h };
        await page.setContent(
          doc(functionalCss(), renderToStaticMarkup(
            <div id="frame" style={{ width: layout.w, height: layout.h }}>
              <WidgetVisualViewport widgetType="standings" layout={layout} visual={widget.visual} testId="viewport">
                <StandingsFunctional model={model} settings={settings} renderMode="harness" />
              </WidgetVisualViewport>
            </div>,
          )),
        );
        await page.evaluate(() => document.fonts.ready);
        return containment(page, "#frame", "[data-standings-row]");
      }

      // Baseline with a visible header: records the accepted row extents and
      // content overflow, so the band case can prove it adds no new clipping.
      // NOTE: earlier runs without doctype measured phantom "pre-existing"
      // slack (BackCompat/quirks tables neither inherit nor measure like the
      // product, which ships CSS1Compat). Do not relax limits from quirks data.
      const baselineSettings = { templateId, showSessionHeader: true, showSessionFooter: true };
      const baselineSize = resolveFunctionalStandingsSize(content.columns, 5, baselineSettings);
      const baseline = await renderFunctional(
        baselineSettings, baselineSize.width, baselineSize.height,
      );
      expect(baseline.items).toHaveLength(5);
      expect(baseline.bandBox, `${templateId} baseline band`).toBeNull();
      // Accepted overflow of the whole baseline content (rows + footer).
      const baselineOverflow = Math.max(
        0,
        ...baseline.items.map((row) => row.bottom - baseline.frameBox.bottom),
        ...(baseline.footerBox ? [baseline.footerBox.bottom - baseline.frameBox.bottom] : []),
      );

      const settings = {
        templateId,
        showSessionHeader: false,
        showSessionFooter: false,
        headerFirst: "none",
        headerSecond: "none",
        footerFirst: "none",
        footerSecond: "none",
        brandVisible: true,
      };
      const size = resolveFunctionalStandingsSize(content.columns, 5, settings);
      const measured = await renderFunctional(settings, size.width, size.height);
      expect(measured.bandBox, `${templateId} brand band`).toBeTruthy();
      expectInside(measured.frameBox, measured.bandBox!, `${templateId} brand band`);
      expect(measured.bandInnerBox, `${templateId} brand content`).toBeTruthy();
      expectInside(measured.frameBox, measured.bandInnerBox!, `${templateId} brand content`);
      expect(measured.items).toHaveLength(5);
      expect(measured.items).toHaveLength(baseline.items.length);
      for (const [index, row] of measured.items.entries()) {
        // The band shifts rows down by design; it must stay strictly inside
        // the calculated frame and add no new clipping past the accepted
        // baseline overflow (+1 subpixel).
        expectInside(measured.frameBox, row, `${templateId} row ${index}`);
        expect(row.bottom - measured.frameBox.bottom, `${templateId} row ${index} overflow`)
          .toBeLessThanOrEqual(baselineOverflow + 1);
        expect(row.right, `${templateId} row ${index} right`)
          .toBeLessThanOrEqual(baseline.items[index]!.right + 1);
      }
      expect(measured.frameBox.bottom - measured.frameBox.top).toBe(size.height);
    }

    const crystalCases = [
      {
        name: "crystal standings",
        renderer: "standings" as const,
        settings: { showSessionHeader: false, brandVisible: true },
        rows: "[data-standings-row]",
      },
      {
        name: "crystal relative",
        renderer: "relative" as const,
        settings: { showHeader: false, brandVisible: true },
        rows: "[data-relative-row]",
      },
    ];
    for (const { name, renderer, settings, rows } of crystalCases) {
      const widget = standingsDefinition.createDefault(`crystal-${renderer}`);
      widget.visual.systemId = "vantare-crystal";
      const layout = { ...widget.layout, w: 520, h: 600 };
      const standingsModel = buildStandingsViewModelV2(frame, { state: "live" }, { ...createDefaultStandingsContent(), classScope: "all-classes", rowCount: 5 });
      const relativeModel = buildRelativeViewModelV2(frame, { state: "live" }, createDefaultRelativeContent());
      const node = renderer === "standings"
        ? <StandingsCrystal model={standingsModel} settings={settings} renderMode="harness" />
        : <RelativeCrystal model={relativeModel} settings={settings} renderMode="harness" />;
      await page.setContent(
        doc(crystalCss(), renderToStaticMarkup(
          <div id="frame" style={{ width: layout.w, height: layout.h }}>
            <WidgetVisualViewport widgetType={renderer === "standings" ? "standings" : "relative"} layout={layout} visual={widget.visual} testId="viewport">
              {node}
            </WidgetVisualViewport>
          </div>,
        )),
      );
      await page.evaluate(() => document.fonts.ready);
      const measured = await containment(page, "#frame", rows);
      expect(measured.bandBox, `${name} brand band`).toBeTruthy();
      expectInside(measured.frameBox, measured.bandBox!, `${name} brand band`);
      expect(measured.bandInnerBox, `${name} brand content`).toBeTruthy();
      expectInside(measured.frameBox, measured.bandInnerBox!, `${name} brand content`);
      expect(measured.items.length, `${name} rows`).toBeGreaterThan(0);
      for (const [index, row] of measured.items.entries()) {
        expectInside(measured.frameBox, row, `${name} row ${index}`);
      }
    }

    const pedalsModel: PedalsViewModel = {
      type: "pedals",
      status: "ready",
      throttle: 0.6,
      brake: 0.3,
      clutch: 0,
      throttleText: "60%",
      brakeText: "30%",
      clutchText: "0%",
    };
    const pedalsWidget = standingsDefinition.createDefault("crystal-pedals");
    pedalsWidget.visual.systemId = "vantare-crystal";
    for (const pedalsLayout of [
      // Representative productive size.
      { x: 0, y: 0, w: 200, h: 260, zIndex: 0, aspectLocked: false },
      // Canonical default size (viewport scale 1).
      { x: 0, y: 0, w: 120, h: 160, zIndex: 0, aspectLocked: false },
    ]) {
      await page.setContent(
        doc(crystalCss(), renderToStaticMarkup(
          <div id="frame" style={{ width: pedalsLayout.w, height: pedalsLayout.h }}>
            <WidgetVisualViewport widgetType="pedals" layout={pedalsLayout} visual={pedalsWidget.visual} testId="viewport">
              <PedalsCrystal model={pedalsModel} settings={{ brandVisible: true }} renderMode="harness" />
            </WidgetVisualViewport>
          </div>,
        )),
      );
      await page.evaluate(() => document.fonts.ready);
      const pedals = await containment(page, "#frame", ".vc-pedals-channel");
      const sizeLabel = `${pedalsLayout.w}x${pedalsLayout.h}`;
      expect(pedals.bandBox, `pedals ${sizeLabel} brand band`).toBeTruthy();
      expectInside(pedals.frameBox, pedals.bandBox!, `pedals ${sizeLabel} brand band`);
      expect(pedals.bandInnerBox, `pedals ${sizeLabel} brand content`).toBeTruthy();
      expectInside(pedals.frameBox, pedals.bandInnerBox!, `pedals ${sizeLabel} brand content`);
      expect(pedals.items).toHaveLength(3);
      for (const [index, channel] of pedals.items.entries()) {
        // The discreet chip must not intersect any channel or label: strict
        // AABB disjointness, not just frame containment.
        expect(
          pedals.bandInnerBox!.right <= channel.left ||
          pedals.bandInnerBox!.left >= channel.right ||
          pedals.bandInnerBox!.bottom <= channel.top ||
          pedals.bandInnerBox!.top >= channel.bottom,
          `pedals ${sizeLabel} brand intersects channel ${index}`,
        ).toBe(true);
      }
    }
  } finally {
    await browser.close();
  }
}, 90_000);
