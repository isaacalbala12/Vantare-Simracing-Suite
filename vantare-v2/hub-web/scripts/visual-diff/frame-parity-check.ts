import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Page } from "playwright-core";
import { until } from "../wait-for.ts";

/** Runs against the real packaged QA window, without changing any settings. */
export async function checkFrameParity(page: Page, expanded: boolean) {
  const list = page.locator(".v-section-tab-list");
  await until(
    async () =>
      list.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return [...node.querySelectorAll<HTMLElement>('[role="tab"]')].every(
          (tab) => {
            const box = tab.getBoundingClientRect();
            const clipped =
              box.left < bounds.left - 0.25 || box.right > bounds.right + 0.25;
            return (getComputedStyle(tab).opacity === "0") === clipped;
          },
        );
      }),
    5000,
    "whole-tab clipping",
  );
  const last = list.getByRole("tab").last();
  if (expanded) assert.equal(await last.getAttribute("data-clipped"), "");
  await page.getByRole("tab", { name: "General", exact: true }).focus();
  await page.keyboard.press("End");
  await page
    .getByRole("heading", { name: "Diagnóstico", exact: true })
    .waitFor();
  await until(
    async () => last.evaluate((node) => getComputedStyle(node).opacity === "1"),
    5000,
    "keyboard reveals the last tab",
  );
  await page.keyboard.press("Home");
  await page
    .getByRole("tab", { name: "Cuenta", exact: true })
    .waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.getByRole("heading", { name: "General", exact: true }).waitFor();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.mouse.move(1000, 890);
  const shadow = await page
    .locator('.v-sidebar [aria-current="page"]')
    .first()
    .evaluate((node) => getComputedStyle(node).boxShadow);
  assert.notEqual(shadow, "none");
  const native = await readFile("../native/hub/assets/pit/v-side.svg", "utf8");
  const expected = [...native.matchAll(/\bd="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const paths = await page
    .locator(".v-titlebar-actions button[aria-expanded]")
    .first()
    .locator("svg path")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("d")));
  assert.deepEqual(paths, expected);
  return {
    expanded,
    keyboardLastTab: true,
    wholeTabClipping: true,
    panelIcon: "v-side",
    activeShadow: shadow,
  };
}
