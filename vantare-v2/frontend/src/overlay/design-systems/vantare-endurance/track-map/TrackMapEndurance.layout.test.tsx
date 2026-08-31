// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import type { TrackMapViewModel } from "../../../widget-types/track-map/track-map-view-model";
import { TrackMapEndurance } from "./TrackMapEndurance";

const model: TrackMapViewModel = {
  type: "track-map",
  status: "ready",
  outlinePath: "M 80 40 C 300 10 520 80 560 220 C 500 360 220 380 80 250 Z",
  viewBox: "0 0 640 440",
  trackLabel: "Circuit de Spa-Francorchamps",
  showTrackLabel: true,
  synthetic: false,
  markers: [],
};

describe("TrackMapEndurance production layout", () => {
  it("keeps the renderer and footer inside a 640x440 runtime frame", async () => {
    const css = readFileSync(join(__dirname, "..", "tokens.css"), "utf8");
    const markup = renderToStaticMarkup(
      <TrackMapEndurance model={model} settings={{}} renderMode="desktop" />,
    );
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.setContent(`
        <style>
          * { box-sizing: content-box; }
          body { margin: 0; }
          #frame { width: 640px; height: 440px; overflow: hidden; }
          #frame > [data-widget-renderer="track-map"] { width: 100%; }
          ${css}
        </style>
        <div id="frame">${markup}</div>
      `);

      const boxes = await page.evaluate(() => {
        const frame = document.querySelector("#frame")!.getBoundingClientRect();
        const renderer = document
          .querySelector('[data-widget-renderer="track-map"]')!
          .getBoundingClientRect();
        const footer = document.querySelector(".ven-tm-footer")!.getBoundingClientRect();
        return {
          rendererOverflow: renderer.bottom - frame.bottom,
          footerOverflow: footer.bottom - frame.bottom,
        };
      });

      expect(boxes.rendererOverflow).toBeLessThanOrEqual(1);
      expect(boxes.footerOverflow).toBeLessThanOrEqual(1);
    } finally {
      await browser.close();
    }
  });
});
