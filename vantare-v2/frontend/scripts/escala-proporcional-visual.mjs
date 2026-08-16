import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(frontend, "test-results", "escala-proporcional");
const port = 5191;
const baseUrl = `http://127.0.0.1:${port}`;

const HUB_HASH = "#/hub";

const MATRIX = [
  { name: "compact-16x9", width: 1280, height: 720 },
  { name: "ref-1440x900", width: 1440, height: 900 },
  { name: "base-1080p", width: 1920, height: 1080 },
  { name: "qhd", width: 2560, height: 1440 },
  { name: "ultrawide-21x9-low", width: 2560, height: 1080 },
  { name: "ultrawide-21x9", width: 3440, height: 1440 },
  { name: "4k", width: 3840, height: 2160 },
  { name: "ultrawide-32x9", width: 5120, height: 1440 },
  { name: "ultrawide-32x9-4k", width: 7680, height: 2160 },
  { name: "arbitrary", width: 2304, height: 864 },
];

const CAPTURES = [
  { name: "capture-1080p", width: 1920, height: 1080 },
  { name: "capture-qhd", width: 2560, height: 1440 },
  { name: "capture-21x9", width: 3440, height: 1440 },
  { name: "capture-4k", width: 3840, height: 2160 },
  { name: "capture-32x9", width: 5120, height: 1440 },
];

fs.mkdirSync(path.join(output, "captures"), { recursive: true });

function portOwners() {
  if (process.platform !== "win32") return [];
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ','`,
  ], { encoding: "utf8", windowsHide: true });
  return result.stdout.trim().split(",").map((value) => value.trim()).filter(Boolean);
}

const owners = portOwners();
if (owners.length) throw new Error(`port ${port} already owned by ${owners.join(", ")}`);

const server = spawn(process.execPath, [
  path.join(frontend, "node_modules", "vite", "bin", "vite.js"),
  "--config", path.join(frontend, "vite.escala-harness.config.ts"),
  "--host", "127.0.0.1", "--port", String(port), "--strictPort",
], { cwd: frontend, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

function stopServer() {
  if (!server.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ }
  }
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(`${baseUrl}/responsive-overlay-harness.html`, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Vite did not start.\n${serverOutput}`);
}

function expectedTransform(width, height) {
  const scale = height / 1080;
  const frameWidth = Math.min(width, height * (21 / 9));
  return {
    scale,
    layoutWidth: frameWidth / scale,
    offsetX: (width - frameWidth) / 2,
    offsetY: (height - 1080 * scale) / 2,
    frameWidth,
  };
}

const expectedZoom = (height) => Math.min(Math.max(height / 1080, 1), 2.5);

async function assertOverlayInvariants(page, viewport, errors) {
  await page.goto(`${baseUrl}/responsive-overlay-harness.html`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="runtime-overlay-scene"]');

  const expected = expectedTransform(viewport.width, viewport.height);
  const scene = await page.locator('[data-testid="runtime-overlay-scene"]').evaluate((element) => ({
    scale: Number(element.dataset.scale),
    offsetX: Number(element.dataset.offsetX),
    offsetY: Number(element.dataset.offsetY),
    layoutWidth: Number(element.dataset.layoutWidth),
    layoutHeight: Number(element.dataset.layoutHeight),
    overflow: getComputedStyle(element).overflow,
  }));

  assert.ok(Math.abs(scene.scale - expected.scale) < 0.01, `${viewport.name}: scale ${scene.scale} != ${expected.scale}`);
  assert.ok(Math.abs(scene.offsetX - expected.offsetX) < 0.5, `${viewport.name}: offsetX ${scene.offsetX} != ${expected.offsetX}`);
  assert.ok(Math.abs(scene.offsetY - expected.offsetY) < 0.5, `${viewport.name}: offsetY ${scene.offsetY} != ${expected.offsetY}`);
  assert.ok(Math.abs(scene.layoutWidth - expected.layoutWidth) < 0.5, `${viewport.name}: layoutWidth ${scene.layoutWidth} != ${expected.layoutWidth}`);
  assert.equal(scene.overflow, "hidden");

  const frameBoxes = await page.locator('[data-testid="runtime-widget-frame"]').evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.dataset.widgetId,
      left: element.style.left,
      top: element.style.top,
      width: element.style.width,
      height: element.style.height,
    })),
  );
  assert.ok(frameBoxes.length >= 2, `${viewport.name}: expected at least 2 widget frames`);

  for (const frame of frameBoxes) {
    const right = Number.parseFloat(frame.left) + Number.parseFloat(frame.width);
    assert.ok(right <= scene.layoutWidth + 0.01, `${viewport.name}: widget ${frame.id} crosses the frame right edge (${right} > ${scene.layoutWidth})`);
  }

  const tower = frameBoxes.find((frame) => frame.id === "broadcast-tower-harness");
  assert.ok(tower, `${viewport.name}: full-width tower widget missing`);
  if (expected.layoutWidth > 1920) {
    assert.ok(Number.parseFloat(tower.width) === expected.layoutWidth,
      `${viewport.name}: tower not stretched to ${expected.layoutWidth} (got ${tower.width})`);
  }

  const documentOverflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    body: document.body.scrollWidth <= document.body.clientWidth,
  }));
  assert.ok(documentOverflow.doc, `${viewport.name}: document horizontal overflow`);
  assert.ok(documentOverflow.body, `${viewport.name}: body horizontal overflow`);

  errors.push(viewport.name);
}

async function assertHubZoom(page, viewport) {
  await page.goto(`${baseUrl}/hub-zoom-harness.html${HUB_HASH}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="license-loading"]', { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForSelector("[data-testid='v52-content-container']", { timeout: 15000 });

  const hub = await page.evaluate(() => ({
    zoom: document.documentElement.style.zoom,
    hasHubClass: document.body.classList.contains("hub"),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  const expected = expectedZoom(viewport.height);
  assert.ok(Math.abs(Number(hub.zoom) - expected) < 0.01, `${viewport.name}: html.zoom ${hub.zoom} != ${expected}`);
  assert.ok(hub.hasHubClass, `${viewport.name}: body.hub missing`);
  assert.ok(!hub.horizontalOverflow, `${viewport.name}: horizontal overflow`);

  const fixedOk = await page.locator("[data-testid='topbar-nav-dashboard']").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, viewportWidth: window.innerWidth };
  }).catch(() => null);
  assert.ok(fixedOk && fixedOk.left >= 0 && fixedOk.left < fixedOk.viewportWidth,
    `${viewport.name}: topbar outside viewport`);

  const contentWidth = await page.locator("[data-testid='v52-content-container']").evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(contentWidth > 0, `${viewport.name}: content width 0`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const overlayOk = [];
  for (const viewport of MATRIX) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await assertOverlayInvariants(page, viewport, overlayOk);
    await page.close();
  }

  const zoomOk = [];
  for (const viewport of CAPTURES) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await assertHubZoom(page, viewport);
    zoomOk.push(viewport.name);
    await page.close();
  }

  for (const capture of CAPTURES) {
    const page = await browser.newPage({ viewport: { width: capture.width, height: capture.height } });
    await page.goto(`${baseUrl}/responsive-overlay-harness.html`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="runtime-overlay-scene"]');
    await page.screenshot({ path: path.join(output, "captures", `${capture.name}-overlay.png`) });
    await page.goto(`${baseUrl}/hub-zoom-harness.html${HUB_HASH}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid='v52-content-container']", { timeout: 15000 });
    await page.screenshot({ path: path.join(output, "captures", `${capture.name}-hub.png`) });
    await page.close();
  }

  console.log(`ESCALA-PROPORCIONAL PASS: overlay ${overlayOk.length}/${MATRIX.length}, hub zoom ${zoomOk.length}/${CAPTURES.length}, capturas ${CAPTURES.length}`);
  console.log(`Capturas: ${path.join(output, "captures")}`);
} catch (error) {
  console.error(`ESCALA-PROPORCIONAL FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopServer();
}
