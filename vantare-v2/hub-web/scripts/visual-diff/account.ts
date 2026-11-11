import type { VisualScene } from "./scenes.ts";
export const accountScenes: Record<string, VisualScene> = {
  "cuenta-base": {
    mock: "cuenta-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Cuenta", exact: true }).click();
      await page
        .getByRole("heading", { name: "Isaac Albalá", exact: true })
        .waitFor();
    },
  },
};
