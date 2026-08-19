import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/00-fundamentos");
// La franja de variantes de la marca (D-96) es evidencia de la shell, no de
// fundamentos: vive en el harness de tokens pero se guarda con el rail.
const shellOutput = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/01-shell");
const port = 5193;
const url = `http://127.0.0.1:${port}/orbit-tokens-harness.html`;

fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(shellOutput, { recursive: true });

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
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(url, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Orbit foundations harness did not start.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const browserProblems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") browserProblems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByTestId("orbit-foundations-harness").waitFor();
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load("16px Inter"),
      document.fonts.load("16px 'Cascadia Code'"),
    ]);
    await document.fonts.ready;
  });

  const contract = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const proof = getComputedStyle(document.querySelector('[data-testid="orbit-tailwind-proof"]'));
    const fontRequests = performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => /font|\.woff2|\.ttf/u.test(name));
    return {
      variables: {
        bg: root.getPropertyValue("--v-bg").trim(),
        red: root.getPropertyValue("--v-red-500").trim(),
        coral: root.getPropertyValue("--v-coral").trim(),
        radius: root.getPropertyValue("--v-radius").trim(),
      },
      proof: {
        background: proof.backgroundColor,
        color: proof.color,
        radius: proof.borderRadius,
      },
      icons: document.querySelectorAll('[data-testid="orbit-icon-grid"] use').length,
      density: document.body.dataset.density,
      bodyRow: getComputedStyle(document.body).getPropertyValue("--v-row").trim(),
      fontsLoaded: document.fonts.check("16px Inter") && document.fonts.check("16px 'Cascadia Code'"),
      externalFontRequest: fontRequests.some((name) => name.includes("fonts.googleapis.com") || name.includes("fonts.gstatic.com")),
    };
  });

  const expected = JSON.stringify({ bg: "#08090b", red: "#f04755", coral: "#ff6a5f", radius: "18px" });
  if (JSON.stringify(contract.variables) !== expected) throw new Error(`theme variables changed: ${JSON.stringify(contract.variables)}`);
  if (contract.proof.background !== "rgb(8, 9, 11)" || contract.proof.color !== "rgb(245, 243, 242)" || contract.proof.radius !== "18px") {
    throw new Error(`Tailwind Orbit utilities changed: ${JSON.stringify(contract.proof)}`);
  }
  if (contract.icons !== 15) throw new Error(`expected 15 icons, found ${contract.icons}`);
  if (contract.density !== "balanced" || contract.bodyRow !== "49px") throw new Error(`balanced density changed: ${JSON.stringify(contract)}`);
  if (!contract.fontsLoaded || contract.externalFontRequest) throw new Error(`offline font contract failed: ${JSON.stringify(contract)}`);
  if (browserProblems.length) throw new Error(`browser console not clean\n${browserProblems.join("\n")}`);

  await page.screenshot({ path: path.join(output, "orbit-foundations-1920x1080.png"), fullPage: false });

  const marks = page.getByTestId("orbit-mark-variants");
  await marks.waitFor();
  const markRows = await marks.evaluate((node) => node.children.length);
  if (markRows !== 4) throw new Error(`expected 4 mark rows (marca + 3 referencias), found ${markRows}`);
  await marks.screenshot({ path: path.join(shellOutput, "orbit-rail-mark.png") });

  await page.evaluate(() => localStorage.setItem("vantare.v03orbit.density", "compact"));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("orbit-foundations-harness").waitFor();
  const compact = await page.evaluate(() => ({
    density: document.body.dataset.density,
    row: getComputedStyle(document.body).getPropertyValue("--v-row").trim(),
  }));
  if (compact.density !== "compact" || compact.row !== "42px") throw new Error(`compact density changed: ${JSON.stringify(compact)}`);
  if (browserProblems.length) throw new Error(`browser console not clean after compact reload\n${browserProblems.join("\n")}`);
  await page.screenshot({ path: path.join(output, "orbit-foundations-compact-1920x1080.png"), fullPage: false });

  console.log(`Orbit foundations visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
