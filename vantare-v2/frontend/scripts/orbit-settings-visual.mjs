import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/11-ajustes");
const port = 5201;
const base = `http://127.0.0.1:${port}/orbit-settings-harness.html?view=ajustes`;
const url = (section) => `${base}&settings=${section}`;

const SECTIONS = ["account", "application", "updates", "hotkeys", "diagnostics"];

const shots = [
  { name: "1920x1080", width: 1920, height: 1080, sections: SECTIONS, noPageScroll: true },
  { name: "1920x900", width: 1920, height: 900, sections: ["account", "hotkeys"], noPageScroll: false },
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
      const request = http.get(url("account"), (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Orbit settings harness did not start.\n${serverOutput}`);
}

function contractOf() {
  const root = document.querySelector(".orbit-set");
  const column = document.querySelector(".orbit-column");
  return {
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    section: root ? root.getAttribute("data-section") : null,
    title: document.querySelector('[data-testid="orbit-settings-title"]')?.textContent ?? "",
    lead: document.querySelector('[data-testid="orbit-settings-lead"]')?.textContent ?? "",
    contextRows: document.querySelectorAll('[data-testid="orbit-settings-context"] .orbit-row').length,
    // La fila activa se tiñe con el degradado `--orbit-selection-bg` del kit.
    // Si alguna hoja de página resetea `.orbit-row { background }` despues del
    // kit, la seleccion queda plana y no hay forma de saber dónde estás: aquí
    // se exige que la fila activa tenga un `background-image` real.
    selectedRows: document.querySelectorAll('[data-testid="orbit-settings-context"] .orbit-row--sel').length,
    selectedTinted: [
      ...document.querySelectorAll('[data-testid="orbit-settings-context"] .orbit-row--sel'),
    ].every((node) => getComputedStyle(node).backgroundImage !== "none"),
    // La regla del briefing 01: en Ajustes la columna no muestra ningún bloque
    // persistente, solo la navegación de secciones.
    persistentBlocks: document.querySelectorAll('[data-testid="orbit-column-blocks"]').length,
    panels: document.querySelectorAll('[data-testid^="orbit-settings-panel-"]').length,
    // El `title` nativo está prohibido en la vista y en su columna (`08 · a11y`).
    nativeTitles: [...document.querySelectorAll(".orbit-set, .orbit-set__context")]
      .reduce((total, node) => total + node.querySelectorAll("[title]").length, 0)
      + (root && root.hasAttribute("title") ? 1 : 0)
      + (column ? column.querySelectorAll(".orbit-set__context [title]").length : 0),
  };
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const shot of shots) {
    for (const section of shot.sections) {
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

      await page.goto(url(section), { waitUntil: "networkidle" });
      await page.getByTestId("orbit-settings").waitFor();
      await page.getByTestId(`orbit-settings-panel-${section}`).waitFor();
      await page.evaluate(async () => { await document.fonts.ready; });

      const label = `${section}-${shot.name}`;
      const summary = await page.evaluate(contractOf);

      if (summary.section !== section) {
        throw new Error(`${label}: la vista está en «${summary.section}» y se pidió «${section}»`);
      }
      if (summary.panels !== 1) {
        throw new Error(`${label}: hay ${summary.panels} paneles pintados a la vez`);
      }
      if (!summary.title.trim() || !summary.lead.trim()) {
        throw new Error(`${label}: la cabecera no dice título y lead de la sección`);
      }
      if (summary.contextRows !== 5) {
        throw new Error(`${label}: la columna lista ${summary.contextRows} secciones (esperadas 5)`);
      }
      if (summary.selectedRows !== 1) {
        throw new Error(`${label}: la columna marca ${summary.selectedRows} filas activas (esperada 1)`);
      }
      if (!summary.selectedTinted) {
        throw new Error(`${label}: la fila activa no lleva el degradado \`--orbit-selection-bg\` (background-image: none)`);
      }
      if (summary.persistentBlocks !== 0) {
        throw new Error(`${label}: la columna sigue mostrando bloques persistentes`);
      }
      if (summary.nativeTitles !== 0) {
        throw new Error(`${label}: la vista usa \`title\` nativo (${summary.nativeTitles})`);
      }
      if (shot.noPageScroll && summary.scrollHeight > summary.innerHeight) {
        throw new Error(`${label}: la página hace scroll vertical (${summary.scrollHeight} > ${summary.innerHeight})`);
      }
      if (summary.scrollWidth > summary.innerWidth) {
        throw new Error(`${label}: la página hace scroll horizontal (${summary.scrollWidth} > ${summary.innerWidth})`);
      }

      await page.screenshot({
        path: path.join(output, `orbit-ajustes-${label}.png`),
        fullPage: false,
      });

      // ── Navegación por la columna: la cabecera y el panel cambian juntos.
      if (shot.noPageScroll && section === "account") {
        await page.getByTestId("orbit-settings-context").locator(".orbit-row").nth(3).click();
        await page.getByTestId("orbit-settings-panel-hotkeys").waitFor();
        const moved = await page.evaluate(contractOf);
        if (moved.section !== "hotkeys") {
          throw new Error(`${label}: la columna no cambió de sección (${moved.section})`);
        }
        if (moved.title === summary.title || moved.lead === summary.lead) {
          throw new Error(`${label}: la cabecera no cambió al navegar`);
        }
        if (moved.nativeTitles !== 0) {
          throw new Error(`${label}: la vista usa \`title\` nativo tras navegar`);
        }
        if (moved.scrollHeight > moved.innerHeight) {
          throw new Error(`${label}: la página hace scroll tras navegar`);
        }
      }

      // ── Actualizaciones: cada tarjeta de canal enseña la versión de SU canal.
      // Con el canal Stable activo la tarjeta de Testers llegó a lucir una
      // nightly porque se clasificaba por `prerelease` a secas (ISA-368).
      if (shot.noPageScroll && section === "updates") {
        await page.getByTestId("orbit-settings-channels").waitFor();
        await page.waitForFunction(() =>
          (document.querySelector('[data-testid="orbit-settings-channel-stable"]')?.textContent ?? "")
            .includes("v0."),
        );
        const cards = await page.evaluate(() =>
          ["stable", "testers", "nightly"].map((channel) => ({
            channel,
            text: document.querySelector(`[data-testid="orbit-settings-channel-${channel}"]`)?.textContent ?? "",
          })),
        );
        const marker = { stable: null, testers: "testers", nightly: "nightly" };
        const foreign = { stable: ["nightly", "testers"], testers: ["nightly"], nightly: ["testers"] };
        for (const card of cards) {
          if (!/v\d+\.\d+/.test(card.text)) {
            throw new Error(`${label}: la tarjeta «${card.channel}» no enseña ninguna versión`);
          }
          if (marker[card.channel] && !card.text.includes(marker[card.channel])) {
            throw new Error(`${label}: la tarjeta «${card.channel}» no enseña una release de su canal`);
          }
          for (const alien of foreign[card.channel]) {
            if (card.text.includes(alien)) {
              throw new Error(`${label}: la tarjeta «${card.channel}» enseña una release «${alien}»`);
            }
          }
        }
        await page.getByTestId("orbit-settings-channels").screenshot({
          path: path.join(output, `orbit-ajustes-canales-${label}.png`),
        });
      }

      // ── Atajos: grabar una combinación la pinta en keycaps.
      if (shot.noPageScroll && section === "hotkeys") {
        const row = page.getByTestId("orbit-keycap-row").first();
        await row.click();
        await page.waitForFunction(
          () => document.querySelectorAll('[data-recording="true"]').length === 1,
        );
        await page.keyboard.press("Control+Shift+J");
        await page.waitForFunction(
          () => document.querySelectorAll('[data-recording="true"]').length === 0,
        );
        const keys = await row.locator("kbd").allTextContents();
        if (keys.length < 3) {
          throw new Error(`${label}: la grabación pintó ${keys.length} keycaps`);
        }
        await page.screenshot({
          path: path.join(output, `orbit-ajustes-grabacion-${label}.png`),
          fullPage: false,
        });
      }

      if (problems.length) {
        throw new Error(`${label}: la consola no está limpia\n${problems.join("\n")}`);
      }

      await page.close();
    }
  }

  console.log(`Orbit settings visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
