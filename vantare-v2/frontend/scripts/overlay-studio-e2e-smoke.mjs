/**
 * Overlay Studio Route smoke tests (Playwright + Wails mock harness).
 *
 * Usage:
 *   node scripts/overlay-studio-e2e-smoke.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const PREFERRED_PORT = 5176;
const HARNESS_PATH = "/overlay-studio-route-harness.html";
const LOAD_TIMEOUT_MS = 15_000;

async function startHarnessServer() {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: path.join(FRONTEND_ROOT, "vite.overlay-studio-harness.config.ts"),
    server: {
      host: "127.0.0.1",
      port: PREFERRED_PORT,
      strictPort: false,
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const resolvedPort = typeof address === "object" && address ? address.port : PREFERRED_PORT;
  return {
    server,
    baseUrl: `http://127.0.0.1:${resolvedPort}`,
  };
}

function harnessUrl(baseUrl, seed = "empty") {
  return `${baseUrl}${HARNESS_PATH}?seed=${seed}`;
}

function createConsoleCollector(page) {
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  return errors;
}

function assertNoConsoleErrors(errors, testName) {
  const relevant = errors.filter(
    (entry) => !entry.includes("wails-runtime-mock activo"),
  );
  if (relevant.length > 0) {
    throw new Error(`${testName}: unexpected console errors:\n${relevant.join("\n")}`);
  }
}

async function waitForProfilesBoot(page) {
  await page.waitForFunction(() => {
    const loading = document.querySelector("[data-testid='studio-route-loading']");
    return !loading?.textContent?.includes("Cargando perfiles");
  }, undefined, { timeout: LOAD_TIMEOUT_MS });
}

async function assertEditorLoaded(page, testName) {
  await page.waitForSelector("[data-testid='overlay-studio-v3']", { timeout: LOAD_TIMEOUT_MS });
  await page.waitForSelector("[data-testid='studio-widget-row-standings']", { timeout: LOAD_TIMEOUT_MS });

  const stuckLoading = await page.locator("[data-testid='studio-route-loading']").filter({
    hasText: "Cargando perfil...",
  }).count();
  if (stuckLoading > 0) {
    throw new Error(`${testName}: stuck on Cargando perfil...`);
  }

  const loadError = await page.locator("[data-testid='studio-route-load-error']").count();
  if (loadError > 0) {
    const message = await page.locator("[data-testid='studio-route-load-error']").innerText();
    throw new Error(`${testName}: load error visible: ${message}`);
  }
}

async function testEmptyStateShowsGuidance(page, baseUrl, consoleErrors) {
  await page.goto(harnessUrl(baseUrl, "empty"), { waitUntil: "networkidle" });
  await waitForProfilesBoot(page);

  await page.waitForSelector("[data-testid='no-active-profile-state']", { timeout: LOAD_TIMEOUT_MS });
  const editor = await page.locator("[data-testid='overlay-studio-v3']").count();
  if (editor > 0) {
    throw new Error("empty-state: editor should not render without active profile");
  }

  assertNoConsoleErrors(consoleErrors, "empty-state");
  console.log("ok empty-state");
}

async function testCreateProfileOpensEditor(page, baseUrl, consoleErrors) {
  await page.goto(harnessUrl(baseUrl, "empty"), { waitUntil: "networkidle" });
  await waitForProfilesBoot(page);
  await page.waitForSelector("[data-testid='no-active-profile-state']", { timeout: LOAD_TIMEOUT_MS });

  await page.getByRole("button", { name: "Crear perfil" }).click();
  await page.waitForSelector("[data-testid='studio-create-profile-dialog']", { timeout: LOAD_TIMEOUT_MS });

  await page.getByTestId("studio-create-profile-dialog-input").fill("Race HUD E2E");
  await page.getByTestId("studio-create-profile-dialog-confirm").click();

  await assertEditorLoaded(page, "create-profile");
  assertNoConsoleErrors(consoleErrors, "create-profile");
  console.log("ok create-profile");
}

async function testActiveProfileLoadsEditor(page, baseUrl, consoleErrors) {
  await page.goto(harnessUrl(baseUrl, "active"), { waitUntil: "networkidle" });
  await waitForProfilesBoot(page);
  await assertEditorLoaded(page, "active-profile");

  const noActive = await page.locator("[data-testid='no-active-profile-state']").count();
  if (noActive > 0) {
    throw new Error("active-profile: should not show no-active-profile-state");
  }

  assertNoConsoleErrors(consoleErrors, "active-profile");
  console.log("ok active-profile");
}

async function main() {
  const { chromium } = await import("playwright");
  const { server, baseUrl } = await startHarnessServer();

  let browser;
  let page;
  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

    await testEmptyStateShowsGuidance(page, baseUrl, createConsoleCollector(page));
    await testCreateProfileOpensEditor(page, baseUrl, createConsoleCollector(page));
    await testActiveProfileLoadsEditor(page, baseUrl, createConsoleCollector(page));

    console.log("overlay studio e2e smoke complete");
    process.exit(0);
  } finally {
    void (async () => {
      if (page) {
        await page.close().catch(() => undefined);
      }
      if (browser) {
        await browser.close().catch(() => undefined);
      }
      server.httpServer?.closeAllConnections?.();
      await Promise.race([
        server.close(),
        new Promise((resolve) => {
          setTimeout(resolve, 1000);
        }),
      ]);
    })();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});