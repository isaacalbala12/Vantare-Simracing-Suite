import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assertNoHorizontalOverflow } from "./orbit-overflow-assert.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/03-inicio");
const port = 5195;
const url = `http://127.0.0.1:${port}/orbit-home-harness.html?orbit=1&view=inicio`;

// Reloj congelado: las previsiones del calendario simulado están fechadas ese
// día, así que sin fijar la hora el harness fotografiaría un calendario vacío
// y las cuentas atrás cambiarían en cada ejecución.
const FROZEN_CLOCK = new Date("2026-07-07T18:07:30Z");

const viewports = [
  { name: "1920x1080", width: 1920, height: 1080, compact: false },
  { name: "1920x900", width: 1920, height: 900, compact: true },
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
  // El mini-lienzo necesita perfiles y calendario reales: sin el runtime
  // simulado el navegador limpio no recibe ningún evento de Wails.
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
      const request = http.get(url, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Orbit home harness did not start.\n${serverOutput}`);
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
    const isWailsRuntimeNoise = (error) => (error.stack ?? "").includes("wailsio_runtime");
    page.on("pageerror", (error) => {
      if (!isWailsRuntimeNoise(error)) problems.push(`pageerror: ${error.message}`);
    });

    await page.clock.install({ time: FROZEN_CLOCK });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByTestId("orbit-home").waitFor();
    await page.getByTestId("orbit-home-races").waitFor();
    await page.getByTestId("orbit-mini-stage").waitFor();
    // El reloj corre durante la carga (el runtime simulado responde con
    // `setTimeout`) y se congela justo antes de medir y capturar.
    await page.clock.setFixedTime(FROZEN_CLOCK);
    await page.evaluate(async () => { await document.fonts.ready; });

    const contract = await page.evaluate(() => {
      const home = document.querySelector(".orbit-home");
      const rows = [...document.querySelectorAll('[data-testid="orbit-home-races"] .orbit-row')];
      const visibleRows = rows.filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight + 0.5;
      });
      const stage = document.querySelector('[data-testid="orbit-mini-stage"]');

      // Cada lista de la rejilla debe poder llegar al final sin recortar la
      // última fila: se lleva su contenedor al máximo de scroll y se compara
      // el borde inferior de la última fila con el del contenedor.
      const listOverflow = (testId) => {
        const list = document.querySelector(`[data-testid="${testId}"]`);
        if (!list) return null;
        const scroller = list.closest(".orbit-surface__body");
        if (!scroller) return { testId, error: "sin contenedor de scroll" };
        const style = getComputedStyle(scroller);
        const rows = [...list.querySelectorAll(".orbit-row")];
        if (rows.length === 0) return { testId, rows: 0, clipped: 0 };

        // El calendario simulado no siempre desborda el panel: se clonan filas
        // hasta forzar el scroll, se mide y se retiran antes de capturar.
        const clones = [];
        while (scroller.scrollHeight <= scroller.clientHeight + 1 && clones.length < 24) {
          const clone = rows[rows.length - 1].cloneNode(true);
          clone.dataset.probe = "true";
          list.appendChild(clone);
          clones.push(clone);
        }
        scroller.scrollTop = scroller.scrollHeight;
        const all = [...list.querySelectorAll(".orbit-row")];
        const last = all[all.length - 1];
        const box = scroller.getBoundingClientRect();
        const rect = last.getBoundingClientRect();
        const clipped = Math.max(0, rect.bottom - box.bottom) + Math.max(0, box.top - rect.top);
        const scrolls = scroller.scrollHeight > scroller.clientHeight + 1;
        scroller.scrollTop = 0;
        for (const clone of clones) clone.remove();
        return {
          testId,
          rows: rows.length,
          probes: clones.length,
          clipped: Math.round(clipped * 100) / 100,
          scrolls,
          overflowY: style.overflowY,
          padBottom: style.paddingBottom,
        };
      };

      return {
        lists: [listOverflow("orbit-home-races"), listOverflow("orbit-home-profiles")].filter(
          Boolean,
        ),
        nextRace: document.querySelectorAll('[data-testid="orbit-next-race"]').length,
        dials: document.querySelectorAll(".orbit-dial").length,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        compact: home?.getAttribute("data-compact") === "true",
        raceRows: rows.length,
        visibleRaceRows: visibleRows.length,
        // Widgets reales: los pinta el host V3 a través de su viewport, no una
        // caja de relleno del kit (`.orbit-mini-stage__ghost`).
        hostWidgets: stage
          ? stage.querySelectorAll('[data-widget-visual-viewport="true"]').length
          : 0,
        ghosts: stage ? stage.querySelectorAll(".orbit-mini-stage__ghost").length : 0,
        nativeTitles: home ? home.querySelectorAll("[title]").length : -1,
      };
    });

    if (contract.scrollHeight > contract.innerHeight) {
      throw new Error(`${viewport.name}: la página hace scroll vertical (${contract.scrollHeight} > ${contract.innerHeight})`);
    }
    if (contract.scrollWidth > contract.innerWidth) {
      throw new Error(`${viewport.name}: la página hace scroll horizontal (${contract.scrollWidth} > ${contract.innerWidth})`);
    }
    await assertNoHorizontalOverflow(page, viewport.name);
    if (contract.compact !== viewport.compact) {
      throw new Error(`${viewport.name}: modo compacto ${contract.compact}, se esperaba ${viewport.compact}`);
    }
    if (contract.raceRows !== 4) {
      throw new Error(`${viewport.name}: ${contract.raceRows} filas de carreras, se esperaban 4`);
    }
    if (contract.visibleRaceRows !== 4) {
      throw new Error(`${viewport.name}: solo ${contract.visibleRaceRows} de 4 carreras quedan a la vista`);
    }
    if (contract.nextRace !== 1) {
      throw new Error(`${viewport.name}: ${contract.nextRace} tarjetas «Próxima serie», se esperaba 1`);
    }
    if (contract.dials !== 0) {
      throw new Error(`${viewport.name}: el hero sigue pintando el dial (${contract.dials})`);
    }
    for (const list of contract.lists) {
      if (list.error) {
        throw new Error(`${viewport.name}: ${list.testId} ${list.error}`);
      }
      if (!list.scrolls) {
        throw new Error(`${viewport.name}: ${list.testId} no llega a desplazarse ni con ${list.probes} filas de sonda`);
      }
      if (list.overflowY !== "auto" && list.overflowY !== "scroll") {
        throw new Error(`${viewport.name}: ${list.testId} no desplaza dentro del panel (overflow-y: ${list.overflowY})`);
      }
      if (parseFloat(list.padBottom) < 8) {
        throw new Error(`${viewport.name}: ${list.testId} sin hueco al pie (padding-bottom: ${list.padBottom})`);
      }
      if (list.clipped > 0.5) {
        throw new Error(`${viewport.name}: ${list.testId} recorta la última fila ${list.clipped}px tras el scroll máximo`);
      }
    }
    if (contract.hostWidgets !== 3) {
      throw new Error(`${viewport.name}: el mini-lienzo pinta ${contract.hostWidgets} widgets del host V3, se esperaban 3`);
    }
    if (contract.ghosts !== 0) {
      throw new Error(`${viewport.name}: el mini-lienzo cae en cajas de relleno (${contract.ghosts})`);
    }
    if (contract.nativeTitles !== 0) {
      throw new Error(`${viewport.name}: la vista usa \`title\` nativo (${contract.nativeTitles})`);
    }
    if (problems.length) {
      throw new Error(`${viewport.name}: la consola no está limpia\n${problems.join("\n")}`);
    }

    await page.screenshot({ path: path.join(output, `orbit-inicio-${viewport.name}.png`), fullPage: false });
    await page.close();
  }

  console.log(`Orbit home visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
