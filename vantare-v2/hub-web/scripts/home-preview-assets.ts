// Derive visible SVG bounds without modifying the shared widget assets.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { homeWidgetKinds } from "../src/contract/generated/home.ts";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.VANTARE_HUB_QA_CHROMIUM,
});
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  const output: Record<
    string,
    { source: number[]; content: number[]; sha256: string }
  > = {};
  for (const kind of homeWidgetKinds) {
    const bytes = await readFile(
      new URL(`../src/renderer/assets/widgets/${kind}.svg`, import.meta.url),
    );
    await page.setContent(bytes.toString("utf8"));
    const boxes = await page.locator("svg").evaluate((element) => {
      const svg = element as SVGSVGElement;
      const v = svg.viewBox.baseVal;
      const b = svg.getBBox();
      const x = Math.max(v.x, b.x),
        y = Math.max(v.y, b.y);
      const width = Math.min(v.x + v.width, b.x + b.width) - x,
        height = Math.min(v.y + v.height, b.y + b.height) - y;
      if (width <= 0 || height <= 0) throw new Error("Empty widget artwork");
      return {
        source: [v.x, v.y, v.width, v.height],
        content: [x, y, width, height].map(
          (n) => Math.round(n * 10000) / 10000,
        ),
      };
    });
    output[kind] = {
      ...boxes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  await writeFile(
    new URL("../src/renderer/ui/home/widget-artwork.json", import.meta.url),
    `${JSON.stringify(output, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
