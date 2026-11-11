import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";
import { t } from "../src/renderer/i18n/es.ts";
import { privacyText } from "../src/renderer/i18n/privacy.es";
import { until } from "./wait-for.ts";
import { webQaPreview } from "./web-qa";

const evidence = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/privacy",
);
await mkdir(evidence, { recursive: true });
const server = await webQaPreview();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function open(scene: string) {
    await page.goto(`${server.resolvedUrls?.local[0]}?escena=${scene}`);
    await page
      .getByRole("tab", { name: t("settings.privacy"), exact: true })
      .click();
    await page
      .getByRole("switch", { name: t("privacy.crashes"), exact: true })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  await open("privacidad-mail");
  const crashes = page.getByRole("switch", {
    name: t("privacy.crashes"),
    exact: true,
  });
  await crashes.click();
  await until(
    async () => (await crashes.getAttribute("aria-checked")) === "true",
    5000,
    "privacy ACK",
  );
  await page
    .getByRole("button", { name: privacyText.enable, exact: true })
    .click();
  await page
    .getByRole("button", { name: privacyText.disable, exact: true })
    .waitFor();
  for (const scheme of ["dark", "light"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.scheme)) !==
      scheme
    ) {
      await page
        .getByRole("button", {
          name: "Cambiar tema claro u oscuro",
          exact: true,
        })
        .click();
    }
    await until(
      async () =>
        (await page.evaluate(() => document.documentElement.dataset.scheme)) ===
        scheme,
      5000,
      "scheme saved through real appearance path",
    );
    assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
    await page.screenshot({ path: resolve(evidence, `privacy-${scheme}.png`) });
  }
  await open("privacidad-conflicto");
  await crashes.click();
  await page.getByText(t("privacy.conflict"), { exact: true }).waitFor();
  await page
    .getByRole("button", { name: t("settings.retry"), exact: true })
    .click();
  await until(
    async () => (await crashes.getAttribute("aria-checked")) === "true",
    5000,
    "privacy retry",
  );
  await open("privacidad-protegida");
  assert.equal(await crashes.getAttribute("aria-disabled"), "true");
  await page.goto(
    `${server.resolvedUrls?.local[0]}?escena=diagnostico-observado`,
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
  assert.equal((await report.inputValue()).includes("access_token"), false);
  await page
    .getByRole("button", { name: t("diagnostics.copy"), exact: true })
    .click();
  await page.getByText(t("diagnostics.copied"), { exact: true }).waitFor();
  for (const scheme of ["dark", "light"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.scheme)) !==
      scheme
    ) {
      await page
        .getByRole("button", {
          name: "Cambiar tema claro u oscuro",
          exact: true,
        })
        .click();
    }
    await until(
      async () =>
        (await page.evaluate(() => document.documentElement.dataset.scheme)) ===
        scheme,
      5000,
      "scheme saved through real appearance path",
    );
    assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
    await page.screenshot({
      path: resolve(evidence, `diagnostics-${scheme}.png`),
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(evidence, "privacy.json"),
    JSON.stringify({
      passed: true,
      consent: true,
      mailAck: true,
      conflictRetry: true,
      protected: true,
      report: true,
      axe: true,
      errors,
    }),
  );
} finally {
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : done())),
  );
}
