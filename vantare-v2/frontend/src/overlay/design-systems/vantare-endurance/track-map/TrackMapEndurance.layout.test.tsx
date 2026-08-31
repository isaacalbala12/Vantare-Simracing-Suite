// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { buildAuthoringV2Runtime } from "../../../authoring/fixtures/authoring-v2-fixture";
import { buildMockTelemetry } from "../../../core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../../../core/telemetry-rate-coordinator";
import { WidgetVisualHost } from "../../../core/WidgetVisualHost";
import { WidgetVisualViewport } from "../../../core/WidgetVisualViewport";
import type { WidgetInstanceV3 } from "../../../core/profile-document";
import { RuntimeWidgetFrame } from "../../../runtime/RuntimeWidgetFrame";
import { TRACK_GEOMETRY_PACK } from "../../../track-geometry/track-geometry-pack";
import { trackMapDefinition } from "../../../widget-types/track-map/track-map-definition";

type Surface = "desktop" | "studio" | "obs";
type Size = Readonly<{ width: number; height: number; label: string }>;

const surfaces: readonly Surface[] = ["desktop", "studio", "obs"];
const sizes: readonly Size[] = [
  { width: 160, height: 110, label: "minimum" },
  { width: 320, height: 220, label: "default" },
  { width: 640, height: 440, label: "audited" },
  { width: 480, height: 260, label: "unlocked resize" },
];

function buildWidget(size: Size): WidgetInstanceV3 {
  const widget = trackMapDefinition.createDefault("track-map-layout");
  return {
    ...widget,
    layout: {
      ...widget.layout,
      x: 0,
      y: 0,
      w: size.width,
      h: size.height,
      aspectLocked: size.label !== "unlocked resize",
    },
  };
}

function buildRuntime() {
  const trackLabel = TRACK_GEOMETRY_PACK.find((geometry) => geometry.synthetic)?.label;
  if (!trackLabel) throw new Error("reference track geometry missing");
  const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
  return buildAuthoringV2Runtime("track-map", {
    ...snapshot,
    session: { ...snapshot.session, trackName: trackLabel },
  });
}

function renderSurface(surface: Surface, size: Size): string {
  const widget = buildWidget(size);
  const runtime = buildRuntime();
  if (!runtime.overlayV2Frame || !runtime.overlayV2Source) {
    throw new Error("track-map V2 fixture missing");
  }

  if (surface === "desktop" || surface === "obs") {
    const telemetry = createTelemetryRateCoordinator();
    telemetry.setOverlayFrame(runtime.overlayV2Frame, runtime.overlayV2Source);
    const markup = renderToStaticMarkup(
      <RuntimeWidgetFrame widget={widget} telemetry={telemetry} renderMode={surface} />,
    );
    telemetry.dispose();
    return markup;
  }

  return renderToStaticMarkup(
    <div
      data-testid="runtime-widget-frame"
      data-surface="studio"
      style={{ position: "absolute", width: size.width, height: size.height }}
    >
      <WidgetVisualViewport
        widgetType={widget.type}
        visual={widget.visual}
        layout={widget.layout}
        testId="studio-widget-viewport-track-map-layout"
      >
        <WidgetVisualHost widget={widget} renderMode="studio" runtime={runtime} />
      </WidgetVisualViewport>
    </div>,
  );
}

describe("TrackMapEndurance production layout", () => {
  it("keeps meaningful map content inside every representative frame and surface", async () => {
    const css = readFileSync(join(__dirname, "..", "tokens.css"), "utf8");
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      for (const surface of surfaces) {
        for (const size of sizes) {
          await page.setContent(`
            <style>
              body { margin: 0; }
              [data-testid="runtime-widget-frame"] { overflow: visible !important; }
              ${css}
            </style>
            ${renderSurface(surface, size)}
          `);

          const geometry = await page.evaluate(() => {
            const selectors = {
              frame: '[data-testid="runtime-widget-frame"]',
              renderer: '[data-widget-renderer="track-map"]',
              map: ".ven-tm-canvas",
              outline: ".ven-tm-outline",
              footer: ".ven-tm-footer",
            } as const;
            const frame = document.querySelector(selectors.frame)!.getBoundingClientRect();
            const measured = Object.fromEntries(
              Object.entries(selectors).map(([name, selector]) => {
                const element = document.querySelector(selector)!;
                const box = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                const intersectionWidth = Math.max(
                  0,
                  Math.min(box.right, frame.right) - Math.max(box.left, frame.left),
                );
                const intersectionHeight = Math.max(
                  0,
                  Math.min(box.bottom, frame.bottom) - Math.max(box.top, frame.top),
                );
                return [name, {
                  left: box.left,
                  top: box.top,
                  right: box.right,
                  bottom: box.bottom,
                  width: box.width,
                  height: box.height,
                  intersectionWidth,
                  intersectionHeight,
                  display: style.display,
                  visibility: style.visibility,
                  opacity: Number(style.opacity),
                }];
              }),
            );
            return {
              boxes: measured,
              footerText: document.querySelector(".ven-tm-footer")?.textContent?.trim(),
              rendererSystem: document
                .querySelector('[data-widget-renderer="track-map"]')
                ?.getAttribute("data-widget-system"),
            };
          });

          const context = `${surface}/${size.label}/${size.width}x${size.height}`;
          const frame = geometry.boxes.frame;
          expect(frame.width, `${context} frame width`).toBeGreaterThan(0);
          expect(frame.height, `${context} frame height`).toBeGreaterThan(0);
          expect(frame.width, `${context} frame contract width`).toBeCloseTo(size.width, 1);
          expect(frame.height, `${context} frame contract height`).toBeCloseTo(size.height, 1);
          expect(frame.intersectionWidth, `${context} frame visible width`).toBeGreaterThan(0);
          expect(frame.intersectionHeight, `${context} frame visible height`).toBeGreaterThan(0);
          for (const name of ["renderer", "map", "outline", "footer"] as const) {
            const box = geometry.boxes[name];
            expect(box.width, `${context} ${name} width`).toBeGreaterThan(0);
            expect(box.height, `${context} ${name} height`).toBeGreaterThan(0);
            expect(box.left, `${context} ${name} left`).toBeGreaterThanOrEqual(frame.left - 1);
            expect(box.top, `${context} ${name} top`).toBeGreaterThanOrEqual(frame.top - 1);
            expect(box.right, `${context} ${name} right`).toBeLessThanOrEqual(frame.right + 1);
            expect(box.bottom, `${context} ${name} bottom`).toBeLessThanOrEqual(frame.bottom + 1);
            expect(box.intersectionWidth, `${context} ${name} visible width`).toBeGreaterThan(0);
            expect(box.intersectionHeight, `${context} ${name} visible height`).toBeGreaterThan(0);
            expect(box.display, `${context} ${name} display`).not.toBe("none");
            expect(box.visibility, `${context} ${name} visibility`).toBe("visible");
            expect(box.opacity, `${context} ${name} opacity`).toBeGreaterThan(0);
          }

          expect(geometry.boxes.renderer.width, `${context} renderer fills width`)
            .toBeGreaterThanOrEqual(frame.width - 1);
          expect(geometry.boxes.renderer.height, `${context} renderer fills height`)
            .toBeGreaterThanOrEqual(frame.height - 1);
          expect(geometry.boxes.map.height, `${context} map remains meaningful`)
            .toBeGreaterThan(frame.height / 2);
          expect(geometry.boxes.map.bottom, `${context} map precedes footer`)
            .toBeLessThanOrEqual(geometry.boxes.footer.top + 1);
          expect(geometry.footerText, `${context} footer text`).toContain("Vantare Reference Loop");
          expect(geometry.rendererSystem, `${context} renderer system`).toBe("vantare-endurance");
        }
      }
    } finally {
      await browser.close();
    }
  });
});
