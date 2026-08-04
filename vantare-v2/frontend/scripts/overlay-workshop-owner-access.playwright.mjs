import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = Number(process.env.OVERLAY_WORKSHOP_E2E_PORT ?? 4179);
const baseUrl = `http://${host}:${port}`;

function fail(message) {
  throw new Error(`Overlay Workshop owner access check failed: ${message}`);
}

async function waitForPreview(process) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (process.exitCode !== null) fail("Vite preview exited before becoming ready");
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(100);
  }
  fail("Vite preview did not become ready");
}

function licenseWith(operationalRoles) {
  return {
    state: "active",
    entitlements: [],
    operationalRoles,
    userId: "00000000-0000-0000-0000-000000000001",
    email: "not-an-authority@example.test",
    deviceOK: true,
  };
}

async function emitLicense(page, license) {
  await page.evaluate((data) => {
    window._wails?.dispatchWailsEvent?.({ name: "license:changed", data });
  }, license);
}

async function openWorkshop(browser, license) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
  });
  await page.route("**/wails/runtime", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "{}",
  }));
  // Production Wails provides this bootstrap. The static preview used by this
  // browser test does not, so emulate only its empty bootstrap surface.
  await page.route("**/wails/custom.js", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window._wails = window._wails || {};",
  }));
  await page.goto(`${baseUrl}/workshop`, { waitUntil: "networkidle" });
  await emitLicense(page, license);
  return { page, errors };
}

const preview = spawn(process.execPath, ["./node_modules/vite/bin/vite.js", "preview", "--host", host, "--port", String(port), "--strictPort"], {
  stdio: "ignore",
  windowsHide: true,
});

try {
  await waitForPreview(preview);
  const browser = await chromium.launch({ headless: true });
  try {
    const owner = await openWorkshop(browser, licenseWith(["owner"]));
    await owner.page.locator("[data-overlay-workshop-page]").waitFor();
    if (await owner.page.locator("[data-overlay-workshop-access-denied]").count()) {
      fail("verified owner was denied");
    }
    if (owner.errors.length) fail(owner.errors.join("; "));
    await owner.page.close();

    const nonOwner = await openWorkshop(browser, licenseWith(["nightly_tester"]));
    await nonOwner.page.locator("[data-overlay-workshop-access-denied]").waitFor();
    if (await nonOwner.page.locator("[data-overlay-workshop-page], [data-overlay-workshop-stage]").count()) {
      fail("non-owner mounted Workshop controls");
    }
    if (nonOwner.errors.length) fail(nonOwner.errors.join("; "));
    await nonOwner.page.close();
  } finally {
    await browser.close();
  }
  console.log("Overlay Workshop owner/non-owner browser gate passed.");
} finally {
  preview.kill();
}
