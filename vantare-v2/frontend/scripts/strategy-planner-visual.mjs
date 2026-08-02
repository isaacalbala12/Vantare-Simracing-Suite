import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.resolve(frontendDir, "../docs/strategy-planner/evidence/str-07");
const port = Number(process.env.STRATEGY_VISUAL_PORT ?? 5187);
const origin = `http://127.0.0.1:${port}`;
const serverLog = [];

await mkdir(evidenceDir, { recursive: true });

const server = spawn(
  process.execPath,
  [path.join(frontendDir, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: frontendDir,
    env: { ...process.env, VITE_RUNTIME_MOCK: "mock" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);

for (const stream of [server.stdout, server.stderr]) {
  stream?.on("data", (chunk) => {
    serverLog.push(String(chunk));
    if (serverLog.length > 80) serverLog.shift();
  });
}

let browser;
try {
  await waitForServer(`${origin}/strategy-planner-harness.html?access=tester`, 20_000);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${origin}/strategy-planner-harness.html?access=tester`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Mis planes" }).waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "actual-gallery-wide.png"), fullPage: true });

  await page.getByRole("button", { name: "Crear plan" }).click();
  await page.screenshot({ path: path.join(evidenceDir, "actual-entry-wide.png") });
  await page.getByRole("button", { name: /Continuar a revisión/ }).click();
  await page.screenshot({ path: path.join(evidenceDir, "actual-review-wide.png") });
  await page.getByRole("button", { name: /Crear workspace/ }).click();
  await page.getByRole("heading", { name: "Plan de carrera" }).waitFor();

  const layouts = [
    { name: "wide", width: 1920, height: 1080 },
    { name: "medium", width: 1280, height: 900 },
    { name: "compact", width: 800, height: 900 },
  ];

  const metrics = {};
  for (const layout of layouts) {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      for (const element of document.querySelectorAll("main, .scrollable-main, [class*='overflow-y']")) {
        if (element instanceof HTMLElement) element.scrollTop = 0;
      }
    });
    await page.waitForTimeout(100);
    await page.locator(".strategy-workspace__header").scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const scroller = document.querySelector(".scrollable-main");
      if (scroller instanceof HTMLElement) scroller.scrollTop = 0;
    });
    await page.waitForTimeout(50);
    metrics[layout.name] = await assertLayout(page, layout.name);
    await page.screenshot({ path: path.join(evidenceDir, `actual-workspace-${layout.name}.png`) });
    if (layout.name === "medium") {
      await page.locator('[data-testid="strategy-column-inventory"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(evidenceDir, "actual-workspace-medium-inventory.png") });
    }
  }

  await page.getByRole("button", { name: "Stints" }).focus();
  await page.keyboard.press("ArrowRight");
  if (await page.getByRole("button", { name: "Inventario" }).getAttribute("aria-pressed") !== "true") {
    throw new Error("Compact tab keyboard navigation did not select Inventory");
  }
  await page.screenshot({ path: path.join(evidenceDir, "actual-workspace-compact-inventory.png") });
  const comparisonOpener = page.getByRole("button", { name: "Comparar planes" });
  await comparisonOpener.focus();
  await comparisonOpener.click();
  await page.getByRole("dialog", { name: "Comparar estrategias" }).waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "actual-comparison-compact.png") });
  const closeComparison = page.getByRole("button", { name: "Cerrar comparación" });
  if (!(await closeComparison.evaluate((element) => element === document.activeElement))) {
    throw new Error("Comparison dialog did not receive initial focus");
  }
  if (!(await page.locator(".strategy-planner__background").evaluate((element) => element.hasAttribute("inert") && element.getAttribute("aria-hidden") === "true"))) {
    throw new Error("Comparison dialog did not isolate the background");
  }
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  if (!(await closeComparison.evaluate((element) => element === document.activeElement))) {
    throw new Error("Comparison dialog focus escaped its trap");
  }
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Comparar estrategias" }).waitFor({ state: "detached" });
  if (!(await comparisonOpener.evaluate((element) => element === document.activeElement))) {
    throw new Error("Comparison dialog did not restore focus to its opener");
  }
  await page.getByRole("button", { name: "Guardar plan" }).click();
  await page.getByRole("status").waitFor();

  if (consoleErrors.length || pageErrors.length) {
    throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
  }

  console.log(JSON.stringify({ result: "PASS", origin, metrics, consoleErrors: 0, pageErrors: 0 }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  console.error("Vite tail:\n" + serverLog.join(""));
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopProcessTree(server);
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited early with code ${server.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Vite did not become ready within ${timeoutMs}ms`);
}

async function assertLayout(page, layoutName) {
  const result = await page.evaluate((name) => {
    const bodyOverflow = document.documentElement.scrollWidth - window.innerWidth;
    const plans = document.querySelector('[data-testid="strategy-column-plans"]');
    const stints = document.querySelector('[data-testid="strategy-column-stints"]');
    const inventory = document.querySelector('[data-testid="strategy-column-inventory"]');
    const tabs = document.querySelector(".strategy-panel-tabs");
    if (!(plans instanceof HTMLElement) || !(stints instanceof HTMLElement) || !(inventory instanceof HTMLElement) || !(tabs instanceof HTMLElement)) {
      throw new Error("Workspace columns are missing");
    }
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), display: getComputedStyle(element).display };
    };
    const offenders = [...document.querySelectorAll("body *")]
      .filter((element) => element instanceof HTMLElement && element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 8)
      .map((element) => ({ tag: element.tagName, className: element.className, right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) }));
    return { name, bodyOverflow, plans: box(plans), stints: box(stints), inventory: box(inventory), tabs: box(tabs), offenders };
  }, layoutName);

  if (result.bodyOverflow > 1) throw new Error(`${layoutName} has ${result.bodyOverflow}px horizontal overflow: ${JSON.stringify(result.offenders)}`);
  if (layoutName === "wide") {
    const ratio = result.stints.width / result.plans.width;
    if (ratio < 1.75 || ratio > 2.25) throw new Error(`Wide 3/6/3 ratio is ${ratio.toFixed(2)}`);
    if (Math.abs(result.plans.width - result.inventory.width) > 30) throw new Error("Wide side columns are not balanced");
  }
  if (layoutName === "medium" && result.inventory.y <= result.stints.y) {
    throw new Error("Medium inventory did not move below the primary workspace row");
  }
  if (layoutName === "compact") {
    if (result.tabs.display === "none") throw new Error("Compact panel tabs are hidden");
    if (result.stints.display === "none" || result.plans.display !== "none" || result.inventory.display !== "none") {
      throw new Error("Compact layout did not expose exactly the selected panel");
    }
  }
  return result;
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}
