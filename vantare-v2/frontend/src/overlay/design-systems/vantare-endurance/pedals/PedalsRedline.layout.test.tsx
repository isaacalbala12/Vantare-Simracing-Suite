// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import type { PedalsViewModel } from "../../../widget-types/pedals/pedals-view-model";
import { PedalsEndurance } from "./PedalsEndurance";

const FRAME_WIDTH = 520;
const FRAME_HEIGHT = 420;
const BASE_WIDTH = 120;
const SCALE = FRAME_WIDTH / BASE_WIDTH;
const BASE_HEIGHT = FRAME_HEIGHT / SCALE;

function model(): PedalsViewModel {
  return {
    type: "pedals",
    status: "ready",
    throttle: 0.72,
    brake: 0.18,
    clutch: 0.04,
    throttleText: "72%",
    brakeText: "18%",
    clutchText: "4%",
  };
}

describe("Pedals Redline frame geometry", () => {
  it("keeps every visible descendant inside a 520x420 frame", async () => {
    const css = readFileSync(join(__dirname, "../tokens.css"), "utf8");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT } });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}${css}</style>`
          + `<div data-frame style="position:relative;width:${FRAME_WIDTH}px;height:${FRAME_HEIGHT}px;overflow:hidden">`
          + `<div data-viewport style="width:${BASE_WIDTH}px;height:${BASE_HEIGHT}px;transform:scale(${SCALE});transform-origin:top left">`
          + renderToStaticMarkup(
            <PedalsEndurance
              model={model()}
              settings={{ templateId: "pedals-redline" }}
              renderMode="desktop"
            />,
          )
          + `</div></div>`,
      );

      const result = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>("[data-frame]");
        const root = document.querySelector<HTMLElement>("[data-template='pedals-redline']");
        if (!frame || !root) throw new Error("missing Redline frame or renderer root");
        const frameBox = frame.getBoundingClientRect();
        const outside = [root, ...root.querySelectorAll<HTMLElement>("*")]
          .map((element) => ({
            selector: element.className || element.tagName,
            box: element.getBoundingClientRect().toJSON(),
          }))
          .filter(({ box }) =>
            box.left < frameBox.left - 0.5
            || box.top < frameBox.top - 0.5
            || box.right > frameBox.right + 0.5
            || box.bottom > frameBox.bottom + 0.5,
          );
        return {
          frame: frameBox.toJSON(),
          root: root.getBoundingClientRect().toJSON(),
          outside,
        };
      });

      expect(result.outside).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
