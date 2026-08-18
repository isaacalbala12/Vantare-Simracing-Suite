import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/04-studio");
const port = 5196;
const base = `http://127.0.0.1:${port}/orbit-studio-harness.html`;
const url = (query = "") => `${base}?orbit=1&view=studio${query}`;

const shots = [
  { name: "1920x1080", width: 1920, height: 1080, query: "" },
  { name: "1920x900", width: 1920, height: 900, query: "" },
  { name: "1920x1080-dock-cerrado", width: 1920, height: 1080, query: "&rightDock=closed" },
  { name: "1920x1080-estres", width: 1920, height: 1080, query: "&stress=1" },
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
], {
  cwd: frontend,
  // El Studio necesita perfiles reales: sin el runtime simulado el navegador
  // limpio nunca recibe `hub:list` ni el documento del perfil activo.
  env: { ...process.env, VITE_RUNTIME_MOCK: "mock" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  detached: process.platform !== "win32",
});

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
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(url(), (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Orbit studio harness did not start.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const shot of shots) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 1,
    });
    const problems = [];
    const isWailsRuntimeNoise = (error) => (error.stack ?? "").includes("wailsio_runtime");
    page.on("pageerror", (error) => {
      if (!isWailsRuntimeNoise(error)) problems.push(`pageerror: ${error.message}`);
    });

    await page.goto(url(shot.query), { waitUntil: "networkidle" });
    await page.getByTestId("orbit-studio").waitFor();
    await page.getByTestId("orbit-studio-widget-list").waitFor();
    await page.getByTestId("orbit-studio-topbar-controls").waitFor();
    await page.getByTestId("orbit-studio-stage").waitFor();
    await page.evaluate(async () => { await document.fonts.ready; });

    const contract = await page.evaluate(() => {
      const studio = document.querySelector('[data-testid="orbit-studio"]');
      const box = (selector) => {
        const node = document.querySelector(selector);
        return node ? Math.round(node.getBoundingClientRect().height) : -1;
      };
      const dock = document.querySelector('[data-testid="orbit-studio-dock"]');
      return {
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        toolbar: box('[data-testid="orbit-studio-toolbar"]'),
        statusbar: box('[data-testid="orbit-studio-statusbar"]'),
        dockOpen: studio?.getAttribute("data-right-dock") === "open",
        dockWidth: dock && !dock.hasAttribute("hidden")
          ? Math.round(dock.getBoundingClientRect().width)
          : 0,
        widgetRows: document.querySelectorAll('[data-testid^="orbit-studio-widget-item-"]').length,
        nativeTitles: studio ? studio.querySelectorAll("[title]").length : -1,
        columnTitles: document.querySelectorAll('.orbit-column [title]').length,
      };
    });

    if (contract.scrollHeight > contract.innerHeight) {
      throw new Error(`${shot.name}: la página hace scroll vertical (${contract.scrollHeight} > ${contract.innerHeight})`);
    }
    if (contract.scrollWidth > contract.innerWidth) {
      throw new Error(`${shot.name}: la página hace scroll horizontal (${contract.scrollWidth} > ${contract.innerWidth})`);
    }
    if (contract.toolbar !== 60) {
      throw new Error(`${shot.name}: toolbar de ${contract.toolbar}px, se esperaban 60`);
    }
    if (contract.statusbar !== 39) {
      throw new Error(`${shot.name}: statusbar de ${contract.statusbar}px, se esperaban 39`);
    }
    const dockClosed = shot.query.includes("rightDock=closed");
    if (contract.dockOpen === dockClosed) {
      throw new Error(`${shot.name}: el inspector está ${contract.dockOpen ? "abierto" : "cerrado"} y se esperaba lo contrario`);
    }
    if (!dockClosed && contract.dockWidth !== 395) {
      throw new Error(`${shot.name}: inspector de ${contract.dockWidth}px, se esperaban 395`);
    }
    const expectedRows = shot.query.includes("stress=1") ? 20 : 3;
    if (contract.widgetRows !== expectedRows) {
      throw new Error(`${shot.name}: ${contract.widgetRows} filas de widgets, se esperaban ${expectedRows}`);
    }
    if (contract.nativeTitles !== 0 || contract.columnTitles !== 0) {
      throw new Error(`${shot.name}: la vista usa \`title\` nativo (${contract.nativeTitles} + ${contract.columnTitles})`);
    }
    if (problems.length) {
      throw new Error(`${shot.name}: la consola no está limpia\n${problems.join("\n")}`);
    }

    await page.screenshot({ path: path.join(output, `orbit-studio-${shot.name}.png`), fullPage: false });
    await page.close();
  }

  console.log(`Orbit studio visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
