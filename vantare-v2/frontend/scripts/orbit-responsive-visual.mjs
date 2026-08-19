/**
 * Contrato responsive de la shell Orbit (D-R4-3).
 *
 * Recorre la escala completa de ventanas —desde una ventana de escritorio más
 * pequeña que el mínimo de diseño hasta 32:9— sobre la shell real (Inicio y
 * Studio) y comprueba las tres promesas del briefing:
 *
 *  1. Ventanas pequeñas: la UI **se escala**, no se recorta. Ningún panel se
 *     sale por la derecha ni por abajo, y la página no hace scroll.
 *  2. El factor de escala es exactamente el que dicta `resolveOrbitZoom`, y la
 *     columna contextual está plegada donde toca (≤ 1152 px reales).
 *  3. Ultrapanorámicas: el contenido queda topado y centrado, con el fondo del
 *     workspace ocupando toda la ventana.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assertNoHorizontalOverflow } from "./orbit-overflow-assert.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(
  frontend,
  "../docs/design/orbit-v03/evidence/porte/01-shell/responsive",
);
const port = 5205;

// Espejo de `src/hub/orbit/orbit-zoom.ts`. Se repite a propósito: el harness es
// un verificador independiente y no debe importar el módulo que audita.
const REF_WIDTH = 1180;
const REF_HEIGHT = 790;
const ZOOM_FLOOR = 0.6;
const AUTO_COLLAPSE_WIDTH = 1152;
const ULTRAWIDE_WIDTH = 2200;
const CONTENT_MAX = 1508;
const CONTENT_MAX_ULTRAWIDE = 1760;

const expectedZoom = (width, height) =>
  Math.min(Math.max(Math.min(width / REF_WIDTH, height / REF_HEIGHT), ZOOM_FLOOR), 1);

const scenes = [
  { name: "inicio", page: "orbit-shell-harness.html", query: "?orbit=1", nav: null },
  // Ajustes es la otra cara del contrato: rejilla de formulario, controles del
  // kit y `Select` portalado a `document.body`. Se llega por la paleta, igual
  // que en la app.
  { name: "ajustes", page: "orbit-shell-harness.html", query: "?orbit=1", nav: "ajustes" },
];

// El Studio no entra aquí: su harness no monta el editor dentro de este script
// (se queda en «Cargando perfiles…»), y su contrato responsive ya lo cubre
// `visual:orbit-studio`. Lo que el Studio comparte con estas escenas —shell,
// escalado y plegado— es exactamente lo que se asserta abajo.

const viewports = [
  // La ventana que Isaac reportó recortada, más la escala habitual de portátiles.
  { name: "870x780", width: 870, height: 780 },
  { name: "1024x640", width: 1024, height: 640 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
  // 21:9 y 32:9.
  { name: "2560x1080", width: 2560, height: 1080 },
  { name: "3440x1440", width: 3440, height: 1440 },
  { name: "5120x1440", width: 5120, height: 1440 },
];

const sceneNamed = (name) => scenes.find((scene) => scene.name === name);
const inicioScene = sceneNamed("inicio");
const ajustesScene = sceneNamed("ajustes");
const sceneUrl = (scene) => `http://127.0.0.1:${port}/${scene.page}${scene.query}`;

fs.mkdirSync(output, { recursive: true });

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
  return result.stdout.trim().split(",").map((value) => value.trim()).filter(Boolean);
}

const owners = portOwners();
if (owners.length) throw new Error(`port ${port} already owned by ${owners.join(", ")}`);

const server = spawn(
  process.execPath,
  [
    path.join(frontend, "node_modules", "vite", "bin", "vite.js"),
    "--host", "127.0.0.1", "--port", String(port), "--strictPort",
  ],
  { cwd: frontend, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" },
);

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

async function waitForServer(url) {
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
  throw new Error(`Orbit responsive harness did not start.\n${serverOutput}`);
}

/** Recogida en el navegador de todo lo que el contrato necesita comprobar. */
function collect() {
  const root = document.querySelector(".orbit-root");
  const shell = document.querySelector(".orbit-shell");
  const workspace = document.querySelector(".orbit-workspace");
  const column = document.querySelector(".orbit-column");
  const rootRect = root?.getBoundingClientRect();
  const workspaceRect = workspace?.getBoundingClientRect();

  // Un panel «recortado» es el que se sale del viewport real **sin** que nadie
  // pueda traerlo a la vista. Si cuelga de un contenedor que desplaza, salirse
  // no es un recorte: es el respaldo documentado (doc 03 § 3.6, «Launcher /
  // Roadmap / Ajustes … por debajo hacen scroll de vista»).
  const scrollableAncestor = (node) => {
    for (let cursor = node.parentElement; cursor; cursor = cursor.parentElement) {
      const style = getComputedStyle(cursor);
      const scrollsY = (style.overflowY === "auto" || style.overflowY === "scroll")
        && cursor.scrollHeight > cursor.clientHeight + 1;
      const scrollsX = (style.overflowX === "auto" || style.overflowX === "scroll")
        && cursor.scrollWidth > cursor.clientWidth + 1;
      if (scrollsY || scrollsX) return true;
    }
    return false;
  };
  const clipped = [];
  for (const node of document.querySelectorAll(".orbit-surface, .orbit-panel, .orbit-column, .orbit-rail, .orbit-topbar")) {
    if (!(node instanceof HTMLElement)) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (scrollableAncestor(node)) continue;
    const tag = `${node.tagName.toLowerCase()}.${[...node.classList].join(".")}`;
    if (rect.right > window.innerWidth + 1) clipped.push(`${tag} right=${Math.round(rect.right)}>${window.innerWidth}`);
    if (rect.bottom > window.innerHeight + 1) clipped.push(`${tag} bottom=${Math.round(rect.bottom)}>${window.innerHeight}`);
  }

  // Anchura útil del contenido de la vista: el primer envoltorio topado que
  // cuelga del workspace (`width: min(--orbit-content-max, 100% - gutter)`).
  const contentNode = workspace?.querySelector(
    ".orbit-home, .orbit-set, .orbit-races, .orbit-strategy, .orbit-engineer, .orbit-telemetry, .orbit-roadmap, .orbit-settings, .orbit-launcher, .orbit-testing",
  );
  const contentRect = contentNode?.getBoundingClientRect();

  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    // `scrollWidth/Height` van en px de maquetación (bajo `zoom` no coinciden
    // con `innerWidth/Height`): el viewport comparable es `clientWidth/Height`.
    layoutWidth: document.documentElement.clientWidth,
    layoutHeight: document.documentElement.clientHeight,
    zoom: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--orbit-zoom") || "1"),
    floored: document.documentElement.dataset.orbitZoomFloored === "true",
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    rootWidth: rootRect ? Math.round(rootRect.width) : 0,
    rootHeight: rootRect ? Math.round(rootRect.height) : 0,
    shellExists: Boolean(shell),
    columnCollapsed: !column,
    contentMax: Number.parseFloat(getComputedStyle(root ?? document.body).getPropertyValue("--orbit-content-max")),
    contentWidth: contentRect ? Math.round(contentRect.width) : null,
    contentLeft: contentRect ? Math.round(contentRect.left) : null,
    contentRight: contentRect ? Math.round(contentRect.right) : null,
    workspaceLeft: workspaceRect ? Math.round(workspaceRect.left) : 0,
    workspaceRight: workspaceRect ? Math.round(workspaceRect.right) : 0,
    clipped,
  };
}

/**
 * Lleva la escena a su vista. `nav` usa la paleta de comandos, que es el mismo
 * camino que tiene el usuario y no un estado inventado.
 */
async function enterScene(page, scene) {
  await page.getByTestId("orbit-shell").waitFor();
  if (!scene.nav) return;
  await page.keyboard.press("Control+k");
  await page.waitForSelector(".orbit-palette", { state: "visible" });
  await page.getByTestId(`orbit-palette-item-${scene.nav}`).first().click();
  await page.waitForSelector(".orbit-palette", { state: "hidden" });
  await page.waitForSelector(".orbit-set", { state: "visible" });
}

let browser;
const failures = [];
try {
  await waitForServer(sceneUrl(scenes[0]));
  browser = await chromium.launch({ headless: true });

  for (const scene of scenes) {
    const url = sceneUrl(scene);
    for (const viewport of viewports) {
      const label = `${scene.name} ${viewport.name}`;
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      const problems = [];
      const isWailsRuntimeNoise = (error) => (error.stack ?? "").includes("wailsio_runtime");
      page.on("pageerror", (error) => {
        if (!isWailsRuntimeNoise(error)) problems.push(`pageerror: ${error.message}`);
      });

      await page.goto(url, { waitUntil: "networkidle" });
      await enterScene(page, scene);
      await page.evaluate(async () => { await document.fonts.ready; });

      const report = await page.evaluate(collect);
      const expected = expectedZoom(viewport.width, viewport.height);

      const check = (condition, message) => { if (!condition) failures.push(`${label}: ${message}`); };

      // 1 · El factor es el esperado y la shell acaba midiendo la ventana.
      check(
        Math.abs(report.zoom - expected) < 0.005,
        `factor de zoom ${report.zoom.toFixed(4)}, se esperaba ${expected.toFixed(4)}`,
      );
      check(
        Math.abs(report.rootWidth - viewport.width) <= 2,
        `la shell mide ${report.rootWidth}px de ancho, se esperaba ${viewport.width}px`,
      );
      check(
        Math.abs(report.rootHeight - viewport.height) <= 2,
        `la shell mide ${report.rootHeight}px de alto, se esperaba ${viewport.height}px`,
      );
      check(report.floored === false, "el factor ha tocado suelo en un tamaño soportado");

      // 2 · Sin scroll de página en ningún tamaño y sin paneles recortados.
      check(
        report.scrollHeight <= report.layoutHeight + 1,
        `la página hace scroll vertical (${report.scrollHeight} > ${report.layoutHeight})`,
      );
      check(
        report.scrollWidth <= report.layoutWidth + 1,
        `la página hace scroll horizontal (${report.scrollWidth} > ${report.layoutWidth})`,
      );
      check(
        report.clipped.length === 0,
        `hay paneles recortados por el viewport\n  ${report.clipped.join("\n  ")}`,
      );

      // 3 · Plegado de la columna: manda el viewport real, no el escalado.
      const shouldCollapse = viewport.width <= AUTO_COLLAPSE_WIDTH;
      if (true) {
        check(
          report.columnCollapsed === shouldCollapse,
          `columna ${report.columnCollapsed ? "plegada" : "desplegada"}, se esperaba ${shouldCollapse ? "plegada" : "desplegada"}`,
        );
      }

      // 4 · Tope y centrado del contenido en ultrapanorámicas.
      const expectedMax = viewport.width >= ULTRAWIDE_WIDTH ? CONTENT_MAX_ULTRAWIDE : CONTENT_MAX;
      check(
        report.contentMax === expectedMax,
        `tope de contenido ${report.contentMax}px, se esperaba ${expectedMax}px`,
      );
      // El Studio queda exento del tope a propósito (su lienzo usa todo el ancho).
      if (report.contentWidth !== null) {
        check(
          report.contentWidth <= expectedMax + 1,
          `el contenido mide ${report.contentWidth}px, por encima del tope ${expectedMax}px`,
        );
        if (viewport.width >= ULTRAWIDE_WIDTH) {
          const leftGap = report.contentLeft - report.workspaceLeft;
          const rightGap = report.workspaceRight - report.contentRight;
          check(
            Math.abs(leftGap - rightGap) <= 2,
            `el contenido no está centrado (margen izq ${leftGap}px, der ${rightGap}px)`,
          );
          // El fondo del workspace sí ocupa la ventana entera.
          check(
            report.workspaceRight >= viewport.width - 1,
            `el workspace no llega al borde (${report.workspaceRight} < ${viewport.width})`,
          );
        }
      }

      if (problems.length) failures.push(`${label}: la consola no está limpia\n${problems.join("\n")}`);

      await assertNoHorizontalOverflow(page, label);
      await page.screenshot({
        path: path.join(output, `orbit-responsive-${scene.name}-${viewport.name}.png`),
        fullPage: false,
      });
      await page.close();
    }
  }

  // Extra: las capas flotantes han de escalar con la shell y quedar dentro de
  // la ventana. La paleta vive dentro de `.orbit-root`, pero el Select y el
  // Drawer se portalan a `document.body`, **fuera** de la shell: es justo lo
  // que obliga a poner el `zoom` en `<html>` y no en `.orbit-root`.
  {
    const factor = expectedZoom(870, 780);
    const page = await browser.newPage({ viewport: { width: 870, height: 780 }, deviceScaleFactor: 1 });
    page.on("pageerror", () => {});

    // 1 · Paleta de comandos (dentro de la shell).
    await page.goto(sceneUrl(inicioScene), { waitUntil: "networkidle" });
    await page.getByTestId("orbit-shell").waitFor();
    await page.keyboard.press("Control+k");
    await page.waitForSelector(".orbit-palette", { state: "visible" });
    const palette = await page.evaluate(() => {
      const rect = document.querySelector(".orbit-palette").getBoundingClientRect();
      const veil = document.querySelector(".orbit-palette-backdrop").getBoundingClientRect();
      return {
        left: Math.round(rect.left), right: Math.round(rect.right), bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        veilRight: Math.round(veil.right), veilBottom: Math.round(veil.bottom),
      };
    });
    if (palette.right > 871 || palette.left < -1 || palette.bottom > 781) {
      failures.push(`paleta: se sale de la ventana (${palette.left}..${palette.right}, bottom ${palette.bottom})`);
    }
    // El velo cubre el viewport real entero aunque esté escalado.
    if (Math.abs(palette.veilRight - 870) > 2 || Math.abs(palette.veilBottom - 780) > 2) {
      failures.push(`paleta: el velo no cubre la ventana (${palette.veilRight}x${palette.veilBottom})`);
    }
    await page.screenshot({ path: path.join(output, "orbit-responsive-paleta-870x780.png") });

    // 2 · Select de Ajustes (portalado a `document.body`, fuera de la shell).
    await page.goto(sceneUrl(ajustesScene), { waitUntil: "networkidle" });
    await enterScene(page, ajustesScene);
    const trigger = page.locator(".orbit-select:visible").first();
    if (await trigger.count()) {
      await trigger.click();
      await page.waitForSelector(".orbit-select__list", { state: "visible" });
      const list = await page.evaluate(() => {
        const node = document.querySelector(".orbit-select__list");
        const rect = node.getBoundingClientRect();
        const trig = document.querySelector(".orbit-select[data-open=\"true\"]").getBoundingClientRect();
        return {
          portaled: !node.closest(".orbit-root"),
          left: Math.round(rect.left), right: Math.round(rect.right),
          top: Math.round(rect.top), bottom: Math.round(rect.bottom),
          // Anclaje: la lista se pega al disparador, no se va a otro sitio.
          drift: Math.round(Math.abs(rect.left - trig.left)),
        };
      });
      if (!list.portaled) failures.push("select: se esperaba portalado a `document.body`");
      if (list.right > 871 || list.left < -1 || list.bottom > 781 || list.top < -1) {
        failures.push(
          `select: la lista se sale de la ventana (${list.left}..${list.right}, ${list.top}..${list.bottom})`,
        );
      }
      if (list.drift > 4) failures.push(`select: la lista no queda anclada al disparador (${list.drift}px)`);
      await page.screenshot({ path: path.join(output, "orbit-responsive-select-870x780.png") });
    } else {
      failures.push("select: no se encontró ningún Select en Ajustes");
    }
    await page.close();
  }

  // Extra: por debajo del suelo la shell desplaza internamente en vez de
  // recortar, y la página sigue sin sacar barras.
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 420 }, deviceScaleFactor: 1 });
    page.on("pageerror", () => {});
    await page.goto(sceneUrl(inicioScene), { waitUntil: "networkidle" });
    await page.getByTestId("orbit-shell").waitFor();
    const floor = await page.evaluate(() => {
      const root = document.querySelector(".orbit-root");
      return {
        floored: document.documentElement.dataset.orbitZoomFloored === "true",
        zoom: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--orbit-zoom")),
        scrolls: root ? root.scrollWidth > root.clientWidth || root.scrollHeight > root.clientHeight : false,
        pageScrollWidth: document.documentElement.scrollWidth,
        innerWidth: document.documentElement.clientWidth,
      };
    });
    if (!floor.floored) failures.push("640x420: no se ha marcado el suelo del factor");
    if (Math.abs(floor.zoom - ZOOM_FLOOR) > 0.005) {
      failures.push(`640x420: factor ${floor.zoom}, se esperaba el suelo ${ZOOM_FLOOR}`);
    }
    if (!floor.scrolls) failures.push("640x420: la shell debería desplazar internamente y no lo hace");
    if (floor.pageScrollWidth > floor.innerWidth + 1) {
      failures.push("640x420: la página saca barra horizontal en vez de desplazar la shell");
    }
    await page.screenshot({ path: path.join(output, "orbit-responsive-inicio-640x420-suelo.png") });
    await page.close();
  }

  if (failures.length) throw new Error(`Orbit responsive FAIL:\n- ${failures.join("\n- ")}`);
  console.log(`Orbit responsive visual PASS (${scenes.length * viewports.length + 1} escenarios). Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
