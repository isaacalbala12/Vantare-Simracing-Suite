import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { hideToasts, settle, stillPage } from "./lib/orbit-still.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/07-estrategia");
const port = 5199;
const url = `http://127.0.0.1:${port}/orbit-strategy-harness.html?view=estrategia`;

// Reloj congelado: la columna calcula las próximas salidas del calendario real.
const FROZEN_CLOCK = new Date("2026-07-07T18:07:30Z");

const viewports = [
  { name: "1920x1080", width: 1920, height: 1080, editor: true },
  { name: "1920x900", width: 1920, height: 900, editor: false },
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
  // El runtime simulado publica el evento activo (`strategy:roster`) y atiende
  // los comandos del editor real, que es de donde sale el inventario.
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
  throw new Error(`Orbit strategy harness did not start.\n${serverOutput}`);
}

function contractOf() {
  const root = document.querySelector(".orbit-strategy");
  const list = document.querySelector('[data-testid="orbit-strategy-list"]');
  return {
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    stints: document.querySelectorAll('[data-testid^="orbit-stint-"]').length,
    listScrollY: list ? list.scrollHeight > list.clientHeight + 0.5 : null,
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
    await page.getByTestId("orbit-strategy").waitFor();
    await page.getByTestId("orbit-strategy-overview").waitFor();
    await page.getByTestId("orbit-stint-0").waitFor();
    await hideToasts(page);
    await settle(page);

    const summary = await page.evaluate(contractOf);
    if (summary.scrollHeight > summary.innerHeight) {
      throw new Error(`${viewport.name}: la página hace scroll vertical (${summary.scrollHeight} > ${summary.innerHeight})`);
    }
    if (summary.scrollWidth > summary.innerWidth) {
      throw new Error(`${viewport.name}: la página hace scroll horizontal (${summary.scrollWidth} > ${summary.innerWidth})`);
    }
    if (summary.stints < 3) {
      throw new Error(`${viewport.name}: solo ${summary.stints} stints en la lista`);
    }
    if (summary.listScrollY !== true) {
      throw new Error(`${viewport.name}: la lista de stints no tiene scroll interno`);
    }
    if (summary.nativeTitles !== 0) {
      throw new Error(`${viewport.name}: la vista usa \`title\` nativo (${summary.nativeTitles})`);
    }

    await hideToasts(page);

    await settle(page);
    await page.screenshot({
      path: path.join(output, `orbit-estrategia-resumen-${viewport.name}.png`),
      fullPage: false,
    });

    if (viewport.editor) {
      // Neumáticos → elegir un juego → abrir el stint 1 → soltarlo en FL.
      await page.getByRole("button", { name: "Neumáticos", exact: true }).click();
      await page.getByTestId("orbit-strategy-tyres").waitFor();
      const tyre = page.locator('[data-testid^="orbit-tyre-item-"]').last();
      const tyreId = await tyre.getAttribute("data-testid");
      await tyre.click();

      await page.getByTestId("orbit-stint-edit-0").click();
      const slot = page.getByTestId("orbit-corner-slot-FL");
      await slot.waitFor();
      await slot.press("Enter");

      const mounted = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="orbit-corner-slot-FL"]');
        return {
          state: node?.getAttribute("data-state") ?? null,
          text: node?.textContent ?? "",
          editorVisible: document.querySelectorAll('[data-testid="orbit-stint-editor-0"]').length,
          nativeTitles: document.querySelector(".orbit-strategy")?.querySelectorAll("[title]").length ?? -1,
        };
      });
      const wanted = (tyreId ?? "").replace("orbit-tyre-item-", "");
      if (mounted.editorVisible !== 1) {
        throw new Error(`${viewport.name}: el editor del stint 1 no está montado`);
      }
      if (mounted.state !== "filled" || !mounted.text.includes(wanted)) {
        throw new Error(`${viewport.name}: FL no recibió ${wanted} (estado ${mounted.state})`);
      }
      if (mounted.nativeTitles !== 0) {
        throw new Error(`${viewport.name}: el editor usa \`title\` nativo`);
      }

      await hideToasts(page);

      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-estrategia-editor-neumaticos-${viewport.name}.png`),
        fullPage: false,
      });
    }

    // ── ⚙ Ajustes: abre con el botón y cierra con Esc (briefing 07 · parte B).
    await page.getByTestId("orbit-strategy-settings").click();
    await page.getByRole("menu").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "detached" });
    if ((await page.getByTestId("orbit-strategy-settings").getAttribute("aria-expanded")) !== "false") {
      throw new Error(`${viewport.name}: el menú ⚙ no cerró con Esc`);
    }

    // ── Estrategias: tarjetas + comparación con veredicto visible.
    await page.getByRole("tab", { name: "Estrategias", exact: true }).click();
    await page.getByTestId("orbit-strategy-strategies").waitFor();
    const verdict = page.getByTestId("orbit-strategy-verdict");
    await verdict.waitFor();
    const verdictText = (await verdict.textContent()) ?? "";
    if (!verdictText.includes("dobla turno")) {
      throw new Error(`${viewport.name}: la comparación no muestra veredicto (${verdictText})`);
    }
    const stratsScroll = await page.evaluate(contractOf);
    if (stratsScroll.scrollHeight > stratsScroll.innerHeight) {
      throw new Error(`${viewport.name}: Estrategias hace scroll de página`);
    }
    if (stratsScroll.nativeTitles !== 0) {
      throw new Error(`${viewport.name}: Estrategias usa \`title\` nativo`);
    }
    if (viewport.editor) {
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-estrategia-estrategias-${viewport.name}.png`),
        fullPage: false,
      });
    }

    // La tarjeta «+ Nueva estrategia» crea y activa (después de la captura).
    const before = await page.locator('[data-testid^="orbit-strat-local"]').count();
    await page.getByTestId("orbit-strategy-new-card").click();
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-testid^="orbit-strat-local"]').length > n,
      before,
    );
    if ((await page.getByTestId("orbit-strategy-name").textContent()) !== "Estrategia #3") {
      throw new Error(`${viewport.name}: la estrategia nueva no quedó activa`);
    }

    // ── Disponibilidad: tablero + formulario con recorte.
    await page.getByRole("tab", { name: "Disponibilidad de pilotos", exact: true }).click();
    await page.getByTestId("orbit-strategy-availability").waitFor();
    // El `Select` del kit es un combobox propio: se abre y se elige la opción.
    await page.getByRole("combobox", { name: "Estado" }).click();
    await page.getByRole("option", { name: "No disponible" }).click();
    await page.getByLabel("Desde").fill("15:00");
    await page.getByLabel("Hasta").fill("16:00");
    await page.getByRole("button", { name: "Añadir tramo" }).click();
    const cells = await page.getByTestId("orbit-availability-cell").count();
    if (cells < 5) {
      throw new Error(`${viewport.name}: el recorte no partió el tramo (${cells} segmentos)`);
    }
    const availScroll = await page.evaluate(contractOf);
    if (availScroll.scrollHeight > availScroll.innerHeight) {
      throw new Error(`${viewport.name}: Disponibilidad hace scroll de página`);
    }
    if (availScroll.nativeTitles !== 0) {
      throw new Error(`${viewport.name}: Disponibilidad usa \`title\` nativo`);
    }
    if (viewport.editor) {
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-estrategia-disponibilidad-${viewport.name}.png`),
        fullPage: false,
      });
    }

    // ── Menú de entrada: Continuar, Nueva estrategia y las guardadas (ISA-377).
    await page.getByTestId("orbit-strategy-new-event").click();
    await page.getByTestId("orbit-strategy-home").waitFor();
    await page.getByTestId("orbit-strategy-saved-list").waitFor();
    // El evento que acabamos de dejar es el que ofrece «Continuar».
    const continueCard = page.getByTestId("orbit-strategy-continue");
    await continueCard.waitFor();
    const continueText = (await continueCard.textContent()) ?? "";
    if (!continueText.includes("Última edición")) {
      throw new Error(`${viewport.name}: la tarjeta Continuar no dice la última edición`);
    }
    const homeScroll = await page.evaluate(contractOf);
    if (homeScroll.scrollHeight > homeScroll.innerHeight) {
      throw new Error(`${viewport.name}: el menú de entrada hace scroll de página`);
    }
    if (homeScroll.nativeTitles !== 0) {
      throw new Error(`${viewport.name}: el menú de entrada usa \`title\` nativo`);
    }
    if (viewport.editor) {
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-estrategia-menu-${viewport.name}.png`),
        fullPage: false,
      });
    }

    // ── El diálogo de borrado es del kit, nunca un `confirm` nativo.
    const firstDelete = page.locator('[data-testid^="orbit-strategy-delete-"]').first();
    const deletable = (await firstDelete.count()) > 0;
    if (deletable) {
      await firstDelete.click();
      await page.getByTestId("orbit-strategy-delete-dialog").waitFor();
      if (viewport.editor) {
        await hideToasts(page);
        await settle(page);
        await page.screenshot({
          path: path.join(output, `orbit-estrategia-borrar-${viewport.name}.png`),
          fullPage: false,
        });
      }
      await page.keyboard.press("Escape");
      await page.getByTestId("orbit-strategy-delete-dialog").waitFor({ state: "detached" });
    }

    // ── Asistente: origen (automática deshabilitada), equipo y punto de partida.
    await page.getByTestId("orbit-strategy-new-strategy").click();
    await page.getByTestId("orbit-strategy-wizard").waitFor();
    const auto = page.getByTestId("orbit-strategy-wizard-auto-action");
    if (!(await auto.isDisabled())) {
      throw new Error(`${viewport.name}: la vía automática debería estar deshabilitada`);
    }
    if (!((await auto.getAttribute("data-tip")) ?? "").includes("ADR 0005")) {
      throw new Error(`${viewport.name}: la vía automática no dice por qué no está`);
    }
    if (viewport.editor) {
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-estrategia-asistente-origen-${viewport.name}.png`),
        fullPage: false,
      });
    }
    await page.getByTestId("orbit-strategy-wizard-manual").click();
    await page.getByTestId("orbit-strategy-wizard-team").waitFor();
    if (viewport.editor) {
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-estrategia-asistente-equipo-${viewport.name}.png`),
        fullPage: false,
      });
    }
    await page.getByTestId("orbit-strategy-wizard-team").click();
    await page.getByTestId("orbit-strategy-paths").waitFor();
    const pathsScroll = await page.evaluate(contractOf);
    if (pathsScroll.scrollHeight > pathsScroll.innerHeight) {
      throw new Error(`${viewport.name}: el selector de eventos hace scroll de página`);
    }
    if (pathsScroll.nativeTitles !== 0) {
      throw new Error(`${viewport.name}: el selector usa \`title\` nativo`);
    }
    // El hueco bajo las dos tarjetas lo llena la lista recomendada (D-R3-E-1).
    await page.getByTestId("orbit-strategy-recommended").waitFor();
    // El camino «Desde un evento» lista las series reales del calendario.
    await page.getByTestId("orbit-strategy-path-series").click();
    await page.getByTestId("orbit-strategy-series").waitFor();
    if (viewport.editor) {
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-estrategia-selector-${viewport.name}.png`),
        fullPage: false,
      });
    }

    await page.getByTestId("orbit-strategy-path-own").click();
    await page.getByTestId("orbit-strategy-form").waitFor();
    await page.getByLabel("Nombre del evento").fill("Enduro de casa");
    await page.getByLabel("Circuito").fill("Motorland Aragón");
    await page.getByLabel("Clase").fill("GT3");
    await page.getByRole("button", { name: "2 h", exact: true }).click();
    await page.getByTestId("orbit-strategy-form-add-driver").click();
    await page.getByLabel("Nombre del piloto 2").fill("Sol Martín");
    const formScroll = await page.evaluate(contractOf);
    if (formScroll.scrollWidth > formScroll.innerWidth) {
      throw new Error(`${viewport.name}: el formulario hace scroll horizontal`);
    }
    if (formScroll.nativeTitles !== 0) {
      throw new Error(`${viewport.name}: el formulario usa \`title\` nativo`);
    }
    if (viewport.editor) {
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-estrategia-formulario-${viewport.name}.png`),
        fullPage: false,
      });
    }

    await page.getByTestId("orbit-strategy-form-submit").click();
    await page.getByTestId("orbit-strategy-overview").waitFor();
    await page.getByTestId("orbit-stint-0").waitFor();
    const created = await page.evaluate(() => ({
      ...(() => {
        const root = document.querySelector(".orbit-strategy");
        return {
          nativeTitles: root ? root.querySelectorAll("[title]").length : -1,
          scrollHeight: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight,
        };
      })(),
      title: document.querySelector(".orbit-strategy__copy h2")?.textContent ?? "",
      events: document.querySelectorAll('[data-testid="orbit-strategy-events"] button').length,
    }));
    if (created.title !== "Enduro de casa") {
      throw new Error(`${viewport.name}: el evento propio no quedó activo (${created.title})`);
    }
    if (created.events < 2) {
      throw new Error(`${viewport.name}: la columna no lista los dos eventos (${created.events})`);
    }
    if (created.scrollHeight > created.innerHeight) {
      throw new Error(`${viewport.name}: el Resumen del evento propio hace scroll de página`);
    }
    if (created.nativeTitles !== 0) {
      throw new Error(`${viewport.name}: el Resumen del evento propio usa \`title\` nativo`);
    }
    if (viewport.editor) {
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-estrategia-evento-propio-${viewport.name}.png`),
        fullPage: false,
      });
    }

    if (problems.length) {
      throw new Error(`${viewport.name}: la consola no está limpia\n${problems.join("\n")}`);
    }

    await page.close();
  }

  console.log(`Orbit strategy visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
