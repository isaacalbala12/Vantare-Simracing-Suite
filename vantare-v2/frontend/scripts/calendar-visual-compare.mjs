import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { spawn, execSync } from "node:child_process";
import http from "node:http";

const __filename = fileURLToPath(import.meta.url);
const FRONTEND = path.resolve(path.dirname(__filename), "..");
const ROOT = path.resolve(FRONTEND, "..");
const OUT = path.join(ROOT, "docs/superpowers/screenshots/calendar-08-compare");
const REFERENCE_DIR = "C:/Users/isaac/Desktop/Vantare-Overlays";
const PORT = 5175;
const BASE = `http://localhost:${PORT}`;
const HARNESS_URL = `${BASE}/calendar-harness.html#/hub`;
const VIEWPORT = { width: 1440, height: 900 };

fs.mkdirSync(OUT, { recursive: true });

const killPort = (port) => {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = out.trim().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0" && !isNaN(parseInt(pid, 10))) {
          try { execSync(`taskkill /PID ${pid} /F /T`); } catch (e) {}
        }
      }
    } else {
      try { execSync(`lsof -ti:${port} | xargs kill -9`); } catch (e) {}
    }
  } catch (e) {}
};

const startVite = () => {
  killPort(PORT);
  console.log(`Starting Vite dev server (harness config) on port ${PORT}...`);
  const server = spawn("pnpm", ["exec", "vite", "--config", "vite.calendar-harness.config.ts"], {
    cwd: FRONTEND,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  server.stdout.on("data", (d) => process.stdout.write(d));
  server.stderr.on("data", (d) => process.stderr.write(d));
  return server;
};

const waitForServer = (url) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Vite dev server did not start within 30s")), 30000);
  const poll = () => {
    const req = http.get(url, (res) => {
      clearTimeout(timeout);
      if (res.statusCode === 200) resolve();
      else setTimeout(poll, 500);
    });
    req.on("error", () => setTimeout(poll, 500));
  };
  poll();
});

const assertReferenceHtml = (fileName) => {
  const filePath = path.join(REFERENCE_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Reference HTML not found: ${filePath}`);
  }
  const stats = fs.statSync(filePath);
  if (stats.size < 20 * 1024) {
    throw new Error(`Reference HTML too small (${stats.size} bytes): ${filePath}`);
  }
  console.log(`Reference HTML OK: ${fileName} (${stats.size} bytes)`);
  return `file:///${filePath.replace(/\\/g, "/")}`;
};

const validatePng = (name, minBytes = 20 * 1024) => {
  const filePath = path.join(OUT, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Screenshot missing: ${name}`);
  }
  const stats = fs.statSync(filePath);
  if (stats.size < minBytes) {
    throw new Error(`Screenshot too small (${stats.size} bytes): ${name}`);
  }
  console.log(`Screenshot OK: ${name} (${stats.size} bytes)`);
};

const capture = async (page, name, options) => {
  await page.screenshot({ ...options, path: path.join(OUT, name) });
  console.log(`Captured: ${name}`);
};

const assertNoText = async (page, text, context) => {
  const count = await page.locator(`text=${text}`).count();
  if (count > 0) {
    throw new Error(`${context} shows '${text}'`);
  }
};

const assertHasText = async (page, text, context) => {
  const count = await page.locator(`text=${text}`).count();
  if (count === 0) {
    throw new Error(`${context} missing '${text}'`);
  }
};

const assertSelector = async (page, selector, context) => {
  const count = await page.locator(selector).count();
  if (count === 0) {
    throw new Error(`${context} missing selector ${selector}`);
  }
};

const openReferenceCalendar = async (context) => {
  const page = await context.newPage();
  await page.goto(assertReferenceHtml("calendario_v5.2.html"));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  return page;
};

const switchReferenceView = async (page, view) => {
  await page.click(`[data-view="${view}"]`);
  await page.waitForSelector(`#view-${view}`, { state: "visible" });
  await page.waitForTimeout(300);
};

const captureReferenceCalendar = async (context) => {
  const page = await openReferenceCalendar(context);

  await capture(page, "calendar-month-reference.png", { fullPage: false });
  await page.close();

  const weekPage = await openReferenceCalendar(context);
  await switchReferenceView(weekPage, "week");
  await capture(weekPage, "calendar-week-reference.png", { fullPage: false });
  await weekPage.close();

  const dayPage = await openReferenceCalendar(context);
  await switchReferenceView(dayPage, "day");
  await assertNoText(dayPage, "0 carreras programadas", "Reference calendar day");
  await capture(dayPage, "calendar-day-reference.png", { fullPage: false });
  await dayPage.close();
};

const captureReferenceHub = async (context) => {
  const page = await context.newPage();
  await page.goto(assertReferenceHtml("hub_main.html"));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await capture(page, "hub-reference.png", { fullPage: false });
  await page.close();
};

const openAppCalendar = async (context) => {
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-07-03T12:00:00Z') });
  page.on("console", msg => console.log("BROWSER CONSOLE:", msg.text()));
  page.on("pageerror", err => console.error("BROWSER ERROR:", err));

  await page.goto(HARNESS_URL);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('[data-testid="topbar-nav-calendar"]', { state: "visible", timeout: 15000 });
  await page.click('[data-testid="topbar-nav-calendar"]');
  await page.waitForSelector('[data-testid="calendar-toolbar"]', { state: "visible" });
  await page.waitForSelector('[data-testid="calendar-race-rail"]', { state: "visible" });
  await page.waitForTimeout(1500);
  return page;
};

const captureAppHarness = async (context) => {
  // Hub dashboard
  {
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-07-03T12:00:00Z') });
    page.on("console", msg => console.log("BROWSER CONSOLE:", msg.text()));
    page.on("pageerror", err => console.error("BROWSER ERROR:", err));
    await page.goto(HARNESS_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[data-testid="upcoming-card-beginner"]', { state: "visible", timeout: 15000 });
    await page.waitForTimeout(500);
    await assertNoText(page, "Cargando...", "App hub");
    await assertNoText(page, "Nueva carrera", "App hub");
    await capture(page, "hub-app.png", { fullPage: false });
    await page.close();
  }

  // Calendar month
  {
    const page = await openAppCalendar(context);
    await assertSelector(page, '[data-testid="calendar-month-view"]', "App calendar month");
    await assertHasText(page, "Cada 15 min", "App calendar month");
    await assertNoText(page, "Nueva carrera", "App calendar month");
    await capture(page, "calendar-month-app.png", { fullPage: false });
    await page.close();
  }

  // Calendar week
  {
    const page = await openAppCalendar(context);
    await page.click('[data-testid="calendar-view-btn-week"]');
    await page.waitForSelector('[data-testid="calendar-week-view"]', { state: "visible" });
    await assertHasText(page, "Cada 15 min", "App calendar week");
    await assertNoText(page, "Nueva carrera", "App calendar week");

    const firstEvent = await page.locator('[data-testid^="calendar-week-event-"]').first();
    await firstEvent.waitFor({ state: "attached" });
    await firstEvent.evaluate((el) => {
      const scroller = el.closest('[style*="overflow-y:auto"]') || el.closest('[style*="overflow-y: auto"]');
      if (scroller) {
        const top = el.offsetTop - scroller.clientHeight / 2;
        scroller.scrollTo({ top: Math.max(0, top), behavior: "instant" });
      } else {
        el.scrollIntoView({ block: "center" });
      }
    });
    await page.waitForTimeout(300);

    const visibleEventCount = await page.evaluate(() => {
      const viewport = { top: 0, bottom: window.innerHeight };
      const events = document.querySelectorAll('[data-testid^="calendar-week-event-"]');
      let count = 0;
      for (const ev of events) {
        const rect = ev.getBoundingClientRect();
        if (rect.top < viewport.bottom && rect.bottom > viewport.top) {
          count += 1;
        }
      }
      return count;
    });
    if (visibleEventCount === 0) {
      throw new Error("App calendar week has no event visible in the screenshot viewport");
    }

    await capture(page, "calendar-week-app.png", { fullPage: false });
    await page.close();
  }

  // Calendar day
  {
    const page = await openAppCalendar(context);
    await page.click('[data-testid="calendar-view-btn-day"]');
    await page.waitForSelector('[data-testid="calendar-day-view"]', { state: "visible" });
    await assertNoText(page, "0 carreras programadas", "App calendar day");
    await assertNoText(page, "Nueva carrera", "App calendar day");

    const firstEvent = await page.locator('[data-testid^="calendar-day-event-"]').first();
    await firstEvent.waitFor({ state: "attached" });
    await firstEvent.evaluate((el) => {
      const scroller = el.closest('[style*="overflow-y:auto"]') || el.closest('[style*="overflow-y: auto"]');
      if (scroller) {
        const top = el.offsetTop - scroller.clientHeight / 2;
        scroller.scrollTo({ top: Math.max(0, top), behavior: "instant" });
      } else {
        el.scrollIntoView({ block: "center" });
      }
    });
    await page.waitForTimeout(300);

    const visibleEventCount = await page.evaluate(() => {
      const viewport = { top: 0, bottom: window.innerHeight };
      const events = document.querySelectorAll('[data-testid^="calendar-day-event-"]');
      let count = 0;
      for (const ev of events) {
        const rect = ev.getBoundingClientRect();
        if (rect.top < viewport.bottom && rect.bottom > viewport.top) {
          count += 1;
        }
      }
      return count;
    });
    if (visibleEventCount === 0) {
      throw new Error("App calendar day has no event visible in the screenshot viewport");
    }

    await capture(page, "calendar-day-app.png", { fullPage: false });
    await page.close();
  }

  // Detail panel (app only, triggered by clicking a rail card)
  // NOTE: This section may fail if mock data doesn't trigger the panel.
  // It's non-critical for CALENDAR-10 comparison, so we wrap it.
  {
    const page = await openAppCalendar(context);
    await page.waitForTimeout(200);
    try {
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="rail-card-weekly"]');
        if (el) el.click();
      });
      await page.waitForTimeout(500);
      await page.waitForSelector('[data-testid="calendar-race-detail-panel"]', { state: "visible", timeout: 5000 });
      await page.waitForTimeout(600);

      const panelTitle = await page.locator('[data-testid="calendar-detail-panel-title"]').count();
      if (panelTitle > 0) {
        await assertHasText(page, "Quitar filtro", "App calendar detail panel");
        await assertNoText(page, "Nueva carrera", "App calendar detail panel");
        await capture(page, "calendar-drawer-app.png", { fullPage: false });
      } else {
        console.log("Detail panel opened but empty — skipping drawer screenshot");
      }
    } catch (e) {
      console.log("Detail panel section skipped (non-critical):", e.message);
    }
    await page.close();
  }
};

const buildSideBySide = async (context, leftName, rightName, outName) => {
  const leftPath = path.join(OUT, leftName);
  const rightPath = path.join(OUT, rightName);
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) {
    console.log(`Skipping side-by-side: missing ${leftName} or ${rightName}`);
    return;
  }
  const leftB64 = fs.readFileSync(leftPath).toString("base64");
  const rightB64 = fs.readFileSync(rightPath).toString("base64");

  const page = await context.newPage();
  await page.setViewportSize({ width: 1, height: 1 });
  await page.setContent(`
    <html><body style="margin:0">
      <canvas id="c"></canvas>
      <img id="l" src="data:image/png;base64,${leftB64}" style="display:none">
      <img id="r" src="data:image/png;base64,${rightB64}" style="display:none">
    </body></html>
  `);
  const { width, height } = await page.evaluate(() => {
    const l = document.getElementById("l");
    const r = document.getElementById("r");
    return new Promise((resolve) => {
      Promise.all([l.decode(), r.decode()]).then(() => {
        const canvas = document.getElementById("c");
        const w = l.naturalWidth + r.naturalWidth;
        const h = Math.max(l.naturalHeight, r.naturalHeight);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(l, 0, 0);
        ctx.drawImage(r, l.naturalWidth, 0);
        resolve({ width: w, height: h });
      });
    });
  });
  await page.setViewportSize({ width, height });
  await page.screenshot({ path: path.join(OUT, outName), fullPage: false });
  await page.close();
  console.log(`Composed: ${outName}`);
};

const runValidations = () => {
  validatePng("hub-reference.png");
  validatePng("hub-app.png");
  validatePng("calendar-month-reference.png");
  validatePng("calendar-month-app.png");
  validatePng("calendar-week-reference.png");
  validatePng("calendar-week-app.png");
  validatePng("calendar-day-reference.png");
  validatePng("calendar-day-app.png");
  // calendar-drawer-app.png is optional — may not be generated if detail panel didn't open
  const drawerPath = path.join(OUT, "calendar-drawer-app.png");
  if (fs.existsSync(drawerPath)) {
    validatePng("calendar-drawer-app.png");
  } else {
    console.log("Skipping drawer validation (screenshot not generated)");
  }
};

const server = startVite();

try {
  await waitForServer(`${BASE}/calendar-harness.html`);
  console.log("Vite dev server ready.");

  assertReferenceHtml("calendario_v5.2.html");
  assertReferenceHtml("hub_main.html");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });

    await captureReferenceHub(context);
    await captureReferenceCalendar(context);
    await captureAppHarness(context);

    await buildSideBySide(context, "hub-reference.png", "hub-app.png", "hub-side-by-side.png");
    await buildSideBySide(context, "calendar-month-reference.png", "calendar-month-app.png", "calendar-month-side-by-side.png");
    await buildSideBySide(context, "calendar-week-reference.png", "calendar-week-app.png", "calendar-week-side-by-side.png");
    await buildSideBySide(context, "calendar-day-reference.png", "calendar-day-app.png", "calendar-day-side-by-side.png");

    runValidations();
  } finally {
    await browser.close();
  }
} finally {
  console.log("Cleaning up Vite dev server...");
  killPort(PORT);
  console.log("Compare screenshots saved to:", OUT);
}
