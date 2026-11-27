import assert from "node:assert/strict";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { accessText } from "../src/renderer/i18n/access.es.ts";
import {
  foundersCopy,
  accountText as text,
} from "../src/renderer/i18n/account.es.ts";

/**
 * Account/license QA scenes of the simulated Hub (mock/modules/account-license.ts):
 * unverified → verified → signed out, and a blocked account. Each state is
 * checked with axe and captured for review.
 */
export async function checkAccountLicense(
  page: Page,
  base: string,
  evidence: string,
) {
  const state = async (scheme: string, name: string) => {
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(report.violations, [], `license ${scheme}/${name}`);
    await page.screenshot({
      path: resolve(evidence, `licencia-${scheme}-${name}.png`),
    });
  };
  const open = async (scheme: string, scene: string) => {
    await page.goto(`${base}?escena=visual-${scheme}:${scene}`);
    await page.locator(".v-sidebar").waitFor();
    await page.locator(".v-sidebar-account, .v-account-link").first().click();
    await page
      .getByRole("heading", { name: "Isaac Albalá", exact: true })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
  };
  // The menu follows the `core` event: Calendar is hidden while blocked,
  // locked while unverified and open only for a verified tester.
  const calendar = async (
    expected: "hidden" | "locked" | "open",
    scheme: string,
    name: string,
  ) => {
    const item = page.locator('.v-sidebar [data-nav="calendar"]');
    const actual =
      (await item.count()) === 0
        ? "hidden"
        : (await item.getAttribute("aria-disabled")) === "true"
          ? "locked"
          : "open";
    assert.equal(actual, expected, `calendar menu ${scheme}/${name}`);
  };
  const pill = (name: string) =>
    page
      .getByRole("region", { name: "Isaac Albalá" })
      .locator(".v-account-pill")
      .getByText(name, { exact: true });
  for (const scheme of ["dark", "light"]) {
    await open(scheme, "cuenta-transicion");
    await pill(text.unverified).waitFor();
    await calendar("locked", scheme, "sin-verificar");
    await state(scheme, "1-sin-verificar");
    await page.getByRole("button", { name: text.check, exact: true }).click();
    await pill(text.testerAccess).waitFor();
    await calendar("open", scheme, "verificado");
    await state(scheme, "2-verificado");
    await page.getByRole("button", { name: text.logout, exact: true }).click();
    await page
      .getByRole("button", { name: accessText.email, exact: true })
      .waitFor();
    await state(scheme, "3-sesion-cerrada");
    await open(scheme, "cuenta-bloqueada-caducada");
    await pill("La credencial ha caducado; comprueba el acceso.").waitFor();
    await calendar("hidden", scheme, "bloqueada");
    await state(scheme, "4-bloqueada");
    await page.getByRole("button", { name: text.check, exact: true }).click();
    await pill(text.active).waitFor();
    // B3: the tester's date and warnings; a tester never sees a purchase.
    for (const [scene, warning] of [
      ["cuenta-tester", null],
      ["cuenta-tester-caduca", "Tu acceso caduca el"],
      ["cuenta-tester-gracia", "Estás en carrera"],
    ] as const) {
      await open(scheme, scene);
      await pill(text.testerAccess).waitFor();
      await page.getByText(text.validUntil, { exact: true }).waitFor();
      for (const name of [text.monthly, text.annual, foundersCopy.ES.button])
        assert.equal(
          await page.getByRole("button", { name, exact: true }).count(),
          0,
          `purchase for a tester ${scheme}/${scene}`,
        );
      if (warning) await page.getByText(warning).waitFor();
      await state(scheme, `5-${scene}`);
    }
  }
}
