import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { WidgetVisualViewport } from "../../../core/WidgetVisualViewport";
import { TrackMapEndurance } from "./TrackMapEndurance";

it("keeps the transparent map, class legend and footer inside persisted frames", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const css = readFileSync(resolve(import.meta.dirname, "../tokens.css"), "utf8");
    for (const [w, h] of [[320, 220], [640, 440]]) {
      await page.setContent(`<style>${css}</style>` + renderToStaticMarkup(
        <div id="frame" style={{ width: w, height: h }}>
          <WidgetVisualViewport widgetType="track-map" layout={{ w, h }} testId="viewport">
            <TrackMapEndurance settings={{}} model={{
              type: "track-map", status: "ready", synthetic: false, showTrackLabel: true,
              outlinePath: "M 12 12 L 300 200", viewBox: "0 0 320 220", trackLabel: "Monza",
              markers: [
                { id: "p1", x: 20, y: 20, isPlayer: true, classId: "HYPERCAR" },
                { id: "p2", x: 40, y: 40, isPlayer: false, classId: "LMGT3" },
              ],
            }} />
          </WidgetVisualViewport>
        </div>,
      ));
      const measured = await page.evaluate(() => {
        const frame = document.querySelector("#frame")!.getBoundingClientRect();
        const root = document.querySelector(".ven-track-map")!;
        return {
          background: getComputedStyle(root).backgroundColor,
          children: [...root.children].map(child => { const r = child.getBoundingClientRect(); return { bottom: r.bottom, right: r.right }; }),
          bottom: frame.bottom, right: frame.right,
          playerStroke: getComputedStyle(document.querySelector('[data-player="true"]')!).stroke,
        };
      });
      expect(measured.background).toBe("rgba(0, 0, 0, 0)");
      expect(measured.playerStroke).toBe("rgb(255, 255, 255)");
      for (const child of measured.children) {
        expect(child.bottom).toBeLessThanOrEqual(measured.bottom + 1);
        expect(child.right).toBeLessThanOrEqual(measured.right + 1);
      }
    }
  } finally { await browser.close(); }
}, 30_000);
