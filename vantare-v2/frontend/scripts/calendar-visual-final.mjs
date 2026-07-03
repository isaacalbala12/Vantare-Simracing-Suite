import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { spawn, execSync } from "node:child_process";
import http from "node:http";

const __filename = fileURLToPath(import.meta.url);
const FRONTEND = path.resolve(path.dirname(__filename), "..");
const ROOT = path.resolve(FRONTEND, "..");
const OUT = path.join(ROOT, "docs/superpowers/screenshots/calendar-08-final");
const PORT = 5175;
const BASE = `http://localhost:${PORT}`;
const HARNESS_URL = `${BASE}/calendar-harness.html#/hub`;

fs.mkdirSync(OUT, { recursive: true });

// Robust port killer (handles Windows cmd wrapper issues)
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

killPort(PORT);

console.log(`Starting Vite dev server (harness config) on port ${PORT}...`);
const server = spawn("pnpm", ["exec", "vite", "--config", "vite.calendar-harness.config.ts"], {
  cwd: FRONTEND,
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
});

server.stdout.on("data", (d) => process.stdout.write(d));
server.stderr.on("data", (d) => process.stderr.write(d));

try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Vite dev server did not start within 30s")), 30000);
    const poll = () => {
      const req = http.get(`${BASE}/calendar-harness.html`, (res) => {
        clearTimeout(timeout);
        if (res.statusCode === 200) resolve();
        else setTimeout(poll, 500);
      });
      req.on("error", () => setTimeout(poll, 500));
    };
    poll();
  });

  console.log("Vite dev server ready.");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    async function capture(name, page, options) {
      await page.screenshot({ ...options, path: path.join(OUT, name) });
      console.log(`Captured: ${name}`);
    }

    async function openCalendar() {
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
      await page.waitForSelector('[data-testid="rail-card-beginner"]', { state: "visible" });
      await page.waitForTimeout(1500); // Let fade-in animations settle
      return page;
    }

    // ── Hub dashboard ─────────────────────────────────────────────────────────
    {
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2026-07-03T12:00:00Z') });
      page.on("console", msg => console.log("BROWSER CONSOLE:", msg.text()));
      page.on("pageerror", err => console.error("BROWSER ERROR:", err));
      await page.goto(HARNESS_URL);
      await page.waitForLoadState("networkidle");
      await page.waitForSelector('[data-testid="upcoming-card-beginner"]', { state: "visible", timeout: 15000 });
      await page.waitForTimeout(500);
      const emptyText = await page.locator('text=Cargando...').count();
      if (emptyText > 0) throw new Error("Hub dashboard shows Cargando...");
      await capture("hub-dashboard.png", page, { fullPage: false });
      await page.close();
    }

    // ── Toolbar ──────────────────────────────────────────────────────────────
    {
      const page = await openCalendar();
      const nuevaCarrera = await page.locator('text=Nueva carrera').count();
      if (nuevaCarrera > 0) throw new Error("Toolbar shows '+ Nueva carrera' button");
      await capture("calendar-toolbar.png", page, { clip: { x: 360, y: 80, width: 720, height: 80 } });
      await page.close();
    }

    // ── Month view ────────────────────────────────────────────────────────────
    {
      const page = await openCalendar();
      const monthVisible = await page.locator('[data-testid="calendar-month-view"]').count();
      if (monthVisible === 0) throw new Error("Month view not rendered");
      const content = await page.locator('text=Cada 15 min').count();
      if (content === 0) throw new Error("Month view missing content");
      const nuevaCarrera = await page.locator('text=Nueva carrera').count();
      if (nuevaCarrera > 0) throw new Error("Month view shows '+ Nueva carrera' button");
      await capture("calendar-month.png", page, { fullPage: false });
      await page.close();
    }

    // ── Week view ──────────────────────────────────────────────────────────────
    {
      const page = await openCalendar();
      await page.click('[data-testid="calendar-view-btn-week"]');
      await page.waitForSelector('[data-testid="calendar-week-view"]', { state: "visible" });
      const content = await page.locator('text=Cada 15 min').count();
      if (content === 0) throw new Error("Week view missing content");
      await capture("calendar-week.png", page, { fullPage: false });
      await page.close();
    }

    // ── Day view ──────────────────────────────────────────────────────────────
    {
      const page = await openCalendar();
      await page.click('[data-testid="calendar-view-btn-day"]');
      await page.waitForSelector('[data-testid="calendar-day-view"]', { state: "visible" });

      const zeroText = await page.locator('text=0 carreras programadas').count();
      if (zeroText > 0) throw new Error("Day view shows '0 carreras programadas'");

      const nuevaCarrera = await page.locator('text=Nueva carrera').count();
      if (nuevaCarrera > 0) throw new Error("Day view shows '+ Nueva carrera' button");

      // Scroll the day timeline so the first race is visible in the viewport before screenshotting.
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

      // Hard validation: at least one event card must be inside the captured viewport.
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
      if (visibleEventCount === 0) throw new Error("Day view has no event visible in the screenshot viewport");

      await capture("calendar-day.png", page, { fullPage: false });
      await page.close();
    }

    // ── Drawer ───────────────────────────────────────────────────────────────
    {
      const page = await openCalendar();

      await page.waitForTimeout(200);

      // Click the weekly rail card to open drawer (bypasses overlay issues)
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="rail-card-weekly"]');
        if (el) el.click();
      });
      await page.waitForTimeout(500);
      // Wait for drawer to appear
      await page.waitForSelector('[data-testid="calendar-race-detail-drawer"]', { state: "visible", timeout: 10000 });
      await page.waitForTimeout(600);

      // Debug: log drawer content
      const drawerHtml = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="calendar-race-detail-drawer"]');
        return el ? el.innerHTML.substring(0, 2000) : 'NO DRAWER';
      });
      console.log('DRAWER HTML:', drawerHtml);

      const drawerEvents = await page.locator('[data-testid="calendar-detail-drawer-day-item"]').count();
      console.log('DRAWER EVENTS COUNT:', drawerEvents);
      if (drawerEvents === 0) throw new Error("Drawer 'Calendario del día filtrado' is empty — no races shown");
      const quitarBtn = await page.locator('text=Quitar filtro').count();
      if (quitarBtn === 0) throw new Error("Drawer missing 'Quitar filtro' button");

      const nuevaCarrera = await page.locator('text=Nueva carrera').count();
      if (nuevaCarrera > 0) throw new Error("Drawer shows '+ Nueva carrera' button");

      await capture("calendar-drawer.png", page, { fullPage: false });
      await page.close();
    }

    await context.close();
  } finally {
    await browser.close();
  }
} finally {
  console.log("Cleaning up Vite dev server...");
  killPort(PORT);
  console.log("Final screenshots saved to:", OUT);
}
