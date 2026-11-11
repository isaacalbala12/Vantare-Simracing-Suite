import type { Page } from "playwright-core";
import type { VisualScene } from "./scenes.ts";

async function sidebar(page: Page, expanded: boolean) {
  const nav = page.locator(".v-sidebar");
  const isExpanded = !(await nav.evaluate((element) =>
    element.classList.contains("v-sidebar--collapsed"),
  ));
  if (isExpanded !== expanded) await page.keyboard.press("Control+b");
  if (expanded)
    await page.getByRole("region", { name: "Perfiles", exact: true }).waitFor();
}
export const frameScenes: Record<string, VisualScene> = {
  "ajustes-apariencia-sidebar": {
    mock: "ajustes-con-diseno",
    async prepare(page) {
      await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
      await sidebar(page, true);
    },
  },
  "frame-ajustes-contraida": {
    mock: "ajustes-con-diseno",
    async prepare(page) {
      await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
      await sidebar(page, false);
    },
  },
  "frame-calendario-expandida": {
    mock: "ajustes-con-diseno",
    async prepare(page) {
      await sidebar(page, true);
      await page
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
    },
  },
  "frame-calendario-contraida": {
    mock: "ajustes-con-diseno",
    async prepare(page) {
      await sidebar(page, false);
      await page
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
    },
  },
};
