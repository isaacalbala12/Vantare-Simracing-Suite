import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { t } from "../src/renderer/i18n/es.ts";
import { until } from "./wait-for.ts";

export async function checkPrivacyHost(
  page: Page,
  data: string,
  evidence: string,
) {
  const path = join(data, "..", "Vantare", "native", "privacy.json");
  await page
    .getByRole("tab", { name: t("settings.privacy"), exact: true })
    .click();
  const crashes = page.getByRole("switch", {
    name: t("privacy.crashes"),
    exact: true,
  });
  await crashes.waitFor();
  await crashes.click();
  await until(
    async () => {
      try {
        const value = JSON.parse(await readFile(path, "utf8"));
        return value.crashes === true && value.crashes_decided === true;
      } catch {
        return false;
      }
    },
    5000,
    "explicit crash consent persisted by Rust",
  );
  const mail = page.getByRole("switch", {
    name: t("privacy.mail"),
    exact: true,
  });
  assert.equal(await mail.getAttribute("aria-disabled"), "true");
  await page.screenshot({ path: join(evidence, "privacy-native.png") });
  await crashes.click();
  await until(
    async () => JSON.parse(await readFile(path, "utf8")).crashes === false,
    5000,
    "explicit crash consent revoked by Rust",
  );
  await page
    .getByRole("tab", { name: t("settings.diagnostics"), exact: true })
    .click();
  await page
    .getByRole("button", { name: t("diagnostics.prepare"), exact: true })
    .click();
  const report = page.getByRole("textbox", {
    name: t("diagnostics.preview"),
    exact: true,
  });
  await report.waitFor();
  const text = await report.inputValue();
  const parsed = JSON.parse(text);
  assert.ok(parsed && typeof parsed === "object");
  assert.equal(text.includes("D:"), false);
  assert.equal(text.includes("access_token"), false);
  await page
    .getByRole("button", { name: t("diagnostics.copy"), exact: true })
    .click();
  await page.getByText(t("diagnostics.copied"), { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, "diagnostics-native.png") });
}
