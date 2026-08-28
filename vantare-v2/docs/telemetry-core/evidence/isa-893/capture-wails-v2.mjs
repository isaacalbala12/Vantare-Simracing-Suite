import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const requireFromFrontend = createRequire(
  new URL("../../../../frontend/package.json", import.meta.url),
);
const { chromium } = requireFromFrontend("playwright");

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? "" : process.argv[index + 1] ?? "";
}

const cdp = argument("cdp");
const output = argument("output");
const screenshot = argument("screenshot");
if (!cdp || !output || !screenshot) {
  throw new Error("usage: node capture-wails-v2.mjs --cdp URL --output FILE --screenshot FILE");
}

const expected = [
  "delta", "standings", "relative", "pedals", "broadcast-tower",
  "fuel-strategy", "pedals-telemetry", "pedals-telemetry-compact",
  "racing-flags", "delta-trace", "race-schedule", "head-to-head",
  "delta-advanced", "input-telemetry", "multiclass-relative",
  "track-weather", "car-damage-visual", "car-damage-numbers",
  "engineer-radio", "track-map",
];

const browser = await chromium.connectOverCDP(cdp);
const deadline = Date.now() + 30_000;
let overlay;
while (Date.now() < deadline) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (page.url() !== "http://wails.localhost/") continue;
      const count = await page.locator('[data-testid="runtime-widget-frame"]').count();
      if (count === expected.length) {
        overlay = page;
        break;
      }
    }
    if (overlay) break;
  }
  if (overlay) break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (!overlay) throw new Error("the Wails overlay did not render all 20 widget frames");

await overlay.waitForTimeout(2_000);
const observed = await overlay.evaluate((types) => {
  const frames = [...document.querySelectorAll('[data-testid="runtime-widget-frame"]')];
  const widgets = frames.map((frame) => {
    const id = frame.getAttribute("data-widget-id") ?? "";
    const type = types.find((candidate) => id === `bench-${candidate}`) ?? "unknown";
    return {
      id,
      type,
      painted: frame.childElementCount > 0 && frame.getBoundingClientRect().width > 0
        && frame.getBoundingClientRect().height > 0,
      text: (frame.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 160),
      diagnosticCodes: [...frame.querySelectorAll("[data-diagnostic-code]")]
        .map((node) => node.getAttribute("data-diagnostic-code")),
      rendererError: frame.querySelector('[data-testid="widget-render-diagnostic"]')?.textContent ?? null,
    };
  });
  return {
    url: window.location.href,
    title: document.title,
    widgets,
    diagnostics: typeof window.__vantareOverlayV2Diagnostics === "function"
      ? window.__vantareOverlayV2Diagnostics()
      : null,
  };
}, expected);

const actualTypes = observed.widgets.map((widget) => widget.type).sort();
const expectedTypes = [...expected].sort();
if (JSON.stringify(actualTypes) !== JSON.stringify(expectedTypes)) {
  throw new Error(`unexpected widget catalogue: ${JSON.stringify(actualTypes)}`);
}
if (observed.widgets.some((widget) => !widget.painted || widget.rendererError)) {
  throw new Error(`widget did not paint cleanly: ${JSON.stringify(observed.widgets)}`);
}
const authorityFailures = observed.widgets.flatMap((widget) => widget.diagnosticCodes)
  .filter((code) => code?.startsWith("overlay-v2-") || code === "widget-authority-missing");
if (authorityFailures.length > 0) {
  throw new Error(`Overlay V2 authority diagnostics were visible: ${authorityFailures.join(", ")}`);
}
if (!observed.diagnostics
  || !(observed.diagnostics.overlay_v2_parse_duration?.count >= 1)) {
  throw new Error(`no live Overlay V2 frames were decoded: ${JSON.stringify(observed.diagnostics)}`);
}

await overlay.screenshot({ path: screenshot, fullPage: true });
await writeFile(output, `${JSON.stringify({
  schema: "vantare.isa-893.wails-v2.v1",
  capturedAt: new Date().toISOString(),
  cdp,
  expectedWidgetCount: expected.length,
  ...observed,
}, null, 2)}\n`, { encoding: "utf8", flag: "wx" });

// Deliberadamente no se llama browser.close(): la aplicación Wails es la dueña
// de WebView2. El proceso se cierra después mediante Application.Quit por CDP.
process.exit(0);
