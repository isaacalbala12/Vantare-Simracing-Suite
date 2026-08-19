import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/12-testing-center");
const port = 5202;
const base = `http://127.0.0.1:${port}/orbit-testing-harness.html?orbit=1&view=testing`;
const url = `${base}&channel=nightly`;
const stableUrl = `${base}&channel=stable`;

const shots = [
  { name: "1920x1080", width: 1920, height: 1080, noPageScroll: true, interact: true },
  { name: "1920x900", width: 1920, height: 900, noPageScroll: false, interact: false },
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
      const request = http.get(url, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Orbit testing harness did not start.\n${serverOutput}`);
}

function contractOf() {
  const root = document.querySelector(".orbit-tc");
  return {
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    present: Boolean(root),
    channel: document.querySelector('[data-testid="orbit-testing-channel"]')?.textContent ?? "",
    status: document.querySelector('[data-testid="orbit-testing-status"]')?.textContent ?? "",
    textareas: document.querySelectorAll(".orbit-tc__fields .orbit-textarea").length,
    selects: document.querySelectorAll(".orbit-tc__fields .orbit-select").length,
    consentRows: document.querySelectorAll(".orbit-tc__consent-row").length,
    errors: document.querySelectorAll(".orbit-tc__error").length,
    tabs: [...document.querySelectorAll(".orbit-tc__tabs [role='tab']")].map(
      (tab) => tab.textContent.trim(),
    ),
    // El `title` nativo está prohibido en la vista (`08 · a11y`). Se mide sobre
    // la pantalla, no sobre la shell, que es de otro briefing.
    nativeTitles: root ? root.querySelectorAll("[title]").length : 0,
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

    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByTestId("orbit-testing").waitFor();
    await page.evaluate(async () => { await document.fonts.ready; });

    const label = shot.name;
    const summary = await page.evaluate(contractOf);

    if (summary.textareas !== 4) {
      throw new Error(`${label}: el formulario pinta ${summary.textareas} campos de texto (esperados 4)`);
    }
    if (summary.selects !== 1) {
      throw new Error(`${label}: el formulario no pinta el select de módulo`);
    }
    if (summary.consentRows !== 3) {
      throw new Error(`${label}: el consentimiento pinta ${summary.consentRows} filas (esperadas 3)`);
    }
    if (summary.tabs.join("·") !== "Reportar·Validar·Mis reportes") {
      throw new Error(`${label}: las pestañas son «${summary.tabs.join("·")}»`);
    }
    if (!summary.channel.trim()) {
      throw new Error(`${label}: la cabecera no dice el canal`);
    }
    if (!summary.status.trim()) {
      throw new Error(`${label}: la cabecera no dice el estado del borrador`);
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
      path: path.join(output, `orbit-testing-${label}.png`),
      fullPage: false,
    });

    if (shot.interact) {
      // ── Enviar en vacío valida los obligatorios en la propia pantalla.
      await page.getByTestId("orbit-testing-send").click();
      await page.waitForFunction(
        () => document.querySelectorAll(".orbit-tc__error").length === 3,
      );
      const validated = await page.evaluate(contractOf);
      if (validated.nativeTitles !== 0) {
        throw new Error(`${label}: la vista usa \`title\` nativo tras validar`);
      }
      if (validated.scrollHeight > validated.innerHeight) {
        throw new Error(`${label}: la página hace scroll tras validar`);
      }
      await page.screenshot({
        path: path.join(output, `orbit-testing-validacion-${label}.png`),
        fullPage: false,
      });

      // ── Consentimiento de diagnóstico: la vista previa aparece plegada.
      await page.getByTestId("orbit-testing-consent-diagnostic").click();
      await page.getByTestId("orbit-testing-preview-card").waitFor();
      const preview = await page.evaluate(contractOf);
      if (preview.nativeTitles !== 0) {
        throw new Error(`${label}: la vista previa usa \`title\` nativo`);
      }
      if (preview.scrollHeight > preview.innerHeight) {
        throw new Error(`${label}: la vista previa hace scroll de página`);
      }
      await page.screenshot({
        path: path.join(output, `orbit-testing-diagnostico-${label}.png`),
        fullPage: false,
      });
      await page.getByTestId("orbit-testing-consent-diagnostic").click();

      // ── Pestaña Validar: sin backend de validaciones la vista lo dice.
      await page.getByRole("tab", { name: "Validar" }).click();
      await page.getByTestId("orbit-testing-validate").waitFor();
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            '[data-testid="orbit-testing-validate-error"], .orbit-tc__candidate, .orbit-note',
          ).length > 0,
      );
      const validate = await page.evaluate(contractOf);
      if (validate.nativeTitles !== 0) {
        throw new Error(`${label}: Validar usa \`title\` nativo`);
      }
      if (validate.scrollHeight > validate.innerHeight) {
        throw new Error(`${label}: Validar hace scroll de página`);
      }
      if (validate.scrollWidth > validate.innerWidth) {
        throw new Error(`${label}: Validar hace scroll horizontal`);
      }
      await page.screenshot({
        path: path.join(output, `orbit-testing-validar-${label}.png`),
        fullPage: false,
      });

      // ── Pestaña Mis reportes: estado vacío honesto (no hay historial).
      await page.getByRole("tab", { name: "Mis reportes" }).click();
      await page.getByTestId("orbit-testing-mine").waitFor();
      const mine = await page.evaluate(contractOf);
      if (mine.nativeTitles !== 0) {
        throw new Error(`${label}: Mis reportes usa \`title\` nativo`);
      }
      if (mine.scrollHeight > mine.innerHeight) {
        throw new Error(`${label}: Mis reportes hace scroll de página`);
      }
      await page.screenshot({
        path: path.join(output, `orbit-testing-mis-reportes-${label}.png`),
        fullPage: false,
      });

      await page.getByRole("tab", { name: "Reportar" }).click();
      await page.waitForSelector("#orbit-tc-action");
    }

    if (problems.length) {
      throw new Error(`${label}: la consola no está limpia\n${problems.join("\n")}`);
    }

    await page.close();
  }

  // ── Canal Stable: la vista no existe y la shell devuelve a Inicio con toast.
  const stablePage = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    timezoneId: "Europe/Madrid",
  });
  await stablePage.goto(stableUrl, { waitUntil: "networkidle" });
  await stablePage.waitForFunction(
    () => document.querySelector('.orbit-topbar h1')?.textContent?.trim() === "Inicio",
  );
  const stableSummary = await stablePage.evaluate(() => ({
    view: document.querySelector(".orbit-topbar h1")?.textContent?.trim() ?? "",
    testing: Boolean(document.querySelector(".orbit-tc")),
    railTesting: document.querySelectorAll('[data-testid="orbit-rail-testing"]').length,
    toast: document.querySelector(".orbit-toast")?.textContent ?? "",
  }));
  if (stableSummary.testing) {
    throw new Error("stable: la vista de Testing Center se pinta sin canal");
  }
  if (stableSummary.view !== "Inicio") {
    throw new Error(`stable: la vista activa es «${stableSummary.view}» y no Inicio`);
  }
  if (stableSummary.railTesting !== 0) {
    throw new Error("stable: el rail sigue enseñando el botón de Testing Center");
  }
  await stablePage.screenshot({
    path: path.join(output, "orbit-testing-stable-1920x1080.png"),
    fullPage: false,
  });
  await stablePage.close();

  console.log(`Orbit testing visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
