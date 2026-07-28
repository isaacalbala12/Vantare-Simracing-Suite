import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..", "..");
const referencePath = path.join(
  projectRoot,
  "docs",
  "vantare-program",
  "research",
  "engineer-spotter",
  "reference-ui.html",
);
const evidenceDirectory = path.join(
  projectRoot,
  "docs",
  "vantare-program",
  "research",
  "engineer-spotter",
  "evidence",
);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const browserErrors = [];

page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));

try {
  await page.goto(pathToFileURL(referencePath).href);
  await assertNoRootOverflow(page, "wide");

  await page.getByRole("tab", { name: "Radio Crystal" }).click();
  assert.equal(
    await page.getByRole("tab", { name: "Radio Crystal" }).getAttribute("aria-selected"),
    "true",
  );

  await page.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("End");
  assert.equal(
    await page.getByRole("tab", { name: "Diagnostics" }).getAttribute("aria-selected"),
    "true",
  );
  await page.keyboard.press("Home");
  assert.equal(
    await page.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected"),
    "true",
  );

  await page.getByRole("button", { name: /Fuel window/ }).click();
  assert.equal(
    await page.getByRole("button", { name: /Fuel window/ }).getAttribute("aria-pressed"),
    "true",
  );
  assert.match(await page.locator("#radio-copy").innerText(), /Estimación estable/);

  await page.locator("#language").selectOption("it");
  assert.match(await page.locator("#radio-copy").innerText(), /Stima stabile/);

  await page.getByRole("button", { name: "PTT ready" }).click();
  assert.equal(await page.locator("#ptt").getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator("#ptt").innerText(), "PTT off");

  await page.getByRole("button", { name: "Wake off" }).click();
  assert.equal(await page.locator("#wake").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#wake").innerText(), "Wake armed");

  await page.getByRole("button", { name: /Left car/ }).click();
  await page.locator("#language").selectOption("es");
  await page.screenshot({
    path: path.join(evidenceDirectory, "eng01-overview-wide.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "Pit transaction" }).click();
  await page.screenshot({
    path: path.join(evidenceDirectory, "eng01-pit-wide.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("button", { name: /Core stale/ }).click();
  await page.locator("#language").selectOption("it");
  assert.match(await page.locator("#radio-copy").innerText(), /Nessun messaggio/);
  await assertNoRootOverflow(page, "mobile");
  await page.screenshot({
    path: path.join(evidenceDirectory, "eng01-stale-mobile.png"),
    fullPage: true,
  });

  assert.deepEqual(browserErrors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      tabs: "mouse+keyboard",
      scenarios: "danger+fuel+stale",
      language: "ES+IT",
      controls: "PTT+wake",
      overflow: "wide+mobile none",
      browserErrors: 0,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}

async function assertNoRootOverflow(targetPage, label) {
  const dimensions = await targetPage.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `${label} root overflow: ${dimensions.scrollWidth} > ${dimensions.clientWidth}`,
  );
}
