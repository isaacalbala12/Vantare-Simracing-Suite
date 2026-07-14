import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../../..");
const artifacts = path.join(import.meta.dirname, "artifacts");
const referenceUrl = "file:///C:/Users/isaac/.codex/worktrees/25db/Vantare-Overlays/layout-studio-v10.html";
const harnessUrl = "http://127.0.0.1:5176/overlay-studio-v3-harness.html?viewport=1920";
const fontUrl = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Rajdhani:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap";

const browser = await chromium.launch({ headless: true });
const reference = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await reference.goto(referenceUrl);
await reference.waitForSelector(".wl-item.active");
await reference.evaluate(() => {
  document.querySelector(".wl-item.active")?.classList.remove("active");
  document.querySelector(".wl-item")?.classList.add("active");
});
const actual = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await actual.goto(harnessUrl, { waitUntil: "networkidle" });
await actual.addStyleTag({ url: fontUrl });
await actual.evaluate(() => document.fonts.ready);
await actual.waitForSelector(".osv3-workbench");
await actual.locator(".osv3-list-panel__row").first().click();

const captures = [
  {
    name: "selected-row",
    reference: reference.locator(".wl-item.active"),
    actual: actual.locator(".osv3-list-panel__row--selected"),
    masks: [
      { x: 15, y: 8, w: 69, h: 21 },
      { x: 42, y: 8, w: 105, h: 20 },
      { x: 118, y: 9, w: 108, h: 19 },
    ],
  },
  {
    name: "active-rail-item",
    reference: reference.locator(".sn-item.active"),
    actual: actual.locator(".osv3-inspector-rail__item--active"),
    masks: [{ x: 9, y: 9, w: 36, h: 26 }],
  },
];

const visualStates = {};
for (const capture of captures) {
  const referencePath = path.join(artifacts, `${capture.name}-reference.png`);
  const actualPath = path.join(artifacts, `${capture.name}-actual.png`);
  const diffPath = path.join(artifacts, `${capture.name}-diff.png`);
  await capture.reference.screenshot({ path: referencePath });
  await capture.actual.screenshot({ path: actualPath });
  const referenceImage = sharp(referencePath).ensureAlpha();
  const metadata = await referenceImage.metadata();
  const width = metadata.width;
  const height = metadata.height;
  const { data: referenceData } = await referenceImage.raw().toBuffer({ resolveWithObject: true });
  const { data: actualData } = await sharp(actualPath)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const diff = Buffer.alloc(width * height * 4);
  let changed = 0;
  let considered = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const masked = capture.masks.some(
        (mask) => x >= mask.x && x < mask.x + mask.w && y >= mask.y && y < mask.y + mask.h,
      );
      const delta = Math.max(
        Math.abs(referenceData[offset] - actualData[offset]),
        Math.abs(referenceData[offset + 1] - actualData[offset + 1]),
        Math.abs(referenceData[offset + 2] - actualData[offset + 2]),
      );
      const pixelChanged = !masked && delta > 12;
      if (!masked) considered += 1;
      if (pixelChanged) changed += 1;
      diff[offset] = pixelChanged ? 255 : 0;
      diff[offset + 1] = pixelChanged ? 35 : 0;
      diff[offset + 2] = pixelChanged ? 35 : 0;
      diff[offset + 3] = 255;
    }
  }
  await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(diffPath);
  visualStates[capture.name] = {
    width,
    height,
    threshold: 12,
    masks: capture.masks,
    changedPixels: changed,
    consideredPixels: considered,
    deltaRatio: changed / considered,
    gate: 0.05,
    pass: changed / considered <= 0.05,
  };
}

const domStates = await actual.evaluate(() => {
  const rect = (selector) => {
    const value = document.querySelector(selector)?.getBoundingClientRect();
    return value ? { width: value.width, height: value.height } : null;
  };
  return {
    selectedRow: rect(".osv3-list-panel__row--selected"),
    activeRailItem: rect(".osv3-inspector-rail__item--active"),
    railPreview: rect(".osv3-inspector-rail__preview"),
    resizeHandleCount: document.querySelectorAll(".osv3-resize-handle").length,
    pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
const wideRealShell = await actual.evaluate(() => {
  document.body.classList.add("v52-shell-bg");
  const root = document.querySelector("#root");
  root.style.position = "absolute";
  root.style.left = "84px";
  root.style.top = "80px";
  root.style.width = "1812px";
  root.style.height = "976px";
  const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
  const workbench = rect(".osv3-workbench");
  const header = rect(".osv3-header");
  const grid = rect(".osv3-grid");
  const list = rect(".osv3-list-panel");
  const canvas = rect(".osv3-canvas-column");
  const inspector = rect(".osv3-inspector-slot");
  const toolbar = rect(".osv3-canvas-toolbar");
  const footer = rect(".osv3-preview-source-controls");
  return {
    contentX: workbench.x,
    headerY: header.y,
    gridY: grid.y,
    listWidth: list.width,
    canvasWidth: canvas.width,
    inspectorWidth: inspector.width,
    gap: canvas.x - list.right,
    toolbarHeight: toolbar.height,
    footerHeight: footer.height,
    bottomY: workbench.bottom,
    viewportBottom: window.innerHeight,
  };
});
await browser.close();

const metrics = {
  generatedAt: new Date().toISOString(),
  command: "node docs/analysis/isa-92-overlay-studio-parity/measure-states.mjs",
  visualStates,
  domStates,
  assertions: {
    selectedRow: { expected: { width: 238, height: 37.5 }, tolerancePx: 1, pass: domStates.selectedRow?.width === 238 && domStates.selectedRow?.height === 37.5 },
    activeRailItem: { expected: { width: 52, height: 44 }, tolerancePx: 1, pass: domStates.activeRailItem?.width === 52 && domStates.activeRailItem?.height === 44 },
    railPreview: { expected: { width: 32, height: 22 }, tolerancePx: 1, pass: domStates.railPreview?.width === 32 && domStates.railPreview?.height === 22 },
    resizeHandles: { expected: 8, pass: domStates.resizeHandleCount === 8 },
    overflow: { expected: 0, pass: domStates.pageOverflowX === 0 },
  },
};
await fs.writeFile(path.join(import.meta.dirname, "state-control-metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);

const geometryPath = path.join(import.meta.dirname, "geometry-metrics.json");
const geometry = JSON.parse(await fs.readFile(geometryPath, "utf8"));
const maxDelta = (expected, actual) => Math.max(
  ...Object.keys(expected).map((key) => Math.abs(expected[key] - actual[key])),
);
const wideExpected = { contentX: 84, headerY: 76, gridY: 172.5, listWidth: 240, canvasWidth: 1220, inspectorWidth: 320, gap: 16, toolbarHeight: 36, footerHeight: 44, bottomY: 1056 };
const wideActual = { ...wideRealShell };
delete wideActual.viewportBottom;
const mediumExpected = { listWidth: 240, inspectorDrawerWidth: 320, gap: 16, toolbarHeight: 36, footerHeight: 44, overflowX: 0 };
const mediumActual = { listWidth: geometry.cases.medium.list.width, inspectorDrawerWidth: geometry.cases.medium.inspector.width, gap: geometry.cases.medium.canvas.x - geometry.cases.medium.list.width, toolbarHeight: geometry.cases.medium.toolbar.height, footerHeight: geometry.cases.medium.footer.height, overflowX: geometry.cases.medium.pageOverflowX };
const compactExpected = { canvasWidth: 800, listDrawerWidth: 320, inspectorDrawerWidth: 320, toolbarHeight: 36, footerHeight: 44, overflowX: 0 };
const compactActual = { canvasWidth: geometry.cases.compact.canvas.width, listDrawerWidth: geometry.cases.compact.list.width, inspectorDrawerWidth: geometry.cases.compact.inspector.width, toolbarHeight: geometry.cases.compact.toolbar.height, footerHeight: geometry.cases.compact.footer.height, overflowX: geometry.cases.compact.pageOverflowX };
geometry.authorityAndGates = {
  wideRealShell: {
    tolerancePx: 2,
    expected: wideExpected,
    actual: wideActual,
    maxDeltaPx: maxDelta(wideExpected, wideActual),
    pass: maxDelta(wideExpected, wideActual) <= 2,
  },
  medium: {
    tolerancePx: 4,
    expected: mediumExpected,
    actual: mediumActual,
    maxDeltaPx: maxDelta(mediumExpected, mediumActual),
    pass: maxDelta(mediumExpected, mediumActual) <= 4,
  },
  compact: {
    tolerancePx: 4,
    expected: compactExpected,
    actual: compactActual,
    maxDeltaPx: maxDelta(compactExpected, compactActual),
    pass: maxDelta(compactExpected, compactActual) <= 4,
  },
};
await fs.writeFile(geometryPath, `${JSON.stringify(geometry, null, 2)}\n`);
console.log(JSON.stringify(metrics, null, 2));
