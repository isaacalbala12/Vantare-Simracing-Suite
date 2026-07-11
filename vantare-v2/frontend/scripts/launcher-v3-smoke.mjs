import { chromium } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const baseURL = process.env.LAUNCHER_SMOKE_URL ?? "http://127.0.0.1:5173/#/hub";
const screenshotPath = path.join(os.tmpdir(), "vantare-launcher-v3-smoke.png");
const browser = await chromium.launch({ headless: true });

try {
  const consoleErrors = [];
  const failedRequests = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (!request.url().includes("/wails/") && failure !== "net::ERR_ABORTED") failedRequests.push(request.url());
  });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.getByTestId("topbar-nav-launcher").click({ force: true });
  await page.waitForTimeout(350);
  const onboarding = page.getByTestId("launcher-onboarding-skip");
  if (await onboarding.count()) await onboarding.click();
  await page.getByRole("heading", { name: "Launcher" }).waitFor();
  if (await page.locator('[data-testid^="app-row-"]').count() !== 7) throw new Error("expected seven catalog apps");
  if (await page.locator('[data-testid^="profile-card-"]').count() !== 2) throw new Error("expected two official profile cards");
  await page.getByTestId("profile-edit-creator").click();
  await page.getByTestId("profile-editor-advanced-toggle").click();
  if (await page.getByTestId("editor-step-args-0").count() !== 1) throw new Error("advanced args input missing");
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(baseURL, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1800);
  await mobile.getByTestId("topbar-nav-launcher").click({ force: true });
  await mobile.waitForTimeout(350);
  const mobileSkip = mobile.getByTestId("launcher-onboarding-skip");
  if (await mobileSkip.count()) await mobileSkip.click();
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("mobile launcher overflows horizontally");
  if (consoleErrors.length > 0) throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
  if (failedRequests.length > 0) throw new Error(`failed requests: ${failedRequests.join(" | ")}`);
  await fs.access(screenshotPath);
  console.log(JSON.stringify({ ok: true, apps: 7, profiles: 2, screenshotPath }));
} finally {
  await browser.close();
}
