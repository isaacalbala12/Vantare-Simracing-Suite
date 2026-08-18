import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/10-roadmap");
const port = 5200;
const url = `http://127.0.0.1:${port}/orbit-roadmap-harness.html?orbit=1&view=roadmap`;

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
  throw new Error(`Orbit roadmap harness did not start.\n${serverOutput}`);
}

function contractOf() {
  const root = document.querySelector(".orbit-rm");
  return {
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    source: root ? root.getAttribute("data-source") : null,
    status: document.querySelector('[data-testid="orbit-roadmap-status"]')?.textContent ?? "",
    phases: document.querySelectorAll('[data-testid^="orbit-roadmap-phase-"]').length,
    areas: document.querySelectorAll('[data-testid^="orbit-roadmap-area-"]').length,
    milestones: document.querySelectorAll('[data-testid^="orbit-roadmap-milestone-"]').length,
    contextRows: document.querySelectorAll('[data-testid="orbit-roadmap-context"] .orbit-row').length,
    focused: document.querySelectorAll('.orbit-rm-phase[data-focus="true"]').length,
    // El `title` nativo está prohibido en la vista y en su columna (`08 · a11y`).
    // Se mide sobre la pantalla, no sobre la shell, que es de otro briefing.
    nativeTitles: [...document.querySelectorAll(".orbit-rm, .orbit-rm__context")]
      .reduce((total, node) => total + node.querySelectorAll("[title]").length, 0),
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
    await page.getByTestId("orbit-roadmap").waitFor();
    await page.evaluate(async () => { await document.fonts.ready; });

    const label = shot.name;
    const summary = await page.evaluate(contractOf);

    if (summary.phases < 4) {
      throw new Error(`${label}: la pista pinta ${summary.phases} fases (esperadas 4 o más)`);
    }
    // Cuántas áreas e hitos hay lo decide la fuente, no la pantalla: aquí solo
    // se comprueba que la vista pinta lo que la fuente declara.
    if (summary.areas === 0) {
      throw new Error(`${label}: la vista no pinta ninguna área`);
    }
    if (summary.milestones === 0) {
      throw new Error(`${label}: la vista no pinta ningún hito`);
    }
    if (summary.contextRows !== summary.phases) {
      throw new Error(
        `${label}: la columna lista ${summary.contextRows} fases y la pista ${summary.phases}`,
      );
    }
    if (summary.nativeTitles !== 0) {
      throw new Error(`${label}: la vista usa \`title\` nativo (${summary.nativeTitles})`);
    }
    if (!summary.status.trim()) {
      throw new Error(`${label}: la cabecera no dice el estado de la fuente`);
    }
    if (shot.noPageScroll && summary.scrollHeight > summary.innerHeight) {
      throw new Error(`${label}: la página hace scroll vertical (${summary.scrollHeight} > ${summary.innerHeight})`);
    }
    if (summary.scrollWidth > summary.innerWidth) {
      throw new Error(`${label}: la página hace scroll horizontal (${summary.scrollWidth} > ${summary.innerWidth})`);
    }

    await page.screenshot({
      path: path.join(output, `orbit-roadmap-${label}.png`),
      fullPage: false,
    });

    if (shot.interact) {
      // ── Columna: al pulsar una fase, esa columna queda resaltada.
      await page.getByTestId("orbit-roadmap-context").locator(".orbit-row").nth(2).click();
      await page.waitForFunction(
        () => document.querySelectorAll('.orbit-rm-phase[data-focus="true"]').length === 1,
      );
      const focused = await page.evaluate(contractOf);
      if (focused.focused !== 1) {
        throw new Error(`${label}: el resaltado marca ${focused.focused} fases`);
      }
      if (focused.nativeTitles !== 0) {
        throw new Error(`${label}: la vista usa \`title\` nativo tras interactuar`);
      }
      if (focused.scrollHeight > focused.innerHeight) {
        throw new Error(`${label}: la página hace scroll tras interactuar`);
      }
      await page.screenshot({
        path: path.join(output, `orbit-roadmap-foco-${label}.png`),
        fullPage: false,
      });
    }

    if (problems.length) {
      throw new Error(`${label}: la consola no está limpia\n${problems.join("\n")}`);
    }

    await page.close();
  }

  // ── Direcciones de rework (bloque W5). Son una fase de DISEÑO: se piden con
  // `?roadmapDir=a|b` y conviven con la vista actual, que es la de arriba.
  for (const direction of ["a", "b"]) {
    for (const shot of shots) {
      const page = await browser.newPage({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: 1,
        timezoneId: "Europe/Madrid",
      });
      const problems = [];
      page.on("pageerror", (error) => {
        if (!(error.stack ?? "").includes("wailsio_runtime")) {
          problems.push(`pageerror: ${error.message}`);
        }
      });

      const label = `direction-${direction}`;
      await page.goto(`${url}&roadmapDir=${direction}`, { waitUntil: "networkidle" });
      await page.getByTestId(`orbit-roadmap-direction-${direction}`).waitFor();
      await page.evaluate(async () => { await document.fonts.ready; });

      const summary = await page.evaluate((dir) => {
        const root = document.querySelector(`[data-testid="orbit-roadmap-direction-${dir}"]`);
        const context = document.querySelector(".orbit-rmd__context");
        return {
          scrollHeight: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          // La vista actual no debe pintarse a la vez que una dirección.
          current: document.querySelectorAll('[data-testid="orbit-roadmap"]').length,
          status: document.querySelector('[data-testid="orbit-roadmap-status"]')?.textContent ?? "",
          areas: document.querySelectorAll(`[data-testid^="orbit-rmd-${dir}-area-"]`).length,
          milestones:
            dir === "a"
              ? document.querySelectorAll('[data-testid^="orbit-rmd-a-stop-"]').length
              : document.querySelectorAll('[data-testid^="orbit-rmd-b-milestone-"]').length,
          nativeTitles: [root, context]
            .filter(Boolean)
            .reduce((total, node) => total + node.querySelectorAll("[title]").length, 0),
        };
      }, direction);

      if (summary.current !== 0) throw new Error(`${label}: la vista actual sigue montada`);
      if (summary.areas === 0) throw new Error(`${label}: no pinta ninguna área`);
      if (summary.milestones === 0) throw new Error(`${label}: no pinta ningún hito`);
      if (summary.nativeTitles !== 0) {
        throw new Error(`${label}: usa \`title\` nativo (${summary.nativeTitles})`);
      }
      if (!summary.status.trim()) {
        throw new Error(`${label}: la cabecera no dice el estado de la fuente`);
      }
      if (summary.scrollHeight > summary.innerHeight) {
        throw new Error(
          `${label} ${shot.name}: la página hace scroll vertical (${summary.scrollHeight} > ${summary.innerHeight})`,
        );
      }
      if (summary.scrollWidth > summary.innerWidth) {
        throw new Error(`${label} ${shot.name}: la página hace scroll horizontal`);
      }

      const suffix = shot.name === "1920x1080" ? "" : `-${shot.name}`;
      await page.screenshot({
        path: path.join(output, `${label}${suffix}.png`),
        fullPage: false,
      });

      if (problems.length) {
        throw new Error(`${label} ${shot.name}: la consola no está limpia\n${problems.join("\n")}`);
      }
      await page.close();
    }
  }

  console.log(`Orbit roadmap visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
