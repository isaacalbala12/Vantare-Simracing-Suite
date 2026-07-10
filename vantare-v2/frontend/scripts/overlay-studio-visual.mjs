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
const PORT = 5176;
const MAX_PIXEL_DELTA_RATIO = 0.005;

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

const FIXTURES = [...STATE_FIXTURES, ...SURFACE_FIXTURES];
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

async function startHarnessServer() {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: path.join(FRONTEND_ROOT, "vite.overlay-studio-harness.config.ts"),
    server: {
      host: "127.0.0.1",
      port: PORT,
      strictPort: true,
    },
  });
  await server.listen();
  return server;
}

async function main() {
  mkdirSync(BASELINE_DIR, { recursive: true });
  const { chromium } = await import("playwright");

  const server = await startHarnessServer();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    for (const fixture of FIXTURES) {
      const baselinePath = path.join(BASELINE_DIR, `${fixture.name}.png`);
      const currentPath = path.join(BASELINE_DIR, `${fixture.name}.current.png`);
      const url = `http://127.0.0.1:${PORT}/overlay-studio-harness.html?${fixture.query}`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-overlay-parity-widget-frame] [data-widget-renderer='delta']");
      await page.locator("[data-overlay-parity-widget-frame]").screenshot({ path: currentPath });

      if (updateMode) {
        const { renameSync } = await import("node:fs");
        renameSync(currentPath, baselinePath);
        console.log(`updated baseline ${fixture.name}`);
        continue;
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