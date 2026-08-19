import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/09-telemetria");
const port = 5199;
const base = `http://127.0.0.1:${port}/orbit-telemetry-harness.html?view=telemetria`;
const emptyUrl = `${base}&telemetryDemo=0`;
const demoUrl = `${base}&telemetryDemo=1`;

// Alturas fijas de las cuatro trazas (`06 § Telemetría`).
const TRACE_HEIGHTS = [150, 100, 80, 110];

const shots = [
  { name: "1920x1080", width: 1920, height: 1080, url: emptyUrl, mode: "empty", interact: false },
  { name: "1920x1080", width: 1920, height: 1080, url: demoUrl, mode: "demo", interact: true },
  { name: "1920x900", width: 1920, height: 900, url: demoUrl, mode: "demo", interact: false },
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
      const request = http.get(emptyUrl, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Orbit telemetry harness did not start.\n${serverOutput}`);
}

function contractOf() {
  const root = document.querySelector(".orbit-tel");
  const insights = document.querySelector('[data-testid="orbit-telemetry-insights"]');
  return {
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    mode: root ? root.getAttribute("data-mode") : null,
    status: document.querySelector('[data-testid="orbit-telemetry-status"]')?.textContent ?? "",
    rows: document.querySelectorAll('[data-testid^="orbit-telemetry-insight-"]').length,
    segments: document.querySelectorAll('[data-testid="orbit-trackmap-segment"]').length,
    sessions: document.querySelectorAll('[data-testid="orbit-telemetry-sessions"] .orbit-row').length,
    traceHeights: [...document.querySelectorAll(".orbit-tel__stack .orbit-trace__svg")]
      .map((node) => Math.round(node.getBoundingClientRect().height)),
    insightsScrollY: insights
      ? insights.parentElement.scrollHeight > insights.parentElement.clientHeight + 0.5
      : null,
    nativeTitles: root ? root.querySelectorAll("[title]").length : -1,
    cursor: document.querySelector('[data-testid="orbit-telemetry-cursor"]')?.textContent ?? "",
  };
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const shot of shots) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 1,
      timezoneId: "Europe/Madrid",
    });
    const problems = [];
    const isWailsRuntimeNoise = (error) => (error.stack ?? "").includes("wailsio_runtime");
    page.on("pageerror", (error) => {
      if (!isWailsRuntimeNoise(error)) problems.push(`pageerror: ${error.message}`);
    });

    await page.goto(shot.url, { waitUntil: "networkidle" });
    await page.getByTestId("orbit-telemetry").waitFor();
    await page.evaluate(async () => { await document.fonts.ready; });

    const label = `${shot.mode}-${shot.name}`;
    const summary = await page.evaluate(contractOf);

    if (summary.mode !== shot.mode) {
      throw new Error(`${label}: la vista está en modo ${summary.mode}`);
    }
    if (summary.scrollHeight > summary.innerHeight) {
      throw new Error(`${label}: la página hace scroll vertical (${summary.scrollHeight} > ${summary.innerHeight})`);
    }
    if (summary.scrollWidth > summary.innerWidth) {
      throw new Error(`${label}: la página hace scroll horizontal (${summary.scrollWidth} > ${summary.innerWidth})`);
    }
    if (summary.nativeTitles !== 0) {
      throw new Error(`${label}: la vista usa \`title\` nativo (${summary.nativeTitles})`);
    }

    if (shot.mode === "demo") {
      if (!summary.status.includes("Datos sintéticos")) {
        throw new Error(`${label}: falta el rótulo «Datos sintéticos» (${summary.status})`);
      }
      if (summary.rows !== 8) {
        throw new Error(`${label}: hay ${summary.rows} insights (esperados 8)`);
      }
      if (summary.segments !== 8) {
        throw new Error(`${label}: el mapa pinta ${summary.segments} tramos (esperados 8)`);
      }
      if (summary.sessions !== 3) {
        throw new Error(`${label}: la columna lista ${summary.sessions} sesiones (esperadas 3)`);
      }
      if (summary.insightsScrollY !== true) {
        throw new Error(`${label}: la lista de insights no tiene scroll interno`);
      }
      const heights = summary.traceHeights.join(",");
      if (heights !== TRACE_HEIGHTS.join(",")) {
        throw new Error(`${label}: alturas de traza ${heights} (esperadas ${TRACE_HEIGHTS.join(",")})`);
      }
    } else {
      if (summary.status.includes("Datos sintéticos")) {
        throw new Error(`${label}: el estado vacío se etiqueta como sintético`);
      }
      if (summary.rows !== 0 || summary.segments !== 0) {
        throw new Error(`${label}: el estado vacío pinta datos (${summary.rows} insights, ${summary.segments} tramos)`);
      }
      if (!(await page.getByTestId("orbit-telemetry-traces-empty").count())) {
        throw new Error(`${label}: falta el mensaje de trazas vacías`);
      }
    }

    await page.screenshot({
      path: path.join(output, `orbit-telemetria-${label}.png`),
      fullPage: false,
    });

    if (shot.interact) {
      // ── Insight: enfoca el tramo del mapa y mueve el cursor de las trazas.
      await page.getByTestId("orbit-telemetry-insight-T7").click();
      await page.waitForFunction(
        () => document.querySelector('[data-testid="orbit-telemetry-insight-T7"]')
          ?.getAttribute("data-on") === "true",
      );
      const focused = await page.evaluate(contractOf);
      if (!focused.cursor.includes("1628 m")) {
        throw new Error(`${label}: el cursor no saltó a T7 (${focused.cursor})`);
      }
      if (!(await page.getByTestId("orbit-trackmap-car").count())) {
        throw new Error(`${label}: el coche no aparece en el mapa tras enfocar`);
      }
      await page.screenshot({
        path: path.join(output, `orbit-telemetria-foco-${label}.png`),
        fullPage: false,
      });

      // ── Hover en las trazas: el cursor sigue al ratón.
      const stack = page.getByTestId("orbit-telemetry-stack");
      const box = await stack.boundingBox();
      await page.mouse.move(box.x + box.width * 0.72, box.y + 40);
      await page.waitForFunction(
        (previous) =>
          document.querySelector('[data-testid="orbit-telemetry-cursor"]')?.textContent !== previous,
        focused.cursor,
      );

      // ── Referencia Vantare: el delta y el orden de insights se reescalan.
      const before = await page.getByTestId("orbit-telemetry-delta").textContent();
      await page.getByRole("group", { name: "Referencia" })
        .getByRole("button", { name: "vs referencia Vantare" }).click();
      await page.waitForFunction(
        (previous) =>
          document.querySelector('[data-testid="orbit-telemetry-delta"]')?.textContent !== previous,
        before,
      );
      const after = await page.evaluate(contractOf);
      if (after.scrollHeight > after.innerHeight) {
        throw new Error(`${label}: la vista hace scroll de página tras interactuar`);
      }
      if (after.nativeTitles !== 0) {
        throw new Error(`${label}: la vista usa \`title\` nativo tras interactuar`);
      }
      await page.screenshot({
        path: path.join(output, `orbit-telemetria-referencia-${label}.png`),
        fullPage: false,
      });
    }

    if (problems.length) {
      throw new Error(`${label}: la consola no está limpia\n${problems.join("\n")}`);
    }

    await page.close();
  }

  console.log(`Orbit telemetry visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
