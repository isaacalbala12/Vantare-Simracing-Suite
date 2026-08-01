import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 5187;
const base = `http://127.0.0.1:${port}/telemetry-cutover-runtime-harness.html`;
const server = spawn(process.execPath, [path.join(frontend, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: frontend, stdio: "ignore", windowsHide: true, detached: process.platform !== "win32",
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
  throw new Error("cutover harness did not start");
}

function stop() {
  if (!server.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ }
}

let browser;
try {
  await ready();
  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const runtime of ["studio", "desktop", "obs"]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}?runtime=${runtime}`);
      if ((await page.getByTestId("status").textContent()) !== "ready") throw new Error(`${runtime}: not ready`);
      if (Number(await page.getByTestId("writes").textContent()) < 1) throw new Error(`${runtime}: no canonical write`);
      if ((await page.getByTestId("legacy").textContent()) !== "0") throw new Error(`${runtime}: legacy subscription`);
      if (errors.length) throw new Error(`${runtime}: ${errors.join("; ")}`);
      await page.close();
    }
  }
} finally {
  await browser?.close();
  stop();
}
