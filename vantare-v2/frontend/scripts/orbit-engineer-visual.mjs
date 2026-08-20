import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { hideToasts, settle, stillPage } from "./lib/orbit-still.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/08-ingeniero");
const port = 5198;
const url = `http://127.0.0.1:${port}/orbit-engineer-harness.html?view=ingeniero`;

// Reloj congelado: los mensajes sembrados se anclan a esta sesión.
const FROZEN_CLOCK = new Date("2026-07-07T18:44:30Z");

const viewports = [
  { name: "1920x1080", width: 1920, height: 1080, interact: true },
  { name: "1920x900", width: 1920, height: 900, interact: false },
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
  // El runtime simulado publica la configuración real del Ingeniero
  // (`engineer:status`) con veinte mensajes de radio sembrados.
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
  throw new Error(`Orbit engineer harness did not start.\n${serverOutput}`);
}

function contractOf() {
  const root = document.querySelector(".orbit-engineer");
  const feed = document.querySelector('[data-testid="orbit-engineer-feed"]');
  return {
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    rows: document.querySelectorAll('[data-testid^="orbit-rf-"]').length,
    modules: document.querySelectorAll('[data-testid^="orbit-eng-mod-"]').length,
    outputs: document.querySelectorAll('[data-testid^="orbit-engineer-output-"]').length,
    feedScrollY: feed ? feed.scrollHeight > feed.clientHeight + 0.5 : null,
    nativeTitles: root ? root.querySelectorAll("[title]").length : -1,
  };
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    const page = await stillPage(browser, {
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      timezoneId: "Europe/Madrid",
    });
    const problems = [];
    const isWailsRuntimeNoise = (error) => (error.stack ?? "").includes("wailsio_runtime");
    page.on("pageerror", (error) => {
      if (!isWailsRuntimeNoise(error)) problems.push(`pageerror: ${error.message}`);
    });

    await page.clock.install({ time: FROZEN_CLOCK });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByTestId("orbit-engineer").waitFor();
    await page.getByTestId("orbit-engineer-modules").waitFor();
    await page.locator('[data-testid^="orbit-rf-"]').first().waitFor();
    await hideToasts(page);
    await settle(page);

    const summary = await page.evaluate(contractOf);
    if (summary.scrollHeight > summary.innerHeight) {
      throw new Error(`${viewport.name}: la página hace scroll vertical (${summary.scrollHeight} > ${summary.innerHeight})`);
    }
    if (summary.scrollWidth > summary.innerWidth) {
      throw new Error(`${viewport.name}: la página hace scroll horizontal (${summary.scrollWidth} > ${summary.innerWidth})`);
    }
    if (summary.modules !== 4) {
      throw new Error(`${viewport.name}: la fila de módulos tiene ${summary.modules} tarjetas`);
    }
    if (summary.outputs !== 6) {
      throw new Error(`${viewport.name}: hay ${summary.outputs} categorías de salida`);
    }
    if (summary.rows !== 20) {
      throw new Error(`${viewport.name}: el feed muestra ${summary.rows} mensajes (esperados 20)`);
    }
    if (summary.feedScrollY !== true) {
      throw new Error(`${viewport.name}: el feed no tiene scroll interno`);
    }
    if (summary.nativeTitles !== 0) {
      throw new Error(`${viewport.name}: la vista usa \`title\` nativo (${summary.nativeTitles})`);
    }

    await hideToasts(page);

    await settle(page);
    await page.screenshot({
      path: path.join(output, `orbit-ingeniero-${viewport.name}.png`),
      fullPage: false,
    });

    if (viewport.interact) {
      // ── Filtro del feed: Spotter deja solo los mensajes del spotter.
      const filter = page.getByRole("group", { name: "Filtro por origen" });
      await filter.getByRole("button", { name: "Spotter" }).click();
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid^="orbit-rf-"]').length === 8,
      );
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-ingeniero-filtro-spotter-${viewport.name}.png`),
        fullPage: false,
      });
      await filter.getByRole("button", { name: "Todo" }).click();

      // ── Salidas: el cambio va al servicio y vuelve por `engineer:status`.
      const laps = page.getByTestId("orbit-engineer-output-laps");
      await laps.getByRole("button", { name: "Off" }).click();
      await page.waitForFunction(() => {
        const row = document.querySelector('[data-testid="orbit-engineer-output-laps"]');
        const off = row?.querySelectorAll("button")[3];
        return off?.getAttribute("aria-pressed") === "true";
      });

      // ── Módulo apagado: el icono de Subtítulos pierde el degradado.
      const subtitles = page.getByTestId("orbit-eng-mod-subtitles");
      await subtitles.getByRole("button", { name: "Subtítulos" }).click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="orbit-eng-mod-subtitles"]')
            ?.getAttribute("data-on") === "false",
      );
      const dimmed = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="orbit-eng-ico-subtitles"]');
        return node ? getComputedStyle(node).opacity : null;
      });
      if (dimmed === null || Number(dimmed) >= 1) {
        throw new Error(`${viewport.name}: el icono del módulo apagado no se atenúa (${dimmed})`);
      }

      const after = await page.evaluate(contractOf);
      if (after.scrollHeight > after.innerHeight) {
        throw new Error(`${viewport.name}: la vista hace scroll de página tras interactuar`);
      }
      if (after.nativeTitles !== 0) {
        throw new Error(`${viewport.name}: la vista usa \`title\` nativo tras interactuar`);
      }

      await hideToasts(page);

      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-ingeniero-modulos-${viewport.name}.png`),
        fullPage: false,
      });
    }

    if (problems.length) {
      throw new Error(`${viewport.name}: la consola no está limpia\n${problems.join("\n")}`);
    }

    await page.close();
  }

  console.log(`Orbit engineer visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
