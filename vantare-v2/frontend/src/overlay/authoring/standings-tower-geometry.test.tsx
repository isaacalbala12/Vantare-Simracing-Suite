// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import { StandingsEndurance } from "../design-systems/vantare-endurance/standings/StandingsEndurance";
import { createScenarioWidget } from "./fixtures/authoring-v2-workshop-frame";
import { REDLINE_TOWER_REFERENCE } from "./fixtures/redline-tower-reference";

it("contains complete rows, long gaps and stale notices at persisted sizes in Chromium", async () => {
  const directory = "src/overlay/design-systems/vantare-endurance/standings";
  const css = readFileSync(resolve(directory, "standings-redline-tower.css"), "utf8")
    .replace(/url\('\/src\/([^']+\.ttf)'\)/g, (_, file: string) =>
      `url(data:font/ttf;base64,${readFileSync(resolve("src", file)).toString("base64")})`);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [280, 340, 482, 650]) {
      const widget = createScenarioWidget({ widget: "standings", system: "vantare-endurance", variant: "default", designId: "standings-endurance-redline-tower" });
      widget.layout = { ...widget.layout, w: width, h: 1087 * width / 482 };
      const model = { ...REDLINE_TOWER_REFERENCE, statusMessage: "Fuente temporalmente atrasada: se conserva el último frame. ".repeat(6),
        rows: REDLINE_TOWER_REFERENCE.rows.map(row => ({ ...row, driverName: "Un nombre de piloto muy largo", configuredDriverName: "Un nombre de piloto muy largo", gapText: "+12345.678s" })) };
      const markup = renderToStaticMarkup(<div id="frame" style={{ width: widget.layout.w, height: widget.layout.h }}>
        <WidgetVisualViewport widgetType="standings" visual={widget.visual} layout={widget.layout} testId="viewport">
          <StandingsEndurance model={model} settings={widget.visual.baseSettings} layout={widget.layout} renderMode="desktop" />
        </WidgetVisualViewport>
      </div>);
      await page.setContent(`<style>${css}</style>${markup}`);
      await page.evaluate(() => document.fonts.ready);
      const measured = await page.evaluate(() => {
        const frame = document.querySelector("#frame")!.getBoundingClientRect();
        return Array.from(document.querySelectorAll("[data-standings-row]"), row => {
          const box = row.getBoundingClientRect();
          const name = row.querySelector(".ven-tower-driver")!.getBoundingClientRect();
          const gap = row.querySelector(".ven-tower-gap")!;
          const range = document.createRange();
          range.selectNodeContents(gap);
          const text = range.getBoundingClientRect();
          return { inside: box.right <= frame.right + .1 && box.bottom <= frame.bottom + .1,
            gapInside: text.right <= frame.right + .1 && text.left >= name.right - .1 };
        });
      });
      expect(measured).toHaveLength(11);
      expect(measured.every(row => row.inside && row.gapInside)).toBe(true);
    }
  } finally {
    await browser.close();
  }
}, 20_000);
