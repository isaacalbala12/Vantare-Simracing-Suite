import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { studioFrequencyOptions } from "../src/contract/generated/studio";
import { studioText as t } from "../src/renderer/i18n/studio";
import { studioFrequencyText as frequency } from "../src/renderer/i18n/studio-frequency.es";
import { studioStateScenes } from "./visual-diff/studio-states";
import { until } from "./wait-for";

export async function checkStudioTrackComposition(parent: Page, base: string) {
  const browser = parent.context().browser();
  assert.ok(browser, "Real Chromium is required for layout assertions");
  const context = await browser.newContext();
  try {
    // 1024 CSS px exercises the container fallback used at high UI scale.
    // It does not change the product's permitted window zoom levels.
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [1024, 720],
    ]) {
      for (const scheme of ["dark", "light"]) {
        const page = await context.newPage();
        try {
          await page.setViewportSize({ width, height });
          const adapter = studioStateScenes["studio-estado-pista"];
          await page.goto(`${base}?escena=visual-${scheme}:${adapter.mock}`);
          await adapter.prepare(page);
          await page.evaluate(() => document.fonts.ready);
          for (const expanded of [false, true]) {
            const nav = page.locator(".v-sidebar");
            if (
              (await nav.evaluate(
                (node) => !node.classList.contains("v-sidebar--collapsed"),
              )) !== expanded
            ) {
              await page
                .getByRole("button", {
                  name: /^(Contraer o ampliar navegación|Contraer barra)$/,
                })
                .first()
                .click();
            }
            await until(
              async () =>
                Math.abs(
                  (await nav.evaluate((node) =>
                    Number.parseFloat(getComputedStyle(node).width),
                  )) - (expanded ? 272 : 76),
                ) < 1,
              5000,
              "Studio sidebar settled",
            );
            const pixelScale = await nav.evaluate(
              (node) =>
                node.getBoundingClientRect().width /
                Number.parseFloat(getComputedStyle(node).width),
            );
            const groups = page.locator(".v-studio-track-group");
            await until(
              async () => (await groups.count()) === 4,
              5000,
              "All four Track groups mounted",
            );
            assert.equal(
              await groups.count(),
              4,
              "Positive control: all four groups are mounted",
            );
            for (const name of [
              t.visibilityGroup,
              t.whenGroup,
              t.placeGroup,
              frequency.title,
            ]) {
              assert.equal(
                await page.getByRole("region", { name, exact: true }).count(),
                1,
                `Accessible Track group: ${name}`,
              );
            }
            const cadence = page.getByRole("group", {
              name: frequency.choices,
              exact: true,
            });
            const buttons = cadence.getByRole("button");
            assert.equal(
              await buttons.count(),
              studioFrequencyOptions.choices.length + 1,
            );
            for (const [index, name] of [
              frequency.inherit,
              ...studioFrequencyOptions.choices.map(frequency.hz),
            ].entries()) {
              const button = cadence.getByRole("button", { name, exact: true });
              assert.equal(await button.count(), 1);
              assert.equal(
                await button.getAttribute("aria-pressed"),
                String(index === 0),
              );
            }
            const inherit = cadence.getByRole("button", {
              name: frequency.inherit,
              exact: true,
            });
            await inherit.focus();
            await page.keyboard.press("Tab");
            await until(
              () =>
                buttons
                  .nth(1)
                  .evaluate((node) => document.activeElement === node),
              5000,
              "Tab reaches the first Hz choice",
            );
            await page.keyboard.press("Shift+Tab");
            assert.ok(
              await inherit.evaluate(
                (node) =>
                  document.activeElement === node &&
                  node.matches(":focus-visible"),
              ),
              "Frequency inheritance keeps keyboard focus",
            );
            for (const group of await groups.all()) {
              const summary = await group.evaluate((node) => {
                const heading = node.querySelector("h3");
                const summary = node.querySelector(
                  ".v-studio-track-group-summary",
                );
                if (!heading || !summary)
                  throw new Error("Group summary missing");
                return {
                  padding: getComputedStyle(summary).paddingTop,
                  gap:
                    summary.getBoundingClientRect().top -
                    heading.getBoundingClientRect().bottom,
                };
              });
              assert.equal(
                summary.padding,
                "0px",
                "No legacy Track panel padding",
              );
              assert.ok(Math.abs(summary.gap / pixelScale - 4) < 1);
            }
            const layout = await page
              .locator(".v-studio-track-groups")
              .evaluate((node) => {
                const column = node.closest(".v-focus-column");
                assertElement(column);
                const children = [...node.children].map((child) =>
                  child.getBoundingClientRect(),
                );
                return {
                  column: column.clientWidth,
                  columns:
                    getComputedStyle(node).gridTemplateColumns.split(" ")
                      .length,
                  lastSpans: getComputedStyle(node.lastElementChild as Element)
                    .gridColumn,
                  placementSpans: getComputedStyle(node.children[2]).gridColumn,
                  tops: children.map((r) => r.top),
                };
                function assertElement(
                  value: Element | null,
                ): asserts value is Element {
                  if (!value) throw new Error("Studio focus container missing");
                }
              });
            assert.equal(layout.columns, layout.column <= 820 ? 2 : 3);
            if (layout.column <= 820) {
              assert.equal(layout.lastSpans, "1 / -1");
              assert.equal(layout.placementSpans, "1 / -1");
              assert.ok(layout.tops[2] > layout.tops[0]);
            }
            const geometry = await groups
              .first()
              .locator(".v-slider")
              .evaluate((node) => {
                const label = node.querySelector(".v-slider-label");
                const value = node.querySelector(".v-slider-value");
                const control = node.querySelector(".v-slider-control");
                if (!label || !value || !control)
                  throw new Error("Real opacity control missing");
                const l = label.getBoundingClientRect(),
                  v = value.getBoundingClientRect(),
                  c = control.getBoundingClientRect();
                return {
                  labelBottom: l.bottom,
                  valueTop: v.top,
                  controlTop: c.top,
                  valueCenter: v.top + v.height / 2,
                  controlCenter: c.top + c.height / 2,
                  valueLeft: v.left,
                  controlRight: c.right,
                  valueWidth: v.width,
                };
              });
            assert.ok(
              geometry.labelBottom <= geometry.controlTop + 1,
              "The opacity label is above its track",
            );
            assert.ok(
              Math.abs(geometry.valueCenter - geometry.controlCenter) < 1,
              "Opacity value and track share a row, as in prototype A",
            );
            assert.ok(
              geometry.controlRight + 11 * pixelScale <= geometry.valueLeft,
              "The value has a separate readable column",
            );
            assert.ok(Math.abs(geometry.valueWidth / pixelScale - 44) < 0.1);
            const visibility = page.getByRole("region", {
              name: t.visibilityGroup,
            });
            assert.equal(
              await visibility.locator(".v-slider-value").textContent(),
              t.opacityValue(85),
            );
            for (const name of [
              t.practiceShort,
              t.qualifyingShort,
              t.raceShort,
            ]) {
              const button = page
                .getByRole("group", { name: t.showIn, exact: true })
                .getByRole("button", { name, exact: true });
              assert.equal(await button.getAttribute("aria-pressed"), "true");
              assert.equal(
                await button.locator('svg[aria-hidden="true"]').count(),
                1,
              );
            }
            for (const group of await groups.all()) {
              const clipped = await group.evaluate((node) => {
                const bounds = node.getBoundingClientRect();
                return [
                  ...node.querySelectorAll<HTMLElement>(
                    "button, [role=slider], output",
                  ),
                ].filter((child) => {
                  if (!child.getClientRects().length) return false;
                  const rect = child.getBoundingClientRect();
                  return (
                    rect.width > 0 &&
                    (rect.left < bounds.left - 1 ||
                      rect.right > bounds.right + 1)
                  );
                }).length;
              });
              assert.equal(
                clipped,
                0,
                "Every control stays inside its card, including the disabled placement action",
              );
            }
            const slider = page.getByRole("slider", {
              name: t.opacity,
              exact: true,
            });
            await slider.focus();
            await page.keyboard.press("Tab");
            await page.keyboard.press("Shift+Tab");
            assert.ok(
              await slider.evaluate((node) => document.activeElement === node),
              "Tab returns to the opacity input",
            );
            const thumb = page.locator(
              ".v-studio-track-groups .v-slider-thumb",
            );
            const focus = await thumb.evaluate((node) => ({
              width: Number.parseFloat(getComputedStyle(node).outlineWidth),
              style: getComputedStyle(node).outlineStyle,
              keyboard: node.matches(":has(:focus-visible)"),
              dpr: window.devicePixelRatio,
            }));
            // Chromium rounds outline strokes to device pixels at CSS zoom.
            // The 100% cases require 2px; smaller scales retain that painted stroke.
            const paintedWidth =
              Math.floor(2 * pixelScale * focus.dpr) / (pixelScale * focus.dpr);
            assert.ok(
              focus.keyboard &&
                focus.style !== "none" &&
                focus.width >= paintedWidth - 0.02,
              `Opacity keyboard ring ${width}/${scheme}/${expanded}: ${JSON.stringify({ ...focus, pixelScale, paintedWidth })}`,
            );
          }
          const slider = page.getByRole("slider", {
            name: t.opacity,
            exact: true,
          });
          await slider.focus();
          await page.keyboard.press("ArrowLeft");
          await until(
            () =>
              slider
                .getAttribute("aria-valuetext")
                .then((value) => value === t.opacityValue(84)),
            5000,
            "Formatted opacity follows the saved value",
          );
          assert.ok(
            await slider.evaluate((node) => document.activeElement === node),
          );
          const cadence = page.getByRole("group", {
            name: frequency.choices,
            exact: true,
          });
          const selected = cadence.getByRole("button", {
            name: frequency.hz(10),
            exact: true,
          });
          await selected.focus();
          await page.keyboard.press("Enter");
          await until(
            async () =>
              (await selected.getAttribute("aria-pressed")) === "true",
            5000,
            "Keyboard frequency selection is confirmed",
          );
          assert.equal(
            await cadence
              .getByRole("button", { name: frequency.inherit, exact: true })
              .getAttribute("aria-pressed"),
            "false",
          );
          assert.ok(
            await selected.evaluate((node) => document.activeElement === node),
            "Saved frequency retains focus",
          );
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
}
