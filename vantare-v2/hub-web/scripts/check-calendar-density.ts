import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { calendarScenes } from "./visual-diff/calendar-scenes";

export async function checkCalendarDensity(page: Page, base: string) {
  const original = page.viewportSize();
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}?escena=visual-dark:calendar-live-reference`);
      await calendarScenes["calendario-r6-proximas"].prepare(page);
      await page.locator(".v-calendar-hero").waitFor();
      for (const scheme of ["dark", "light"]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.scheme = value;
        }, scheme);
        for (const expanded of [false, true]) {
          const sidebar = page.locator(".v-sidebar");
          if (
            (await sidebar.evaluate(
              (node) => !node.classList.contains("v-sidebar--collapsed"),
            )) !== expanded
          )
            await page
              .getByRole("button", {
                name: /^(Contraer o ampliar navegación|Contraer barra)$/,
              })
              .first()
              .click();
          assert.equal(
            await page
              .locator(".v-calendar-header h1")
              .evaluate((node) => getComputedStyle(node).fontSize),
            width < 1400 ? "24px" : "28px",
          );
          assert.equal(
            await page.locator(".v-calendar-header-short").isVisible(),
            width < 1400,
          );
          assert.ok(
            (await page
              .getByRole("button", { name: "Avisos", exact: true })
              .count()) > 0,
          );
          const rows = page.locator(".v-calendar-live-row");
          assert.ok(
            (await rows.count()) > 0,
            "Positive control: calendar departures are rendered",
          );
          for (const row of await rows.all())
            assert.ok(
              await row.evaluate(
                (node) => node.scrollWidth <= node.clientWidth + 1,
              ),
              "Departure columns must fit without clipping the timeline",
            );
          if (width < 1400) {
            assert.equal(
              await page
                .locator(".v-calendar-hero-time > strong")
                .evaluate((node) => getComputedStyle(node).fontSize),
              "38px",
            );
            assert.equal(
              await page
                .locator(".v-calendar-hero .v-calendar-after")
                .isVisible(),
              false,
            );
          }
          assert.ok(await page.locator(".v-window-controls").isVisible());
        }
      }
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}
