import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/analysis/isa-915-clerk-login-ui/artifacts");
const port = 5209;
const baseUrl = `http://127.0.0.1:${port}/clerk-login-harness.html`;
const states = ["loading", "signed-out", "error"];
const viewports = [
  { name: "375x812", width: 375, height: 812 },
  { name: "414x896", width: 414, height: 896 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
];

fs.mkdirSync(output, { recursive: true });

function portOwners() {
  if (process.platform !== "win32") return [];
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
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
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ }
  }
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(baseUrl, (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Clerk login harness did not start.\n${serverOutput}`);
}

const report = [];
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    for (const state of states) {
      const page = await browser.newPage({ viewport });
      const problems = [];
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          if (message.text().includes("wails-runtime-mock activo")) return;
          problems.push(`console.${message.type()}: ${message.text()}`);
        }
      });
      page.on("requestfailed", (request) => {
        problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`);
      });
      page.on("response", (response) => {
        if (response.status() >= 400) problems.push(`response ${response.status()}: ${response.url()}`);
      });

      await page.goto(`${baseUrl}?state=${state}`, { waitUntil: "networkidle" });
      await page.getByTestId("login-screen").waitFor();

      const contract = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="login-screen"]');
        const rect = root?.getBoundingClientRect();
        const interactive = [...document.querySelectorAll("button, input, a")]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
          })
          .map((element) => {
            const box = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              width: Math.round(box.width * 100) / 100,
              height: Math.round(box.height * 100) / 100,
              name: element.getAttribute("aria-label") || element.textContent?.trim() || "",
            };
          });
        const unlabeledInputs = [...document.querySelectorAll("input")].filter((input) => {
          const id = input.getAttribute("id");
          return !input.getAttribute("aria-label") && !input.closest("label") &&
            !(id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
        }).length;
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          scrollHeight: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight,
          rootWidth: rect?.width ?? 0,
          h1: document.querySelectorAll("h1").length,
          main: document.querySelectorAll("main").length,
          nativeTitles: root?.querySelectorAll("[title]").length ?? -1,
          unlabeledInputs,
          interactive,
        };
      });

      if (contract.scrollWidth > contract.innerWidth + 1) {
        problems.push(`horizontal overflow ${contract.scrollWidth} > ${contract.innerWidth}`);
      }
      if (contract.rootWidth > contract.innerWidth + 1) {
        problems.push(`root width ${contract.rootWidth} > ${contract.innerWidth}`);
      }
      if (contract.h1 !== 1 || contract.main !== 1) {
        problems.push(`semantic landmarks main=${contract.main} h1=${contract.h1}`);
      }
      if (contract.nativeTitles !== 0) problems.push(`native title attributes=${contract.nativeTitles}`);
      if (contract.unlabeledInputs !== 0) problems.push(`unlabelled inputs=${contract.unlabeledInputs}`);
      for (const target of contract.interactive) {
        if (target.width < 44 || target.height < 44) {
          problems.push(`small target ${target.tag} ${target.width}x${target.height} ${target.name}`);
        }
      }

      if (contract.interactive.length) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const active = document.activeElement;
          return active && ["A", "BUTTON", "INPUT"].includes(active.tagName);
        });
        if (!focused) problems.push("keyboard focus did not reach an interactive control");
      }

      if (problems.length) {
        throw new Error(`${viewport.name}/${state}\n${problems.join("\n")}`);
      }

      const screenshot = path.join(output, `clerk-login-${state}-${viewport.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      report.push({ viewport: viewport.name, state, ...contract, screenshot: path.basename(screenshot) });
      await page.close();
    }
  }

  fs.writeFileSync(path.join(output, "ui-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Clerk login UI PASS: ${report.length} state/viewport combinations. ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
