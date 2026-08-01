import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 5186;
const base = `http://127.0.0.1:${port}/telemetry-shadow-runtime-harness.html`;
const vite = path.join(frontend, "node_modules", "vite", "bin", "vite.js");
const server = spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: frontend,
  stdio: "ignore",
  windowsHide: true,
  detached: process.platform !== "win32",
});

async function ready() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ok = await new Promise((resolve) => {
      const request = http.get(base, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("runtime harness did not start");
}

function stop() {
  if (!server.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ }
  }
}

let browser;
try {
  await ready();
  browser = await chromium.launch({ headless: true });
  for (const runtime of ["studio", "desktop", "obs"]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}?runtime=${runtime}`);
    const diagnostics = JSON.parse(await page.getByTestId("diagnostics").textContent());
    if (diagnostics.runtime !== runtime || diagnostics.result !== "mapped") {
      throw new Error(`${runtime}: invalid diagnostics ${JSON.stringify(diagnostics)}`);
    }
    if ((await page.getByTestId("render-writes").textContent()) !== "0") {
      throw new Error(`${runtime}: shadow wrote to render authority`);
    }
    if (errors.length) throw new Error(`${runtime}: ${errors.join("; ")}`);
    await page.close();
  }
} finally {
  await browser?.close();
  stop();
}
