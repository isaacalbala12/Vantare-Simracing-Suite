import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { accessText } from "../src/renderer/i18n/access.es.ts";
import {
  foundersCopy,
  accountText as text,
} from "../src/renderer/i18n/account.es.ts";
import { accountScenes } from "./visual-diff/account.ts";
export async function checkAccount(page: Page, base: string, evidence: string) {
  const reports = [];
  for (const scheme of ["dark", "light"]) {
    await page.goto(`${base}?escena=visual-${scheme}:cuenta-base`);
    await accountScenes["cuenta-base"].prepare(page);
    await page.evaluate(() => document.fonts.ready);
    for (const expanded of [false, true]) {
      const nav = page.locator(".v-sidebar");
      if (
        (await nav.evaluate(
          (node) => !node.classList.contains("v-sidebar--collapsed"),
        )) !== expanded
      )
        await page.keyboard.press("Control+b");
      if (expanded)
        await page
          .getByRole("region", { name: "Perfiles", exact: true })
          .waitFor();
      assert.equal((await nav.boundingBox())?.width, expanded ? 272 : 76);
      const report = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      reports.push({ scheme, expanded, violations: report.violations });
      await writeFile(
        resolve(evidence, "account-axe.json"),
        JSON.stringify(reports, null, 2),
      );
      assert.deepEqual(
        report.violations,
        [],
        `account ${scheme}, expanded=${expanded}`,
      );
    }
  }
  const safety: { scheme: string; state: string; violations: unknown[] }[] = [];
  const check = async (scheme: string, state: string) => {
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    safety.push({ scheme, state, violations: report.violations });
    await writeFile(
      resolve(evidence, "account-safety-axe.json"),
      JSON.stringify(safety, null, 2),
    );
    assert.deepEqual(
      report.violations,
      [],
      `account safety ${scheme}/${state}`,
    );
  };
  for (const scheme of ["dark", "light"]) {
    await page.goto(`${base}?escena=visual-${scheme}:cuenta-sesion`);
    await page.locator(".v-sidebar").waitFor();
    await page.keyboard.press("Control+b");
    await page.getByRole("region", { name: "Perfiles", exact: true }).waitFor();
    await page.getByRole("button", { name: text.title, exact: true }).click();
    await page
      .getByRole("heading", { name: "Isaac Albalá", exact: true })
      .waitFor();
    await page.getByText(text.checkoutNotice, { exact: true }).waitFor();
    await page.waitForFunction(
      (expected) => document.documentElement.dataset.scheme === expected,
      scheme,
    );
    await page.evaluate(() => document.fonts.ready);
    await check(scheme, "signedIn");
    await page.screenshot({
      path: resolve(evidence, `account-live-${scheme}.png`),
    });
    await page.getByRole("button", { name: text.monthly, exact: true }).click();
    await page.getByText(text.purchaseWaiting, { exact: true }).waitFor();
    for (const name of [text.monthly, text.annual, foundersCopy.ES.button])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).isDisabled(),
        true,
      );
    await check(scheme, "purchaseWaiting");
    await page
      .getByRole("button", { name: text.stopPurchase, exact: true })
      .click();
    await page
      .getByText("Espera detenida. Puedes comprobar el acceso manualmente.", {
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: text.reset, exact: true }).click();
    const dialog = page.getByRole("alertdialog", {
      name: text.reset,
      exact: true,
    });
    await dialog.getByText(text.resetDescription, { exact: true }).waitFor();
    await check(scheme, "deviceResetConfirmation");
    await page.screenshot({
      path: resolve(evidence, `account-reset-${scheme}.png`),
    });
    await dialog
      .getByRole("button", { name: text.cancel, exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: text.reset, exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: text.resetConfirm, exact: true })
      .click();
    await page.getByRole("alertdialog").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page
      .getByRole("button", { name: foundersCopy.EN.button, exact: true })
      .waitFor();
    await page.getByRole("button", { name: text.logout, exact: true }).click();
    await page
      .getByRole("button", { name: accessText.email, exact: true })
      .waitFor();
    await page.goto(`${base}?escena=visual-${scheme}:cuenta-founders`);
    await page.getByRole("button", { name: text.title, exact: true }).click();
    await page.getByText(text.foundersOwned, { exact: true }).waitFor();
    await page.waitForFunction(
      (expected) => document.documentElement.dataset.scheme === expected,
      scheme,
    );
    await page.evaluate(() => document.fonts.ready);
    for (const name of [text.monthly, text.annual, foundersCopy.ES.button])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).isDisabled(),
        true,
      );
    await check(scheme, "founders");
  }
  await writeFile(
    resolve(evidence, "account-interactions.json"),
    JSON.stringify({
      avatar: true,
      closedPurchase: true,
      stopPurchase: true,
      localLanguage: true,
      logoutGate: true,
      purchaseWaitingGuard: true,
      foundersGuard: true,
      checkoutNotice: true,
      deviceResetCancelAndConfirm: true,
    }),
  );
}
