import type { VisualScene } from "./scenes.ts";
export const studioScenes: Record<string, VisualScene> = {
  "studio-base": {
    mock: "studio-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Studio", exact: true }).click();
      await page
        .getByRole("heading", { name: "Standings", exact: true })
        .waitFor();
      const toggle = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await toggle.getAttribute("aria-expanded")) === "true")
        await toggle.click();
    },
  },
};
