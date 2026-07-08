#!/usr/bin/env node
/**
 * Widget Studio Visual Compare — self-sufficient
 * ────────────────────────────────────────────────
 * Starts its own Vite dev server, renders every official design
 * via Playwright, measures getBoundingClientRect(), validates
 * parity invariants, and captures screenshots.
 *
 * Usage:
 *   node frontend/scripts/widget-studio-visual-compare.mjs
 *
 * Exit 0 = all invariants pass.
 * Exit 1 = at least one invariant violated OR Playwright missing.
 *
 * To skip when Playwright is intentionally unavailable:
 *   SKIP_VISUAL_COMPARE=1 node frontend/scripts/widget-studio-visual-compare.mjs
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");
const FRONTEND = path.join(ROOT, "frontend");
const SCREENSHOT_DIR = path.join(ROOT, "docs", "superpowers", "screenshots", "widget-parity");
const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

// ── Official designs to capture ───────────────────────────────────────────────

const DESIGNS = [
  { id: "standings-leaderboard", widgetType: "standings", name: "Standings Leaderboard" },
  { id: "standings-endurance", widgetType: "standings", name: "Standings Endurance" },
  { id: "standings-vantare-crystal", widgetType: "standings", name: "Standings Vantare Crystal" },
  { id: "vantare-racing-essential", widgetType: "relative", name: "Relative Vantare Racing" },
  { id: "broadcast-pro", widgetType: "relative", name: "Relative Broadcast Pro" },
  { id: "relative-vantare-crystal", widgetType: "relative", name: "Relative Vantare Crystal" },
  { id: "delta-time-attack", widgetType: "delta", name: "Delta Time Attack" },
  { id: "delta-broadcast", widgetType: "delta", name: "Delta Broadcast" },
  { id: "delta-vantare-crystal", widgetType: "delta", name: "Delta Vantare Crystal" },
  { id: "pedals-clean-broadcast", widgetType: "pedals", name: "Pedals Clean Broadcast" },
  { id: "pedals-endurance", widgetType: "pedals", name: "Pedals Endurance" },
  { id: "pedals-vantare-crystal", widgetType: "pedals", name: "Pedals Vantare Crystal" },
];

// ── Expected canonical values ─────────────────────────────────────────────────

const STANDINGS_EXPECTED_ROWS = 20;
const RELATIVE_EXPECTED_ROWS = 5;

const CANONICAL_STANDINGS_DRIVERS = [
  "ALPINE", "PORSCHE PENSKE", "FERRARI AF", "CADILLAC RACING",
  "TOYOTA GAZOO", "PEUGEOT", "AF CORSE", "HERTZ TEAM JOTA",
  "BMW M TEAM", "LAMBORGHINI", "ISOTTA FRASCHINI", "PROTON COMP",
  "UNITED AUTOSPORTS", "INTER EUROPOL", "LIGIER JSP320", "GR RACING",
  "MAZDA", "NISSAN", "ASTON MARTIN", "MCLAREN",
];

const CANONICAL_RELATIVE_DRIVERS = [
  "FERRARI AF", "CADILLAC RACING", "TOYOTA GAZOO", "PEUGEOT", "AF CORSE",
];

const ERRORS = [];
const WARNINGS = [];
const captures = [];
const measurements = [];

function fail(msg) { ERRORS.push(msg); console.error(`  ✗ FAIL: ${msg}`); }
function warn(msg) { WARNINGS.push(msg); console.warn(`  ⚠ WARN: ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }

// ── Vite dev server management ────────────────────────────────────────────────

function resolveViteEntry() {
  return path.join(FRONTEND, "node_modules", "vite", "bin", "vite.js");
}

function startViteServer() {
  return new Promise((resolve, reject) => {
    const viteEntry = resolveViteEntry();
    if (!existsSync(viteEntry)) {
      reject(new Error(`Vite entry not found at ${viteEntry}. Run frontend dependency install first.`));
      return;
    }

    const child = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      cwd: FRONTEND,
      env: { ...process.env, CI: "true" },
    });

    let resolved = false;
    const readyInterval = setInterval(async () => {
      if (resolved) return;
      try {
        const resp = await fetch(BASE_URL, { signal: AbortSignal.timeout(500) });
        if (resp.ok) {
          resolved = true;
          clearTimeout(timeout);
          clearInterval(readyInterval);
          resolve(child);
        }
      } catch {
        // not ready yet
      }
    }, 250);

    const timeout = setTimeout(() => {
      if (!resolved) {
        clearInterval(readyInterval);
        child.kill("SIGTERM");
        reject(new Error("Vite dev server did not start within 30 seconds"));
      }
    }, 30000);

    child.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(text);
      if (!resolved && (text.includes("Local:") || text.includes(`localhost:${PORT}`))) {
        resolved = true;
        clearTimeout(timeout);
        clearInterval(readyInterval);
        resolve(child);
      }
    });

    child.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    child.on("error", (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        clearInterval(readyInterval);
        reject(err);
      }
    });

    child.on("exit", (code) => {
      if (!resolved) {
        clearTimeout(timeout);
        clearInterval(readyInterval);
      }
    });
  });
}

async function waitForServer(url, maxAttempts = 30, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ── Playwright measurement and capture ────────────────────────────────────────

async function measureAndCapture(page, design) {
  const url = `${BASE_URL}/widget-parity-harness.html?design=${design.id}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);

  const content = await page.content();

  // ── Measure widget bounding box ──────────────────────────────────────────
  const measurement = await page.evaluate((designId) => {
    const container = document.querySelector(`[data-design-id="${designId}"]`);
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height), x: Math.round(rect.x), y: Math.round(rect.y) };
  }, design.id);

  if (!measurement) {
    fail(`${design.id}: widget panel not found in DOM`);
    return null;
  }

  ok(`size: ${measurement.width}×${measurement.height}`);
  return { measurement, content };
}

function validateInvariants(design, measurement, content) {
  const allOk = [];

  if (design.widgetType === "standings") {
    const rowCount = (content.match(/data-standings-row/g) ?? []).length;
    if (rowCount !== STANDINGS_EXPECTED_ROWS) {
      fail(`${design.id}: standings expected ${STANDINGS_EXPECTED_ROWS} rows, got ${rowCount}`);
    } else {
      ok(`${design.id}: ${rowCount} standings rows`);
      allOk.push(rowCount);
    }

    const hasDriverCol = content.includes('data-standings-col="driverName"');
    if (!hasDriverCol) fail(`${design.id}: missing driverName column`);
    else allOk.push("driverName");

    const templateMatch = content.match(/data-standings-template="([^"]+)"/);
    if (!templateMatch) {
      fail(`${design.id}: missing data-standings-template attribute`);
    } else {
      if (design.id === "standings-vantare-crystal" && templateMatch[1] !== "glassmorphism") {
        fail(`${design.id}: expected data-standings-template="glassmorphism", got "${templateMatch[1]}"`);
      } else if (design.id !== "standings-vantare-crystal" && templateMatch[1] === "glassmorphism") {
        fail(`${design.id}: base/non-glass design must not render data-standings-template="glassmorphism" (got "${templateMatch[1]}")`);
      } else {
        ok(`${design.id}: data-standings-template="${templateMatch[1]}"`);
      }
      allOk.push(`template:${templateMatch[1]}`);
    }

    for (const driver of CANONICAL_STANDINGS_DRIVERS) {
      if (!content.includes(driver)) {
        fail(`${design.id}: missing canonical driver "${driver}"`);
      }
    }
    allOk.push("drivers");
  }

  if (design.widgetType === "relative") {
    const relRowCount = (content.match(/data-relative-row/g) ?? []).length;
    if (relRowCount !== RELATIVE_EXPECTED_ROWS) {
      fail(`${design.id}: relative expected ${RELATIVE_EXPECTED_ROWS} rows, got ${relRowCount}`);
    } else {
      ok(`${design.id}: ${relRowCount} relative rows`);
      allOk.push(relRowCount);
    }

    const hasPlayer = content.includes("TOYOTA GAZOO");
    if (!hasPlayer) fail(`${design.id}: missing player TOYOTA GAZOO`);
    else allOk.push("player");

    for (const d of CANONICAL_RELATIVE_DRIVERS) {
      if (!content.includes(d)) fail(`${design.id}: missing relative driver "${d}"`);
    }
    allOk.push("relative-drivers");

    const hasRelPanel = content.includes('data-testid="relative-panel"');
    if (!hasRelPanel) fail(`${design.id}: missing relative-panel`);
    else allOk.push("relative-panel");
  }

  if (design.widgetType === "delta") {
    if (!content.includes("-0.150") && !content.includes("0.150")) {
      fail(`${design.id}: missing delta value -0.150`);
    } else allOk.push("delta-value");
  }

  if (design.widgetType === "pedals") {
    const hasThr = content.includes("pedal-bar-thr");
    const hasBrk = content.includes("pedal-bar-brk");
    const hasClt = content.includes("pedal-bar-clt");
    if (!hasThr || !hasBrk || !hasClt) {
      fail(`${design.id}: missing pedal bars`);
    } else allOk.push("pedal-bars");
  }

  return allOk;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Widget Studio Visual Compare (self-sufficient)");
  console.log("=".repeat(50));

  if (process.env.SKIP_VISUAL_COMPARE === "1") {
    console.warn("⚠ SKIP_VISUAL_COMPARE=1 — visual parity validation intentionally skipped.");
    console.warn("  To run parity checks, unset SKIP_VISUAL_COMPARE and install Playwright:");
    console.warn("    pnpm add -D playwright && pnpm --dir frontend exec playwright install chromium");
    process.exit(0);
  }

  let chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    console.error("Playwright not installed. Run: pnpm add -D playwright");
    process.exit(1);
  }

  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // ── Start Vite ──────────────────────────────────────────────────────────
  console.log("\nStarting Vite dev server...");
  let viteProcess;
  try {
    viteProcess = await startViteServer();
  } catch (e) {
    console.error(`Failed to start Vite: ${e.message}`);
    process.exit(1);
  }

  try {
    const ready = await waitForServer(BASE_URL);
    if (!ready) {
      fail("Vite dev server did not become ready");
      return;
    }
    console.log("Vite dev server ready.\n");

    const browser = await chromium.launch({ headless: true });

    try {
      for (const design of DESIGNS) {
        console.log(`\n[${design.widgetType}] ${design.name} (${design.id})`);

        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

        try {
          const result = await measureAndCapture(page, design);
          if (result) {
            measurements.push({ design: design.id, ...result.measurement });
            validateInvariants(design, result.measurement, result.content);

            const screenshotPath = path.join(SCREENSHOT_DIR, `${design.id}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            captures.push(screenshotPath);
            ok(`screenshot: ${path.relative(ROOT, screenshotPath)}`);
          }
        } catch (e) {
          fail(`${design.id}: ${e.message}`);
        } finally {
          await page.close();
        }
      }

      // ── Cross-design parity checks ──────────────────────────────────────
      console.log("\n--- Cross-design parity checks ---");

      const standingsSizes = measurements.filter((m) => m.design.startsWith("standings-"));
      if (standingsSizes.length >= 2) {
        const first = standingsSizes[0];
        const allSame = standingsSizes.every((m) => m.width === first.width && m.height === first.height);
        if (!allSame) {
          fail(`standings: preview sizes differ across designs: ${standingsSizes.map((m) => `${m.design}=${m.width}×${m.height}`).join(", ")}`);
        } else {
          ok(`standings: all ${standingsSizes.length} designs have same size ${first.width}×${first.height}`);
        }
      }

      const relativeSizes = measurements.filter((m) => m.design.startsWith("vantare-") || m.design.startsWith("broadcast-") || m.design.startsWith("relative-"));
      if (relativeSizes.length >= 2) {
        const first = relativeSizes[0];
        const allSame = relativeSizes.every((m) => m.width === first.width && m.height === first.height);
        if (!allSame) {
          fail(`relative: preview sizes differ across designs: ${relativeSizes.map((m) => `${m.design}=${m.width}×${m.height}`).join(", ")}`);
        } else {
          ok(`relative: all ${relativeSizes.length} designs have same size ${first.width}×${first.height}`);
        }
      }

      // ── Screenshot sanity ────────────────────────────────────────────────
      for (const cap of captures) {
        const stat = await import("node:fs").then((fs) => fs.statSync(cap));
        if (stat.size < 1000) {
          fail(`screenshot too small: ${path.relative(ROOT, cap)} (${stat.size} bytes)`);
        }
      }

    } finally {
      await browser.close();
    }

  } finally {
    // ── Kill Vite ────────────────────────────────────────────────────────
    if (viteProcess) {
      viteProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(50));
  console.log("Summary:");
  console.log(`  Measurements: ${measurements.length}`);
  console.log(`  Screenshots:  ${captures.length}`);
  console.log(`  Warnings:     ${WARNINGS.length}`);
  console.log(`  Errors:       ${ERRORS.length}`);

  if (measurements.length > 0) {
    console.log("\nMeasurements (getBoundingClientRect):");
    for (const m of measurements) {
      console.log(`  ${m.design}: ${m.width}×${m.height}`);
    }
  }

  if (captures.length > 0) {
    console.log(`\nScreenshots: ${path.relative(ROOT, SCREENSHOT_DIR)}/ (${captures.length} files)`);
  }

  if (ERRORS.length > 0) {
    console.error("\n✗ Parity invariants violated. Fix before committing.");
    process.exit(1);
  }

  console.log("\n✓ All parity invariants passed.");
}

await main();
