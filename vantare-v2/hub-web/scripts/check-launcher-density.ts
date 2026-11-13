import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";

/** CSS must be exercised by Chromium; jsdom does not evaluate these media rules. */
export async function checkLauncherDensity(
  page: Page,
  base: string,
  evidence: string,
) {
  const viewport = page.viewportSize();
  const results = [];
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}?escena=launcher-base`);
      await page.getByRole("button", { name: "Launcher", exact: true }).click();
      await page.locator(".v-launcher-profiles").waitFor();
      for (const expanded of [false, true]) {
        const sidebar = page.locator(".v-sidebar");
        const current = await sidebar.evaluate(
          (node) => !node.classList.contains("v-sidebar--collapsed"),
        );
        if (current !== expanded)
          await page
            .getByRole("button", {
              name: /^(Contraer o ampliar navegación|Contraer barra)$/,
              exact: true,
            })
            .first()
            .click();
        const layout = await page
          .locator(".v-launcher-page")
          .evaluate((node) => {
            const grid = node.querySelector<HTMLElement>(
              ".v-launcher-profile-grid",
            );
            const caption = node.querySelector<HTMLElement>(
              ".v-launcher-heading p",
            );
            const cards = [
              ...node.querySelectorAll<HTMLElement>(
                ".v-launcher-profile:not(.v-launcher-profile--new)",
              ),
            ];
            if (!grid || !caption) throw new Error("Launcher layout missing");
            return {
              display: getComputedStyle(grid).display,
              caption: getComputedStyle(caption).display,
              cards: cards.map((card) => {
                const bounds = card.getBoundingClientRect();
                const heading = card.querySelector("strong");
                if (!heading) throw new Error("Profile heading missing");
                const title = heading.getBoundingClientRect();
                return {
                  x: bounds.x,
                  y: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  titleBottom: title.bottom,
                  bottom: bounds.bottom,
                };
              }),
            };
          });
        assert.equal(
          layout.cards.length,
          2,
          "Positive control: the profile fixture must contain two cards",
        );
        assert.equal(layout.display, height < 820 ? "flex" : "grid");
        assert.equal(layout.caption === "none", height < 820);
        if (height < 820) {
          for (const card of layout.cards) {
            assert.equal(card.width, 200);
            assert.ok(
              card.titleBottom <= card.bottom,
              "Profile label must not be clipped",
            );
          }
          assert.equal(
            layout.cards[0].y,
            layout.cards[1].y,
            "Compact profiles stay on one row",
          );
        }
        const first = page.getByRole("button", {
          name: "Creador de Contenido",
          exact: true,
        });
        await first.focus();
        await page.keyboard.press("Tab");
        const next = page.getByRole("button", { name: "Pro", exact: true });
        assert.ok(
          await next.evaluate(
            (node) =>
              document.activeElement === node && node.matches(":focus-visible"),
          ),
          "Keyboard focus must remain visible on the next profile",
        );
        results.push({ width, height, expanded, ...layout });
      }
    }
    await writeFile(
      join(evidence, "launcher-density.json"),
      JSON.stringify(results, null, 2),
    );
  } finally {
    if (viewport) await page.setViewportSize(viewport);
  }
}
