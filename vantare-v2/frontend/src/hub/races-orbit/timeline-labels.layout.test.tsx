import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { HorizontalTimeline } from "../../ui/orbit/HorizontalTimeline";
import { fitZoom, pxPerHourOf, tickEveryMinFor, type TimelineRange } from "./races-orbit-model";

it("mantiene legibles las horas con las escalas y anchos de Calendario", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const css = readFileSync(join(__dirname, "../../styles/orbit-kit.css"), "utf8");
    for (const width of [200, 320, 550, 1200]) {
      for (const range of [6, 12, 24] as TimelineRange[]) {
        const px = pxPerHourOf(width, fitZoom(range));
        const html = renderToStaticMarkup(<HorizontalTimeline rows={[]} rowLabel={() => null} blocks={() => []}
          start={new Date("2026-09-08T04:00:00Z")} spanMin={1440} tickEveryMin={tickEveryMinFor(px)} pxPerHour={px} />);
        await page.setContent(`<style>:root{--orbit-font-mono:monospace}${css}</style>${html}`);
        const overlaps = await page.locator(".orbit-tl__tick").evaluateAll(nodes => nodes.flatMap((node,index) => {
          if (!index) return [];
          const before = nodes[index-1].getBoundingClientRect();
          const after = node.getBoundingClientRect();
          return before.right > after.left + 0.1 ? [{before:before.right,after:after.left}] : [];
        }));
        expect(overlaps, `eje ${width}px, escala ${range}h`).toEqual([]);
      }
    }
  } finally { await browser.close(); }
}, 20000);
