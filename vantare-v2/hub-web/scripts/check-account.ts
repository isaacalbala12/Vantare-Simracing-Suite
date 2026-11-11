import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { accessText } from "../src/renderer/i18n/access.es.ts";
import { accountText as text } from "../src/renderer/i18n/account.es.ts";
import { accountScenes } from "./visual-diff/account.ts";
export async function checkAccount(page: Page, base: string, evidence: string) {
  const reports = [];
  for (const scheme of ["dark", "light"]) {
    await page.goto(`${base}?escena=visual-${scheme}:cuenta-base`);
    await accountScenes["cuenta-base"].prepare(page);
    await page.evaluate(() => document.fonts.ready);
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    reports.push({ scheme, violations: report.violations });
    await writeFile(
      resolve(evidence, "account-axe.json"),
      JSON.stringify(reports, null, 2),
    );
    assert.deepEqual(report.violations, [], `account ${scheme}`);
  }
  await page.goto(`${base}?escena=cuenta-sesion`);
  await page.getByRole("button", { name: text.title, exact: true }).click();
  await page
    .getByRole("heading", { name: "Isaac Albalá", exact: true })
    .waitFor();
  await page.getByRole("button", { name: text.monthly, exact: true }).click();
  await page
    .getByText("Compra abierta. Los derechos se comprobarán automáticamente.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: text.stopPurchase, exact: true })
    .click();
  await page
    .getByText("Espera detenida. Puedes comprobar el acceso manualmente.", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page
    .getByText("Founders · €50 · founder price", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: text.logout, exact: true }).click();
  await page
    .getByRole("button", { name: accessText.email, exact: true })
    .waitFor();
  await writeFile(
    resolve(evidence, "account-interactions.json"),
    JSON.stringify({
      avatar: true,
      closedPurchase: true,
      stopPurchase: true,
      localLanguage: true,
      logoutGate: true,
    }),
  );
}
