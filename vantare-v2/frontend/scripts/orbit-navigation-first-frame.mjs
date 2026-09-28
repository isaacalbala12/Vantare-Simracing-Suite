import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.VITE_RUNTIME_MOCK = "mock";
const server = await createServer({
  root: frontend,
  configFile: path.join(frontend, "vite.config.ts"),
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
let browser;

try {
  await server.listen();
  const url = new URL("orbit-shell-harness.html", server.resolvedUrls.local[0]);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url.href, { waitUntil: "networkidle" });
  await page.getByTestId("orbit-shell").waitFor();

  const firstFrame = await page.evaluate(() => new Promise((resolve, reject) => {
    const button = document.querySelector('.orbit-rail__button[aria-label="Ajustes"]');
    if (!button) return reject(new Error("Ajustes is absent from the rail"));
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error("Ajustes did not mount"));
    }, 5000);
    const observer = new MutationObserver(() => {
      const view = document.querySelector(".orbit-workspace > .orbit-set");
      if (!view) return;
      window.clearTimeout(timeout);
      observer.disconnect();
      const head = view.querySelector(".orbit-set__head-copy");
      const panel = view.querySelector(".orbit-set__panel");
      resolve({
        context: document.querySelector(".orbit-column__context")?.textContent?.trim() ?? "",
        headOpacity: head ? getComputedStyle(head).opacity : null,
        panelOpacity: panel ? getComputedStyle(panel).opacity : null,
        headTransform: head ? getComputedStyle(head).transform : null,
        panelTransform: panel ? getComputedStyle(panel).transform : null,
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    button.click();
  }));

  assert.ok(firstFrame.context.includes("Secciones"), "context column must paint with the page");
  assert.equal(firstFrame.headOpacity, "1", "page heading must be visible on first paint");
  assert.equal(firstFrame.panelOpacity, "1", "page panel must be visible on first paint");
  assert.equal(firstFrame.headTransform, "none", "heading must not jump vertically");
  assert.equal(firstFrame.panelTransform, "none", "panel must not jump vertically");

  await page.getByTestId("orbit-settings-context").getByText("Rendimiento", { exact: true }).click();
  const performancePanel = page.getByTestId("orbit-settings-panel-performance");
  await performancePanel.waitFor();
  const switchedPanel = await performancePanel.evaluate((element) => ({
    opacity: getComputedStyle(element).opacity,
    transform: getComputedStyle(element).transform,
  }));
  assert.deepEqual(switchedPanel, { opacity: "1", transform: "none" },
    "switching Settings tabs must not restart a hidden or moving panel");
  console.log("Orbit navigation first frame PASS");
} finally {
  await browser?.close();
  await server.close();
}
