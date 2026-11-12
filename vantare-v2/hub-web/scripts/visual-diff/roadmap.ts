import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { VisualScene } from "./scenes.ts";
export const roadmapScenes: Record<string, VisualScene> = {
  "roadmap-publicado": {
    mock: "roadmap-published",
    async prepare(page) {
      await page.getByRole("button", { name: "Roadmap", exact: true }).click();
      await page.getByRole("tab", { name: "Circuito", exact: true }).click();
      await page.locator(".v-roadmap-hero h2").waitFor();
    },
    async cleanup(page) {
      await page.setViewportSize({ width: 1800, height: 1100 });
      try {
        assert.equal(
          await page.locator(".v-roadmap-current-body").isVisible(),
          true,
        );
        await page.locator(".v-roadmap-hero .v-tooltip-trigger").hover();
        await page.locator(".v-tooltip").waitFor();
        const output = process.env.VANTARE_HUB_EVIDENCE;
        if (output) {
          await mkdir(output, { recursive: true });
          const scheme = await page.evaluate(
            () => document.documentElement.dataset.scheme,
          );
          // Supplementary CDP image, not the 1440x900 HWND reference comparison.
          await page.screenshot({
            path: join(output, `roadmap-amplio-${scheme}.png`),
          });
        }
      } finally {
        await page.setViewportSize({ width: 1440, height: 900 });
      }
    },
  },
  "roadmap-tablero": {
    mock: "roadmap-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Roadmap", exact: true }).click();
      await page.getByRole("tab", { name: "Tablero", exact: true }).click();
      await page
        .getByText("Sin hitos publicados", { exact: true })
        .first()
        .waitFor();
    },
  },
  "roadmap-temporada": {
    mock: "roadmap-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Roadmap", exact: true }).click();
      await page.getByRole("tab", { name: "Temporada", exact: true }).click();
      await page
        .getByText("Sin versiones o fechas previstas publicadas", {
          exact: true,
        })
        .waitFor();
    },
  },
  "roadmap-base": {
    mock: "roadmap-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Roadmap", exact: true }).click();
      await page.getByRole("tab", { name: "Circuito", exact: true }).click();
      await page
        .getByText("Aún no hay hitos actuales publicados", { exact: true })
        .waitFor();
      const geometry = await page.evaluate(() => {
        const main = document.querySelector(".v-shell-main");
        if (!main) throw new Error("Missing roadmap content area");
        return {
          footer:
            main.getBoundingClientRect().bottom -
            parseFloat(getComputedStyle(main).paddingBottom),
          columns: Array.from(
            document.querySelectorAll(".v-roadmap-lane"),
            (column) => column.getBoundingClientRect().bottom,
          ),
        };
      });
      assert.equal(geometry.columns.length, 3);
      assert.ok(
        geometry.columns.every(
          (bottom) => Math.abs(bottom - geometry.footer) <= 2,
        ),
        "Empty Circuito columns must reach the content footer",
      );
    },
  },
};
