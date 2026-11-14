import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { residentOrderReceiptTimeoutMs } from "../src/contract/generated/launcher_resident.ts";
import { removalText as text } from "../src/renderer/i18n/launcher-removal.ts";
import { openProfileRemovalWithKeyboard } from "./check-dialog-safety.ts";
import {
  assertControlCaption,
  observeResidentControls,
} from "./check-resident-control.ts";
import { until } from "./wait-for.ts";
export async function prepareResidentRemoval(page: Page, state: string) {
  await observeResidentControls(page);
  if (state === "timeout") await page.clock.install();
  await page.getByRole("button", { name: "Launcher", exact: true }).click();
  await page
    .getByRole("heading", { name: "Creador de Contenido", exact: true })
    .waitFor();
  const toggle = page.getByRole("button", {
    name: "Contraer o ampliar navegación",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-expanded")) === "true")
    await toggle.click();
  const dialog = await openProfileRemovalWithKeyboard(page);
  const confirm = dialog.getByRole("button", { name: "Eliminar", exact: true });
  if (["owned", "unknown", "unsupported"].includes(state)) {
    const reason =
      state === "owned"
        ? text.reasons["owned-live"]
        : state === "unknown"
          ? text.reasons["ownership-unknown"]
          : text.reasons.unsupported;
    await dialog.getByText(reason, { exact: true }).waitFor();
    assert.equal(await confirm.getAttribute("aria-disabled"), "true");
    await confirm.focus();
    await page.keyboard.press("Enter");
  } else {
    await until(
      async () => (await confirm.getAttribute("aria-disabled")) === "false",
      5000,
      "fresh ownership enables checked removal",
    );
    if (state !== "ready") {
      await confirm.focus();
      await page.keyboard.press("Enter");
      if (state === "finished") {
        await dialog.waitFor({ state: "hidden" });
        await page.getByText(text.removed, { exact: true }).waitFor();
        assert.equal(
          await page
            .locator('.v-launcher-profile[aria-label="Creador de Contenido"]')
            .count(),
          0,
        );
        await until(
          () =>
            page
              .getByRole("heading", { name: "Launcher", exact: true })
              .evaluate((node) => node === document.activeElement),
          5000,
          "removed origin returns focus to heading",
        );
      } else {
        const message =
          state === "accepted"
            ? text.accepted
            : state === "rejected"
              ? text.reasons["owned-live"]
              : state === "failed"
                ? text.reasons.io
                : text.unknown;
        if (state === "timeout") {
          await dialog.getByText(text.queued, { exact: true }).waitFor();
          await page.clock.runFor(residentOrderReceiptTimeoutMs);
        }
        await dialog.getByText(message, { exact: true }).waitFor();
        assert.equal(
          await page
            .locator('.v-launcher-profile[aria-label="Creador de Contenido"]')
            .count(),
          1,
        );
        await confirm.focus();
        await page.keyboard.press("Enter"); // aria-disabled stays focusable, but cannot issue twice.
      }
    }
  }
  if (state !== "finished") {
    const audit = await new AxeBuilder({ page })
      // Electron denies auxiliary pages; audit this same-origin dialog as the existing smoke does.
      .setLegacyMode()
      .include('[data-window-dialog="screen"]')
      .analyze();
    assert.deepEqual(
      audit.violations,
      [],
      "checked-removal dialog accessibility",
    );
  }
  const requests = await page.evaluate(
    () =>
      Reflect.get(window, "residentControlRequests") as { method: string }[],
  );
  assert.deepEqual(
    requests.map((r) => r.method),
    ["ready", "owned", "unknown", "unsupported"].includes(state)
      ? []
      : ["launcher.profile.removeChecked"],
  );
  await assertControlCaption(page);
  if (state !== "finished") {
    const cancel = dialog.getByRole("button", {
      name:
        state === "ready" || ["owned", "unknown", "unsupported"].includes(state)
          ? "Cancelar"
          : "Cerrar",
      exact: true,
    });
    await cancel.focus();
    assert.equal(
      await cancel.evaluate((node) => node === document.activeElement),
      true,
    );
  }
}
export async function checkResidentRemoval(page: Page, base: string) {
  for (const state of [
    "ready",
    "owned",
    "unknown",
    "unsupported",
    "accepted",
    "rejected",
    "failed",
    "finished",
    "gap",
    "restart",
    "timeout",
  ]) {
    await page.goto(`${base}?escena=launcher-removal-${state}`);
    await prepareResidentRemoval(page, state);
  }
}
