import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const output = path.join(repoRoot, "docs", "analysis", "isa-92-overlay-studio-parity", "strict-interaction-smoke.json");
const results = [];
const consoleErrors = [];

const server = await createServer({
  root: frontendRoot,
  configFile: path.join(frontendRoot, "vite.overlay-studio-harness.config.ts"),
  server: { host: "127.0.0.1", port: 5176, strictPort: false },
});
await server.listen();
const address = server.httpServer?.address();
const port = typeof address === "object" && address ? address.port : 5176;
const baseUrl = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });

function record(check, ok, evidence = {}) {
  results.push({ check, ok, ...evidence });
}

async function setup(width = 1920, height = 1080, select = true) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("wails-runtime-mock activo")) {
      consoleErrors.push(`console.error: ${message.text()}`);
    }
  });
  await page.goto(`${baseUrl}/overlay-studio-route-harness.html?seed=active`, { waitUntil: "networkidle" });
  await page.getByTestId("overlay-studio-v3").waitFor();
  if (select) await page.getByTestId("studio-widget-row-boost-box").click();
  return page;
}

async function frameGeometry(frame) {
  const box = await frame.boundingBox();
  const style = await frame.evaluate((element) => ({
    left: element.style.left,
    top: element.style.top,
    width: element.style.width,
    height: element.style.height,
    zIndex: element.style.zIndex,
    transform: element.style.transform,
  }));
  return { box, style };
}

async function drag(page, locator, dx, dy, { escape = false, inspectFirstMove = false } = {}) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("missing interaction target bounds");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 1 });
  const firstMoveBox = inspectFirstMove ? await page.getByTestId("studio-widget-frame-boost-box").boundingBox() : null;
  if (escape) await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(50);
  return firstMoveBox;
}

try {
  {
    const page = await setup();
    const frame = page.getByTestId("studio-widget-frame-boost-box");
    const before = await frameGeometry(frame);
    const firstMoveBox = await drag(page, frame, 92, 46, { inspectFirstMove: true });
    const after = await frameGeometry(frame);
    record("click-selection", await page.getByTestId("studio-canvas-action-bar").isVisible());
    record("first-pointermove-preview", firstMoveBox && before.box && (firstMoveBox.x !== before.box.x || firstMoveBox.y !== before.box.y), { before: before.box, firstMoveBox });
    record("move-commit", before.style.left !== after.style.left || before.style.top !== after.style.top, { before: before.style, after: after.style });

    const moved = await frameGeometry(frame);
    await drag(page, frame, 70, 35, { escape: true });
    const cancelled = await frameGeometry(frame);
    record("escape-move", JSON.stringify(moved.style) === JSON.stringify(cancelled.style));
    record("concurrent-telemetry-render", await page.locator("[data-testid^='studio-widget-visual-']").count() === 9 && await page.getByTestId("studio-inspector").isVisible());
    await page.close();
  }

  {
    const page = await setup();
    const frame = page.getByTestId("studio-widget-frame-boost-box");
    const before = await frameGeometry(frame);
    await drag(page, page.getByTestId("studio-resize-handle-se-boost-box"), 44, 26, { escape: true });
    const after = await frameGeometry(frame);
    record("escape-resize", JSON.stringify(before.style) === JSON.stringify(after.style));
    await page.close();
  }

  const directions = {
    nw: [-36, -22], n: [0, -22], ne: [36, -22], e: [36, 0],
    se: [36, 22], s: [0, 22], sw: [-36, 22], w: [-36, 0],
  };
  for (const [handle, [dx, dy]] of Object.entries(directions)) {
    const page = await setup();
    const frame = page.getByTestId("studio-widget-frame-boost-box");
    const before = await frameGeometry(frame);
    await drag(page, page.getByTestId(`studio-resize-handle-${handle}-boost-box`), dx, dy);
    const after = await frameGeometry(frame);
    record(`resize-${handle}`, JSON.stringify(before.style) !== JSON.stringify(after.style));
    await page.close();
  }

  {
    const page = await setup();
    await page.getByTestId("studio-inspector-rail-item-layout").click();
    await page.getByTestId("studio-layout-aspect-lock").check();
    const frame = page.getByTestId("studio-widget-frame-boost-box");
    const before = await frame.boundingBox();
    await drag(page, page.getByTestId("studio-resize-handle-se-boost-box"), 60, 20);
    const after = await frame.boundingBox();
    const beforeRatio = before.width / before.height;
    const afterRatio = after.width / after.height;
    record("aspect-lock", Math.abs(beforeRatio - afterRatio) < 0.03, { beforeRatio, afterRatio });

    const beforeZ = (await frameGeometry(frame)).style.zIndex;
    await page.getByTestId("studio-layout-front").click();
    const afterZ = (await frameGeometry(frame)).style.zIndex;
    record("z-order", beforeZ !== afterZ, { beforeZ, afterZ });
    await page.close();
  }

  {
    const page = await setup();
    const labels = [];
    await page.getByTestId("studio-zoom-plus").click();
    labels.push(await page.getByTestId("studio-zoom-label").innerText());
    for (let index = 0; index < 2; index += 1) await page.getByTestId("studio-zoom-plus").click();
    labels.push(await page.getByTestId("studio-zoom-label").innerText());
    for (let index = 0; index < 2; index += 1) await page.getByTestId("studio-zoom-plus").click();
    labels.push(await page.getByTestId("studio-zoom-label").innerText());
    record("zoom-50-100-150", JSON.stringify(labels) === JSON.stringify(["50%", "100%", "150%"]), { labels });

    const frame = page.getByTestId("studio-widget-frame-boost-box");
    await frame.focus();
    const before = await frameGeometry(frame);
    await page.keyboard.press("ArrowRight");
    const moved = await frameGeometry(frame);
    record("keyboard-move", before.style.left !== moved.style.left);

    await page.getByTestId("studio-menu-button").click();
    record("dirty", /sin guardar|unsaved|cambios/i.test(await page.getByTestId("studio-save-status").innerText()));
    await page.getByTestId("studio-undo-button").click();
    const undone = await frameGeometry(frame);
    await page.getByTestId("studio-redo-button").click();
    const redone = await frameGeometry(frame);
    record("undo", undone.style.left === before.style.left, { before: before.style.left, undone: undone.style.left });
    record("redo", redone.style.left === moved.style.left, { moved: moved.style.left, redone: redone.style.left });
    await page.getByTestId("studio-save-button").click();
    await page.getByTestId("studio-save-status").filter({ hasText: /guardado|saved/i }).waitFor();
    record("save", true);
    await page.getByTestId("studio-menu-button").click();

    const popupPromise = page.waitForEvent("popup");
    await page.getByTestId("studio-browser-view-button").click();
    const popup = await popupPromise;
    record("browser-view", popup.url().includes("/overlay?profile=example-racing.json"), { url: popup.url() });
    await popup.close();
    await page.close();
  }

  {
    const page = await setup(900, 900, false);
    const grid = page.getByTestId("studio-responsive-grid");
    await page.getByTestId("studio-list-drawer-toggle").click();
    record("compact-list-drawer", await grid.getAttribute("data-open-drawer") === "list");
    await page.getByTestId("studio-widget-row-boost-box").click();
    record("compact-inspector-drawer", await grid.getAttribute("data-open-drawer") === "inspector");
    await page.keyboard.press("Escape");
    record("compact-drawer-escape", await grid.getAttribute("data-open-drawer") === "none");
    await page.close();
  }
} finally {
  await browser.close();
  server.httpServer?.closeAllConnections?.();
  await server.close();
}

const report = {
  ok: results.every((result) => result.ok) && consoleErrors.length === 0,
  generatedAt: new Date().toISOString(),
  command: "node frontend/scripts/overlay-studio-strict-interactions.mjs",
  route: "real V52Shell + StudioRoute + OverlayStudioV3",
  results,
  consoleErrors,
};
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
