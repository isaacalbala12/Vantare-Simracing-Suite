// Probe reducido de ISA-912 (`frontend/scripts/isa-912-webview-profile.mjs`):
// conserva su detección por DOM, rAF y PerformanceObserver, y añade el control
// reproducible del overlay a través del botón productivo del Hub.
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import process from "node:process";

// Playwright pertenece al workspace frontend; resolver desde su package.json
// evita exigir una segunda instalación en la raíz solo para este banco.
const requireFromFrontend = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium } = requireFromFrontend("playwright");

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

async function describePage(page) {
  return page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    overlay: window.location.href === "http://wails.localhost/"
      && (typeof window.__vantareOverlayV2Diagnostics === "function"
        || document.querySelector('[data-testid="runtime-overlay-surface"]') !== null),
    hub: window.location.href.startsWith("http://wails.localhost/#/hub")
      || document.querySelector(".orbit-root") !== null,
    widgetCount: document.querySelectorAll('[data-testid="runtime-widget-frame"]').length,
  }));
}

async function pagesByRole(browser) {
  const described = [];
  for (const page of browser.contexts().flatMap((context) => context.pages())) {
    try { described.push({ page, description: await describePage(page) }); } catch { /* target disappeared */ }
  }
  return described;
}

async function targetDiagnostics(browser) {
  const targets = [];
  for (const page of browser.contexts().flatMap((context) => context.pages())) {
    try {
      targets.push({ url: page.url(), ...(await describePage(page)) });
    } catch (error) {
      targets.push({ url: page.url(), error: error instanceof Error ? error.message : String(error) });
    }
  }
  return targets;
}

async function waitForRole(browser, role, present, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const found = (await pagesByRole(browser)).some(({ description }) => description[role]);
    if (found === present) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  throw new Error(`${role} target did not become ${present ? "present" : "absent"} within ${timeoutMs} ms; targets=${JSON.stringify(await targetDiagnostics(browser))}`);
}

async function waitForWidgets(browser, expectedWidgets, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastCount = null;
  do {
    const overlay = (await pagesByRole(browser)).find(({ description }) => description.overlay);
    lastCount = overlay?.description.widgetCount ?? null;
    if (lastCount > 0 && (!expectedWidgets || lastCount === expectedWidgets)) return lastCount;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  throw new Error(`overlay did not render ${expectedWidgets || ">0"} runtime-widget-frame elements within ${timeoutMs} ms; lastCount=${lastCount}; targets=${JSON.stringify(await targetDiagnostics(browser))}`);
}

async function setOverlay(browser, shouldRun) {
  await waitForRole(browser, "hub", true, 30_000);
  const pages = await pagesByRole(browser);
  const running = pages.some(({ description }) => description.overlay);
  if (running === shouldRun) return { changed: false, running };
  const hub = pages.find(({ description }) => description.hub)?.page;
  if (!hub) throw new Error("Hub target is not available to control the overlay");
  await hub.evaluate(() => { if (window.location.hash !== "#/hub") window.location.hash = "#/hub"; });
  const eventName = shouldRun ? "overlay:start-active" : "overlay:stop";
  const emittedAt = new Date().toISOString();
  await hub.evaluate(async (name) => {
    const { Events } = await import("/wails/runtime.js");
    await Events.Emit(name);
  }, eventName);
  await waitForRole(browser, "overlay", shouldRun);
  return { changed: true, running: shouldRun, emittedAt, mechanism: { kind: "wails-event", eventName } };
}

async function browserRendererProcessIds(browser, cdp) {
  const versionUrl = new URL("/json/version", cdp);
  const response = await fetch(versionUrl);
  if (!response.ok) throw new Error(`CDP browser endpoint ${versionUrl} returned HTTP ${response.status}`);
  const version = await response.json();
  if (!version.webSocketDebuggerUrl) throw new Error(`CDP browser endpoint ${versionUrl} did not expose webSocketDebuggerUrl`);

  const session = await browser.newBrowserCDPSession();
  try {
    const { processInfo = [] } = await session.send("SystemInfo.getProcessInfo");
    return processInfo
      .filter(({ type }) => type === "renderer")
      .map(({ id }) => Number(id))
      .filter(Number.isInteger);
  } finally {
    await session.detach();
  }
}

async function probe(page, durationMs) {
  await page.evaluate(() => {
    const previous = window.__vantareHuellaProbe;
    if (previous) { previous.stopped = true; previous.observer?.disconnect(); }
    const state = { frames: 0, longTasks: [], stopped: false, observer: null };
    const tick = () => { if (!state.stopped) { state.frames += 1; requestAnimationFrame(tick); } };
    try {
      state.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.longTasks.push(entry.duration);
      });
      state.observer.observe({ entryTypes: ["longtask"] });
    } catch { state.observer = null; }
    window.__vantareHuellaProbe = state;
    requestAnimationFrame(tick);
  });
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  return page.evaluate((elapsedMs) => {
    const state = window.__vantareHuellaProbe;
    state.stopped = true;
    state.observer?.disconnect();
    const result = {
      rafPerSecond: state.frames / (elapsedMs / 1_000),
      longTaskCount: state.longTasks.length,
      longTaskTotalMs: state.longTasks.reduce((sum, value) => sum + value, 0),
      longTaskMaxMs: state.longTasks.length ? Math.max(...state.longTasks) : 0,
      widgetCount: document.querySelectorAll('[data-testid="runtime-widget-frame"]').length,
    };
    delete window.__vantareHuellaProbe;
    return result;
  }, durationMs);
}

const cdp = argument("cdp");
const action = argument("action", "inspect");
const output = argument("output");
const durationSeconds = Number(argument("duration", "10"));
const expectedWidgets = Number(argument("expected-widgets", "0"));
if (!cdp || !["inspect", "overlay-start", "overlay-stop", "app-quit"].includes(action) || !Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 120 || !Number.isInteger(expectedWidgets) || expectedWidgets < 0) {
  throw new Error("usage: node huella-cdp.mjs --cdp http://127.0.0.1:9247 --action inspect|overlay-start|overlay-stop|app-quit [--duration 10] [--expected-widgets 3] [--output result.json]");
}

const browser = await chromium.connectOverCDP(cdp);
await waitForRole(browser, "hub", true, 30_000);
if (action === "app-quit") {
  const hub = (await pagesByRole(browser)).find(({ description }) => description.hub)?.page;
  if (!hub) throw new Error("Hub target is not available for clean shutdown");
  await hub.evaluate(async () => {
    const { Application } = await import("/wails/runtime.js");
    await Application.Quit();
  }).catch(() => {
    // El transporte puede desaparecer antes de responder porque Quit cierra
    // precisamente el WebView que ejecutó la petición.
  });
  process.stdout.write(`${JSON.stringify({ schema: "vantare.huella.cdp.v1", action, requested: true })}\n`);
  process.exit(0);
}
const control = action === "inspect" ? null : await setOverlay(browser, action === "overlay-start");
const renderedWidgets = action === "overlay-start" ? await waitForWidgets(browser, expectedWidgets) : 0;
const overlayReadyAt = action === "overlay-start" ? new Date().toISOString() : null;
let rendererProcessIds = [];
let rendererProcessInfoError = null;
if (action === "overlay-start") {
  try {
    rendererProcessIds = await browserRendererProcessIds(browser, cdp);
  } catch (error) {
    rendererProcessInfoError = error instanceof Error ? error.message : String(error);
  }
}
const pages = await pagesByRole(browser);
const targets = await Promise.all(pages.filter(({ description }) => description.hub || description.overlay).map(async ({ page, description }) => ({
  role: description.overlay ? "overlay" : "hub",
  ...description,
  probe: await probe(page, durationSeconds * 1_000),
})));
const result = { schema: "vantare.huella.cdp.v1", capturedAt: new Date().toISOString(), action, control, durationSeconds, expectedWidgets, renderedWidgets, overlayReadyAt, rendererProcessIds, rendererProcessInfoError, targets };
const json = `${JSON.stringify(result, null, 2)}\n`;
if (output) await writeFile(output, json, { encoding: "utf8", flag: "wx" });
process.stdout.write(json);

// Igual que ISA-912: salir solo cierra la conexión diagnóstica. browser.close()
// cerraría el WebView2 que pertenece a la aplicación real.
process.exit(0);
