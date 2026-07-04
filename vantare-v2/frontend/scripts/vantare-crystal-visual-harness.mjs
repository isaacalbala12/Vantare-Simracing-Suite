/**
 * Vantare Crystal Visual Harness
 * ─────────────────────────────
 * Captures a full-page screenshot of the HTML reference for Vantare Crystal
 * widget styling, then documents the manual comparison approach.
 *
 * Usage:
 *   node frontend/scripts/vantare-crystal-visual-harness.mjs
 *
 * Requires: playwright (pnpm add -D playwright)
 * If playwright is not installed the script prints instructions and exits cleanly.
 */

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");

const SCREENSHOT_DIR = path.join(
  ROOT,
  "docs",
  "superpowers",
  "screenshots",
  "vantare-crystal",
);
const HTML_REF = path.join(
  ROOT,
  "docs",
  "overlay-vantare-crystal-widgets.html",
);

async function main() {
  console.log("Vantare Crystal Visual Harness");
  console.log("=".repeat(36));

  // ── prerequisite checks ──────────────────────────────────────────
  if (!existsSync(HTML_REF)) {
    console.error("HTML reference not found:", HTML_REF);
    console.error(
      "Create docs/overlay-vantare-crystal-widgets.html before running.",
    );
    process.exit(1);
  }

  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // ── attempt playwright capture ───────────────────────────────────
  try {
    const { chromium } = await import("playwright");

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });

    const fileUrl = `file:///${HTML_REF.replace(/\\/g, "/")}`;
    await page.goto(fileUrl, { waitUntil: "networkidle" });

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "html-reference.png"),
      fullPage: true,
    });

    console.log("\nScreenshot saved:", path.join(SCREENSHOT_DIR, "html-reference.png"));

    await page.close();
    await browser.close();
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("Cannot find module") ||
        e.code === "ERR_MODULE_NOT_FOUND")
    ) {
      console.log("\nPlaywright is not installed.");
      console.log("Install it with:  pnpm add -D playwright");
      console.log(
        "Then re-run this script to capture a baseline screenshot.\n",
      );
    } else {
      console.error("\nUnexpected error during screenshot capture:");
      console.error(e);
    }
  }

  // ── document comparison approach ──────────────────────────────────
  console.log("Comparison approach:");
  console.log(
    "  1. Open the WidgetStudio shell with the Vantare Crystal overlay theme.",
  );
  console.log(
    "  2. For each widget preview, compare against the HTML reference above.",
  );
  console.log(
    "  3. Key areas to check: badge colors, border radius, typography,",
  );
  console.log(
    "     spacing/padding, background fills, and icon rendering.",
  );
  console.log(
    "  4. When a pixel-level diff is needed, use the html-reference.png",
  );
  console.log(
    "     baseline captured in:  " + SCREENSHOT_DIR,
  );
  console.log("");
}

await main();
