import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/05-launcher");
const port = 5197;
const url = `http://127.0.0.1:${port}/orbit-launcher-harness.html?view=launcher`;

// Reloj congelado: la instantánea del harness fecha la última detección y la
// última ejecución ese día, así que sin fijar la hora la captura cambiaría.
const FROZEN_CLOCK = new Date("2026-07-07T18:07:30Z");

const viewports = [
  { name: "1920x1080", width: 1920, height: 1080, profilesScroll: false },
  { name: "1920x900", width: 1920, height: 900, profilesScroll: true },
  // DPR 2: es donde se nota si un icono llega a la losa por debajo de su
  // tamaño. Las losas del catálogo miden 39 px y los pasos de cadena 26, o sea
  // 78 y 52 px físicos, así que un icono de 32 px se vería ampliado y borroso.
  // Solo se captura el catálogo y la cadena; el resto ya lo cubre DPR 1.
  { name: "1920x1080@2x", width: 1920, height: 1080, profilesScroll: false, dpr: 2, iconsOnly: true },
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
  throw new Error(`Orbit launcher harness did not start.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.dpr ?? 1,
    });
    const problems = [];
    const isWailsRuntimeNoise = (error) => (error.stack ?? "").includes("wailsio_runtime");
    page.on("pageerror", (error) => {
      if (!isWailsRuntimeNoise(error)) problems.push(`pageerror: ${error.message}`);
    });

    await page.clock.install({ time: FROZEN_CLOCK });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByTestId("orbit-launcher").waitFor();
    await page.getByTestId("orbit-launcher-apps").waitFor();
    await page.getByTestId("orbit-launcher-context-profiles").waitFor();
    await page.clock.setFixedTime(FROZEN_CLOCK);
    await page.evaluate(async () => { await document.fonts.ready; });

    const contract = await page.evaluate(() => {
      const view = document.querySelector(".orbit-launcher");
      const profiles = document.querySelector(".orbit-launcher__profiles");
      const column = document.querySelector(".orbit-column");
      return {
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        apps: document.querySelectorAll('[data-testid="orbit-launcher-apps"] .orbit-row').length,
        detectedChips: document.querySelectorAll(
          '[data-testid="orbit-launcher-apps"] .orbit-launcher__state--detected, [data-testid="orbit-launcher-apps"] .orbit-launcher__state--installed',
        ).length,
        chainSteps: document.querySelectorAll('[data-testid="orbit-chain-step"]').length,
        profilesScroll: profiles ? profiles.scrollHeight > profiles.clientHeight + 0.5 : false,
        // El bloque persistente del Launcher se oculta en su propia vista.
        persistentLauncher: column
          ? column.querySelectorAll('[data-block="launcher"]').length
          : -1,
        contextProfiles: document.querySelectorAll(
          '[data-testid="orbit-launcher-context-profiles"] .orbit-row',
        ).length,
        nativeTitles: view ? view.querySelectorAll("[title]").length : -1,
      };
    });

    if (contract.scrollHeight > contract.innerHeight) {
      throw new Error(`${viewport.name}: la página hace scroll vertical (${contract.scrollHeight} > ${contract.innerHeight})`);
    }
    if (contract.scrollWidth > contract.innerWidth) {
      throw new Error(`${viewport.name}: la página hace scroll horizontal (${contract.scrollWidth} > ${contract.innerWidth})`);
    }
    if (contract.apps !== 7) {
      throw new Error(`${viewport.name}: ${contract.apps} aplicaciones en el catálogo, se esperaban 7`);
    }
    if (contract.detectedChips !== 2) {
      throw new Error(`${viewport.name}: ${contract.detectedChips} aplicaciones detectadas, se esperaban 2`);
    }
    if (contract.chainSteps !== 7) {
      throw new Error(`${viewport.name}: ${contract.chainSteps} pasos de cadena, se esperaban 7 (3 + 4)`);
    }
    if (contract.contextProfiles !== 2) {
      throw new Error(`${viewport.name}: ${contract.contextProfiles} perfiles en la columna, se esperaban 2`);
    }
    if (contract.persistentLauncher !== 0) {
      throw new Error(`${viewport.name}: el bloque persistente Launcher sigue en la columna`);
    }
    if (contract.profilesScroll !== viewport.profilesScroll) {
      throw new Error(`${viewport.name}: scroll interno de perfiles ${contract.profilesScroll}, se esperaba ${viewport.profilesScroll}`);
    }
    if (contract.nativeTitles !== 0) {
      throw new Error(`${viewport.name}: la vista usa \`title\` nativo (${contract.nativeTitles})`);
    }
    if (problems.length) {
      throw new Error(`${viewport.name}: la consola no está limpia\n${problems.join("\n")}`);
    }

    await page.screenshot({ path: path.join(output, `orbit-launcher-${viewport.name}.png`), fullPage: false });

    if (viewport.iconsOnly) {
      // Contrato del icono: la losa nunca amplia la imagen. Con `object-fit:
      // contain` un origen menor que la caja fisica se ve borroso, asi que se
      // comprueba que el ancho natural cubra la losa a este DPR.
      const upscaled = await page.evaluate((dpr) => {
        const offenders = [];
        for (const img of document.querySelectorAll(".orbit-monogram__img")) {
          const box = img.getBoundingClientRect();
          const needed = Math.round(Math.max(box.width, box.height) * dpr);
          // Un SVG no tiene resolucion natural: escala solo.
          const natural = img.currentSrc.startsWith("data:image/svg+xml")
            ? Number.POSITIVE_INFINITY
            : img.naturalWidth;
          if (natural && natural < needed) offenders.push(`${needed}px pedidos, origen de ${natural}px`);
        }
        return offenders;
      }, viewport.dpr ?? 1);
      if (upscaled.length) {
        throw new Error(`${viewport.name}: iconos ampliados en la losa\n${upscaled.join("\n")}`);
      }
      await page.getByTestId("orbit-launcher-apps").screenshot({
        path: path.join(output, `orbit-launcher-catalogo-iconos-${viewport.name}.png`),
      });
      await page.close();
      continue;
    }

    // Dos estados que solo se ven interactuando: la tarjeta punteada bajo el
    // puntero y el cajon del editor de perfil abierto sobre la vista.
    if (!viewport.profilesScroll) {
      await page.getByTestId("orbit-launcher-create").hover();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(output, `orbit-launcher-crear-hover-${viewport.name}.png`), fullPage: false });

      await page.getByTestId("orbit-launcher-profile-creator").getByRole("button", { name: /Editar el perfil/ }).click();
      await page.getByTestId("orbit-profile-editor").waitFor();
      await page.waitForTimeout(320);
      const drawer = await page.evaluate(() => {
        const panel = document.querySelector(".orbit-drawer");
        const body = document.querySelector(".orbit-drawer__body");
        return {
          width: panel ? Math.round(panel.getBoundingClientRect().width) : -1,
          dialog: document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
          focusInside: panel ? panel.contains(document.activeElement) : false,
          bodyScrolls: body ? body.scrollHeight > body.clientHeight - 0.5 : false,
          nativeTitles: panel ? panel.querySelectorAll("[title]").length : -1,
        };
      });
      if (drawer.width !== 480) throw new Error(`${viewport.name}: el cajon mide ${drawer.width}px, se esperaban 480`);
      if (drawer.dialog !== 1) throw new Error(`${viewport.name}: ${drawer.dialog} dialogos modales abiertos`);
      if (!drawer.focusInside) throw new Error(`${viewport.name}: el foco no entro en el cajon`);
      if (drawer.nativeTitles !== 0) throw new Error(`${viewport.name}: el cajon usa title nativo`);
      await page.screenshot({ path: path.join(output, `orbit-launcher-editor-${viewport.name}.png`), fullPage: false });
      await page.keyboard.press("Escape");
    }

    if (problems.length) {
      throw new Error(`${viewport.name}: la consola no esta limpia tras interactuar: ${problems.join(" | ")}`);
    }
    await page.close();
  }

  console.log(`Orbit launcher visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
