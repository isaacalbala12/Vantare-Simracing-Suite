import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { CONTROL_SCENES, decodePng } from "./crystal-parity-protocol.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(frontendRoot, "..");
const outputDirectory = path.join(repositoryRoot, "docs", "evidence", "isa-178");
const port = 5194;
const baseUrl = `http://127.0.0.1:${port}/overlay-studio-harness.html`;
const cases = [
  { locale: "es", severity: "critical", scene: "transparent", surface: "desktop", size: "wide", width: 440, height: 112 },
  { locale: "en", severity: "warning", scene: "solid", surface: "obs", size: "medium", width: 340, height: 92 },
  { locale: "it", severity: "info", scene: "grid", surface: "desktop", size: "compact", width: 260, height: 76 },
  { locale: "pt-BR", severity: "critical", scene: "solid", surface: "obs", size: "wide", width: 440, height: 112 },
];

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error("engineer-radio visual harness did not start");
}

function alphaStats(decoded) {
  let transparent = 0;
  for (let offset = 3; offset < decoded.data.length; offset += 4) {
    if (decoded.data[offset] < 255) transparent += 1;
  }
  return { alphaLt255Ratio: transparent / (decoded.width * decoded.height) };
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const viteCli = path.join(frontendRoot, "node_modules", "vite", "bin", "vite.js");
  const server = spawn(process.execPath, [viteCli, "--host", "127.0.0.1", "--port", String(port)], {
    cwd: frontendRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const report = [];
  try {
    await waitForServer();
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
      document.documentElement.append(style);
    });
    for (const item of cases) {
      const url = `${baseUrl}?widget=engineer-radio&system=vantare-crystal&surface=${item.surface}&locale=${encodeURIComponent(item.locale)}&severity=${item.severity}`;
      await page.goto(url, { waitUntil: "networkidle" });
      const scene = CONTROL_SCENES.find((candidate) => candidate.id === item.scene);
      await page.locator("[data-overlay-parity-stage]").evaluate((element, value) => {
        const stage = element;
        stage.style.backgroundColor = value.backgroundColor;
        stage.style.backgroundImage = value.backgroundImage;
        stage.style.backgroundPosition = value.backgroundPosition ?? "0 0";
        stage.style.backgroundSize = value.backgroundSize ?? "auto";
      }, scene);
      await page.locator("[data-overlay-parity-widget-frame]").evaluate((element, size) => {
        const frame = element;
        frame.style.width = `${size.width}px`;
        frame.style.height = `${size.height}px`;
      }, item);
      await page.evaluate(async () => document.fonts?.ready);
      const root = page.locator("[data-engineer-radio-root]");
      await root.waitFor({ state: "visible" });
      const buffer = await root.screenshot({ omitBackground: item.scene === "transparent" });
      const filename = `engineer-radio-${item.locale}-${item.severity}-${item.scene}-${item.size}.png`;
      await writeFile(path.join(outputDirectory, filename), buffer);
      const decoded = await decodePng(page, buffer);
      const text = (await root.locator(".vc-engineer-radio__message").textContent())?.trim();
      const geometry = await root.evaluate((element) => ({
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
      }));
      report.push({ ...item, file: filename, width: decoded.width, height: decoded.height, text, geometry, ...alphaStats(decoded) });
    }
    for (const state of ["stale", "disconnected", "error"]) {
      await page.goto(`${baseUrl}?widget=engineer-radio&system=vantare-crystal&surface=obs&state=${state}`, { waitUntil: "networkidle" });
      if (await page.locator("[data-engineer-radio-root]").count()) {
        throw new Error(`engineer-radio remained visible in ${state} state`);
      }
    }
    await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), captures: report }, null, 2)}\n`);
    if (!report.some((item) => item.scene === "transparent" && item.alphaLt255Ratio > 0)) {
      throw new Error("transparent capture contains no transparent pixels");
    }
    if (report.some((item) => item.geometry.scrollWidth > item.geometry.clientWidth || item.geometry.scrollHeight > item.geometry.clientHeight)) {
      throw new Error("engineer-radio overflows one or more responsive captures");
    }
    process.stdout.write(`engineer-radio-visual: ${report.length} captures OK\n`);
  } finally {
    await page.close();
    await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
