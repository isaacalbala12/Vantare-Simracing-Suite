import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";
import { webQaPreview } from "./web-qa";

const evidence = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/roadmap",
);
await mkdir(evidence, { recursive: true });
const server = await webQaPreview();
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
  const origin = server.resolvedUrls?.local[0];
  assert.ok(origin);
  for (const scheme of ["dark", "light"]) {
    await page.goto(`${origin}?escena=roadmap-base`);
    await page.getByRole("button", { name: "Roadmap", exact: true }).click();
    await page.getByRole("tab", { name: "Circuito", exact: true }).click();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    if (scheme === "light") {
      await page
        .getByRole("button", {
          name: "Cambiar tema claro u oscuro",
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () => document.documentElement.dataset.scheme === "light",
      );
    }
    await page.screenshot({
      path: resolve(evidence, `roadmap-base-${scheme}.png`),
    });
    await page
      .locator(".v-roadmap")
      .screenshot({ path: resolve(evidence, `roadmap-content-${scheme}.png`) });
    const audit = await new AxeBuilder({ page })
      .include(".v-roadmap")
      .analyze();
    await writeFile(
      resolve(evidence, `axe-${scheme}.json`),
      JSON.stringify(audit, null, 2),
    );
    assert.deepEqual(
      audit.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ),
      [],
    );
  }
  await page.goto(`${origin}?escena=roadmap-error`);
  await page.getByRole("button", { name: "Roadmap", exact: true }).click();
  await page.getByText("Rework - Roadmap", { exact: true }).waitFor();
  await page
    .getByText("No se pudo actualizar. Se conserva la última publicación.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByText("Rework - Roadmap", { exact: true }).count(),
    1,
  );
  await page.getByRole("tab", { name: "Temporada", exact: true }).click();
  await page.getByText(/sin garantía de release/).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(evidence, "browser.json"),
    JSON.stringify(
      {
        viewport: [1440, 900],
        scale: 1,
        errors,
        offlinePreservesPublication: true,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise<void>((done) => server.httpServer.close(() => done()));
}
