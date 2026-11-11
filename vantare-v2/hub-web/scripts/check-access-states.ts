import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { accountLimits } from "../src/contract/generated/account.ts";
import { accessText as text } from "../src/renderer/i18n/access.es.ts";
import { windowText } from "../src/renderer/i18n/window.es.ts";

const scenes = [
  ["acceso-navegador", text.waitingBrowser],
  ["acceso-enlace-copiado", text.copied],
  ["acceso-comprobando", text.checking],
  ["acceso-cancelando", text.canceling],
  ["acceso-cerrando", text.loggingOut],
  ["acceso-cierre-incierto", text.logoutFailed],
  ["acceso-error", "No se pudo completar el acceso: vuelve a intentarlo."],
] as const;
export async function checkAccessStates(
  page: Page,
  base: string,
  evidence: string,
) {
  const reports = [];
  for (const [scene, status] of scenes)
    for (const scheme of ["dark", "light"]) {
      await page.goto(`${base}?escena=visual-${scheme}:${scene}`);
      await page.getByText(status, { exact: true }).waitFor();
      await page
        .getByRole("button", { name: windowText.close, exact: true })
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
      const report = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      reports.push({ scene, scheme, violations: report.violations });
      await writeFile(
        resolve(evidence, "access-states-axe.json"),
        JSON.stringify(reports, null, 2),
      );
      assert.deepEqual(report.violations, [], `${scene} ${scheme}`);
      await page.screenshot({
        path: resolve(evidence, `${scene}-${scheme}.png`),
      });
    }
  await page.goto(`${base}?escena=acceso-correo-completo`);
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
    .click();
  await page
    .getByRole("button", { name: text.submit.authorize, exact: true })
    .click();
  await page
    .getByRole("dialog", { name: text.title, exact: true })
    .waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-access-secret]").count(), 0);
  await writeFile(
    resolve(evidence, "access-states-interactions.json"),
    JSON.stringify({
      codeLoginCompletes: true,
      gateUnmounted: true,
      credentialFieldsRemoved: true,
      onlyLocalMock: true,
    }),
  );
}
