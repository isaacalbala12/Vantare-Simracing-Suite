import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import type { VisualScene } from "./scenes.ts";
export const upcomingScenes: Record<string, VisualScene> = {
  "strategy-proximamente": {
    mock: "proximamente-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Strategy", exact: true }).click();
      await page
        .getByRole("heading", { name: "Plan de paradas", exact: true })
        .waitFor();
      await assertFooter(page);
    },
  },
  "engineer-base": {
    mock: "proximamente-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Engineer", exact: true }).click();
      await page
        .getByRole("heading", { name: "Avisos de voz en pista", exact: true })
        .waitFor();
      await assertFooter(page);
    },
  },
};

async function assertFooter(page: Page) {
  const remaining = await page.evaluate(() => {
    const main = document.querySelector(".v-shell-main");
    const card = document.querySelector(".v-upcoming-roadmap");
    if (!main || !card) throw new Error("Missing upcoming content");
    return (
      main.getBoundingClientRect().bottom -
      parseFloat(getComputedStyle(main).paddingBottom) -
      card.getBoundingClientRect().bottom
    );
  });
  assert.ok(
    Math.abs(remaining) <= 2,
    "Upcoming roadmap card must fill the content height",
  );
}
