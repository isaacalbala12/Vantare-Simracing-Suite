import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";
import { preview } from "vite";

const evidence = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/upcoming",
);
await mkdir(evidence, { recursive: true });
const server = await preview({
  configFile: false,
  root: resolve("src/renderer"),
  build: { outDir: resolve("out-qa/renderer") },
  preview: { host: "127.0.0.1", port: 0 },
});
const browser = await chromium.launch({
  executablePath: process.env.VANTARE_HUB_BROWSER,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const module of ["engineer", "strategy"] as const) {
    for (const scheme of ["dark", "light"]) {
      await page.goto(
        `${server.resolvedUrls?.local[0]}?escena=visual-${scheme}:proximamente-base`,
      );
      await page
        .getByRole("button", {
          name: module === "engineer" ? "Ingeniero" : "Estrategia",
          exact: true,
        })
        .click();
      await page
        .getByRole("heading", { name: "Qué podrás hacer", exact: true })
        .waitFor();
      await page.keyboard.press("Control+b");
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.waitForFunction(
        (scheme) => document.documentElement.dataset.scheme === scheme,
        scheme,
      );
      await page.screenshot({
        path: resolve(evidence, `${module}-base-${scheme}.png`),
      });
      const audit = await new AxeBuilder({ page })
        .include(".v-upcoming")
        .analyze();
      await writeFile(
        resolve(evidence, `axe-${module}-${scheme}.json`),
        JSON.stringify(audit, null, 2),
      );
      assert.deepEqual(
        audit.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        ),
        [],
      );
      assert.equal(await page.getByRole("textbox").count(), 0);
      await page
        .getByRole("button", { name: "Ver Roadmap", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Roadmap", exact: true })
        .waitFor();
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(evidence, "browser.json"),
    JSON.stringify(
      { viewport: [1440, 900], scale: 1, errors, teaserOnly: true },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise<void>((done) => server.httpServer.close(() => done()));
}
