import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/02-kit");
const port = 5195;
const url = `http://127.0.0.1:${port}/ui-orbit-harness.html`;
const viewport = { width: 1920, height: 1080 };
// Una captura por grupo del briefing: el kit completo no cabe en 1080 px.
const groups = [
  { id: "primitivos", selector: '[data-group="primitivos"]', file: "orbit-kit-1-primitivos" },
  { id: "estado", selector: '[data-group="estado"]', file: "orbit-kit-2-estado" },
  { id: "contenedores", selector: '[data-group="contenedores"]', file: "orbit-kit-3-contenedores" },
  // El grupo 4 no cabe en 1080 px: se parte en las dos mitades que el harness
  // marca con `data-shot`.
  { id: "visualizacion-a", selector: '[data-shot="visualizacion-a"]', file: "orbit-kit-4a-visualizacion" },
  { id: "visualizacion-b", selector: '[data-shot="visualizacion-b"]', file: "orbit-kit-4b-visualizacion" },
];

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
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: frontend,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  },
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
  throw new Error(`Orbit kit harness did not start.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });

  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByTestId("orbit-kit-harness").waitFor();
  await page.evaluate(async () => { await document.fonts.ready; });

  // Contrato del kit: nada del harness usa `title` nativo (08 · tooltips).
  const nativeTitles = await page.evaluate(
    () => document.querySelectorAll("[title]").length,
  );
  if (nativeTitles > 0) throw new Error(`el kit usa \`title\` nativo en ${nativeTitles} nodos`);

  // Los 3 toasts apilados forman parte del criterio: se disparan antes de la
  // captura del grupo 3 y se capturan dentro de su ventana de 2,6 s.
  for (const group of groups) {
    const section = page.locator(group.selector);
    await section.waitFor();
    if (group.id.startsWith("visualizacion")) {
      // Los toasts del grupo 3 se cierran solos: se esperan para que no tapen
      // las trazas del grupo 4.
      await page.waitForFunction(() => document.querySelectorAll(".orbit-toast").length === 0, undefined, {
        timeout: 6000,
      });
    }
    if (group.id === "visualizacion-b") {
      // `over` y `pulse` de las esquinas son estados de arrastre: se provocan
      // con eventos reales justo antes de la captura (el pulso dura 500 ms).
      const transfer = await page.evaluateHandle(() => {
        const data = new DataTransfer();
        data.setData("text/plain", "SET-03");
        return data;
      });
      await page.dispatchEvent('[data-testid="orbit-corner-slot-RL"]', "dragover", {
        dataTransfer: transfer,
      });
      await page.dispatchEvent('[data-testid="orbit-corner-slot-RR"]', "drop", {
        dataTransfer: transfer,
      });
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="orbit-corner-slot-RR"]')
            ?.getAttribute("data-pulse") === "true",
        undefined,
        { timeout: 2000 },
      );
    }
    if (group.id === "contenedores") {
      await page.getByRole("button", { name: "Lanzar 3 toasts" }).click();
      await page.waitForFunction(
        () => document.querySelectorAll(".orbit-toast").length === 3,
        undefined,
        { timeout: 2000 },
      );
      // El menú desplegable también entra en el criterio: se abre después de
      // los toasts porque cualquier clic fuera lo cerraría.
      await page.getByRole("button", { name: "Acciones del perfil" }).click();
      await page.getByRole("menu").waitFor();
    }
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    if (group.id === "primitivos") {
      // El desplegable del `Select` es del kit, no del sistema operativo: entra
      // en el criterio y se abre tras el scroll porque flota en coordenadas de
      // viewport (portal a `body`).
      await page.getByRole("combobox", { name: "Sistema" }).click();
      const list = page.getByRole("listbox", { name: "Sistema" });
      await list.waitFor();
      const rows = await list.getByRole("option").count();
      if (rows !== 5) throw new Error(`el desplegable pinta ${rows} opciones, se esperaban 5`);
      const nativeSelects = await page.evaluate(() => document.querySelectorAll("select").length);
      if (nativeSelects > 0) throw new Error(`el kit todavia usa ${nativeSelects} \`select\` nativos`);
      await page.waitForTimeout(120);
    }
    await page.screenshot({ path: path.join(output, `${group.file}-1920x1080.png`), fullPage: false });
  }

  // ── Política de scroll (B1) ────────────────────────────────────────────
  // El desplegable largo es el caso que Isaac reportó: la lista desbordaba y
  // asomaba la barra gris del sistema. Se comprueba que desborda de verdad,
  // que la rueda sigue moviéndola y que la barra que pinta es la del kit
  // (6 px, pista transparente, pulgar con el token).
  await page.locator('[data-group="primitivos"]').scrollIntoViewIfNeeded();
  await page.getByRole("combobox", { name: "Circuito" }).click();
  const longList = page.getByRole("listbox", { name: "Circuito" });
  await longList.waitFor();
  const scrollReport = await longList.evaluate((node) => {
    const styles = getComputedStyle(node);
    const bar = getComputedStyle(node, "::-webkit-scrollbar");
    const track = getComputedStyle(node, "::-webkit-scrollbar-track");
    const thumb = getComputedStyle(node, "::-webkit-scrollbar-thumb");
    return {
      overflows: node.scrollHeight > node.clientHeight + 1,
      width: styles.scrollbarWidth,
      barWidth: bar.width,
      trackBg: track.backgroundColor,
      thumbBg: thumb.backgroundColor,
      thumbRadius: thumb.borderTopLeftRadius,
    };
  });
  if (!scrollReport.overflows) {
    throw new Error("el desplegable largo no desborda: el caso de la barra no se está probando");
  }
  if (scrollReport.width !== "thin") {
    throw new Error(`la lista no usa scrollbar fina (scrollbar-width: ${scrollReport.width})`);
  }
  if (scrollReport.barWidth !== "6px") {
    throw new Error(`la barra mide ${scrollReport.barWidth}, se esperaban 6px`);
  }
  if (scrollReport.trackBg !== "rgba(0, 0, 0, 0)") {
    throw new Error(`la pista de la barra no es transparente (${scrollReport.trackBg})`);
  }
  if (scrollReport.thumbRadius === "0px") {
    throw new Error("el pulgar de la barra no está redondeado");
  }
  if (!scrollReport.thumbBg.startsWith("rgba(255, 255, 255")) {
    throw new Error(`el pulgar no usa el token del kit (${scrollReport.thumbBg})`);
  }
  // La rueda del ratón sigue desplazando: la política pinta, no desactiva.
  await longList.hover();
  await page.mouse.wheel(0, 200);
  await page.waitForFunction(
    () => (document.querySelector(".orbit-select__list")?.scrollTop ?? 0) > 0,
    undefined,
    { timeout: 2000 },
  );
  await page.waitForTimeout(160);
  await page.screenshot({
    path: path.join(output, "orbit-kit-5-scroll-1920x1080.png"),
    fullPage: false,
  });
  await page.keyboard.press("Escape");

  if (problems.length) throw new Error(`la consola no está limpia\n${problems.join("\n")}`);
  await page.close();
  console.log(`Orbit kit visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
