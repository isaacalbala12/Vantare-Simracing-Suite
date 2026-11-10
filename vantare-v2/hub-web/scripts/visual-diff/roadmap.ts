import type { VisualScene } from "./scenes.ts";
export const roadmapScenes: Record<string, VisualScene> = {
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
    },
  },
};
