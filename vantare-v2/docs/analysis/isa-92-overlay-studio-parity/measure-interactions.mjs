import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.ISA92_BASE_URL ?? "http://127.0.0.1:5176";
const output = path.join(import.meta.dirname, "interaction-smoke.json");
const artifacts = path.join(import.meta.dirname, "artifacts");
const browser = await chromium.launch({ headless: true });
const consoleErrors = [];
const results = [];

async function setup(viewportWidth = 1920, viewportHeight = 1080, selectWidget = true) {
  const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`console.error: ${message.text()}`);
  });
  await page.goto(`${baseUrl}/overlay-studio-v3-harness.html?viewport=${viewportWidth}`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid='overlay-studio-v3']");
  if (selectWidget) await page.locator(".osv3-list-panel__row").first().click();
  return page;
}

async function geometry(frame) {
  return frame.evaluate((element) => ({
    left: element.style.left,
    top: element.style.top,
    width: element.style.width,
    height: element.style.height,
  }));
}

async function drag(page, locator, dx, dy, escape = false) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Missing interaction target bounds");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  if (escape) await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(40);
}

{
  const page = await setup();
  const frame = page.getByTestId("studio-widget-frame-delta-main");
  const before = await geometry(frame);
  await drag(page, frame, 112, 56);
  const after = await geometry(frame);
  results.push({ check: "move", ok: before.left !== after.left || before.top !== after.top, before, after });
  await page.close();
}

{
  const page = await setup();
  const frame = page.getByTestId("studio-widget-frame-delta-main");
  const before = await geometry(frame);
  await drag(page, page.getByTestId("studio-resize-handle-se-delta-main"), 54, 30, true);
  const after = await geometry(frame);
  results.push({
    check: "resize-escape-cancel",
    ok: JSON.stringify(before) === JSON.stringify(after),
    before,
    after,
  });
  await page.close();
}

{
  const page = await setup();
  const frame = page.getByTestId("studio-widget-frame-delta-main");
  const before = await geometry(frame);
  await drag(page, frame, 96, 48, true);
  const after = await geometry(frame);
  results.push({ check: "escape-cancel", ok: JSON.stringify(before) === JSON.stringify(after), before, after });
  await page.close();
}

const directions = {
  nw: [-42, -24], n: [0, -24], ne: [42, -24], e: [42, 0],
  se: [42, 24], s: [0, 24], sw: [-42, 24], w: [-42, 0],
};
for (const [handle, [dx, dy]] of Object.entries(directions)) {
  const page = await setup();
  const frame = page.getByTestId("studio-widget-frame-delta-main");
  const before = await geometry(frame);
  await drag(page, page.getByTestId(`studio-resize-handle-${handle}-delta-main`), dx, dy);
  const after = await geometry(frame);
  results.push({
    check: `resize-${handle}`,
    ok: before.left !== after.left || before.top !== after.top || before.width !== after.width || before.height !== after.height,
    before,
    after,
  });
  await page.close();
}

{
  const page = await setup();
  for (let index = 0; index < 5; index += 1) await page.getByTestId("studio-zoom-plus").click();
  const label = await page.getByTestId("studio-zoom-label").innerText();
  results.push({ check: "zoom-150", ok: label === "150%", label });
  const frame = page.getByTestId("studio-widget-frame-delta-main");
  await frame.focus();
  const before = await geometry(frame);
  await page.keyboard.press("ArrowRight");
  const after = await geometry(frame);
  results.push({ check: "keyboard-move", ok: before.left !== after.left, before, after });
  results.push({ check: "action-bar", ok: await page.locator(".osv3-canvas-action-bar").isVisible() });
  await page.locator(".osv3-workbench").screenshot({ path: path.join(artifacts, "studio-wide-interaction.png") });
  await page.close();
}

{
  const page = await setup(800, 700, false);
  await page.getByTestId("studio-list-drawer-toggle").click();
  await page.waitForTimeout(220);
  results.push({
    check: "compact-list-drawer",
    ok: await page.evaluate(() => document.querySelector(".osv3-grid")?.getAttribute("data-open-drawer") === "list"),
  });
  await page.locator(".osv3-workbench").screenshot({ path: path.join(artifacts, "studio-compact-list-drawer.png") });
  await page.getByTestId("studio-inspector-drawer-toggle").click();
  await page.waitForTimeout(220);
  results.push({
    check: "compact-inspector-drawer",
    ok: await page.evaluate(() => document.querySelector(".osv3-grid")?.getAttribute("data-open-drawer") === "inspector"),
  });
  await page.locator(".osv3-workbench").screenshot({ path: path.join(artifacts, "studio-compact-inspector-drawer.png") });
  await page.close();
}

await browser.close();
const report = {
  ok: results.every((result) => result.ok) && consoleErrors.length === 0,
  generatedAt: new Date().toISOString(),
  command: "node docs/analysis/isa-92-overlay-studio-parity/measure-interactions.mjs",
  results,
  consoleErrors,
};
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
