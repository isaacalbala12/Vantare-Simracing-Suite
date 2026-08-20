import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { hideToasts, settle, stillPage } from "./lib/orbit-still.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/10-roadmap");
const port = 5200;
const url = `http://127.0.0.1:${port}/orbit-roadmap-harness.html?view=roadmap`;

const shots = [
  { name: "1920x1080", width: 1920, height: 1080, noPageScroll: true, interact: true },
  { name: "1920x900", width: 1920, height: 900, noPageScroll: true, interact: false },
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
  const reader = document.querySelector(".orbit-rm__column");
  const details = document.querySelector(".orbit-rm__done");
  // El bloque «Entregado recientemente» cita asuntos de commit literales, y un
  // asunto puede llevar un porcentaje suyo («28% mas rapido»). Eso no es la
  // pantalla publicando progreso —que es lo que prohíbe D-R3-F-1—, así que la
  // medida se toma sobre la lectura menos ese bloque. El `<details>` de HECHO
  // mantiene sus hijos en el DOM aunque esté plegado, de modo que sin excluirlo
  // la primera captura ya contaría el texto que ni siquiera se ve.
  const narrative = reader?.cloneNode(true) ?? null;
  narrative?.querySelector('[data-testid="orbit-roadmap-delivered"]')?.remove();
  return {
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    source: root ? root.getAttribute("data-source") : null,
    status: document.querySelector('[data-testid="orbit-roadmap-status"]')?.textContent ?? "",
    sections: document.querySelectorAll(".orbit-rm__section").length,
    now: document.querySelectorAll('[data-testid="orbit-roadmap-now"]').length,
    next: document.querySelectorAll('[data-testid="orbit-roadmap-next"]').length,
    done: document.querySelectorAll('[data-testid="orbit-roadmap-done"]').length,
    highlights: document.querySelectorAll('[data-testid="orbit-roadmap-highlights"] li').length,
    phases: document.querySelectorAll('[data-testid^="orbit-roadmap-phase-"]').length,
    milestones: document.querySelectorAll('[data-testid^="orbit-roadmap-milestone-"]').length,
    derived: document.querySelectorAll('[data-testid="orbit-roadmap-derived"]').length,
    contextRows: document.querySelectorAll('[data-testid="orbit-roadmap-context"] .orbit-row').length,
    focused: document.querySelectorAll('.orbit-rm__section[data-focus="true"]').length,
    doneOpen: details ? details.open : null,
    // Sin porcentajes de progreso en ninguna parte de la lectura (D-R3-F-1).
    // Se devuelve el texto encontrado, no un booleano: un fallo que no dice qué
    // porcentaje ha visto obliga a reproducirlo a mano para saberlo.
    percent: narrative
      ? (narrative.textContent ?? "").match(/.{0,40}\d+\s?%.{0,40}/)?.[0] ?? null
      : null,
    // El registro de entregas sale de los commits, no del plan: tiene que
    // estar, y tiene que estar marcado como derivado.
    delivered: document.querySelectorAll('[data-testid="orbit-roadmap-delivered"]').length,
    deliveredDays: document.querySelectorAll('[data-testid^="orbit-roadmap-delivered-2"]').length,
    // El `title` nativo está prohibido en la vista y en su columna (`08 · a11y`).
    // Se mide sobre la pantalla, no sobre la shell, que es de otro briefing.
    nativeTitles: [...document.querySelectorAll(".orbit-rm, .orbit-rm__context")]
      .reduce((total, node) => total + node.querySelectorAll("[title]").length, 0),
  };
}

/** Contrato común a todas las capturas: la vista dice la verdad y no hace scroll. */
function assertContract(label, summary) {
  if (summary.sections !== 3) {
    throw new Error(`${label}: la columna pinta ${summary.sections} secciones (esperadas 3)`);
  }
  if (!summary.now || !summary.next || !summary.done) {
    throw new Error(`${label}: falta alguna de las secciones AHORA / PRÓXIMO / HECHO`);
  }
  if (summary.highlights === 0) {
    throw new Error(`${label}: AHORA no pinta ningún highlight de la fase en curso`);
  }
  // Cuántas fases e hitos hay lo decide la fuente, no la pantalla: aquí solo se
  // comprueba que la vista pinta lo que la fuente declara.
  if (summary.phases === 0) throw new Error(`${label}: la vista no pinta ninguna fase`);
  if (summary.milestones === 0) throw new Error(`${label}: la vista no pinta ningún hito`);
  if (summary.derived === 0) {
    throw new Error(`${label}: el reparto derivado de los hitos no está marcado`);
  }
  if (summary.percent) {
    throw new Error(`${label}: la columna narrativa pinta un porcentaje («${summary.percent.trim()}»)`);
  }
  if (summary.delivered !== 1) {
    throw new Error(`${label}: la vista pinta ${summary.delivered} bloques de entregas (esperado 1)`);
  }
  if (summary.deliveredDays === 0) {
    throw new Error(`${label}: el registro de entregas no agrupa ningún día`);
  }
  if (summary.contextRows !== 3) {
    throw new Error(`${label}: la columna lista ${summary.contextRows} secciones (esperadas 3)`);
  }
  if (summary.nativeTitles !== 0) {
    throw new Error(`${label}: la vista usa \`title\` nativo (${summary.nativeTitles})`);
  }
  if (!summary.status.trim()) {
    throw new Error(`${label}: la cabecera no dice el estado de la fuente`);
  }
  if (summary.scrollHeight > summary.innerHeight) {
    throw new Error(
      `${label}: la página hace scroll vertical (${summary.scrollHeight} > ${summary.innerHeight})`,
    );
  }
  if (summary.scrollWidth > summary.innerWidth) {
    throw new Error(`${label}: la página hace scroll horizontal`);
  }
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const shot of shots) {
    const page = await stillPage(browser, {
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
    await hideToasts(page);
    await settle(page);

    const label = shot.name;
    const summary = await page.evaluate(contractOf);
    assertContract(label, summary);

    // HECHO nace plegado: lo publicado es contexto, no la lectura principal.
    if (summary.doneOpen !== false) {
      throw new Error(`${label}: el plegable HECHO no nace cerrado`);
    }

    await hideToasts(page);

    await settle(page);
    await page.screenshot({
      path: path.join(output, `orbit-roadmap-${label}.png`),
      fullPage: false,
    });

    if (shot.interact) {
      // ── Columna: al pulsar una sección, esa sección queda resaltada.
      await page.getByTestId("orbit-roadmap-context").locator(".orbit-row").nth(1).click();
      await page.waitForFunction(
        () => document.querySelectorAll('.orbit-rm__section[data-focus="true"]').length === 1,
      );
      const focused = await page.evaluate(contractOf);
      if (focused.focused !== 1) {
        throw new Error(`${label}: el resaltado marca ${focused.focused} secciones`);
      }
      assertContract(`${label} foco`, focused);
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-roadmap-foco-${label}.png`),
        fullPage: false,
      });

      // ── HECHO desplegado: sigue sin porcentajes y sin scroll de página.
      await page.locator(".orbit-rm__done > summary").click();
      await page.waitForFunction(() => document.querySelector(".orbit-rm__done")?.open === true);
      // El resaltado del salto dura 1600 ms: se deja expirar para que la
      // captura de HECHO muestre la vista en reposo.
      await page.waitForTimeout(1900);
      const opened = await page.evaluate(contractOf);
      if (opened.doneOpen !== true) throw new Error(`${label}: HECHO no se despliega`);
      assertContract(`${label} hecho`, opened);
      await hideToasts(page);
      await settle(page);
      await page.screenshot({
        path: path.join(output, `orbit-roadmap-hecho-${label}.png`),
        fullPage: false,
      });

      // ── Entregado recientemente: vive al final de HECHO, así que sin bajar
      // hasta él la evidencia no enseñaría el bloque que lee los commits.
      // El scroll no necesita espera propia: `stillPage` inyecta
      // `scroll-behavior: auto`, de modo que el desplazamiento es instantáneo
      // en vez de suave, y `settle` remata lo que quede vivo (ISA-380).
      await page.getByTestId("orbit-roadmap-delivered").scrollIntoViewIfNeeded();
      await hideToasts(page);
      await settle(page);
      const delivered = await page.evaluate(contractOf);
      assertContract(`${label} entregado`, delivered);
      await page.screenshot({
        path: path.join(output, `orbit-roadmap-entregado-${label}.png`),
        fullPage: false,
      });
    }

    if (problems.length) {
      throw new Error(`${label}: la consola no está limpia\n${problems.join("\n")}`);
    }

    await page.close();
  }

  console.log(`Orbit roadmap visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
