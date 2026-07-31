import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(frontend, "test-results", "telemetry-overlay-shadow");
const port = 5185;
const baseUrl = `http://127.0.0.1:${port}/telemetry-overlay-shadow-harness.html`;
const hardTimeoutMs = 55_000;
const locatorTimeoutMs = 7_000;

const scenarios = [
  ["equal", "Paridad exacta"],
  ["partial", "Parcial"],
  ["stale", "Stale"],
  ["disconnected", "Desconectado"],
  ["unsupported", "Unsupported"],
];

const viewports = [
  { name: "wide", width: 1440, height: 1000 },
  { name: "medium", width: 1024, height: 900 },
  { name: "compact", width: 390, height: 844 },
];

const forbiddenDomValues = [
  "PRIVATE_DRIVER_SHADOW_105",
  "PRIVATE_TEAM_SHADOW_105",
  "PRIVATE_VEHICLE_ID_SHADOW_105",
  "PRIVATE_TRACK_SHADOW_105",
  "C:/Users/",
  "C:\\Users\\",
  "playerVehicleId",
  "canonicalVersion",
  "rawPayload",
  "LMU conectado",
];

fs.mkdirSync(output, { recursive: true });
for (const name of fs.readdirSync(output)) {
  if (/^telemetry-overlay-shadow-(?:wide|medium|compact)\.png$/u.test(name)) {
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

if (portOwners().length > 0) {
  throw new Error(`Telemetry shadow harness cannot start: port ${port} is already in use`);
}

const viteEntry = path.join(frontend, "node_modules", "vite", "bin", "vite.js");
const server = spawn(
  process.execPath,
  [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: frontend,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  },
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  const value = chunk.toString();
  serverOutput += value;
  process.stdout.write(`[vite] ${value}`);
});
server.stderr.on("data", (chunk) => {
  const value = chunk.toString();
  serverOutput += value;
  process.stderr.write(`[vite] ${value}`);
});

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(baseUrl, (response) => {
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
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Telemetry shadow harness did not start\n${serverOutput}`);
}

function stopServer() {
  if (!server.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // The owned process group already exited.
  }
}

async function waitForClosedPort() {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (portOwners().length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`port ${port} remains open after stopping the owned Vite process`);
}

async function assertScenario(page, scenario, stateLabel) {
  await page.getByLabel("Escenario diagnóstico").selectOption(scenario);
  const state = page.getByTestId("shadow-scenario-state");
  await state.waitFor({ state: "visible", timeout: locatorTimeoutMs });
  if ((await state.textContent()) !== stateLabel) {
    throw new Error(`${scenario}: unexpected state label`);
  }
  if ((await page.getByTestId("shadow-report-status").textContent()) !== "Reporte completo accesible") {
    throw new Error(`${scenario}: report was truncated or inaccessible`);
  }
  if ((await page.getByTestId("shadow-result-list").locator("article").count()) === 0) {
    throw new Error(`${scenario}: no widget summaries rendered`);
  }
}

async function assertSafeResponsiveDom(page, viewportName) {
  const audit = await page.evaluate((forbidden) => {
    const html = document.documentElement.innerHTML;
    const forbiddenMatches = forbidden.filter((value) => html.includes(value));
    const globalOverflow =
      document.documentElement.scrollWidth > window.innerWidth ||
      document.body.scrollWidth > window.innerWidth;
    const essentialOverflow = [...document.querySelectorAll('[data-essential="true"]')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.getAttribute("data-testid") ?? element.tagName);
    const prohibitedNodes = document.querySelectorAll(
      "[data-raw-payload], [data-profile-dirty], [data-studio], [data-desktop], [data-obs]",
    ).length;
    return { forbiddenMatches, globalOverflow, essentialOverflow, prohibitedNodes };
  }, forbiddenDomValues);

  if (audit.forbiddenMatches.length > 0) {
    throw new Error(`${viewportName}: forbidden DOM values: ${audit.forbiddenMatches.join(", ")}`);
  }
  if (audit.globalOverflow || audit.essentialOverflow.length > 0) {
    throw new Error(
      `${viewportName}: horizontal overflow (${audit.essentialOverflow.join(", ") || "global"})`,
    );
  }
  if (audit.prohibitedNodes !== 0) {
    throw new Error(`${viewportName}: prohibited product/persistence nodes detected`);
  }
}

let browser;
let hardTimeout;
let runError;

try {
  hardTimeout = setTimeout(async () => {
    process.stderr.write(`Telemetry shadow harness exceeded ${hardTimeoutMs} ms\n`);
    try {
      await browser?.close();
    } finally {
      stopServer();
      process.exit(124);
    }
  }, hardTimeoutMs);

  await waitForServer();
  browser = await chromium.launch({ headless: true, timeout: 10_000 });
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(locatorTimeoutMs);
    const browserProblems = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        browserProblems.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));

    await page.goto(`${baseUrl}?scenario=partial`, {
      waitUntil: "domcontentloaded",
      timeout: 10_000,
    });
    await page.getByTestId("shadow-harness-root").waitFor({ state: "visible" });
    for (const [scenario, label] of scenarios) {
      await assertScenario(page, scenario, label);
      await assertSafeResponsiveDom(page, `${viewport.name}/${scenario}`);
    }
    await page.getByLabel("Escenario diagnóstico").selectOption("partial");
    const screenshot = path.join(output, `telemetry-overlay-shadow-${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, timeout: locatorTimeoutMs });
    if (!fs.existsSync(screenshot) || fs.statSync(screenshot).size === 0) {
      throw new Error(`${viewport.name}: screenshot is missing or empty`);
    }
    if (browserProblems.length > 0) {
      throw new Error(`${viewport.name}: browser output is not clean\n${browserProblems.join("\n")}`);
    }
    await page.close();
  }
} catch (error) {
  runError = error;
} finally {
  clearTimeout(hardTimeout);
  await browser?.close();
  stopServer();
  try {
    await waitForClosedPort();
  } catch (error) {
    runError ??= error;
  }
}

if (runError) {
  const detail = runError instanceof Error ? runError.stack ?? runError.message : String(runError);
  console.error(`Telemetry shadow harness FAIL\n${detail}`);
  if (serverOutput.trim()) console.error(`Vite output:\n${serverOutput}`);
  process.exitCode = 1;
} else {
  console.log(`Telemetry shadow harness PASS. Captures: ${output}`);
}
