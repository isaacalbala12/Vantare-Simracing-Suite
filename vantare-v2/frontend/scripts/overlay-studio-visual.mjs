/**
 * Overlay Studio V3 visual parity harness.
 *
 * Usage:
 *   node scripts/overlay-studio-visual.mjs
 *   node scripts/overlay-studio-visual.mjs --update
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const BASELINE_DIR = path.join(FRONTEND_ROOT, "testdata", "overlay-studio-visual");
const PREFERRED_PORT = 5176;
const MAX_PIXEL_DELTA_RATIO = 0.005;
const LOGICAL_CANVAS_ASPECT = 1920 / 1080;

const STATE_FIXTURES = [
  { name: "original-ready", query: "system=vantare-original&state=ready" },
  { name: "original-stale", query: "system=vantare-original&state=stale" },
  { name: "original-disconnected", query: "system=vantare-original&state=disconnected" },
  { name: "original-error", query: "system=vantare-original&state=error" },
  { name: "crystal-ready", query: "system=vantare-crystal&state=ready" },
  { name: "crystal-stale", query: "system=vantare-crystal&state=stale" },
  { name: "crystal-disconnected", query: "system=vantare-crystal&state=disconnected" },
  { name: "crystal-error", query: "system=vantare-crystal&state=error" },
];

const SURFACE_FIXTURES = [
  { name: "surface-studio", query: "system=vantare-original&state=ready&surface=studio" },
  { name: "surface-desktop", query: "system=vantare-original&state=ready&surface=desktop" },
  { name: "surface-obs", query: "system=vantare-original&state=ready&surface=obs" },
  { name: "surface-harness", query: "system=vantare-original&state=ready&surface=harness" },
];

const STUDIO_SHELL_FIXTURES = [
  {
    name: "studio-wide",
    browser: { width: 1920, height: 1080 },
    viewportWidth: 1600,
    layoutMode: "wide",
  },
  {
    name: "studio-medium",
    browser: { width: 1200, height: 800 },
    viewportWidth: 1200,
    layoutMode: "medium",
  },
  {
    name: "studio-small",
    browser: { width: 800, height: 700 },
    viewportWidth: 800,
    layoutMode: "compact",
  },
];

const PARITY_FIXTURES = [...STATE_FIXTURES, ...SURFACE_FIXTURES];
const updateMode = process.argv.includes("--update");

function pngToDataUrl(filePath) {
  const buffer = readFileSync(filePath);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function comparePng(page, currentPath, baselinePath) {
  const result = await page.evaluate(
    async ({ currentDataUrl, baselineDataUrl, maxRatio }) => {
      function loadImageData(dataUrl) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d");
            if (!context) {
              reject(new Error("canvas context unavailable"));
              return;
            }
            context.drawImage(image, 0, 0);
            resolve({
              width: image.width,
              height: image.height,
              data: context.getImageData(0, 0, image.width, image.height).data,
            });
          };
          image.onerror = () => reject(new Error("failed to decode png"));
          image.src = dataUrl;
        });
      }

      const current = await loadImageData(currentDataUrl);
      const baseline = await loadImageData(baselineDataUrl);
      if (current.width !== baseline.width || current.height !== baseline.height) {
        return {
          ok: false,
          reason: `dimension mismatch ${current.width}x${current.height} vs ${baseline.width}x${baseline.height}`,
        };
      }

      let diffCount = 0;
      const total = current.data.length / 4;
      for (let index = 0; index < current.data.length; index += 4) {
        if (
          current.data[index] !== baseline.data[index] ||
          current.data[index + 1] !== baseline.data[index + 1] ||
          current.data[index + 2] !== baseline.data[index + 2] ||
          current.data[index + 3] !== baseline.data[index + 3]
        ) {
          diffCount += 1;
        }
      }
      const ratio = diffCount / total;
      if (ratio > maxRatio) {
        return { ok: false, reason: `pixel delta ${(ratio * 100).toFixed(3)}% exceeds ${(maxRatio * 100).toFixed(3)}%` };
      }
      return { ok: true, ratio };
    },
    {
      currentDataUrl: pngToDataUrl(currentPath),
      baselineDataUrl: pngToDataUrl(baselinePath),
      maxRatio: MAX_PIXEL_DELTA_RATIO,
    },
  );
  return result;
}

async function captureBaseline(page, fixture, currentPath, baselinePath, capture) {
  await capture(page, currentPath);

  if (updateMode) {
    const { renameSync } = await import("node:fs");
    renameSync(currentPath, baselinePath);
    console.log(`updated baseline ${fixture.name}`);
    return;
  }

  if (!existsSync(baselinePath)) {
    throw new Error(`missing baseline: ${baselinePath}. Run with --update first.`);
  }

  const comparison = await comparePng(page, currentPath, baselinePath);
  if (!comparison.ok) {
    throw new Error(`${fixture.name}: ${comparison.reason}`);
  }
  console.log(`ok ${fixture.name} (${((comparison.ratio ?? 0) * 100).toFixed(3)}% delta)`);
  unlinkSync(currentPath);
}

async function waitForStudioShell(page) {
  await page.waitForSelector("[data-testid='overlay-studio-v3']");
  await page.waitForSelector("[data-testid='studio-canvas-scene']");
  await page.waitForSelector("[data-testid='studio-widget-frame-delta-main']");
  await page.waitForSelector("[data-testid='studio-widget-visual-delta-main'] [data-widget-renderer='delta']");
}

async function assertStudioShellGeometry(page, fixture) {
  await waitForStudioShell(page);

  const layoutMode = await page
    .locator("[data-testid='studio-responsive-grid']")
    .getAttribute("data-layout-mode");
  if (layoutMode !== fixture.layoutMode) {
    throw new Error(`${fixture.name}: expected layout ${fixture.layoutMode}, got ${layoutMode ?? "null"}`);
  }

  const metrics = await page.evaluate((expectedAspect) => {
    const stage = document.querySelector(".osv3-canvas-scene-stage");
    const frame = document.querySelector("[data-testid='studio-widget-frame-delta-main']");
    const visual = document.querySelector("[data-testid='studio-widget-visual-delta-main']");
    const scene = document.querySelector("[data-testid='studio-canvas-scene']");
    if (!stage || !frame || !visual || !scene) {
      return { ok: false, reason: "missing studio shell nodes" };
    }

    const stageRect = stage.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const visualRect = visual.getBoundingClientRect();
    const stageAspect = stageRect.width / stageRect.height;
    const aspectDelta = Math.abs(stageAspect - expectedAspect);
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const visualInsideFrame =
      visualRect.left >= frameRect.left - 1
      && visualRect.top >= frameRect.top - 1
      && visualRect.right <= frameRect.right + 1
      && visualRect.bottom <= frameRect.bottom + 1;

    return {
      ok: aspectDelta <= 0.03 && !overflowX && visualInsideFrame && stageRect.width > 0 && stageRect.height > 0,
      reason: aspectDelta > 0.03
        ? `stage aspect ${stageAspect.toFixed(4)} expected ~${expectedAspect.toFixed(4)}`
        : overflowX
          ? "horizontal page overflow"
          : !visualInsideFrame
            ? "widget visual host misaligned with frame"
            : stageRect.width <= 0 || stageRect.height <= 0
              ? "stage has zero size"
              : null,
      scale: scene.getAttribute("data-scale"),
    };
  }, LOGICAL_CANVAS_ASPECT);

  if (!metrics.ok) {
    throw new Error(`${fixture.name}: ${metrics.reason ?? "geometry check failed"}`);
  }
}

async function assertStudioDragAndResize(page, baseUrl) {
  const url = `${baseUrl}/overlay-studio-v3-harness.html?viewport=1600`;
  await page.goto(url, { waitUntil: "networkidle" });
  await waitForStudioShell(page);

  const frame = page.locator("[data-testid='studio-widget-frame-delta-main']");
  const leftBefore = await frame.evaluate((element) => element.style.left);

  const box = await frame.boundingBox();
  if (!box) {
    throw new Error("studio-wide interactions: widget frame has no bounding box");
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 96, startY + 48, { steps: 8 });
  await page.mouse.up();

  await page.waitForFunction(
    (previousLeft) => {
      const element = document.querySelector("[data-testid='studio-widget-frame-delta-main']");
      return Boolean(element && element.style.left && element.style.left !== previousLeft);
    },
    leftBefore,
    { timeout: 5000 },
  );

  const interaction = await page
    .locator("[data-testid='studio-canvas-viewport']")
    .getAttribute("data-interaction");
  if (interaction !== "idle") {
    throw new Error(`studio-wide interactions: expected idle after drag, got ${interaction ?? "null"}`);
  }

  const widthBefore = await frame.evaluate((element) => element.style.width);
  const heightBefore = await frame.evaluate((element) => element.style.height);
  const ratioBefore = Number.parseFloat(widthBefore) / Number.parseFloat(heightBefore);

  await frame.click();
  const handle = page.locator("[data-testid='studio-resize-handle-se-delta-main']");
  await handle.waitFor({ state: "visible" });

  const handleBox = await handle.boundingBox();
  if (!handleBox) {
    throw new Error("studio-wide interactions: resize handle has no bounding box");
  }

  const resizeX = handleBox.x + handleBox.width / 2;
  const resizeY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(resizeX, resizeY);
  await page.mouse.down();
  await page.mouse.move(resizeX + 64, resizeY + 32, { steps: 6 });
  await page.mouse.up();

  await page.waitForFunction(
    (previousWidth) => {
      const element = document.querySelector("[data-testid='studio-widget-frame-delta-main']");
      return Boolean(element && element.style.width && element.style.width !== previousWidth);
    },
    widthBefore,
    { timeout: 5000 },
  );

  const widthAfter = await frame.evaluate((element) => element.style.width);
  const heightAfter = await frame.evaluate((element) => element.style.height);
  const ratioAfter = Number.parseFloat(widthAfter) / Number.parseFloat(heightAfter);
  if (!Number.isFinite(ratioBefore) || !Number.isFinite(ratioAfter)) {
    throw new Error("studio-wide interactions: invalid resize dimensions");
  }
  if (Math.abs(ratioAfter - ratioBefore) > 0.05) {
    throw new Error(
      `studio-wide interactions: aspect ratio drift ${ratioBefore.toFixed(3)} -> ${ratioAfter.toFixed(3)}`,
    );
  }

  const resizeInteraction = await page
    .locator("[data-testid='studio-canvas-viewport']")
    .getAttribute("data-interaction");
  if (resizeInteraction !== "idle") {
    throw new Error(`studio-wide interactions: expected idle after resize, got ${resizeInteraction ?? "null"}`);
  }
}

async function assertStudioZoomViewport(page, baseUrl) {
  const url = `${baseUrl}/overlay-studio-v3-harness.html?viewport=1600`;
  await page.goto(url, { waitUntil: "networkidle" });
  await waitForStudioShell(page);

  for (let index = 0; index < 5; index += 1) {
    await page.locator("[data-testid='studio-zoom-plus']").click();
  }

  const zoomLabel = await page.locator("[data-testid='studio-zoom-label']").textContent();
  if (zoomLabel !== "150%") {
    throw new Error(`studio zoom: expected 150%, got ${zoomLabel ?? "null"}`);
  }

  const viewport = await page.evaluate(() => {
    const stage = document.querySelector(".osv3-canvas-stage");
    const scene = document.querySelector(".osv3-canvas-scene-stage");
    if (!stage || !scene) {
      return { ok: false, reason: "missing zoom viewport nodes" };
    }
    const stageRect = stage.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    return {
      ok: stage.scrollWidth > stage.clientWidth
        && stage.scrollHeight > stage.clientHeight
        && sceneRect.left >= stageRect.left
        && sceneRect.top >= stageRect.top,
      reason: `scroll ${stage.scrollWidth}x${stage.scrollHeight} / ${stage.clientWidth}x${stage.clientHeight}; scene ${sceneRect.left},${sceneRect.top}; stage ${stageRect.left},${stageRect.top}`,
    };
  });
  if (!viewport.ok) {
    throw new Error(`studio zoom: inaccessible enlarged scene (${viewport.reason})`);
  }

  const frame = page.locator("[data-testid='studio-widget-frame-delta-main']");
  const before = await frame.evaluate((element) => element.style.left);
  const box = await frame.boundingBox();
  if (!box) {
    throw new Error("studio zoom: widget frame has no bounding box");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 72, box.y + box.height / 2 + 36, { steps: 4 });
  await page.mouse.up();

  const after = await frame.evaluate((element) => element.style.left);
  if (!after || after === before) {
    throw new Error("studio zoom: move did not commit at 150%");
  }
}

async function startHarnessServer() {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: path.join(FRONTEND_ROOT, "vite.overlay-studio-harness.config.ts"),
    server: {
      host: "127.0.0.1",
      port: PREFERRED_PORT,
      strictPort: false,
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const resolvedPort = typeof address === "object" && address ? address.port : PREFERRED_PORT;
  const baseUrl = `http://127.0.0.1:${resolvedPort}`;
  return { server, baseUrl };
}

async function main() {
  mkdirSync(BASELINE_DIR, { recursive: true });
  const { chromium } = await import("playwright");

  const { server, baseUrl } = await startHarnessServer();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    for (const fixture of PARITY_FIXTURES) {
      const baselinePath = path.join(BASELINE_DIR, `${fixture.name}.png`);
      const currentPath = path.join(BASELINE_DIR, `${fixture.name}.current.png`);
      const url = `${baseUrl}/overlay-studio-harness.html?${fixture.query}`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-overlay-parity-widget-frame] [data-widget-renderer='delta']");
      await captureBaseline(page, fixture, currentPath, baselinePath, async (capturePage, outputPath) => {
        await capturePage.locator("[data-overlay-parity-widget-frame]").screenshot({ path: outputPath });
      });
    }

    for (const fixture of STUDIO_SHELL_FIXTURES) {
      await page.setViewportSize(fixture.browser);
      const baselinePath = path.join(BASELINE_DIR, `${fixture.name}.png`);
      const currentPath = path.join(BASELINE_DIR, `${fixture.name}.current.png`);
      const url = `${baseUrl}/overlay-studio-v3-harness.html?viewport=${fixture.viewportWidth}`;
      await page.goto(url, { waitUntil: "networkidle" });
      await assertStudioShellGeometry(page, fixture);
      await captureBaseline(page, fixture, currentPath, baselinePath, async (capturePage, outputPath) => {
        await capturePage.locator("[data-testid='overlay-studio-v3']").screenshot({ path: outputPath });
      });
    }

    if (!updateMode) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await assertStudioDragAndResize(page, baseUrl);
      console.log("ok studio-wide interactions");
      await assertStudioZoomViewport(page, baseUrl);
      console.log("ok studio zoom 150 viewport");
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
