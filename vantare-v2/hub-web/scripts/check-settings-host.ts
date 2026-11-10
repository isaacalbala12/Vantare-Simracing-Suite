import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { record } from "../src/contract/validation-common.ts";
import { checkTrackHost } from "./check-track-host.ts";
import { until } from "./wait-for.ts";
export async function checkSettingsHost(
  page: Page,
  data: string,
  evidence: string,
  installation?: string,
) {
  page.setDefaultTimeout(15000);
  const path = join(data, "hub-settings.json");
  const minimized = page.getByRole("switch", {
    name: "Empezar minimizado",
    exact: true,
  });
  await minimized.waitFor();
  if (process.env.VANTARE_HUB_SETTINGS_PROTECTED === "1") {
    await page.getByText("Documento protegido", { exact: true }).waitFor();
    assert.equal(await minimized.isDisabled(), true);
    assert.equal(await readFile(path, "utf8"), '{"version":999}');
    await page.screenshot({ path: join(evidence, "protected-native.png") });
    await writeFile(
      join(evidence, "settings-native.json"),
      JSON.stringify({ passed: true, protectedUnchanged: true }),
    );
    return;
  }
  async function readDocument() {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    assert.ok(
      record(value) && record(value.general) && record(value.appearance),
    );
    return {
      value,
      general: value.general,
      appearance: value.appearance,
      zoom: value.zoom,
    };
  }
  if (process.env.VANTARE_HUB_STARTUP_TEST === "1") {
    const startup = page.getByRole("switch", {
      name: "Abrir al iniciar Windows",
      exact: true,
    });
    assert.equal(await startup.isEnabled(), true);
    await startup.click();
    await until(
      async () => (await startup.getAttribute("aria-checked")) === "true",
      15000,
      "installer acknowledges startup",
    );
    assert.ok(installation, "Explicit isolated installation required");
    const root = installation;
    const context: unknown = JSON.parse(
      await readFile(join(root, "qa-context.json"), "utf8"),
    );
    assert.ok(record(context) && typeof context.shellRoot === "string");
    await readFile(join(context.shellRoot, "Startup/Vantare.lnk"));
    const ui: unknown = JSON.parse(
      await readFile(join(root, "installer-ui.json"), "utf8"),
    );
    assert.ok(record(ui) && ui.autostart === true);
    await startup.click();
    await until(
      async () => (await startup.getAttribute("aria-checked")) === "false",
      15000,
      "installer disables startup",
    );
    await assert.rejects(
      readFile(join(context.shellRoot, "Startup/Vantare.lnk")),
      { code: "ENOENT" },
    );
    await writeFile(
      join(evidence, "startup-native.json"),
      JSON.stringify({
        passed: true,
        isolatedContext: true,
        shortcutCreated: true,
        startupEnabledThenDisabled: true,
      }),
    );
  }
  await minimized.click();
  await until(
    async () => {
      try {
        return (await readDocument()).general.minimized === true;
      } catch {
        return false;
      }
    },
    5000,
    "Rust saves minimized",
  );
  await until(
    () =>
      page
        .getByRole("button", { name: "Aumentar tamaño de la interfaz" })
        .isEnabled(),
    5000,
    "first save acknowledged before shortcut",
  );
  const scale = await page.evaluate(() => devicePixelRatio);
  await page.getByRole("heading", { name: "Ajustes", exact: true }).focus();
  await page.keyboard.press("Control+=");
  await until(
    async () => (await readDocument()).zoom === 110,
    5000,
    "Rust saves zoom",
  );
  await until(
    async () =>
      Math.abs((await page.evaluate(() => devicePixelRatio)) / scale - 1.1) <
      0.01,
    5000,
    "Electron applies zoom factor",
  );
  await page
    .getByRole("button", { name: "Restablecer tamaño de la interfaz" })
    .click();
  await until(
    async () => (await readDocument()).zoom === 100,
    5000,
    "zoom reset persisted",
  );
  const external = await readDocument();
  external.value.general = { ...external.general, updates: false };
  await writeFile(path, JSON.stringify(external.value));
  await minimized.click();
  const conflict = page
    .getByRole("alert")
    .filter({ hasText: "Los ajustes han cambiado" });
  await conflict.waitFor();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Buscar o ejecutar un comando" })
    .fill("Cerrar Hub");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await until(
    async () =>
      (await readFile(join(data, "hub-ui-qa.log"), "utf8")).includes(
        "HUB_QA_CLOSE_BLOCKED",
      ),
    10000,
    "failed save protects close",
  );
  assert.equal(page.isClosed(), false);
  await page
    .getByRole("button", { name: "Reintentar guardado", exact: true })
    .click();
  await conflict.waitFor({ state: "hidden" });
  await until(
    async () => {
      const saved = await readDocument();
      return (
        saved.general.minimized === false && saved.general.updates === false
      );
    },
    5000,
    "retry preserves concurrent writer",
  );
  await page.screenshot({ path: join(evidence, "general-native.png") });
  await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
  await page.getByRole("radio", { name: "Claro", exact: true }).click();
  await until(
    async () => (await readDocument()).appearance.scheme === "light",
    5000,
    "scheme persisted",
  );
  await page.getByRole("radio", { name: "Iris", exact: true }).click();
  await until(
    async () => (await readDocument()).appearance.palette === "iris",
    5000,
    "palette persisted",
  );
  const slider = page.getByRole("slider", { name: "Contraste", exact: true });
  await until(
    () => slider.isEnabled(),
    5000,
    "palette acknowledged before keyboard edit",
  );
  await page.bringToFront();
  await slider.focus();
  try {
    await until(
      () =>
        slider.evaluate((input) => input.ownerDocument.activeElement === input),
      5000,
      "slider keyboard focus",
    );
  } catch (error) {
    await writeFile(
      join(evidence, "slider-focus.json"),
      JSON.stringify(
        await slider.evaluate((input) => ({
          active: input.ownerDocument.activeElement?.outerHTML,
          own: input.outerHTML,
          thumb: input.closest(".v-slider-thumb")?.outerHTML,
          hasFocus: input.ownerDocument.hasFocus(),
          disabled: input instanceof HTMLInputElement && input.disabled,
        })),
        null,
        2,
      ),
    );
    await page.screenshot({ path: join(evidence, "slider-focus.png") });
    throw error;
  }
  await page.keyboard.press("ArrowRight");
  await until(
    async () => (await readDocument()).appearance.contrast === 101,
    5000,
    "slider persists on release",
  );
  await page.screenshot({ path: join(evidence, "appearance-native.png") });
  await page.reload();
  await page
    .getByRole("switch", { name: "Empezar minimizado", exact: true })
    .waitFor();
  await until(
    async () =>
      (await page.evaluate(() => document.documentElement.dataset.palette)) ===
      "iris",
    5000,
    "saved palette restored",
  );
  assert.equal(await minimized.getAttribute("aria-checked"), "false");
  assert.equal(
    await page
      .getByRole("switch", { name: "Avisos de actualización", exact: true })
      .getAttribute("aria-checked"),
    "false",
  );
  await checkTrackHost(page, data, evidence);
  await page.getByRole("tab", { name: "Actualizaciones", exact: true }).click();
  await page.getByText("Entorno de desarrollo", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Instalar y reiniciar", exact: true })
      .count(),
    0,
  );
  await page.screenshot({ path: join(evidence, "updates-native.png") });
  await writeFile(
    join(evidence, "settings-native.json"),
    JSON.stringify({
      passed: true,
      scale,
      realRustSave: true,
      zoomApplied: true,
      conflictProtectsClose: true,
      retryPreservesConcurrentWriter: true,
      paletteRestored: true,
      performanceSaved: process.env.VANTARE_HUB_LAYOUT_MISSING !== "1",
      layoutAbsencePreserved: process.env.VANTARE_HUB_LAYOUT_MISSING === "1",
      visibilitySaved: process.env.VANTARE_HUB_LAYOUT_MISSING !== "1",
      shortcutsRead: process.env.VANTARE_HUB_LAYOUT_MISSING !== "1",
      updatesRead: true,
      developmentCannotRestart: true,
    }),
  );
}
