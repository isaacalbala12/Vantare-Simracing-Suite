import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.ISA13_BASE_URL ?? "http://127.0.0.1:5174";
const viewports = {
  wide: { width: 1440, height: 900 },
  medium: { width: 1024, height: 768 },
  compact: { width: 390, height: 844 },
};
const locales = ["es", "en", "it", "pt"];
const sections = ["profiles", "launcher", "calendar", "setup"];

const browser = await chromium.launch({ headless: true });
try {
  for (const locale of locales) {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      const page = await browser.newPage({ locale, viewport });
      await page.addInitScript((value) => {
        window.localStorage.setItem("vantare.locale", value);
      }, locale);
      await page.goto(`${baseUrl}/#/hub`, { waitUntil: "networkidle" });
      await page.getByTestId("license-loading").waitFor({ state: "detached" });

      const rootToken = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--v-font-mono").trim(),
      );
      await page.evaluate(() => document.fonts.ready);
      assert.match(rootToken, /^['"]?Space Mono['"]?,\s*monospace$/,
        `${locale}/${viewportName}: unexpected --v-font-mono token`);
      assert.equal(
        await page.evaluate(() => document.fonts.check('700 16px "Space Mono"')),
        true,
        `${locale}/${viewportName}: Space Mono 700 is not loaded`,
      );

      for (const section of sections) {
        await page.getByTestId(`topbar-nav-${section}`).click({ force: true });
        const monoStyles = await page.locator(".font-mono:visible").evaluateAll((elements) =>
          elements.map((element) => {
            const style = getComputedStyle(element);
            return {
              family: style.fontFamily,
              weight: style.fontWeight,
              transform: style.transform,
            };
          }),
        );
        assert.ok(monoStyles.length > 0, `${locale}/${viewportName}/${section}: no mono content`);
        assert.ok(
          monoStyles.every(({ family }) => family.includes("Space Mono")),
          `${locale}/${viewportName}/${section}: mono content does not use Space Mono`,
        );
        assert.ok(
          monoStyles.every(({ transform }) => transform === "none" || transform.includes("translate")),
          `${locale}/${viewportName}/${section}: unexpected scale transform on mono content`,
        );
      }
      await page.close();
    }
  }
  console.log(`ISA-13 Playwright PASS: ${locales.length} locales × ${Object.keys(viewports).length} viewports × ${sections.length} sections`);
} finally {
  await browser.close();
}
