import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { hideToasts, settle, stillPage } from "./lib/orbit-still.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/06-carreras");
const port = 5198;
const url = `http://127.0.0.1:${port}/orbit-races-harness.html?view=carreras`;

// Reloj congelado: las cinco vistas y la línea "ahora" del timeline se calculan
// desde la hora local, así que sin fijarla la captura cambiaría en cada pase.
const FROZEN_CLOCK = new Date("2026-07-07T18:07:30Z");

const views = [
  { id: "next", label: "Próximas", testId: "orbit-races-next" },
  { id: "day", label: "Día", testId: "orbit-races-day" },
  { id: "week", label: "Semana", testId: "orbit-races-week" },
  { id: "month", label: "Mes", testId: "orbit-races-month" },
  { id: "timeline", label: "Timeline", testId: "orbit-races-timeline" },
];

const viewports = [
  { name: "1920x1080", width: 1920, height: 1080, all: true },
  { name: "1920x900", width: 1920, height: 900, all: false },
];

/** El alto corto es donde aparecía el scroll de página: se comprueban las cinco. */
const SHORT_VIEWS = ["next", "day", "week", "month", "timeline"];

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
  // Sin el runtime simulado el navegador limpio no recibe `calendar:loaded` y
  // las cinco vistas saldrían vacías: es el mismo mock que el harness de Inicio.
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
  throw new Error(`Orbit races harness did not start.\n${serverOutput}`);
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
    await page.getByTestId("orbit-races").waitFor();
    await page.getByTestId("orbit-races-filters").waitFor();
    await page.clock.setFixedTime(FROZEN_CLOCK);
    await hideToasts(page);
    await settle(page);

    const wanted = viewport.all ? views : views.filter((view) => SHORT_VIEWS.includes(view.id));

    for (const view of wanted) {
      await page.getByRole("button", { name: view.label, exact: true }).click();
      await page.getByTestId(view.testId).waitFor();
      await page.clock.setFixedTime(FROZEN_CLOCK);

      const contract = await page.evaluate((testId) => {
        const nextRows = [...document.querySelectorAll('[data-testid="orbit-races-next-row"]')];
        const centerSpread = (selector) => {
          const centers = nextRows
            .map((nextRow) => nextRow.querySelector(selector)?.getBoundingClientRect())
            .filter(Boolean)
            .map((rect) => (rect.left + rect.right) / 2);
          return centers.length ? Math.max(...centers) - Math.min(...centers) : null;
        };
        const root = document.querySelector(".orbit-races");
        const column = document.querySelector(".orbit-column");
        // El scroller horizontal es el propio componente del kit (`.orbit-tl`).
        const timeline = document.querySelector('[data-testid="orbit-timeline"]');
        const now = document.querySelector('[data-testid="orbit-timeline-now"]');
        const nowRect = now?.getBoundingClientRect();
        const tlRect = timeline?.getBoundingClientRect();
        const row = document.querySelector('[data-testid="orbit-timeline-row"]');
        const rowRect = row?.getBoundingClientRect();
        // El scroll que veía Isaac era el del workspace de la shell, no el del
        // documento: la página es 100vh y quien crecía era la pantalla.
        const workspace = document.querySelector(".orbit-workspace");
        const view = document.querySelector(`[data-testid="${testId}"]`);
        const body = document.querySelector(".orbit-races__calendar .orbit-surface__body");
        return {
          workspaceOverflow: workspace
            ? workspace.scrollHeight - workspace.clientHeight
            : -1,
          racesOverflow: root ? root.scrollHeight - root.clientHeight : -1,
          // La vista o el cuerpo de la Surface son quienes desplazan por dentro.
          innerScroller:
            (view && view.scrollHeight > view.clientHeight + 0.5) ||
            (body && body.scrollHeight > body.clientHeight + 0.5) ||
            (view && view.scrollHeight <= view.clientHeight + 0.5),
          pxPerHour: document
            .querySelector(".orbit-tl__inner")
            ?.getAttribute("data-px-per-hour") ?? null,
          view: testId,
          scrollHeight: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          // El bloque persistente "Próximas carreras" se oculta en esta vista.
          persistentRaces: column ? column.querySelectorAll('[data-block="races"]').length : -1,
          filters: document.querySelectorAll('[data-testid="orbit-races-filters"] button').length,
          detail: document.querySelectorAll('[data-testid="orbit-races-detail"]').length,
          nativeTitles: root ? root.querySelectorAll("[title]").length : -1,
          nextColumnSpreads:
            testId === "orbit-races-next"
              ? {
                  at: centerSpread(".orbit-races__nrow-at"),
                  duration: centerSpread(".orbit-races__dur"),
                  license: centerSpread(".orbit-chip"),
                }
              : null,
          nextRowOverflow:
            testId === "orbit-races-next"
              ? Math.max(...nextRows.map((nextRow) => nextRow.scrollWidth - nextRow.clientWidth))
              : null,
          timelineScrollX: timeline ? timeline.scrollWidth > timeline.clientWidth + 0.5 : null,
          nowVisible:
            nowRect && tlRect
              ? nowRect.left >= tlRect.left - 0.5 && nowRect.right <= tlRect.right + 0.5
              : null,
          // Fracción del eje en la que cae la línea "ahora" dentro de su fila.
          nowFraction:
            nowRect && rowRect && rowRect.width > 0
              ? (nowRect.left - rowRect.left) / rowRect.width
              : null,
        };
      }, view.testId);

      if (contract.workspaceOverflow > 1) {
        throw new Error(`${viewport.name}/${view.id}: el workspace hace scroll (${contract.workspaceOverflow}px de más)`);
      }
      if (contract.racesOverflow > 1) {
        throw new Error(`${viewport.name}/${view.id}: la pantalla desborda su alto (${contract.racesOverflow}px)`);
      }
      if (contract.innerScroller !== true) {
        throw new Error(`${viewport.name}/${view.id}: la vista no desplaza por dentro`);
      }
      if (contract.scrollHeight > contract.innerHeight) {
        throw new Error(`${viewport.name}/${view.id}: la página hace scroll vertical (${contract.scrollHeight} > ${contract.innerHeight})`);
      }
      if (contract.scrollWidth > contract.innerWidth) {
        throw new Error(`${viewport.name}/${view.id}: la página hace scroll horizontal (${contract.scrollWidth} > ${contract.innerWidth})`);
      }
      if (contract.persistentRaces !== 0) {
        throw new Error(`${viewport.name}/${view.id}: el bloque persistente "Próximas carreras" sigue en la columna`);
      }
      if (contract.filters !== 5) {
        throw new Error(`${viewport.name}/${view.id}: ${contract.filters} filtros de categoría, se esperaban 5`);
      }
      if (contract.detail !== 1) {
        throw new Error(`${viewport.name}/${view.id}: el detalle no está montado`);
      }
      if (contract.nativeTitles !== 0) {
        throw new Error(`${viewport.name}/${view.id}: la vista usa \`title\` nativo (${contract.nativeTitles})`);
      }
      if (view.id === "next") {
        for (const [column, spread] of Object.entries(contract.nextColumnSpreads)) {
          if (spread > 0.5) {
            throw new Error(`${viewport.name}/next: la columna ${column} varía ${spread.toFixed(2)}px entre filas`);
          }
        }
        if (contract.nextRowOverflow > 0.5) {
          throw new Error(`${viewport.name}/next: una fila desborda ${contract.nextRowOverflow}px en horizontal`);
        }
      }
      if (view.id === "timeline") {
        if (contract.timelineScrollX !== true) {
          throw new Error(`${viewport.name}: el timeline no tiene scroll horizontal interno`);
        }
        if (contract.nowVisible !== true) {
          throw new Error(`${viewport.name}: la línea "ahora" cae fuera del viewport del timeline`);
        }
        // El eje arranca en la hora en punto, así que "ahora" debe caer en la
        // fracción `minutos/1440` del ancho de la fila (18:07 ⇒ 7/1440).
        const expected = FROZEN_CLOCK.getUTCMinutes() / 1440;
        if (Math.abs(contract.nowFraction - expected) > 0.004) {
          throw new Error(`${viewport.name}: la línea "ahora" está en ${contract.nowFraction.toFixed(4)}, se esperaba ${expected.toFixed(4)}`);
        }
      }
      if (problems.length) {
        throw new Error(`${viewport.name}/${view.id}: la consola no está limpia\n${problems.join("\n")}`);
      }

      await hideToasts(page);

      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-carreras-${view.id}-${viewport.name}.png`),
        fullPage: false,
      });

      // Timeline con zoom: el Seg de rango 12 h debe ensanchar el eje.
      if (view.id === "timeline" && viewport.all) {
        const before = Number(contract.pxPerHour);
        await page.getByTestId("orbit-races-tl-controls").getByRole("button", { name: "12 h" }).click();
        await page.clock.setFixedTime(FROZEN_CLOCK);
        const after = await page.evaluate(() =>
          Number(document.querySelector(".orbit-tl__inner")?.getAttribute("data-px-per-hour")),
        );
        if (!(after > before)) {
          throw new Error(`${viewport.name}: el rango 12 h no acerca el eje (${before} → ${after})`);
        }
        await hideToasts(page);
        await settle(page);
        await page.screenshot({
          path: path.join(output, `orbit-carreras-timeline-zoom12-${viewport.name}.png`),
          fullPage: false,
        });
        await page.getByTestId("orbit-races-tl-controls").getByRole("button", { name: "24 h" }).click();
      }
    }

    await page.close();
  }

  console.log(`Orbit races visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
