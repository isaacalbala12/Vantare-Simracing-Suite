import type { VisualScene } from "./scenes.ts";
export const roadmapScenes: Record<string, VisualScene> = {
  "roadmap-base": {
    mock: "roadmap-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Roadmap", exact: true }).click();
      await page.getByRole("tab", { name: "Circuito", exact: true }).click();
      await page
        .getByText("Aún no hay hitos actuales publicados", { exact: true })
        .waitFor();
    },
  },
};
