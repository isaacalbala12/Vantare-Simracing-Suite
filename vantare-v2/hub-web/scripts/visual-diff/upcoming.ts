import type { VisualScene } from "./scenes.ts";
export const upcomingScenes: Record<string, VisualScene> = {
  "strategy-proximamente": {
    mock: "proximamente-base",
    async prepare(page) {
      await page
        .getByRole("button", { name: "Estrategia", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Plan de paradas", exact: true })
        .waitFor();
    },
  },
  "engineer-base": {
    mock: "proximamente-base",
    async prepare(page) {
      await page
        .getByRole("button", { name: "Ingeniero", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Avisos de voz en pista", exact: true })
        .waitFor();
    },
  },
};
