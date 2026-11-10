import type { VisualScene } from "./scenes.ts";
export const upcomingScenes: Record<string, VisualScene> = {
  "engineer-base": {
    mock: "proximamente-base",
    async prepare(page) {
      await page
        .getByRole("button", { name: "Ingeniero", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Avisos de voz en pista", exact: true })
        .waitFor();
      await page.keyboard.press("Control+b");
    },
  },
};
