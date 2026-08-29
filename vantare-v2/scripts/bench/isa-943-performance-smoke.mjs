import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const requireFromFrontend = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium } = requireFromFrontend("playwright");

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const cdp = argument("cdp");
const output = argument("output");
const screenshot = argument("screenshot");
if (!cdp || !output || !screenshot) {
  throw new Error("usage: node isa-943-performance-smoke.mjs --cdp URL --output FILE --screenshot FILE");
}

const browser = await chromium.connectOverCDP(cdp);
const deadline = Date.now() + 30_000;
let hub;
while (!hub && Date.now() < deadline) {
  hub = browser.contexts().flatMap((context) => context.pages()).find((page) =>
    page.url().startsWith("http://wails.localhost/#/hub"),
  );
  if (!hub) await new Promise((resolve) => setTimeout(resolve, 200));
}
if (!hub) throw new Error("Hub target not found");

await hub.evaluate(async () => {
  const { Events } = await import("/wails/runtime.js");
  await Events.Emit("overlay:start-active");
});

let overlay;
while (!overlay && Date.now() < deadline) {
  overlay = browser.contexts().flatMap((context) => context.pages()).find((page) =>
    page.url() === "http://wails.localhost/",
  );
  if (!overlay) await new Promise((resolve) => setTimeout(resolve, 200));
}
if (!overlay) throw new Error("Overlay target not found");

const session = await overlay.context().newCDPSession(overlay);
const targetBefore = (await session.send("Target.getTargetInfo")).targetInfo.targetId;
const observed = [];
overlay.on("response", async (response) => {
  if (!response.url().includes("/_vantare/overlay-telemetry/pull") || response.status() !== 200) return;
  try {
    const body = await response.json();
    for (const event of body.events ?? []) {
      const performance = event?.data?.frame?.capabilities?.performance;
      if (performance) observed.push({ at: new Date().toISOString(), event: event.name, performance });
    }
  } catch {
    // A target can close while Playwright is reading the final response.
  }
});

// A reload keeps the same native overlay window/target and starts a fresh pull
// session, whose first response contains the retained frame and its policy.
await overlay.reload();
while (observed.length === 0 && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (observed.length === 0) throw new Error("Initial capabilities.performance not observed");
const before = observed.at(-1).performance;
const requestedLevel = before.level === 4 ? 2 : 4;

await hub.locator('[data-testid="orbit-rail-ajustes"]').click();
const performanceNav = hub
  .locator('[data-testid="orbit-settings-context"] .orbit-row')
  .filter({ hasText: /Rendimiento|Performance|Prestazioni|Desempenho/i })
  .first();
await performanceNav.click();
await hub.locator(`[data-testid="orbit-settings-performance-${requestedLevel}"]`).click();

while (!observed.some((entry) => entry.performance.level === requestedLevel) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 200));
}
const afterEntry = observed.findLast((entry) => entry.performance.level === requestedLevel);
if (!afterEntry) throw new Error(`Level ${requestedLevel} did not reach capabilities.performance`);

const targetAfter = (await session.send("Target.getTargetInfo")).targetInfo.targetId;
await hub.locator('[data-testid="orbit-settings-performance"]').screenshot({ path: screenshot });
const dom = await hub.locator('[data-testid="orbit-settings-performance"]').evaluate((root) => ({
  testId: root.getAttribute("data-testid"),
  selected: root.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("data-testid"),
  options: [...root.querySelectorAll('[role="radio"]')].map((node) => ({
    testId: node.getAttribute("data-testid"),
    text: node.textContent?.replace(/\s+/g, " ").trim(),
    disabled: node.hasAttribute("disabled"),
  })),
}));
const diagnostics = await overlay.evaluate(() =>
  typeof window.__vantareOverlayV2Diagnostics === "function"
    ? window.__vantareOverlayV2Diagnostics()
    : null,
);
const result = {
  schema: "vantare.isa943.performance-smoke.v1",
  capturedAt: new Date().toISOString(),
  cdp,
  targetBefore,
  targetAfter,
  sameOverlayTarget: targetBefore === targetAfter,
  before,
  requestedLevel,
  after: afterEntry.performance,
  diagnostics,
  dom,
};
await mkdir(dirname(output), { recursive: true });
await mkdir(dirname(screenshot), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(0);
