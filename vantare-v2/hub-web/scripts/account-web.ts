import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { pilotLimits } from "../src/contract/generated/contract.ts";
import { t } from "../src/renderer/i18n/es.ts";
import { checkPhotoRejection } from "./check-photo-rejection.ts";
import { until } from "./wait-for.ts";

const evidence = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/account",
);
await mkdir(evidence, { recursive: true });
const server = await preview({
  configFile: false,
  root: resolve("src/renderer"),
  build: { outDir: resolve("out/renderer") },
  preview: { host: "127.0.0.1", port: 0 },
});
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls?.local[0]}?escena=cuenta-base`);
  await page
    .getByRole("tab", { name: t("settings.account"), exact: true })
    .click();
  const name = page.getByRole("textbox", {
    name: t("pilot.name"),
    exact: true,
  });
  await name.fill("Piloto del rediseño QA");
  await checkPhotoRejection(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 600, 300);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel(t("pilot.choosePhoto"), { exact: true }).setInputFiles({
    name: "qa.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  const image = page.getByRole("img", {
    name: "Piloto del rediseño QA",
    exact: true,
  });
  await image.waitFor();
  const source = await image.getAttribute("src");
  assert.ok(source);
  assert.ok(source.startsWith("data:image/jpeg;base64,"));
  assert.ok(
    Buffer.from(source.split(",")[1], "base64").length <=
      pilotLimits.photoBytes,
  );
  assert.equal(
    await image.evaluate((img) => (img as HTMLImageElement).naturalWidth),
    pilotLimits.photoSide,
  );
  await page
    .getByRole("button", { name: t("pilot.save"), exact: true })
    .click();
  await page.getByText(t("pilot.saved"), { exact: true }).waitFor();
  for (const scheme of ["dark", "light"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.scheme)) !==
      scheme
    )
      await page
        .getByRole("button", {
          name: "Cambiar tema claro u oscuro",
          exact: true,
        })
        .click();
    await until(
      async () =>
        (await page.evaluate(() => document.documentElement.dataset.scheme)) ===
        scheme,
      5000,
      "saved scheme",
    );
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
    await page.screenshot({ path: resolve(evidence, `account-${scheme}.png`) });
  }
  await name.fill("Borrador retenido");
  await page
    .getByRole("tab", { name: t("settings.general"), exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: t("settings.search"), exact: true })
    .fill("pais");
  assert.equal(await name.inputValue(), "Borrador retenido");
  await page
    .getByRole("button", { name: t("pilot.discard"), exact: true })
    .click();
  assert.equal(await name.inputValue(), "Piloto del rediseño QA");
  await page
    .getByRole("searchbox", { name: t("settings.search"), exact: true })
    .fill("zzzzzz");
  await page.getByText(t("settings.noResults"), { exact: true }).waitFor();
  await page
    .getByRole("button", { name: t("settings.clearSearch"), exact: true })
    .click();
  assert.equal(await page.getByRole("tab").count(), 8);
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(evidence, "account.json"),
    JSON.stringify({
      passed: true,
      photoCropped: true,
      save: true,
      draftPreserved: true,
      searchWithoutAccents: true,
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
