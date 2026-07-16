import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const evidenceRoot = import.meta.dirname;
const artifacts = path.join(evidenceRoot, "artifacts");
const authorityPath = "C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/layout-studio-v10.html";
const suppliedReferencePath = "C:/Users/isaac/AppData/Local/Temp/isa92-strict-reference.png";
const referencePath = path.join(artifacts, "strict-reference.png");
const actualPath = path.join(artifacts, "strict-real-wide.png");
const sideBySidePath = path.join(artifacts, "strict-side-by-side.png");
const overlayPath = path.join(artifacts, "strict-overlay.png");
const diffPath = path.join(artifacts, "strict-diff-unmasked.png");
const geometryPath = path.join(evidenceRoot, "strict-route-geometry.json");
const metricsPath = path.join(evidenceRoot, "strict-parity-metrics.json");

const width = 1920;
const height = 1080;
const threshold = 12;

await fs.mkdir(artifacts, { recursive: true });
await fs.copyFile(suppliedReferencePath, referencePath);

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width, height } });
await page.goto(pathToFileURL(authorityPath).href);
await page.evaluate(() => document.fonts.ready);

const reference = await page.evaluate(() => {
  const rect = (element) => {
    if (!element) return null;
    const value = element.getBoundingClientRect();
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  };
  const main = document.querySelector("main");
  const canvas = main?.querySelector(":scope > section");
  const canvasChildren = canvas ? [...canvas.children] : [];
  const inspector = main?.querySelector(":scope > aside:last-child");
  const catalog = main?.querySelector(":scope > aside:first-child");
  const headerContent = main?.previousElementSibling?.firstElementChild;
  const styles = (element) => {
    if (!element) return null;
    const value = getComputedStyle(element);
    return {
      backgroundColor: value.backgroundColor,
      borderColor: value.borderColor,
      borderRadius: value.borderRadius,
      backdropFilter: value.backdropFilter,
      fontFamily: value.fontFamily,
      fontSize: value.fontSize,
      lineHeight: value.lineHeight,
    };
  };
  const headerContentRect = rect(headerContent);
  const mainRect = rect(main);
  const catalogRect = rect(catalog);
  const inspectorRect = rect(inspector);
  return {
    geometry: {
      header: headerContentRect && mainRect ? {
        x: headerContentRect.x,
        y: headerContentRect.y,
        width: headerContentRect.width,
        height: mainRect.y - headerContentRect.y,
      } : null,
      grid: catalogRect && inspectorRect ? {
        x: catalogRect.x,
        y: catalogRect.y,
        width: inspectorRect.x + inspectorRect.width - catalogRect.x,
        height: catalogRect.height,
      } : null,
      catalog: catalogRect,
      canvas: rect(canvas),
      toolbar: rect(canvasChildren[0]),
      stage: rect(canvasChildren[1]),
      footer: rect(canvasChildren[2]),
      inspector: inspectorRect,
      rail: rect(inspector?.querySelector(".subnav-rail")),
      inspectorBody: rect(inspector?.querySelector(".sn-content")),
    },
    styles: {
      catalog: styles(main?.querySelector(":scope > aside:first-child")),
      canvas: styles(canvas),
      inspector: styles(inspector),
      selectedRow: styles(document.querySelector(".wl-item.active .wl-name")),
      designCard: styles(document.querySelector(".bc.active")),
    },
  };
});
await browser.close();

const route = JSON.parse(await fs.readFile(geometryPath, "utf8"));
const actual = route.geometry.wide;

const round = (value) => Math.round(value * 100) / 100;
const rectDelta = (expected, observed) => Object.fromEntries(
  ["x", "y", "width", "height"].map((key) => [key, round(observed[key] - expected[key])]),
);

const geometry = {};
for (const key of ["header", "grid", "catalog", "canvas", "toolbar", "stage", "footer", "inspector", "rail", "inspectorBody"]) {
  geometry[key] = {
    reference: reference.geometry[key],
    actual: actual[key],
    deltaPx: rectDelta(reference.geometry[key], actual[key]),
  };
}

const referenceImage = sharp(referencePath).ensureAlpha();
const actualImage = sharp(actualPath).ensureAlpha();
const { data: referenceData } = await referenceImage.raw().toBuffer({ resolveWithObject: true });
const { data: actualData } = await actualImage.raw().toBuffer({ resolveWithObject: true });
const diff = Buffer.alloc(width * height * 4);
let rawChanged = 0;
for (let offset = 0; offset < referenceData.length; offset += 4) {
  const delta = Math.max(
    Math.abs(referenceData[offset] - actualData[offset]),
    Math.abs(referenceData[offset + 1] - actualData[offset + 1]),
    Math.abs(referenceData[offset + 2] - actualData[offset + 2]),
  );
  const changed = delta > threshold;
  if (changed) rawChanged += 1;
  diff[offset] = changed ? 255 : 0;
  diff[offset + 1] = changed ? 35 : 0;
  diff[offset + 2] = changed ? 35 : 0;
  diff[offset + 3] = 255;
}

function compareRegion(referenceRect, actualRect) {
  const regionWidth = Math.floor(Math.min(referenceRect.width, actualRect.width));
  const regionHeight = Math.floor(Math.min(referenceRect.height, actualRect.height));
  const referenceX = Math.floor(referenceRect.x);
  const referenceY = Math.floor(referenceRect.y);
  const actualX = Math.floor(actualRect.x);
  const actualY = Math.floor(actualRect.y);
  let changedPixels = 0;
  for (let y = 0; y < regionHeight; y += 1) {
    for (let x = 0; x < regionWidth; x += 1) {
      const referenceOffset = ((referenceY + y) * width + referenceX + x) * 4;
      const actualOffset = ((actualY + y) * width + actualX + x) * 4;
      const delta = Math.max(
        Math.abs(referenceData[referenceOffset] - actualData[actualOffset]),
        Math.abs(referenceData[referenceOffset + 1] - actualData[actualOffset + 1]),
        Math.abs(referenceData[referenceOffset + 2] - actualData[actualOffset + 2]),
      );
      if (delta > threshold) changedPixels += 1;
    }
  }
  const consideredPixels = regionWidth * regionHeight;
  return {
    width: regionWidth,
    height: regionHeight,
    changedPixels,
    consideredPixels,
    deltaRatio: changedPixels / consideredPixels,
    masks: [],
  };
}

const unmaskedRegionDeltas = {};
for (const key of ["header", "catalog", "toolbar", "footer", "rail", "inspectorBody"]) {
  unmaskedRegionDeltas[key] = compareRegion(reference.geometry[key], actual[key]);
}
const canvasToolbar = unmaskedRegionDeltas.toolbar;
const canvasFooter = unmaskedRegionDeltas.footer;
unmaskedRegionDeltas.canvasChrome = {
  changedPixels: canvasToolbar.changedPixels + canvasFooter.changedPixels,
  consideredPixels: canvasToolbar.consideredPixels + canvasFooter.consideredPixels,
  deltaRatio: (canvasToolbar.changedPixels + canvasFooter.changedPixels) / (canvasToolbar.consideredPixels + canvasFooter.consideredPixels),
  masks: [],
  excluded: "canvas stage interior only",
};

await sharp({
  create: { width: width * 2, height, channels: 4, background: "#080808" },
}).composite([
  { input: referencePath, left: 0, top: 0 },
  { input: actualPath, left: width, top: 0 },
]).png().toFile(sideBySidePath);

const { data: overlayData } = await sharp(actualPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let offset = 3; offset < overlayData.length; offset += 4) overlayData[offset] = 128;
await sharp(referencePath).composite([
  { input: overlayData, raw: { width, height, channels: 4 }, blend: "over" },
]).png().toFile(overlayPath);

await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(diffPath);

const tokens = {};
for (const key of Object.keys(reference.styles)) {
  const expected = reference.styles[key];
  const observed = route.wideEvidence.styles[key];
  const ignoredProperties = key === "selectedRow" ? new Set(["borderColor"]) : new Set();
  tokens[key] = {
    reference: expected,
    actual: observed,
    exact: observed
      ? Object.fromEntries(Object.keys(expected).filter((property) => !ignoredProperties.has(property)).map((property) => [property, expected[property] === observed[property]]))
      : null,
  };
}

const metrics = {
  generatedAt: new Date().toISOString(),
  authority: authorityPath,
  referenceScreenshot: suppliedReferencePath,
  actualScreenshot: actualPath,
  viewport: { width, height },
  comparisonPolicy: {
    rawThresholdPerChannel: threshold,
    broadMasks: 0,
    rawFullScreenshotIsInformational: true,
    allowedStableGateExclusions: [
      "canvas interior because the real fixture intentionally uses the authorised grid mode",
      "minimum dynamic text bounding boxes recorded in strict-route-geometry.json",
      "real V52 topbar and dock because preserving the real shell is an explicit exception",
    ],
  },
  rawFullScreenshot: {
    changedPixels: rawChanged,
    consideredPixels: width * height,
    deltaRatio: rawChanged / (width * height),
    pass: null,
  },
  unmaskedRegionDeltas,
  geometry,
  tokens,
  artifacts: {
    reference: referencePath,
    actual: actualPath,
    sideBySide: sideBySidePath,
    overlay: overlayPath,
    unmaskedDiff: diffPath,
  },
};

await fs.writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
console.log(JSON.stringify(metrics, null, 2));
