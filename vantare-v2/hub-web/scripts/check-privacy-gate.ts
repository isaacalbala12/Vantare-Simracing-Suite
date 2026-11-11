import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { privacyGateText as text } from "../src/renderer/i18n/privacy-gate.es.ts";
import { until } from "./wait-for.ts";

export async function checkPrivacyGate(
  page: Page,
  base: string,
  evidence: string,
) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const reports = [];
  for (const scene of ["privacidad-pendiente", "privacidad-uso"]) {
    await page.goto(`${base}?escena=${scene}`);
    await page.getByRole("dialog").waitFor();
    const reject = page.getByRole("button", { name: text.reject, exact: true });
    await until(
      () => reject.evaluate((node) => document.activeElement === node),
      5000,
      "privacy initial focus",
    );
    for (const scheme of ["dark", "light"]) {
      await page.evaluate((scheme) => {
        document.documentElement.dataset.scheme = scheme;
      }, scheme);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: resolve(evidence, `${scene}-${scheme}.png`),
      });
      const report = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      reports.push({ scene, scheme, violations: report.violations });
      await writeFile(
        resolve(evidence, "privacy-axe.json"),
        JSON.stringify(reports, null, 2),
      );
      assert.deepEqual(
        report.violations,
        [],
        `${scene}/${scheme}: accessibility violations`,
      );
    }
    await reject.focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .getByRole("button", {
          name: scene === "privacidad-uso" ? text.continue : text.accept,
          exact: true,
        })
        .evaluate((node) => document.activeElement === node),
      true,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor();
    await reject.click();
    if (scene === "privacidad-pendiente") {
      await page.getByRole("dialog", { name: text.usageLabel }).waitFor();
      await page
        .getByRole("button", { name: text.reject, exact: true })
        .click();
    }
    await page.getByRole("tab", { name: "General", exact: true }).waitFor();
  }
  await page.goto(`${base}?escena=privacidad-error`);
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: text.reject, exact: true }).click();
  await page.getByRole("alert").filter({ hasText: text.failed }).waitFor();
  assert.equal(
    await page.getByRole("tab", { name: "General", exact: true }).count(),
    0,
  );
}
