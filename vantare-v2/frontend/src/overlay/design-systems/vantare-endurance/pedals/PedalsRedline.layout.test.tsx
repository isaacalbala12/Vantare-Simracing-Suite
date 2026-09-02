// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import type { OverlayUpdateV2 } from "../../../../generated/telemetry";
import goldenV2Raw from "../../../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import { createTelemetryRateCoordinator } from "../../../core/telemetry-rate-coordinator";
import { pedalsDefinition } from "../../../widget-types/pedals/pedals-definition";
import { RuntimeWidgetFrame } from "../../../runtime/RuntimeWidgetFrame";

const FRAME_WIDTH = 520;
const FRAME_HEIGHT = 420;

function renderRuntimeFrame(status: "ready" | "missing", brake?: number): string {
  const telemetry = createTelemetryRateCoordinator();
  if (status === "ready") {
    const update = JSON.parse(goldenV2Raw) as OverlayUpdateV2;
    if (brake !== undefined) {
      update.frame!.player.brake.v = brake;
    }
    telemetry.setOverlayFrame(update.frame ?? undefined, update.source);
  }
  const widget = pedalsDefinition.createDefault("pedals-redline-layout");
  widget.layout = { ...widget.layout, x: 0, y: 0, w: FRAME_WIDTH, h: FRAME_HEIGHT };
  widget.visual = {
    ...widget.visual,
    systemId: "vantare-endurance",
    baseSettings: { templateId: "pedals-redline" },
    appearanceOverrides: {},
  };
  const markup = renderToStaticMarkup(
    <RuntimeWidgetFrame
      widget={widget}
      profileId="pedals-redline-layout-profile"
      telemetry={telemetry}
      renderMode="desktop"
    />,
  );
  telemetry.dispose();
  return markup;
}

describe("Pedals Redline frame geometry", () => {
  it.each(["ready", "missing"] as const)(
    "keeps every visible descendant inside the productive 520x420 frame when %s",
    async (status) => {
      const css = readFileSync(join(__dirname, "../tokens.css"), "utf8");
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({
          viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        await page.setContent(
          `<style>html,body{margin:0;background:transparent}${css}</style>`
            + renderRuntimeFrame(status),
        );
        const result = await page.evaluate(() => {
          const frame = document.querySelector<HTMLElement>("[data-testid='runtime-widget-frame']");
          const root = document.querySelector<HTMLElement>("[data-template='pedals-redline']");
          if (!frame) throw new Error("missing productive runtime frame");
          const frameBox = frame.getBoundingClientRect();
          const outside = [...frame.querySelectorAll<HTMLElement>("*")]
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
            root: root?.getBoundingClientRect().toJSON() ?? null,
            outside,
          };
        });

        expect(result.outside).toEqual([]);
        expect(result.root === null).toBe(status === "missing");
      } finally {
        await browser.close();
      }
    },
  );

  it("confines a saturated brake indication to its local well and slot", async () => {
    const css = readFileSync(join(__dirname, "../tokens.css"), "utf8");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const html = (brake: number) =>
        `<style>html,body{margin:0;background:transparent}*{transition:none!important;animation:none!important}${css}</style>`
          + renderRuntimeFrame("ready", brake);
      await page.setContent(html(0));
      const releasedBoxShadow = await page.locator(".ven-pred-rail[data-pedal='brake'] .ven-pred-well")
        .evaluate((element) => getComputedStyle(element).boxShadow);
      const released = await page.screenshot({ omitBackground: true });
      await page.setContent(html(1));
      const saturatedBoxShadow = await page.locator(".ven-pred-rail[data-pedal='brake'] .ven-pred-well")
        .evaluate((element) => getComputedStyle(element).boxShadow);
      const saturated = await page.screenshot({ omitBackground: true });

      const result = await page.evaluate(async ({ released, saturated }) => {
        const rail = document.querySelector<HTMLElement>(".ven-pred-rail[data-pedal='brake']");
        const well = rail?.querySelector<HTMLElement>(".ven-pred-well");
        const slot = rail?.querySelector<HTMLElement>(".ven-pred-slot");
        if (!rail || !well || !slot) throw new Error("missing productive brake rail");
        const toImageData = async (base64: string) => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("missing canvas context");
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height);
        };
        const [before, after] = await Promise.all([toImageData(released), toImageData(saturated)]);
        const allowed = [well, slot].map((element) => element.getBoundingClientRect());
        let changedOutsideLocalBacking = 0;
        const outsideDifferences: Array<{ x: number; y: number; released: number[]; saturated: number[] }> = [];
        for (let y = 0; y < after.height; y += 1) {
          for (let x = 0; x < after.width; x += 1) {
            if (allowed.some((box) => x >= box.left && x < box.right && y >= box.top && y < box.bottom)) continue;
            const offset = (y * after.width + x) * 4;
            if ([0, 1, 2, 3].some((channel) => before.data[offset + channel] !== after.data[offset + channel])) {
              changedOutsideLocalBacking += 1;
              if (outsideDifferences.length < 16) {
                outsideDifferences.push({
                  x,
                  y,
                  released: [...before.data.slice(offset, offset + 4)],
                  saturated: [...after.data.slice(offset, offset + 4)],
                });
              }
            }
          }
        }
        return {
          changedOutsideLocalBacking,
          outsideDifferences,
          well: well.getBoundingClientRect().toJSON(),
          slot: slot.getBoundingClientRect().toJSON(),
          devicePixelRatio: window.devicePixelRatio,
          saturated: rail.getAttribute("data-saturated"),
          brakeText: slot.textContent,
        };
      }, { released: released.toString("base64"), saturated: saturated.toString("base64") });

      if (result.changedOutsideLocalBacking > 0) {
        console.info("Pedals Redline saturation containment diagnostics", JSON.stringify({
          ...result,
          releasedBoxShadow,
          saturatedBoxShadow,
        }));
      }

      expect(result.saturated).toBe("true");
      expect(result.brakeText).toContain("100%");
      expect(saturatedBoxShadow).toContain("inset");
      expect(saturatedBoxShadow).not.toBe(releasedBoxShadow);
      expect(result.changedOutsideLocalBacking).toBe(0);
    } finally {
      await browser.close();
    }
  });
});
