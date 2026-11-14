import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import { studioText as t } from "../src/renderer/i18n/studio";
import { studioStateScenes } from "./visual-diff/studio-states";
import { until } from "./wait-for";

export async function checkStudioStates(
  parent: Page,
  base: string,
  evidence: string,
) {
  const page = await parent.context().newPage();
  const compact = [];
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const theme of ["dark", "light"]) {
      await page.goto(`${base}?escena=visual-${theme}:studio-a-vacio`);
      await page
        .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
        .click();
      await page
        .getByRole("heading", { name: t.emptyTitle, exact: true })
        .waitFor();
      const nav = page.locator(".v-sidebar");
      if (
        await nav.evaluate((node) =>
          node.classList.contains("v-sidebar--collapsed"),
        )
      )
        await page.keyboard.press("Control+b");
      const strip = page.locator(".v-focus-strip");
      await until(
        async () => (await strip.boundingBox())?.width === 72,
        5000,
        "compact Studio strip",
      );
      const label = strip.locator(".v-focus-add .v-button-label > span");
      assert.equal(
        await label.evaluate((node) => getComputedStyle(node).display),
        "none",
      );
      const add = strip.getByRole("button", { name: t.add, exact: true });
      await add.click();
      await page
        .getByRole("dialog", { name: t.catalog, exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await until(
        () => add.evaluate((node) => node === document.activeElement),
        5000,
        "compact Add focus return",
      );
      compact.push({
        theme,
        viewport: [1280, 720],
        strip: 72,
        labelHiddenByCss: true,
        accessibleAddWorks: true,
      });
    }
    for (const scene of [
      "studio-a-ilegible",
      "studio-a-recargar",
      "studio-a-fallo-lectura",
    ]) {
      await page.goto(`${base}?escena=${scene}`);
      await page
        .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
        .click();
      await page.getByRole("alert").waitFor();
      if (scene === "studio-a-fallo-lectura")
        assert.equal(
          await page.locator('.v-studio-focus [aria-busy="true"]').count(),
          0,
        );
      await page.getByRole("button", { name: t.reload, exact: true }).click();
      const target =
        scene === "studio-a-ilegible"
          ? page.locator(".v-studio-list")
          : page.getByRole("button", { name: /^Standings, / });
      await until(
        () => target.evaluate((node) => node === document.activeElement),
        5000,
        `reload focus ${scene}`,
      );
    }
    await checkStudioComposition(parent, base);
    await writeFile(
      resolve(evidence, "studio-states.json"),
      JSON.stringify(
        {
          compact,
          reloadFocus: true,
          initialReadRecovery: true,
          composition: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await page.close();
  }
}

export async function checkStudioComposition(parent: Page, base: string) {
  const browser = parent.context().browser();
  assert.ok(
    browser,
    "Chromium is available for the isolated composition check",
  );
  const context = await browser.newContext();
  try {
    for (const scene of [
      "studio-estado-delta",
      "studio-estado-error",
      "studio-estado-protegido",
    ]) {
      const adapter = studioStateScenes[scene];
      for (const [width, height] of [
        [1440, 900],
        [1280, 800],
      ]) {
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        try {
          await page.setViewportSize({ width, height });
          await page.goto(`${base}?escena=visual-dark:${adapter.mock}`);
          await adapter.prepare(page);
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
              await until(
                async () =>
                  Math.abs(
                    ((await sidebar.boundingBox())?.width ?? 0) -
                      (expanded ? 272 : 76),
                  ) < 1,
                5000,
                "Studio sidebar settled",
              );
              const root = page.locator(".v-studio-focus");
              assert.equal(
                await root.count(),
                1,
                "Positive control: Studio is mounted",
              );
              const typography = await root.evaluate((node) => {
                const style = getComputedStyle(node);
                return {
                  size: Number.parseFloat(style.fontSize),
                  line: Number.parseFloat(style.lineHeight),
                };
              });
              assert.ok(
                Math.abs(typography.line / typography.size - 1.4) < 0.01,
                "Studio follows the prototype line height without changing the shared frame",
              );
              const column = page.locator(".v-focus-column");
              assert.equal(await column.count(), 1);
              assert.equal(
                await column.evaluate((node) => getComputedStyle(node).gap),
                "14px",
              );
              const stage = page.locator(".v-focus-stage");
              if (scene !== "studio-estado-protegido") {
                assert.equal(
                  await stage.count(),
                  1,
                  "Positive control: real stage exists",
                );
                assert.equal(
                  await stage.evaluate(
                    (node) => getComputedStyle(node).minHeight,
                  ),
                  "170px",
                );
                const bounds = await stage.boundingBox();
                assert.ok(
                  bounds && bounds.height >= 170,
                  "The decorative drawing retains its useful minimum",
                );
              }
              const actions = page.locator(".v-studio-state-actions .v-button");
              if (scene !== "studio-estado-delta") {
                assert.ok(
                  (await actions.count()) > 0,
                  "Positive control: recovery actions are present",
                );
                for (const action of await actions.all()) {
                  const metrics = await action.evaluate((node) => {
                    const style = getComputedStyle(node);
                    return {
                      height: node.getBoundingClientRect().height,
                      radius: style.borderRadius,
                      size: style.fontSize,
                    };
                  });
                  assert.equal(metrics.height, 30);
                  assert.equal(metrics.radius, "8px");
                  assert.equal(metrics.size, "12.5px");
                }
              }
              if (scene === "studio-estado-error") {
                assert.equal(await actions.count(), 2);
                assert.notEqual(
                  await actions
                    .first()
                    .evaluate((node) => getComputedStyle(node).backgroundColor),
                  "rgba(0, 0, 0, 0)",
                  "Retry is the neutral recovery action",
                );
                assert.equal(
                  await actions
                    .nth(1)
                    .evaluate((node) => getComputedStyle(node).backgroundColor),
                  "rgba(0, 0, 0, 0)",
                  "Discard remains the ghost secondary action",
                );
                await actions.first().focus();
                await page.keyboard.press("Tab");
                assert.ok(
                  await actions
                    .nth(1)
                    .evaluate((node) => node === document.activeElement),
                  "The secondary recovery action remains reachable by keyboard",
                );
                assert.ok(
                  await actions
                    .nth(1)
                    .evaluate(
                      (node) =>
                        Number.parseFloat(
                          getComputedStyle(node).outlineWidth,
                        ) >= 2,
                    ),
                  "Recovery actions retain a visible focus outline",
                );
                const status = page.locator(".v-step-save");
                assert.equal(
                  await status.locator("svg").count(),
                  1,
                  "Failed save has a decorative warning icon as well as text",
                );
                assert.equal(
                  await status.locator("svg").getAttribute("aria-hidden"),
                  "true",
                );
                const alert = page.locator(
                  '.v-studio-state-feedback[data-tone="err"] > svg',
                );
                assert.equal(await alert.count(), 1);
                assert.equal(
                  await status.evaluate((node) => getComputedStyle(node).color),
                  await alert.evaluate((node) => getComputedStyle(node).color),
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
