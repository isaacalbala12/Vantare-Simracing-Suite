import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(SCRIPT_DIR, "..");
const REFERENCE_DIR = path.join(FRONTEND_ROOT, "testdata", "crystal-reference");
const OUTPUT_DIR = path.join(FRONTEND_ROOT, ".tmp", "crystal-parity");
const REPORT_ONLY = process.argv.includes("--report-only");
const MAX_PIXEL_DELTA_RATIO = 0.03;
const GEOMETRY_TOLERANCE_PX = 2;

function toDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function comparePng(page, actual, expected) {
  return page.evaluate(async ({ actualUrl, expectedUrl }) => {
    const decode = (url) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("canvas context unavailable"));
        context.drawImage(image, 0, 0);
        resolve({ width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data });
      };
      image.onerror = () => reject(new Error("PNG decode failed"));
      image.src = url;
    });
    const [left, right] = await Promise.all([decode(actualUrl), decode(expectedUrl)]);
    if (left.width !== right.width || left.height !== right.height) {
      return { ratio: 1, dimensionsMatch: false, actual: `${left.width}x${left.height}`, expected: `${right.width}x${right.height}` };
    }
    let different = 0;
    for (let index = 0; index < left.data.length; index += 4) {
      if (left.data[index] !== right.data[index]
        || left.data[index + 1] !== right.data[index + 1]
        || left.data[index + 2] !== right.data[index + 2]
        || left.data[index + 3] !== right.data[index + 3]) different += 1;
    }
    return { ratio: different / (left.data.length / 4), dimensionsMatch: true };
  }, { actualUrl: toDataUrl(actual), expectedUrl: toDataUrl(expected) });
}

async function startServer() {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: path.join(FRONTEND_ROOT, "vite.overlay-studio-harness.config.ts"),
    server: { host: "127.0.0.1", port: 5177, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === "object" && address ? address.port : 5177;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function capture(page, baseUrl, entry, surface, suffix) {
  const query = new URLSearchParams({
    widget: entry.widgetType,
    system: "vantare-crystal",
    design: entry.designId,
    state: "ready",
    surface,
  });
  await page.goto(`${baseUrl}/overlay-studio-harness.html?${query}`, { waitUntil: "networkidle" });
  const frame = page.locator("[data-overlay-parity-widget-frame]");
  await frame.locator(`[data-widget-renderer="${entry.widgetType}"]`).waitFor();
  const geometry = await frame.evaluate((element) => {
    const frameRect = element.getBoundingClientRect();
    const renderer = element.querySelector("[data-widget-renderer]");
    const rendererRect = renderer?.getBoundingClientRect();
    return {
      width: frameRect.width,
      height: frameRect.height,
      rendererWidth: rendererRect?.width ?? 0,
      rendererHeight: rendererRect?.height ?? 0,
      overflowX: element.scrollWidth > element.clientWidth + 1,
      overflowY: element.scrollHeight > element.clientHeight + 1,
    };
  });
  const output = path.join(OUTPUT_DIR, `${entry.id}-${surface}-${suffix}.png`);
  const buffer = await frame.screenshot({ path: output, animations: "disabled", omitBackground: true });
  return { buffer, geometry, output };
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(REFERENCE_DIR, "manifest.json"), "utf8"));
  if (manifest.entries?.length !== 21) throw new Error("Crystal manifest must contain exactly 21 entries");
  await mkdir(OUTPUT_DIR, { recursive: true });
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2200, height: 1400 }, deviceScaleFactor: 1 });
  const results = [];
  try {
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
      document.documentElement.append(style);
    });
    for (const entry of manifest.entries) {
      const harness = await capture(page, baseUrl, entry, "harness", "actual");
      const repeated = await capture(page, baseUrl, entry, "harness", "repeat");
      const reference = await readFile(path.join(REFERENCE_DIR, `${entry.id}.png`));
      const parity = await comparePng(page, harness.buffer, reference);
      const stability = await comparePng(page, harness.buffer, repeated.buffer);
      const surfaceRatios = {};
      for (const surface of ["studio", "desktop", "obs"]) {
        const surfaceCapture = await capture(page, baseUrl, entry, surface, "surface");
        surfaceRatios[surface] = (await comparePng(page, harness.buffer, surfaceCapture.buffer)).ratio;
      }
      const geometryPass = Math.abs(harness.geometry.width - entry.width) <= GEOMETRY_TOLERANCE_PX
        && Math.abs(harness.geometry.height - entry.height) <= GEOMETRY_TOLERANCE_PX
        && !harness.geometry.overflowX && !harness.geometry.overflowY;
      const result = {
        id: entry.id,
        widgetType: entry.widgetType,
        designId: entry.designId,
        geometry: harness.geometry,
        expectedGeometry: { width: entry.width, height: entry.height },
        geometryPass,
        pixelDeltaRatio: parity.ratio,
        pixelPass: parity.dimensionsMatch && parity.ratio <= MAX_PIXEL_DELTA_RATIO,
        stableDeltaRatio: stability.ratio,
        stablePass: stability.dimensionsMatch && stability.ratio === 0,
        surfaceDeltaRatios: surfaceRatios,
        surfacesPass: Object.values(surfaceRatios).every((ratio) => ratio === 0),
      };
      results.push(result);
      process.stdout.write(`${result.pixelPass ? "PASS" : "FAIL"} ${entry.id}: ${(parity.ratio * 100).toFixed(3)}%\n`);
    }
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
  const report = {
    generatedAt: new Date().toISOString(),
    thresholds: { maxPixelDeltaRatio: MAX_PIXEL_DELTA_RATIO, geometryTolerancePx: GEOMETRY_TOLERANCE_PX },
    summary: {
      total: results.length,
      geometryPassed: results.filter((result) => result.geometryPass).length,
      pixelPassed: results.filter((result) => result.pixelPass).length,
      stablePassed: results.filter((result) => result.stablePass).length,
      surfacesPassed: results.filter((result) => result.surfacesPass).length,
    },
    results,
  };
  await writeFile(path.join(OUTPUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report.summary)}\nreport: ${path.join(OUTPUT_DIR, "report.json")}\n`);
  if (!REPORT_ONLY && results.some((result) => !result.geometryPass || !result.pixelPass || !result.stablePass || !result.surfacesPass)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
