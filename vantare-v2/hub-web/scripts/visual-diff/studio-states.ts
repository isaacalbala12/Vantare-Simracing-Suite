import assert from "node:assert/strict";
import type { CDPSession, Page } from "playwright-core";
import { studioText as t } from "../../src/renderer/i18n/studio.ts";
import { studioCatalogText } from "../../src/renderer/i18n/studio-catalog.ts";
import { until } from "../wait-for.ts";
import type { VisualScene } from "./scenes.ts";

async function open(page: Page) {
  await page
    .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
    .click();
  await page.locator(".v-studio-focus").waitFor();
}
async function select(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`^${name}, `) }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
}
async function appearance(page: Page, name: string) {
  await select(page, name);
  await page.getByRole("tab", { name: t.appearance, exact: true }).click();
}
async function catalog(page: Page, expanded: boolean) {
  await appearance(page, "Delta");
  const sidebar = page.locator(".v-sidebar");
  const collapsed = await sidebar.evaluate((node) =>
    node.classList.contains("v-sidebar--collapsed"),
  );
  if (collapsed === expanded) await page.keyboard.press("Control+b");
  await until(
    async () => (await sidebar.boundingBox())?.width === (expanded ? 272 : 76),
    5000,
    "sidebar before catalog",
  );
  await page.locator("[data-add-widget]").click();
  await page.getByRole("dialog", { name: t.catalog, exact: true }).waitFor();
}
const scene = (
  mock: string,
  prepare: (page: Page) => Promise<void>,
): VisualScene => {
  let stress: CDPSession | undefined;
  return {
    mock,
    async prepare(page) {
      stress = undefined;
      await open(page);
      await prepare(page);
      // QA stress viewport: the product selector correctly forbids 125% at 1440px
      // because it preserves 1280 logical pixels. Emulate the mockup's smaller
      // logical viewport without changing that product limit or its preferences.
      // Prepare through real controls first: CDP's visual scale does not apply
      // the same coordinate transform to Playwright pointer input on Windows.
      if (process.env.VANTARE_STUDIO_VISUAL_ZOOM === "125") {
        stress = await page.context().newCDPSession(page);
        await stress.send("Emulation.setDeviceMetricsOverride", {
          width: 1152,
          height: 720,
          deviceScaleFactor: 1,
          mobile: false,
          scale: 1.25,
          dontSetVisibleSize: true,
          screenWidth: 1440,
          screenHeight: 900,
        });
      }
      const strip = page.locator(".v-focus-strip");
      if (await strip.count()) {
        const compact = await page
          .locator(".v-studio-focus")
          .evaluate((element) => element.clientWidth - 48 <= 1120);
        if (compact) {
          assert.equal(
            await strip.evaluate((element) => element.clientWidth),
            72,
          );
          // The catalog deliberately makes this background strip inert. Its Add
          // still needs a name when the modal closes, but must not be announced
          // as an accessible background action while the modal is open.
          assert.equal(
            await strip.locator("[data-add-widget]").getAttribute("aria-label"),
            t.add,
          );
        }
      }
    },
    async cleanup(page) {
      if (stress) {
        await stress.send("Emulation.clearDeviceMetricsOverride");
        await stress.detach();
        stress = undefined;
      }
      await page.keyboard.press("Escape");
      // These scenes deliberately leave a real request unanswered. Let the normal
      // Client deadline settle it after capturing, so answerWhenIdle can close the
      // window; do not force-close or bypass its pending-request guard.
      if (mock === "studio-a-guardando" || mock === "studio-a-cargando")
        await page
          .locator(".v-focus-strip")
          .getByRole("status", {
            name: t.notSaved,
            exact: true,
          })
          .waitFor({ timeout: 50000 });
    },
  };
};
const ordinary = "studio-a-oculto";
// The 13 states of variante-a.html, with the same real bridge and renderer.
// Width/theme/sidebar variants are supplied by visual-diff, not by these scenes.
export const studioStateScenes: Record<string, VisualScene> = {
  "studio-estado-delta": scene(ordinary, async (page) => {
    await appearance(page, "Delta");
  }),
  "studio-estado-std-v": scene(ordinary, async (page) => {
    await appearance(page, "Standings");
  }),
  "studio-estado-std-e": scene(ordinary, async (page) => {
    await appearance(page, "Standings");
    await page
      .getByRole("radio", { name: t.lookEficiencia, exact: true })
      .click();
    await page
      .getByRole("radio", { name: t.designSignature, exact: true })
      .waitFor();
  }),
  "studio-estado-fuel": scene(ordinary, async (page) => {
    await appearance(page, "Fuel y stint");
  }),
  "studio-estado-oculto": scene(ordinary, async (page) => {
    await appearance(page, "Relative");
    await page.getByText(t.hiddenStage, { exact: true }).waitFor();
  }),
  "studio-estado-pista": scene(ordinary, async (page) => {
    await select(page, "Delta");
    await page.getByRole("tab", { name: t.track, exact: true }).click();
  }),
  "studio-estado-contenido": scene(ordinary, async (page) => {
    await appearance(page, "Delta");
    const tab = page.getByRole("tab", { name: t.content, exact: true });
    await tab.focus();
    assert.equal(await tab.getAttribute("aria-disabled"), "true");
  }),
  "studio-estado-menu": scene(ordinary, async (page) => {
    await appearance(page, "Delta");
    await page
      .getByRole("button", { name: studioCatalogText.moreLabel, exact: true })
      .click();
    await page.getByRole("menu").waitFor();
  }),
  "studio-estado-add": scene(ordinary, async (page) => {
    await catalog(page, false);
  }),
  // Do not toggle a background shortcut through the catalog's safety layer.
  "studio-estado-add-abierto": scene(ordinary, async (page) => {
    await catalog(page, true);
  }),
  "studio-estado-vacio": scene("studio-a-vacio", async (page) => {
    await page
      .getByRole("heading", { name: t.emptyTitle, exact: true })
      .waitFor();
  }),
  "studio-estado-protegido": scene("studio-a-protegido", async (page) => {
    await page.getByRole("alert").waitFor();
    assert.equal(await page.getByRole("combobox").count(), 0);
    assert.equal(await page.getByRole("switch").count(), 0);
  }),
  "studio-estado-guardando": scene("studio-a-guardando", async (page) => {
    await appearance(page, "Delta");
    const expanded = page.getByRole("radio", {
      name: t.deltaExpanded,
      exact: true,
    });
    await expanded.click();
    await page
      .locator(".v-focus-strip")
      .getByRole("status", { name: t.saving, exact: true })
      .waitFor();
  }),
  "studio-estado-error": scene("studio-a-error", async (page) => {
    await appearance(page, "Delta");
    await page
      .getByRole("radio", { name: t.deltaExpanded, exact: true })
      .click();
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: t.retry, exact: true }).waitFor();
  }),
  // Additional negative-document cases have no fabricated counterpart in the mockup.
  "studio-estado-ilegible": scene("studio-a-ilegible", async (page) => {
    await page.getByRole("alert").waitFor();
  }),
  "studio-estado-cargando": scene("studio-a-cargando", async (page) => {
    await page.locator('[data-state="loading"]').waitFor();
  }),
  "studio-estado-missing": scene("studio-a-missing", async (page) => {
    await page.getByText(t.missing, { exact: true }).waitFor();
  }),
};
