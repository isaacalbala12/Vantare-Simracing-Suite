import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const evidenceRoot = path.join(repoRoot, "docs", "analysis", "isa-92-overlay-studio-parity");
const artifactRoot = path.join(evidenceRoot, "artifacts");

const viewports = {
  wide: { width: 1920, height: 1080 },
  medium: { width: 1280, height: 900 },
  compact: { width: 900, height: 900 },
};

async function rect(locator) {
  const box = await locator.boundingBox();
  if (!box) return null;
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 100) / 100]));
}

async function loadSelectedState(page, baseUrl) {
  await page.goto(`${baseUrl}/overlay-studio-route-harness.html?seed=active`, { waitUntil: "networkidle" });
  try {
    await page.getByTestId("overlay-studio-v3").waitFor();
  } catch (error) {
    await page.screenshot({ path: path.join(artifactRoot, "strict-route-load-error.png") });
    const text = (await page.locator("body").innerText()).slice(0, 1200);
    throw new Error(`route did not render Overlay Studio at ${page.url()}: ${text}\n${String(error)}`);
  }
  await page.getByTestId("studio-widget-row-boost-box").click();
  await page.locator(".osv3-inspector-layout").waitFor();
  await page.getByTestId("studio-zoom-plus").click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function seedUserDesigns(page) {
  if (!await page.getByTestId("studio-design-user-empty").count()) return;
  for (const name of ["Time Attack", "Broadcast"]) {
    await page.getByTestId("studio-design-save-open").click();
    await page.getByTestId("studio-save-design-name").fill(name);
    await page.getByTestId("studio-save-design-confirm").click();
    await page.getByTestId("studio-save-design-dialog").waitFor({ state: "detached" });
  }
  await page.getByTestId("studio-header").scrollIntoViewIfNeeded();
  await page.locator(".osv3-inspector-section-frame__body").hover();
  await page.mouse.wheel(0, -2000);
  await page.waitForTimeout(300);
}

async function applyOfficialDesign(page) {
  const officialSection = page.getByTestId("studio-design-official-section");
  const apply = officialSection.getByRole("button", { name: /aplicar|apply/i }).first();
  if (await apply.count()) {
    await apply.click();
    await officialSection.locator('[data-design-active="true"]').waitFor();
  }
}

async function collectGeometry(page) {
  const selectors = {
    shell: ".v52-shell-bg",
    header: "[data-testid='studio-header']",
    grid: "[data-testid='studio-responsive-grid']",
    catalog: "[data-testid='studio-widget-list-panel']",
    canvas: "[data-testid='studio-canvas-slot']",
    toolbar: "[data-testid='studio-canvas-toolbar']",
    stage: ".osv3-canvas-stage",
    footer: "[data-testid='studio-preview-source-controls']",
    inspector: "[data-testid='studio-inspector-slot']",
    rail: "[data-testid='studio-inspector-rail']",
    inspectorBody: ".osv3-inspector-content",
    actionBar: "[data-testid='studio-canvas-action-bar']",
  };
  const entries = await Promise.all(Object.entries(selectors).map(async ([name, selector]) => {
    const locator = page.locator(selector).first();
    return [name, await locator.count() ? await rect(locator) : null];
  }));
  return Object.fromEntries(entries);
}

async function collectWideEvidence(page) {
  return page.evaluate(() => {
    const boxes = (selectors) => selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map((element) => {
        const value = element.getBoundingClientRect();
        return {
          selector,
          x: Math.round(value.x * 100) / 100,
          y: Math.round(value.y * 100) / 100,
          width: Math.round(value.width * 100) / 100,
          height: Math.round(value.height * 100) / 100,
        };
      }),
    );
    const style = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        backgroundColor: computed.backgroundColor,
        borderColor: computed.borderColor,
        borderRadius: computed.borderRadius,
        backdropFilter: computed.backdropFilter,
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
      };
    };
    return {
      dynamicTextBoxes: boxes([
        ".osv3-header__breadcrumb span:last-child",
        ".osv3-list-panel__count",
        ".osv3-list-panel__row-name",
        ".osv3-inspector-rail__name",
        ".osv3-design-list__name",
      ]),
      allowedCanvasInterior: boxes([".osv3-canvas-stage"])[0] ?? null,
      styles: {
        workbench: style(".osv3-workbench"),
        catalog: style(".osv3-list-panel"),
        canvas: style(".osv3-canvas-column"),
        inspector: style(".osv3-inspector-slot"),
        selectedRow: style(".osv3-list-panel__row--selected .osv3-list-panel__row-name"),
        designCard: style('.osv3-design-list__item[data-design-active="true"]'),
      },
      page: {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      },
    };
  });
}

async function main() {
  await fs.mkdir(artifactRoot, { recursive: true });
  const server = await createServer({
    root: frontendRoot,
    configFile: path.join(frontendRoot, "vite.overlay-studio-harness.config.ts"),
    server: { host: "127.0.0.1", port: 5176, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === "object" && address ? address.port : 5176;
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: viewports.wide, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const failedResponses = [];
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) {
      failedResponses.push(`response ${response.status()}: ${response.url()}`);
    }
  });
  page.on("console", (message) => {
    if (
      message.type() === "error"
      && !message.text().includes("wails-runtime-mock activo")
      && !message.text().includes("Failed to load resource: the server responded with a status of 404")
    ) {
      consoleErrors.push(`console.error: ${message.text()}`);
    }
  });

  try {
    const geometry = {};
    let wideEvidence = null;

    await loadSelectedState(page, baseUrl);
    await applyOfficialDesign(page);
    await seedUserDesigns(page);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    geometry.wide = await collectGeometry(page);
    wideEvidence = await collectWideEvidence(page);
    await page.screenshot({ path: path.join(artifactRoot, "strict-real-wide.png") });

    await page.getByTestId("studio-menu-button").click();
    await page.getByTestId("studio-save-button").click();
    await page.getByTestId("studio-save-status").filter({ hasText: /guardado|saved/i }).waitFor();
    await page.getByTestId("studio-menu-button").click();
    await page.screenshot({ path: path.join(artifactRoot, "strict-state-saved.png") });

    await page.getByTestId("studio-inspector-visibility-toggle").click();
    await page.screenshot({ path: path.join(artifactRoot, "strict-state-disabled.png") });
    await page.getByTestId("studio-inspector-visibility-toggle").click();

    await page.getByTestId("studio-canvas-options-toggle").click();
    await page.getByTestId("studio-background-select").selectOption("solid-black");
    await page.getByTestId("studio-canvas-options-toggle").click();
    await page.screenshot({ path: path.join(artifactRoot, "strict-state-solid.png") });

    await page.getByTestId("studio-canvas-viewport").click({ position: { x: 1180, y: 760 } });
    await page.screenshot({ path: path.join(artifactRoot, "strict-state-no-selection.png") });

    await page.setViewportSize(viewports.medium);
    await loadSelectedState(page, baseUrl);
    await page.getByTestId("studio-inspector-toggle").click();
    await page.waitForTimeout(220);
    geometry.medium = await collectGeometry(page);
    await page.screenshot({ path: path.join(artifactRoot, "strict-real-medium.png") });

    await page.setViewportSize(viewports.compact);
    await page.goto(`${baseUrl}/overlay-studio-route-harness.html?seed=active`, { waitUntil: "networkidle" });
    await page.getByTestId("overlay-studio-v3").waitFor();
    await page.getByTestId("studio-list-drawer-toggle").click();
    await page.getByTestId("studio-widget-row-boost-box").click();
    await page.locator(".osv3-inspector-layout").waitFor();
    await page.waitForTimeout(220);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      const main = document.querySelector(".scrollable-main");
      if (main) main.scrollTop = 0;
    });
    geometry.compact = await collectGeometry(page);
    await page.screenshot({ path: path.join(artifactRoot, "strict-real-compact-inspector.png") });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(220);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      const main = document.querySelector(".scrollable-main");
      if (main) {
        main.scrollTop = 0;
        main.scrollLeft = 0;
      }
    });
    await page.screenshot({ path: path.join(artifactRoot, "strict-real-compact.png") });

    await fs.writeFile(
      path.join(evidenceRoot, "strict-route-geometry.json"),
      `${JSON.stringify({ viewports, geometry, wideEvidence, consoleErrors: [...consoleErrors, ...failedResponses] }, null, 2)}\n`,
      "utf8",
    );
    if (consoleErrors.length > 0 || failedResponses.length > 0) {
      throw new Error([...consoleErrors, ...failedResponses].join("\n"));
    }
    console.log(`strict route captures written to ${artifactRoot}`);
  } finally {
    await page.close();
    await browser.close();
    server.httpServer?.closeAllConnections?.();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
