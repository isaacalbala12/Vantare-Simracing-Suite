import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(frontend, "test-results", "diagnostics-inspector");
const port = 5184;
const url = `http://127.0.0.1:${port}/diagnostics-harness.html`;
const hardTimeoutMs = 55_000;
const locatorTimeoutMs = 7_000;

fs.mkdirSync(output, { recursive: true });
for (const name of fs.readdirSync(output)) {
  if (/^diagnostics-(?:wide|medium|compact)(?:-(?:current|future|corrupt|failure))?\.png$/u.test(name)) {
    fs.rmSync(path.join(output, name));
  }
}

function portOwners() {
  if (process.platform !== "win32") return [];
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ','`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  return result.stdout
    .trim()
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const existingOwners = portOwners();
if (existingOwners.length > 0) {
  console.error(
    `Diagnostics harness cannot start: port ${port} is already owned by PID(s) ${existingOwners.join(", ")}. No process was terminated.`,
  );
  process.exit(1);
}

const viteEntry = path.join(frontend, "node_modules", "vite", "bin", "vite.js");
const server = spawn(process.execPath, [
  viteEntry,
  "--host",
  "127.0.0.1",
  "--port",
  String(port),
  "--strictPort",
], {
  cwd: frontend,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  detached: process.platform !== "win32",
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  serverOutput += text;
  process.stdout.write(`[vite] ${text}`);
});
server.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  serverOutput += text;
  process.stderr.write(`[vite] ${text}`);
});

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      });
      request.setTimeout(1_000, () => {
        request.destroy();
        resolve(false);
      });
      request.on("error", () => resolve(false));
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Diagnostics harness did not start.\n${serverOutput}`);
}

function stopServer() {
  if (process.platform === "win32") {
    if (server.pid) {
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
  } else {
    if (server.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // The process group already exited.
      }
    }
  }
}

const viewports = [
  { name: "wide", width: 1440, height: 1000 },
  { name: "medium", width: 1024, height: 900 },
  { name: "compact", width: 390, height: 844 },
];

let browser;
let hardTimeout;
let runError;

async function capture(page, name) {
  const capturePath = path.join(output, name);
  await page.screenshot({
    path: capturePath,
    fullPage: true,
    timeout: locatorTimeoutMs,
  });
  if (!fs.existsSync(capturePath) || fs.statSync(capturePath).size === 0) {
    throw new Error(`${name}: screenshot is missing or empty`);
  }
}

try {
  hardTimeout = setTimeout(async () => {
    process.stderr.write(
      `Diagnostics harness exceeded the hard timeout (${hardTimeoutMs} ms).\n`,
    );
    try {
      await browser?.close();
    } finally {
      stopServer();
      process.exit(124);
    }
  }, hardTimeoutMs);

  await waitForServer();
  browser = await chromium.launch({ headless: true, timeout: 10_000 });
  try {
    for (const viewport of viewports) {
      console.log(
        `Checking ${viewport.name} (${viewport.width}x${viewport.height})`,
      );
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
      });
      page.setDefaultTimeout(locatorTimeoutMs);
      page.setDefaultNavigationTimeout(10_000);
      const consoleProblems = [];
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          consoleProblems.push(`${message.type()}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        consoleProblems.push(`pageerror: ${error.message}`);
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
      await page
        .getByTestId("diagnostics-panel")
        .waitFor({ state: "visible", timeout: locatorTimeoutMs });
      await page
        .getByTestId("diagnostics-connection-summary")
        .waitFor({ state: "visible", timeout: locatorTimeoutMs });
      await page
        .getByTestId("diagnostics-payload")
        .waitFor({ state: "visible", timeout: locatorTimeoutMs });

      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      if (horizontalOverflow) {
        throw new Error(`${viewport.name}: horizontal overflow detected`);
      }

      const payload = await page.getByTestId("diagnostics-payload").textContent();
      const expectedPayload = await page.evaluate(
        () => document.documentElement.dataset.diagnosticsExpectedPayload,
      );
      if (payload !== expectedPayload) {
        throw new Error(`${viewport.name}: preview bytes changed`);
      }

      await page.getByTestId("diagnostics-copy").click();
      const copiedPayload = await page.evaluate(
        () => document.documentElement.dataset.diagnosticsCopiedPayload,
      );
      if (copiedPayload !== expectedPayload) {
        throw new Error(`${viewport.name}: copy did not use preview bytes`);
      }

      await page.getByTestId("diagnostics-download").click();
      const downloadedPayload = await page.evaluate(
        () => document.documentElement.dataset.diagnosticsDownloadedPayload,
      );
      if (downloadedPayload !== expectedPayload) {
        throw new Error(`${viewport.name}: download did not use preview bytes`);
      }

      await page.getByTestId("diagnostics-session-current").click();
      await page
        .getByTestId("diagnostics-field-speed")
        .waitFor({ state: "visible", timeout: locatorTimeoutMs });
      if (
        (await page.getByTestId("diagnostics-detail-laps").textContent()) !==
          "18" ||
        (await page.getByTestId("diagnostics-detail-vehicles").textContent()) !==
          "42"
      ) {
        throw new Error(
          `${viewport.name}: inspected current counts were not preserved`,
        );
      }
      if (
        (await page.evaluate(
          () => document.documentElement.dataset.diagnosticsInspectCount,
        )) !== "1"
      ) {
        throw new Error(`${viewport.name}: current session was not inspected once`);
      }
      if (viewport.name === "wide") {
        await capture(page, "diagnostics-wide-current.png");
      }

      await page.getByTestId("diagnostics-session-future").click();
      await page
        .getByTestId("diagnostics-session-notice-future")
        .waitFor({ state: "visible", timeout: locatorTimeoutMs });
      if (
        (await page.getByTestId("diagnostics-detail-laps").textContent()) !==
          "—" ||
        (await page.getByTestId("diagnostics-detail-vehicles").textContent()) !==
          "—"
      ) {
        throw new Error(`${viewport.name}: future metadata exposed zero counts`);
      }
      if (viewport.name === "wide") {
        await capture(page, "diagnostics-wide-future.png");
      }
      await page.getByTestId("diagnostics-session-corrupt").click();
      await page
        .getByTestId("diagnostics-session-notice-corrupt")
        .waitFor({ state: "visible", timeout: locatorTimeoutMs });
      if (
        (await page.getByTestId("diagnostics-detail-laps").textContent()) !==
          "—" ||
        (await page.getByTestId("diagnostics-detail-vehicles").textContent()) !==
          "—"
      ) {
        throw new Error(`${viewport.name}: corrupt metadata exposed zero counts`);
      }
      if (
        (await page.evaluate(
          () => document.documentElement.dataset.diagnosticsInspectCount,
        )) !== "1"
      ) {
        throw new Error(
          `${viewport.name}: future or corrupt session incorrectly invoked Inspect`,
        );
      }
      if (viewport.name === "wide") {
        await capture(page, "diagnostics-wide-corrupt.png");
      }
      await capture(page, `diagnostics-${viewport.name}.png`);

      if (consoleProblems.length > 0) {
        throw new Error(
          `${viewport.name}: browser console is not clean\n${consoleProblems.join("\n")}`,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
    browser = undefined;
  }
} catch (error) {
  runError = error;
} finally {
  clearTimeout(hardTimeout);
  stopServer();
  const lingeringOwners = portOwners();
  if (lingeringOwners.length > 0) {
    const cleanupError = new Error(
      `port ${port} is still owned by PID(s) ${lingeringOwners.join(", ")} after stopping the Vite process tree; no unrelated process was terminated`,
    );
    runError ??= cleanupError;
  }
}

if (runError) {
  const detail =
    runError instanceof Error ? runError.stack ?? runError.message : String(runError);
  console.error(`Diagnostics harness FAIL\n${detail}`);
  if (serverOutput.trim()) {
    console.error(`Vite output:\n${serverOutput}`);
  }
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log(`Diagnostics harness PASS. Captures: ${output}`);
}
