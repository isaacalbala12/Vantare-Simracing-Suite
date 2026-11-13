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
          const rail = page.locator(".v-context:has(.v-calendar-rail)");
          assert.ok(
            await rail.isVisible(),
            "Positive control: calendar context is present",
          );
          assert.ok(
            await rail.evaluate((node) => {
              const heading = node.querySelector(".v-calendar-rail h2");
              if (!heading) return false;
              const style = getComputedStyle(node);
              const expected =
                node.getBoundingClientRect().left +
                parseFloat(style.paddingLeft) +
                parseFloat(style.borderLeftWidth);
              return (
                Math.abs(heading.getBoundingClientRect().left - expected) <= 1
              );
            }),
            "Calendar must not add a second gutter inside ContextRail",
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
          if (width < 1400 && expanded) {
            const track = await page
              .locator(".v-calendar-hero-meta > strong")
              .boundingBox();
            const layout = await page
              .locator(".v-calendar-hero-meta > .v-calendar-license")
              .boundingBox();
            assert.ok(
              track && layout && layout.y > track.y,
              "Narrow hero keeps track and layout on separate readable lines, as GPUI",
            );
          }
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
          await page.getByRole("tab", { name: /^Eventos/ }).click();
          const facts = page.locator(".v-calendar-event-facts strong");
          await facts.first().waitFor();
          assert.ok(
            (await facts.count()) > 0,
            "Positive control: real event facts are rendered",
          );
          for (const fact of await facts.all()) {
            assert.equal(
              await fact.getAttribute("title"),
              await fact.textContent(),
              "Truncated values remain available in full",
            );
            assert.equal(
              await fact.evaluate((node) => getComputedStyle(node).whiteSpace),
              "nowrap",
            );
          }
          await page
            .getByRole("tab", { name: "Próximas", exact: true })
            .click();
          await page.locator(".v-calendar-hero").waitFor();
          assert.ok(await page.locator(".v-window-controls").isVisible());
        }
      }
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}
