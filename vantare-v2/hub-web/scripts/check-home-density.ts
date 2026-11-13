import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { homeScenes } from "./visual-diff/home";

export async function checkHomeDensity(original: Page, base: string) {
  const browser = original.context().browser();
  assert.ok(browser, "Chromium browser is available for the isolated check");
  const context = await browser.newContext();
  try {
    for (const scene of [
      "inicio-base",
      "inicio-vacio",
      "inicio-cargando",
      "inicio-error",
    ]) {
      for (const [width, height] of [
        [1440, 900],
        [1280, 800],
      ]) {
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        try {
          await page.setViewportSize({ width, height });
          await page.goto(
            `${base}?escena=visual-dark:${homeScenes[scene].mock}`,
          );
          await homeScenes[scene].prepare(page);
          await page.evaluate(async () => {
            await document.fonts.ready;
          });
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
                await sidebar.evaluate(
                  (node) => !node.classList.contains("v-sidebar--collapsed"),
                ),
                expanded,
                "Requested sidebar state is actually active",
              );
              const title = page.locator(".v-home-hero h1");
              assert.equal(
                await title.count(),
                1,
                "Positive control: greeting exists",
              );
              assert.equal(
                await title.evaluate((node) => getComputedStyle(node).fontSize),
                height < 820 ? "38px" : "46px",
              );
              assert.equal(
                await title.evaluate(
                  (node) => getComputedStyle(node).lineHeight,
                ),
                height < 820 ? "40px" : "48px",
              );
              const description = page.locator(".v-home-hero-description");
              assert.equal(
                await description.count(),
                1,
                "Positive control: optional description exists",
              );
              assert.equal(
                await description.isVisible(),
                height >= 820 && scene !== "inicio-cargando",
              );
              const templates = page.locator(".v-home-templates > button");
              assert.equal(
                await templates.count(),
                4,
                "Positive control: all template data remains present",
              );
              assert.equal(
                await page
                  .locator(".v-home-templates > button:visible")
                  .count(),
                height < 820 && scene !== "inicio-cargando" ? 2 : 4,
                "Compact templates keep only the native first row; loading retains four placeholders",
              );
              if (height < 820) {
                const errorRail =
                  (await page.locator(".v-home-rail--error").count()) > 0;
                const status = await page
                  .locator(".v-home-rail-status")
                  .boundingBox();
                assert.ok(
                  status &&
                    Math.abs(status.height - (errorRail ? 344 : 274)) <= 1,
                  "Template rail follows the compact hero, including the access-error banner",
                );
              }
              if (scene === "inicio-error") {
                assert.equal(await page.locator(".v-home-error").count(), 1);
                assert.ok(
                  await page.locator(".v-home-error").isVisible(),
                  "Critical access warning must remain visible in compact mode",
                );
              }
              if (scene !== "inicio-cargando") {
                const action = page
                  .locator(".v-home-hero-actions button:not(:disabled)")
                  .first();
                assert.ok(
                  (await action.count()) > 0,
                  "Positive control: a usable hero action exists",
                );
                await action.focus();
                assert.ok(
                  await action.evaluate(
                    (node) => node === document.activeElement,
                  ),
                  "Hero actions keep keyboard focus",
                );
              }
            }
          }
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
}
