import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { record } from "../src/contract/validation-common.ts";
import { t } from "../src/renderer/i18n/es.ts";
import { until } from "./wait-for.ts";
export async function checkTrackHost(
  page: Page,
  data: string,
  evidence: string,
) {
  const path = join(data, "..", "layout.json");
  async function layout() {
    let bytes: string;
    try {
      bytes = await readFile(path, "utf8");
    } catch (error) {
      if (record(error) && error.code === "ENOENT") return {};
      throw error;
    }
    const value: unknown = JSON.parse(bytes);
    assert.ok(record(value));
    return value;
  }
  await page
    .getByRole("switch", { name: "Ocultar fuera de pista", exact: true })
    .click();
  await until(
    async () => (await layout()).hideOffTrack === true,
    5000,
    "visibility persisted to layout",
  );
  await page
    .getByRole("tab", { name: "Rendimiento en pista", exact: true })
    .click();
  await page.getByRole("radio", { name: "Ahorro", exact: true }).click();
  await until(
    async () => {
      const value = (await layout()).performance;
      return record(value) && value.level === "economy";
    },
    5000,
    "performance persisted to layout",
  );
  await page.screenshot({ path: join(evidence, "performance-native.png") });
  await page.getByRole("tab", { name: "Atajos", exact: true }).click();
  await page.getByText(t("shortcuts.global"), { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, "shortcuts-native.png") });
  await page.reload();
  await page
    .getByRole("switch", { name: "Ocultar fuera de pista", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("switch", { name: "Ocultar fuera de pista", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  await page
    .getByRole("tab", { name: "Rendimiento en pista", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("radio", { name: "Ahorro", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
}
