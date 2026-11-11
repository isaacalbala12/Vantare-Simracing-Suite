import assert from "node:assert/strict";
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
  const bounds = await page.evaluate(() => {
    const sidebarNode = document.querySelector(".v-sidebar"),
      columnNode = document.querySelector(".v-shell-column"),
      barNode = document.querySelector(".v-titlebar"),
      controlsNode = document.querySelector(".v-window-controls");
    if (!sidebarNode || !columnNode || !barNode || !controlsNode)
      throw new Error("Frame elements missing");
    const sidebar = sidebarNode.getBoundingClientRect();
    const column = columnNode.getBoundingClientRect();
    const bar = barNode.getBoundingClientRect();
    const controls = controlsNode.getBoundingClientRect();
    return {
      width: sidebar.width,
      columnLeft: column.left,
      barLeft: bar.left,
      controlsRight: controls.right,
      controlsBottom: controls.bottom,
      window: innerWidth,
      barHeight: parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--topbar-h",
        ),
      ),
    };
  });
  assert.equal(bounds.width, expanded ? 272 : 76);
  assert.equal(
    bounds.columnLeft,
    bounds.width,
    "No extra content displacement",
  );
  assert.equal(bounds.barLeft, bounds.width);
  assert.ok(
    bounds.controlsRight <= bounds.window &&
      bounds.controlsBottom <= bounds.barHeight,
  );
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
