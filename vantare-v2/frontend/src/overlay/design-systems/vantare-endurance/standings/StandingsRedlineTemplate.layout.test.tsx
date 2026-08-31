// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import type { OverlayUpdateV2 } from "../../../../generated/telemetry";
import type { WidgetRuntimeInput } from "../../../core/widget-definition";
import { createTelemetryRateCoordinator } from "../../../core/telemetry-rate-coordinator";
import type { WidgetInstanceV3 } from "../../../core/profile-document";
import { RuntimeWidgetFrame } from "../../../runtime/RuntimeWidgetFrame";
import { standingsDefinition } from "../../../widget-types/standings/standings-definition";
import type { StandingsContent } from "../../../widget-types/standings/standings-content";
import { resolveStandingsRedlineFrameLayout } from "../../../widget-types/standings/standings-redline-layout";
import { StudioTelemetryContext } from "../../../../hub/overlay-studio/canvas/studio-telemetry";
import { StudioWidgetFrame } from "../../../../hub/overlay-studio/canvas/StudioWidgetFrame";
import goldenV2Raw from "../../../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json?raw";

type Surface = "desktop" | "studio" | "obs";
type State = "ready" | "missing";

const widths = [280, 340, 419, 420] as const;
const surfaces: readonly Surface[] = ["desktop", "studio", "obs"];
const golden = JSON.parse(goldenV2Raw) as OverlayUpdateV2;
const expectedMetrics = [
  "position",
  "driverName",
  "gap",
  "vehicleClass",
  "tireCompound",
  "pit",
  "currentLap",
  "interval",
  "lastLap",
  "driverNumber",
  "bestLap",
] as const;
// 12 tracks: the two anchors, Redline's motion delta and all nine configurable metrics.
// Presets: 36 + 90 + 44 + (90 + 36 + 20 + 52 + 60 + 90 + 36 + 90 + 60),
// plus eleven 8px gaps and 34px row/block chrome.
const expectedEffectiveWidth = 826;

const activityGate = {
  getActive: () => true,
  subscribe: () => () => undefined,
};

function buildMaximumContent(): StandingsContent {
  const defaults = standingsDefinition.parseContent(undefined);
  const order = [
    "gap",
    "driverName",
    "vehicleClass",
    "tireCompound",
    "pit",
    "currentLap",
    "interval",
    "lastLap",
    "driverNumber",
    "bestLap",
    "position",
  ] as const;
  const presets = {
    position: "sm",
    driverName: "lg",
    vehicleClass: "lg",
    tireCompound: "sm",
    pit: "xs",
    currentLap: "auto",
    interval: "md",
    lastLap: "lg",
    driverNumber: "sm",
    bestLap: "lg",
    gap: "md",
  } as const;
  const aligns = {
    driverName: "left",
    vehicleClass: "center",
    lastLap: "left",
    gap: "right",
  } as const;
  const byMetric = new Map(defaults.columns.map((column) => [column.metricId, column]));
  return {
    ...defaults,
    columns: order.map((metricId) => {
      const column = byMetric.get(metricId);
      if (!column) throw new Error(`missing standings column: ${metricId}`);
      return {
        ...column,
        enabled: true,
        widthPreset: presets[metricId],
        style: { ...column.style, align: aligns[metricId as keyof typeof aligns] },
      };
    }),
  };
}

function buildWidget(width: number): WidgetInstanceV3 {
  const widget = standingsDefinition.createDefault(`standings-redline-${width}`);
  return {
    ...widget,
    content: buildMaximumContent(),
    layout: { ...widget.layout, x: 0, y: 0, w: width, h: 560, aspectLocked: false },
    visual: {
      ...widget.visual,
      systemId: "vantare-endurance",
      baseSettings: { templateId: "standings-redline" },
    },
  };
}

function renderSurface(surface: Surface, state: State, width: number): string {
  if (!golden.frame) throw new Error("20-car Overlay V2 golden frame missing");
  const widget = buildWidget(width);
  const telemetry = createTelemetryRateCoordinator();
  const runtime: WidgetRuntimeInput = state === "ready"
    ? { overlayV2Frame: golden.frame, overlayV2Source: golden.source }
    : {};
  if (state === "ready") telemetry.setOverlayFrame(golden.frame, golden.source);
  const runtimeWidget = {
    ...widget,
    // RuntimeOverlaySurface owns the effective Redline geometry before it
    // delegates the final frame to RuntimeWidgetFrame.
    layout: resolveStandingsRedlineFrameLayout(widget, widget.layout, 1920),
  };

  const markup = surface === "studio"
    ? renderToStaticMarkup(
        <StudioTelemetryContext.Provider
          value={{ coordinator: telemetry, liveAvailable: false, active: true, activityGate, runtime }}
        >
          <StudioWidgetFrame
            widget={widget}
            profileId="isa-968-golden"
            layout={widget.layout}
            selected={false}
            onSelect={() => undefined}
          />
        </StudioTelemetryContext.Provider>,
      )
    : renderToStaticMarkup(
        <RuntimeWidgetFrame
          widget={runtimeWidget}
          profileId="isa-968-golden"
          telemetry={telemetry}
          renderMode={surface}
        />,
      );
  telemetry.dispose();
  return markup;
}

describe("Standings Redline narrow production geometry", () => {
  it("keeps the maximum configured columns legible through productive frames at 280-420 px", async () => {
    const enduranceCss = readFileSync(join(__dirname, "..", "tokens.css"), "utf8");
    const studioCss = readFileSync(
      join(__dirname, "..", "..", "..", "..", "hub", "overlay-studio", "overlay-studio-v3.css"),
      "utf8",
    );
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
      for (const surface of surfaces) {
        for (const width of widths) {
          await page.setContent(
            `<style>html,body{margin:0;background:transparent}*,*::before,*::after{box-sizing:border-box}${enduranceCss}${studioCss}</style>`
              + renderSurface(surface, "ready", width),
          );
          const result = await page.evaluate(({ expectedMetrics }) => {
            const renderer = document.querySelector<HTMLElement>('[data-template="standings-redline"]');
            const frame = renderer?.closest<HTMLElement>('[data-testid^="runtime-widget-frame"], [data-testid^="studio-widget-frame-"]');
            if (!frame || !renderer) throw new Error("missing productive Redline frame or renderer");
            const frameBox = frame.getBoundingClientRect();
            const rows = [...renderer.querySelectorAll<HTMLElement>("[data-standings-row]")];
            const firstRow = rows[0];
            if (!firstRow) throw new Error("missing complete Redline row");
            const cells = [...firstRow.querySelectorAll<HTMLElement>("[data-metric]")];
            const clipped = cells.flatMap((cell) =>
              [cell, ...cell.querySelectorAll<HTMLElement>("*")]
                .filter((node) => node.textContent?.trim())
                .filter((node) => node.scrollWidth > node.clientWidth + 1)
                .map((node) => `${cell.dataset.metric}:${node.clientWidth}/${node.scrollWidth}`),
            );
            const outside = [renderer, ...renderer.querySelectorAll<HTMLElement>("*")]
              .filter((element) => {
                const style = getComputedStyle(element);
                const box = element.getBoundingClientRect();
                return style.display !== "none" && style.visibility !== "hidden"
                  && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
              })
              .flatMap((element) => {
                const box = element.getBoundingClientRect();
                return box.left < frameBox.left - 1 || box.right > frameBox.right + 1
                  || box.top < frameBox.top - 1 || box.bottom > frameBox.bottom + 1
                  ? [`${element.tagName}.${element.className}`]
                  : [];
              });
            return {
              frameWidth: frameBox.width,
              status: renderer.dataset.status,
              rowCount: rows.length,
              metrics: cells.map((cell) => cell.dataset.metric),
              widths: Object.fromEntries(cells.map((cell) => [cell.dataset.metric, cell.clientWidth])),
              aligns: Object.fromEntries(cells.map((cell) => [cell.dataset.metric, getComputedStyle(cell).textAlign])),
              clipped,
              outside,
              completeRows: rows.every((row) =>
                expectedMetrics.every((metric) => row.querySelector(`[data-metric="${metric}"]`))),
            };
          }, { expectedMetrics });

          const context = `${surface}/${width}px`;
          expect(result.frameWidth, `${context} explicit effective width`).toBeCloseTo(expectedEffectiveWidth, 1);
          expect(result.status, `${context} V2 status`).toBe("ready");
          expect(result.rowCount, `${context} complete rows`).toBeGreaterThan(0);
          expect(result.metrics, `${context} configured order`).toEqual(expectedMetrics);
          expect(result.widths.lastLap, `${context} lg preset`).toBeGreaterThanOrEqual(90);
          expect(result.widths.pit, `${context} xs preset`).toBeGreaterThanOrEqual(20);
          expect(result.aligns.vehicleClass, `${context} centered class`).toBe("center");
          expect(result.aligns.lastLap, `${context} left last lap`).toBe("left");
          expect(result.aligns.gap, `${context} right gap`).toBe("right");
          expect(result.completeRows, `${context} complete configured rows`).toBe(true);
          expect(result.clipped, `${context} clipped values`).toEqual([]);
          expect(result.outside, `${context} visible descendants outside frame`).toEqual([]);
        }
      }
    } finally {
      await browser.close();
    }
  });

  it("keeps missing diagnostics inside productive Desktop, Studio and OBS frames", async () => {
    const studioCss = readFileSync(
      join(__dirname, "..", "..", "..", "..", "hub", "overlay-studio", "overlay-studio-v3.css"),
      "utf8",
    );
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
      for (const surface of surfaces) {
        for (const width of widths) {
          await page.setContent(`<style>${studioCss}</style>${renderSurface(surface, "missing", width)}`);
          const result = await page.evaluate(() => {
            const alert = document.querySelector<HTMLElement>('[role="alert"]');
            const frame = alert?.closest<HTMLElement>('[data-testid^="runtime-widget-frame"], [data-testid^="studio-widget-frame-"]');
            if (!frame || !alert) throw new Error("missing productive frame or diagnostic");
            const frameBox = frame.getBoundingClientRect();
            const alertBox = alert.getBoundingClientRect();
            return {
              frameWidth: frameBox.width,
              code: alert.dataset.diagnosticCode,
              inside: alertBox.left >= frameBox.left - 1 && alertBox.right <= frameBox.right + 1
                && alertBox.top >= frameBox.top - 1 && alertBox.bottom <= frameBox.bottom + 1,
            };
          });
          expect(result.frameWidth, `${surface}/${width}px effective missing width`).toBeCloseTo(expectedEffectiveWidth, 1);
          expect(result.code, `${surface}/${width}px missing code`).toBe("overlay-v2-frame-missing");
          expect(result.inside, `${surface}/${width}px missing geometry`).toBe(true);
        }
      }
    } finally {
      await browser.close();
    }
  });
});
