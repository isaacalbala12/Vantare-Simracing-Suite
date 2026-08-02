import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(frontend, "test-results", "testing-center");
const port = 5188;
const url = `http://127.0.0.1:${port}/testing-center-harness.html`;
const viewports = [
  { name: "compact", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 900 },
  { name: "laptop", width: 1024, height: 900 },
  { name: "wide", width: 1440, height: 1000 },
];

fs.mkdirSync(output, { recursive: true });

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
  "--host", "127.0.0.1", "--port", String(port), "--strictPort",
], { cwd: frontend, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });

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
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(url, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Testing Center harness did not start.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const problems = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.getByTestId("testing-center-page").waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
      throw new Error(`${viewport.name}: horizontal overflow`);
    }
    const consents = page.getByRole("checkbox");
    if (await consents.nth(0).isChecked() || await consents.nth(1).isChecked()) {
      throw new Error(`${viewport.name}: consent enabled by default`);
    }
    await page.locator("#tc-action").fill("Abrí el perfil endurance");
    await page.locator("#tc-expected").fill("El perfil debía iniciarse");
    await page.locator("#tc-observed").fill("El botón no respondió");
    await page.locator("#tc-module").selectOption("launcher");
    await consents.nth(0).check();
    const preview = page.getByTestId("testing-center-diagnostic-payload");
    await preview.waitFor();
    const expectedPayload = await page.evaluate(() => document.documentElement.dataset.testingCenterExpectedPayload);
    if (await preview.textContent() !== expectedPayload) throw new Error(`${viewport.name}: preview bytes changed`);
    if (!(await consents.nth(1).isDisabled())) throw new Error(`${viewport.name}: unavailable logs were enabled`);
    if (viewport.name === "compact" || viewport.name === "wide") {
      await page.screenshot({ path: path.join(output, `testing-center-${viewport.name}-preview.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Enviar reporte" }).click();
    await page.getByText(/^report_[0-9a-f]{64}$/u).waitFor();
    const transport = await page.evaluate(() => ({
      payload: document.documentElement.dataset.testingCenterSubmittedPayload,
      key: document.documentElement.dataset.testingCenterSubmittedKey,
      expectedKey: document.documentElement.dataset.testingCenterExpectedKey,
      discarded: document.documentElement.dataset.testingCenterDiscarded,
    }));
    if (transport.payload !== expectedPayload || transport.key !== transport.expectedKey || transport.discarded !== "true") {
      throw new Error(`${viewport.name}: submit/discard contract changed`);
    }
    await page.screenshot({ path: path.join(output, `testing-center-${viewport.name}.png`), fullPage: true });
    if (problems.length) throw new Error(`${viewport.name}: browser console not clean\n${problems.join("\n")}`);
    await page.close();
  }
  console.log(`Testing Center visual PASS (${viewports.length}/${viewports.length}). Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
