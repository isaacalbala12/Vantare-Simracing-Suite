import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assertNoHorizontalOverflow } from "./orbit-overflow-assert.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/01-shell");
const port = 5194;
const url = `http://127.0.0.1:${port}/orbit-shell-harness.html?orbit=1`;
const viewports = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1920x900", width: 1920, height: 900 },
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
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(url, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Orbit shell harness did not start.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const problems = [];
    // El runtime de Wails no existe en un navegador limpio: cada `Events.Emit`
    // rechaza. Es ruido esperado del harness, no un fallo de la shell; todo lo
    // demás sí cuenta.
    const isWailsRuntimeNoise = (error) => (error.stack ?? "").includes("wailsio_runtime");
    page.on("pageerror", (error) => {
      if (!isWailsRuntimeNoise(error)) problems.push(`pageerror: ${error.message}`);
    });

    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByTestId("orbit-shell").waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const contract = await page.evaluate(() => {
      const shell = document.querySelector(".orbit-shell");
      const column = document.querySelector(".orbit-column");
      const rail = document.querySelector(".orbit-rail");
      const topbar = document.querySelector(".orbit-topbar");
      const columnRect = column?.getBoundingClientRect();
      const blocks = document.querySelector(".orbit-column__blocks");
      const blocksRect = blocks?.getBoundingClientRect();
      return {
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
        columnWidth: column ? Math.round(columnRect.width) : 0,
        topbarHeight: topbar ? Math.round(topbar.getBoundingClientRect().height) : 0,
        gridColumns: shell ? getComputedStyle(shell).gridTemplateColumns : "",
        // D-R3-B-1: la columna ya no lleva pie. Lo que se comprueba ahora es
        // que su contenido cabe entero, que era lo que el pie garantizaba.
        hasFoot: Boolean(document.querySelector(".orbit-column__foot")),
        blocksFit:
          Boolean(blocksRect) &&
          blocksRect.height > 0 &&
          blocksRect.bottom <= window.innerHeight + 0.5,
        railTooltips: [...document.querySelectorAll(".orbit-rail__button")].every(
          (node) => node.hasAttribute("data-tip") && !node.hasAttribute("title"),
        ),
      };
    });

    // Sin scroll de página: la política de alturas de § 3.6 es un contrato, no un consejo.
    if (contract.scrollHeight > contract.innerHeight) {
      throw new Error(`${viewport.name}: la página hace scroll vertical (${contract.scrollHeight} > ${contract.innerHeight})`);
    }
    if (contract.railWidth !== 81) throw new Error(`${viewport.name}: rail ${contract.railWidth}px, se esperaba 81px`);
    if (contract.columnWidth !== 296) throw new Error(`${viewport.name}: columna ${contract.columnWidth}px, se esperaba 296px`);
    if (contract.topbarHeight !== 70) throw new Error(`${viewport.name}: topbar ${contract.topbarHeight}px, se esperaba 70px`);
    if (contract.hasFoot) throw new Error(`${viewport.name}: la columna sigue pintando pie (D-R3-B-1 lo elimina)`);
    if (!contract.blocksFit) throw new Error(`${viewport.name}: los bloques de la columna se recortan`);
    if (!contract.railTooltips) throw new Error(`${viewport.name}: el rail usa \`title\` nativo en vez de \`data-tip\``);
    await assertNoHorizontalOverflow(page, viewport.name);
    if (problems.length) throw new Error(`${viewport.name}: la consola no está limpia\n${problems.join("\n")}`);

    await page.screenshot({ path: path.join(output, `orbit-shell-inicio-${viewport.name}.png`), fullPage: false });
    await page.close();
  }

  console.log(`Orbit shell visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
