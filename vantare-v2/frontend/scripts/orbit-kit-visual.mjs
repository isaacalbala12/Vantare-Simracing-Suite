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
  { id: "primitivos", file: "orbit-kit-1-primitivos" },
  { id: "estado", file: "orbit-kit-2-estado" },
  { id: "contenedores", file: "orbit-kit-3-contenedores" },
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
    const section = page.locator(`[data-group="${group.id}"]`);
    await section.waitFor();
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
    await page.screenshot({ path: path.join(output, `${group.file}-1920x1080.png`), fullPage: false });
  }

  if (problems.length) throw new Error(`la consola no está limpia\n${problems.join("\n")}`);
  await page.close();
  console.log(`Orbit kit visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
