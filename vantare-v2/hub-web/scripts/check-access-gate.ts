import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { accountLimits } from "../src/contract/generated/account.ts";
import { accessText as text } from "../src/renderer/i18n/access.es.ts";
import { windowText } from "../src/renderer/i18n/window.es.ts";
import { accessScenes } from "./visual-diff/access.ts";
import { until } from "./wait-for.ts";
export async function checkAccessGate(
  page: Page,
  base: string,
  evidence: string,
) {
  const reports = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [scene, adapter] of Object.entries(accessScenes)) {
    for (const scheme of ["dark", "light"]) {
      await page.goto(`${base}?escena=visual-${scheme}:${scene}`);
      await adapter.prepare(page);
      await page.evaluate(() => document.fonts.ready);
      await until(
        () =>
          page.evaluate(
            (expected) => document.documentElement.dataset.scheme === expected,
            scheme,
          ),
        5000,
        "access scheme",
      );
      const report = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      reports.push({ scene, scheme, violations: report.violations });
      await writeFile(
        resolve(evidence, "access-axe.json"),
        JSON.stringify(reports, null, 2),
      );
      assert.deepEqual(
        report.violations,
        [],
        `${scene}/${scheme}: access accessibility violations`,
      );
      await adapter.cleanup?.(page);
    }
  }
  await page.goto(`${base}?escena=acceso-base`);
  const first = page.getByRole("button", { name: text.google, exact: true });
  await first.waitFor();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await page
      .getByRole("button", { name: windowText.close, exact: true })
      .evaluate((node) => document.activeElement === node),
    true,
  );
  await page.keyboard.press("Escape");
  await first.waitFor();
  await first.click();
  await page.getByText(text.waitingBrowser, { exact: true }).waitFor();
  await page.getByRole("button", { name: text.cancel, exact: true }).click();
  await first.waitFor();
  await page.getByRole("button", { name: text.email, exact: true }).click();
  await page
    .getByRole("textbox", { name: text.emailLabel, exact: true })
    .fill("qa@example.invalid");
  await page
    .getByRole("button", { name: text.submit.continue, exact: true })
    .click();
  await page
    .getByRole("textbox", {
      name: text.codeDigit(1, accountLimits.code),
      exact: true,
    })
    .pressSequentially("123456");
  await page
    .getByRole("button", { name: text.submit.verify, exact: true })
    .waitFor();
  assert.equal(await page.getByText(text.consent, { exact: true }).count(), 0);
  await page
    .getByRole("button", { name: text.submit.verify, exact: true })
    .click();
  await page.getByText(text.consent, { exact: true }).waitFor();
  await page.getByRole("button", { name: text.back, exact: true }).click();
  await first.waitFor();
  await writeFile(
    resolve(evidence, "access-interactions.json"),
    JSON.stringify({
      windowKeyboard: true,
      escapeDoesNotBypass: true,
      explicitBrowserIntent: true,
      cancel: true,
      email: true,
      codeRequiresConfirmation: true,
    }),
  );
}
