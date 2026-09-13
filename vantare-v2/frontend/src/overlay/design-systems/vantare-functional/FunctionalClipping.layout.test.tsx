// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { createTelemetryRateCoordinator } from "../../core/telemetry-rate-coordinator";
import { RuntimeWidgetFrame } from "../../runtime/RuntimeWidgetFrame";
import {
  buildWorkshopFrameV2,
  buildWorkshopWidget,
} from "../../authoring/fixtures/authoring-v2-workshop-frame";
import { resolveStandingsMinimumSize } from "../../widget-types/standings/standings-frame-layout";
import type { WidgetInstanceV3 } from "../../core/profile-document";

const functionalCss = readFileSync(join(__dirname, "tokens.css"), "utf8");

type Scenario = {
  widget: WidgetInstanceV3["type"];
  system: "vantare-functional";
  variant: Parameters<typeof buildWorkshopWidget>[0]["variant"];
  session: "race";
  location: "track";
  state: "ready";
};

function buildWidget(scenario: Scenario, useStudySize = false): { widget: WidgetInstanceV3; runtime: ReturnType<typeof buildWorkshopFrameV2> } {
  let widget = buildWorkshopWidget(scenario);
  const runtime = buildWorkshopFrameV2(scenario);
  // Coloca el frame en el origen del canvas de prueba para que las
  // coordenadas getBoundingClientRect sean directas y la ventana lo enmarque.
  widget = { ...widget, layout: { ...widget.layout, x: 0, y: 0 } };
  if (useStudySize && widget.type === "standings") {
    const study = resolveStandingsMinimumSize(widget);
    if (study?.height !== undefined) {
      widget = { ...widget, layout: { ...widget.layout, w: study.width, h: study.height + 30 } };
    }
  }
  return { widget, runtime };
}

function renderMarkup(widget: WidgetInstanceV3, runtime: ReturnType<typeof buildWorkshopFrameV2>, extraCss = ""): string {
  const telemetry = createTelemetryRateCoordinator();
  if (runtime.overlayV2Frame && runtime.overlayV2Source) {
    telemetry.setOverlayFrame(runtime.overlayV2Frame, runtime.overlayV2Source);
  }
  const frame = (
    <div className={extraCss ? "functional-study" : undefined} data-study-style={extraCss ? "v2-focus" : undefined} style={{ position: "relative", width: widget.layout.w, height: widget.layout.h, background: "#111" }}>
      <RuntimeWidgetFrame widget={widget} profileId="test" telemetry={telemetry} renderMode="desktop" />
    </div>
  );
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>html,body{margin:0;background:#111}${functionalCss}${extraCss}</style></head>
<body>${renderToStaticMarkup(frame)}</body>
</html>`;
}

describe("Functional Workshop clipping and fill", () => {
  it("Standings study (15 rows) fills the frame without gap before the footer", async () => {
    const scenario: Scenario = {
      widget: "standings",
      system: "vantare-functional",
      variant: "standings-functional-study",
      session: "race",
      location: "track",
      state: "ready",
    };
    const { widget, runtime } = buildWidget(scenario, true);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: widget.layout.w + 40, height: widget.layout.h + 40 } });
      await page.setContent(renderMarkup(widget, runtime));
      const result = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>("[data-testid='runtime-widget-frame']");
        const table = document.querySelector<HTMLElement>(".vf-table");
        const wrap = document.querySelector<HTMLElement>(".vf-table-wrap");
        const footer = document.querySelector<HTMLElement>("[data-session-footer]");
        const lastRow = document.querySelector<HTMLElement>("[data-standings-row]:last-child");
        const rows = [...document.querySelectorAll<HTMLElement>("[data-standings-row]")];
        const frameBox = frame?.getBoundingClientRect();
        const tableBox = table?.getBoundingClientRect();
        const wrapBox = wrap?.getBoundingClientRect();
        const footerBox = footer?.getBoundingClientRect();
        const lastRowBox = lastRow?.getBoundingClientRect();
        const outside = frame
          ? [...frame.querySelectorAll<HTMLElement>("*")].filter((el) => {
              const style = getComputedStyle(el);
              const box = el.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0
                && (box.left < frameBox!.left - 1 || box.right > frameBox!.right + 1 || box.top < frameBox!.top - 1 || box.bottom > frameBox!.bottom + 1);
            }).map((el) => `${el.tagName}.${el.className}`)
          : [];
        return {
          frameHeight: frameBox?.height,
          frameWidth: frameBox?.width,
          tableHeight: tableBox?.height,
          wrapHeight: wrapBox?.height,
          footerTop: footerBox?.top,
          tableBottom: tableBox?.bottom,
          lastRowBottom: lastRowBox?.bottom,
          rowCount: rows.length,
          gapBeforeFooter: footerBox && tableBox ? footerBox.top - tableBox.bottom : undefined,
          outside,
        };
      });
      console.log("Standings study layout:", result);
      expect(result.rowCount).toBe(15);
      expect(result.gapBeforeFooter).toBeLessThanOrEqual(0);
      expect(result.outside).toHaveLength(0);
    } finally {
      await browser.close();
    }
  });

  it("Standings study Foco (shorter rows) still fills the wrap", async () => {
    const scenario: Scenario = {
      widget: "standings",
      system: "vantare-functional",
      variant: "standings-functional-study",
      session: "race",
      location: "track",
      state: "ready",
    };
    const { widget, runtime } = buildWidget(scenario, true);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: widget.layout.w + 40, height: widget.layout.h + 40 } });
      const focoCss = `.functional-study[data-study-style="v2-focus"] .vf-standings .vf-table td { height: 28px; }`;
      await page.setContent(renderMarkup(widget, runtime, focoCss));
      const result = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>("[data-testid='runtime-widget-frame']");
        const table = document.querySelector<HTMLElement>(".vf-table");
        const wrap = document.querySelector<HTMLElement>(".vf-table-wrap");
        const footer = document.querySelector<HTMLElement>("[data-session-footer]");
        const lastRow = document.querySelector<HTMLElement>("[data-standings-row]:last-child");
        const rows = [...document.querySelectorAll<HTMLElement>("[data-standings-row]")];
        const frameBox = frame?.getBoundingClientRect();
        const tableBox = table?.getBoundingClientRect();
        const wrapBox = wrap?.getBoundingClientRect();
        const footerBox = footer?.getBoundingClientRect();
        const lastRowBox = lastRow?.getBoundingClientRect();
        const outside = frame
          ? [...frame.querySelectorAll<HTMLElement>("*")].filter((el) => {
              const style = getComputedStyle(el);
              const box = el.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0
                && (box.left < frameBox!.left - 1 || box.right > frameBox!.right + 1 || box.top < frameBox!.top - 1 || box.bottom > frameBox!.bottom + 1);
            }).map((el) => `${el.tagName}.${el.className}`)
          : [];
        return {
          frameHeight: frameBox?.height,
          tableHeight: tableBox?.height,
          wrapHeight: wrapBox?.height,
          footerTop: footerBox?.top,
          tableBottom: tableBox?.bottom,
          lastRowBottom: lastRowBox?.bottom,
          rowCount: rows.length,
          gapBeforeFooter: footerBox && tableBox ? footerBox.top - tableBox.bottom : undefined,
          outside,
        };
      });
      console.log("Standings study Foco layout:", result);
      expect(result.rowCount).toBe(15);
      expect(result.gapBeforeFooter).toBeLessThanOrEqual(0);
      expect(result.outside).toHaveLength(0);
    } finally {
      await browser.close();
    }
  });

  it("Relative multiclass fills the table-wrap and adapts rows to the frame", async () => {
    const scenario: Scenario = {
      widget: "relative",
      system: "vantare-functional",
      variant: "relative-multiclass",
      session: "race",
      location: "track",
      state: "ready",
    };
    const { widget, runtime } = buildWidget(scenario);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: widget.layout.w + 40, height: widget.layout.h + 40 } });
      await page.setContent(renderMarkup(widget, runtime));
      const result = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>("[data-testid='runtime-widget-frame']");
        const table = document.querySelector<HTMLElement>(".vf-table");
        const wrap = document.querySelector<HTMLElement>(".vf-table-wrap");
        const footer = document.querySelector<HTMLElement>("[data-session-footer]");
        const lastRow = document.querySelector<HTMLElement>("[data-relative-row]:last-child");
        const rows = [...document.querySelectorAll<HTMLElement>("[data-relative-row]")];
        const frameBox = frame?.getBoundingClientRect();
        const tableBox = table?.getBoundingClientRect();
        const wrapBox = wrap?.getBoundingClientRect();
        const footerBox = footer?.getBoundingClientRect();
        const outside = frame
          ? [...frame.querySelectorAll<HTMLElement>("*")].filter((el) => {
              const style = getComputedStyle(el);
              const box = el.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0
                && (box.left < frameBox!.left - 1 || box.right > frameBox!.right + 1 || box.top < frameBox!.top - 1 || box.bottom > frameBox!.bottom + 1);
            }).map((el) => `${el.tagName}.${el.className}`)
          : [];
        return {
          frameHeight: frameBox?.height,
          frameWidth: frameBox?.width,
          tableHeight: tableBox?.height,
          wrapHeight: wrapBox?.height,
          footerTop: footerBox?.top,
          tableBottom: tableBox?.bottom,
          lastRowBottom: lastRow?.getBoundingClientRect().bottom,
          rowCount: rows.length,
          gapBeforeFooter: footerBox && tableBox ? footerBox.top - tableBox.bottom : undefined,
          outside,
        };
      });
      console.log("Relative multiclass layout:", result);
      expect(result.rowCount).toBeGreaterThanOrEqual(1);
      expect(result.gapBeforeFooter).toBeCloseTo(0, 0);
      expect(result.tableHeight).toBeCloseTo(result.wrapHeight ?? 0, -1);
      expect(result.outside).toHaveLength(0);
    } finally {
      await browser.close();
    }
  });

  it("Pedals bars fill the frame vertically", async () => {
    const scenario: Scenario = {
      widget: "pedals",
      system: "vantare-functional",
      variant: "pedals-full",
      session: "race",
      location: "track",
      state: "ready",
    };
    const { widget, runtime } = buildWidget(scenario);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: widget.layout.w + 40, height: widget.layout.h + 40 } });
      await page.setContent(renderMarkup(widget, runtime));
      const result = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>("[data-testid='runtime-widget-frame']");
        const renderer = document.querySelector<HTMLElement>("[data-widget-renderer='pedals']");
        const bars = document.querySelector<HTMLElement>(".vf-pedals-bars");
        const track = document.querySelector<HTMLElement>('[data-pedal="throttle"] .vf-pedal-track');
        const frameBox = frame?.getBoundingClientRect();
        const outside = frame
          ? [...frame.querySelectorAll<HTMLElement>("*")].filter((el) => {
              const style = getComputedStyle(el);
              const box = el.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0
                && (box.left < frameBox!.left - 1 || box.right > frameBox!.right + 1 || box.top < frameBox!.top - 1 || box.bottom > frameBox!.bottom + 1);
            }).map((el) => `${el.tagName}.${el.className}`)
          : [];
        return {
          frameHeight: frameBox?.height,
          frameWidth: frameBox?.width,
          rendererHeight: renderer?.getBoundingClientRect().height,
          barsHeight: bars?.getBoundingClientRect().height,
          trackHeight: track?.getBoundingClientRect().height,
          outside,
        };
      });
      console.log("Pedals full layout:", result);
      expect(result.trackHeight).toBeGreaterThan((result.frameHeight ?? 0) * 0.5);
      expect(result.rendererHeight).toBeCloseTo(result.frameHeight ?? 0, -1);
      expect(result.outside).toHaveLength(0);
    } finally {
      await browser.close();
    }
  });
});
