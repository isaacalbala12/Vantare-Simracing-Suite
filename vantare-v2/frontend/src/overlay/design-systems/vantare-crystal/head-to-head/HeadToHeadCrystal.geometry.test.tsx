// @vitest-environment node
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HeadToHeadCrystal } from "./HeadToHeadCrystal";

it("contains all rows and readings at persisted sizes including 360x120", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const base = "src/overlay/design-systems/vantare-crystal/";
    const css = ["tokens.css", "isa93-sections-07-08.css", "isa93-live-families.css", "isa93-input.css", "isa93-parity-overrides.css"].map((name) => readFileSync(base + name, "utf8")).join("\n");
    const entry = { place: 4, number: "36", name: "PLAYER LONG NAME", team: "ALPINE", className: "HYPERCAR", isPlayer: true };
    const markup = renderToStaticMarkup(<HeadToHeadCrystal model={{ type: "head-to-head", status: "ready", player: entry, opponent: { ...entry, isPlayer: false }, ahead: { ...entry, place: 3, isPlayer: false }, behind: { ...entry, place: 5, isPlayer: false }, gapSeconds: 1.84, sectorComparisons: ["g", "r", "g", "r"], target: "ahead", showSectors: true }} settings={{}} renderMode="harness" />);
    for (const [width, height] of [[360, 96], [360, 120], [260, 96], [360, 304], [720, 192]]) {
      const scale = width / 360;
      await page.setContent(`<style>${css}</style><div id="frame" style="width:${width}px;height:${height}px"><div style="width:360px;height:${height / scale}px;transform:scale(${scale});transform-origin:top left">${markup}</div></div>`, { waitUntil: "domcontentloaded" });
      const failures = await page.evaluate(() => {
        const frame = document.querySelector("#frame")!.getBoundingClientRect();
        return [...document.querySelectorAll(".vc-head-to-head main > div, .vc-head-to-head main em, .vc-head-to-head main strong, .vc-head-to-head main i")].filter((node) => {
          const r = node.getBoundingClientRect();
          return r.bottom > frame.bottom + 1 || r.right > frame.right + 1 || r.top < frame.top - 1;
        }).map((node) => node.textContent);
      });
      expect(failures, `${width}x${height}`).toEqual([]);
    }
  } finally { await browser.close(); }
}, 20000);
