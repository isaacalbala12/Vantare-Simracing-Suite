// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import type { OverlayUpdateV2 } from "../../../../generated/telemetry";
import { createTelemetryRateCoordinator } from "../../../core/telemetry-rate-coordinator";
import type { WidgetInstanceV3 } from "../../../core/profile-document";
import { WidgetVisualHost } from "../../../core/WidgetVisualHost";
import { WidgetVisualViewport } from "../../../core/WidgetVisualViewport";
import { RuntimeWidgetFrame } from "../../../runtime/RuntimeWidgetFrame";
import { standingsDefinition } from "../../../widget-types/standings/standings-definition";
import goldenV2Raw from "../../../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json?raw";

type Surface = "desktop" | "studio" | "obs";

const widths = [280, 340, 419, 420] as const;
const surfaces: readonly Surface[] = ["desktop", "studio", "obs"];
const golden = JSON.parse(goldenV2Raw) as OverlayUpdateV2;

function buildWidget(width: number): WidgetInstanceV3 {
  const widget = standingsDefinition.createDefault(`standings-redline-${width}`);
  return {
    ...widget,
    layout: { ...widget.layout, x: 0, y: 0, w: width, h: 560, aspectLocked: false },
    visual: {
      ...widget.visual,
      systemId: "vantare-endurance",
      baseSettings: { templateId: "standings-redline" },
    },
  };
}

function renderReadySurface(surface: Surface, width: number): string {
  if (!golden.frame) throw new Error("20-car Overlay V2 golden frame missing");
  const widget = buildWidget(width);
  const telemetry = createTelemetryRateCoordinator();
  telemetry.setOverlayFrame(golden.frame, golden.source);

  const markup = surface === "studio"
    ? renderToStaticMarkup(
        <div data-testid="runtime-widget-frame" style={{ width, height: widget.layout.h, overflow: "hidden" }}>
          <WidgetVisualViewport
            widgetType={widget.type}
            visual={widget.visual}
            layout={widget.layout}
            testId={`studio-widget-viewport-${widget.id}`}
          >
            <WidgetVisualHost
              widget={widget}
              renderMode="studio"
              runtime={{ overlayV2Frame: golden.frame, overlayV2Source: golden.source }}
            />
          </WidgetVisualViewport>
        </div>,
      )
    : renderToStaticMarkup(
        <RuntimeWidgetFrame
          widget={widget}
          profileId="isa-968-golden"
          telemetry={telemetry}
          renderMode={surface}
        />,
      );
  telemetry.dispose();
  return markup;
}

function renderMissingSurface(surface: Exclude<Surface, "studio">, width: number): string {
  const widget = buildWidget(width);
  const telemetry = createTelemetryRateCoordinator();
  const markup = renderToStaticMarkup(
    <RuntimeWidgetFrame
      widget={widget}
      profileId="isa-968-missing"
      telemetry={telemetry}
      renderMode={surface}
    />,
  );
  telemetry.dispose();
  return markup;
}

describe("Standings Redline narrow production geometry", () => {
  it("keeps every visible golden V2 row, column and descendant inside 280-420 px frames", async () => {
    const css = readFileSync(join(__dirname, "..", "tokens.css"), "utf8");
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
      for (const surface of surfaces) {
        for (const width of widths) {
          await page.setContent(
            `<style>html,body{margin:0;background:transparent}*,*::before,*::after{box-sizing:border-box}${css}</style>`
              + renderReadySurface(surface, width),
          );
          const result = await page.evaluate(() => {
            const frame = document.querySelector<HTMLElement>('[data-testid="runtime-widget-frame"]');
            const renderer = document.querySelector<HTMLElement>('[data-template="standings-redline"]');
            if (!frame || !renderer) throw new Error("missing productive Redline frame or renderer");
            const frameBox = frame.getBoundingClientRect();
            const visible = [renderer, ...renderer.querySelectorAll<HTMLElement>("*")]
              .filter((element) => {
                const style = getComputedStyle(element);
                const box = element.getBoundingClientRect();
                return style.display !== "none"
                  && style.visibility !== "hidden"
                  && Number(style.opacity) > 0
                  && box.width > 0
                  && box.height > 0;
              });
            const outside = visible.flatMap((element) => {
              const box = element.getBoundingClientRect();
              return box.left < frameBox.left - 1 || box.right > frameBox.right + 1
                || box.top < frameBox.top - 1 || box.bottom > frameBox.bottom + 1
                ? [`${element.tagName}.${element.className} ${box.left}/${box.right}/${box.top}/${box.bottom}`]
                : [];
            });
            const rows = [...renderer.querySelectorAll<HTMLElement>("[data-standings-row]")];
            const rowMetrics = rows.map((row) =>
              [...row.querySelectorAll<HTMLElement>("[data-metric]")]
                .map((cell) => cell.dataset.metric ?? "")
                .filter(Boolean),
            );
            return {
              frameWidth: frameBox.width,
              status: renderer.dataset.status,
              rowCount: rows.length,
              rowMetrics,
              outside,
            };
          });

          const context = `${surface}/${width}px`;
          expect(result.frameWidth, `${context} frame width`).toBeCloseTo(width, 1);
          expect(result.status, `${context} V2 status`).toBe("ready");
          expect(result.rowCount, `${context} complete rows`).toBeGreaterThan(0);
          expect(result.rowMetrics, `${context} real configured columns`).toEqual(
            Array.from({ length: result.rowCount }, () => [
              "position",
              "driverName",
              "driverNumber",
              "gap",
              "lastLap",
            ]),
          );
          expect(result.outside, `${context} visible descendants outside frame`).toEqual([]);
        }
      }
    } finally {
      await browser.close();
    }
  });

  it("keeps the productive missing-state diagnostic inside every narrow Desktop and OBS frame", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
      for (const surface of ["desktop", "obs"] as const) {
        for (const width of widths) {
          await page.setContent(renderMissingSurface(surface, width));
          const result = await page.evaluate(() => {
            const frame = document.querySelector<HTMLElement>('[data-testid="runtime-widget-frame"]')!;
            const alert = document.querySelector<HTMLElement>('[role="alert"]')!;
            const frameBox = frame.getBoundingClientRect();
            const alertBox = alert.getBoundingClientRect();
            return {
              code: alert.dataset.diagnosticCode,
              inside: alertBox.left >= frameBox.left - 1
                && alertBox.right <= frameBox.right + 1
                && alertBox.top >= frameBox.top - 1
                && alertBox.bottom <= frameBox.bottom + 1,
            };
          });
          expect(result.code, `${surface}/${width}px missing code`).toBe("overlay-v2-frame-missing");
          expect(result.inside, `${surface}/${width}px missing geometry`).toBe(true);
        }
      }
    } finally {
      await browser.close();
    }
  });
});
