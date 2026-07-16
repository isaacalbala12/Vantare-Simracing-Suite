/**
 * Overlay Studio V3 drag/resize fluidity benchmark.
 *
 * Usage:
 *   node scripts/overlay-studio-drag-bench.mjs
 *   node scripts/overlay-studio-drag-bench.mjs --update-baseline
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  average,
  computeCompositeScore,
  computeTraceMetrics,
  evaluateGates,
} from "./overlay-studio-drag-bench-metrics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(FRONTEND_ROOT, "..");
const BENCH_ROOT = path.join(REPO_ROOT, "docs", "overlays-studio", "benchmarks");
const TRACES_DIR = path.join(BENCH_ROOT, "traces");
const RESULTS_DIR = path.join(BENCH_ROOT, "results");
const CONFIG_PATH = path.join(BENCH_ROOT, "arrastre-y-resize.benchmark.json");
const BASELINE_PATH = path.join(RESULTS_DIR, "baseline-B1.json");
const PREFERRED_PORT = 5176;
const MOVE_STEP_TIMEOUT_MS = 150;

const updateBaseline = process.argv.includes("--update-baseline");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

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

async function waitForStudioShell(page, widgetTestId) {
  await page.waitForSelector("[data-testid='overlay-studio-v3']");
  await page.waitForSelector("[data-testid='studio-canvas-scene']");
  await page.waitForSelector(`[data-testid='${widgetTestId}']`);
}

async function installLongTaskObserver(page) {
  await page.evaluate(() => {
    if (window.__dragBench?.longTaskObserver) {
      window.__dragBench.longTaskObserver.disconnect();
    }
    window.__dragBench = { longTaskCount: 0, longTaskObserver: null, rafId: 0, frameTimes: [] };
    let last = performance.now();
    const tick = (now) => {
      window.__dragBench.frameTimes.push(now - last);
      last = now;
      window.__dragBench.rafId = requestAnimationFrame(tick);
    };
    window.__dragBench.rafId = requestAnimationFrame(tick);
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            window.__dragBench.longTaskCount += 1;
          }
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
      window.__dragBench.longTaskObserver = observer;
    } catch {
      // unsupported in some headless builds
    }
  });
}

async function readLongTaskStats(page) {
  return page.evaluate(() => {
    const bench = window.__dragBench;
    if (!bench) {
      return { longTaskCount: 0, frameDeltaMs: [] };
    }
    if (typeof bench.rafId === "number") {
      cancelAnimationFrame(bench.rafId);
    }
    if (bench.longTaskObserver) {
      bench.longTaskObserver.disconnect();
    }
    return {
      longTaskCount: bench.longTaskCount ?? 0,
      frameDeltaMs: bench.frameTimes ?? [],
    };
  });
}

async function readFrameGeometry(frame, kind) {
  return frame.evaluate((element, mode) => {
    if (mode === "resize") {
      return {
        width: element.style.width,
        height: element.style.height,
      };
    }
    return {
      left: element.style.left,
      top: element.style.top,
    };
  }, kind);
}

function geometrySignature(geometry, kind) {
  if (kind === "resize") {
    return `${geometry.width}|${geometry.height}`;
  }
  return `${geometry.left}|${geometry.top}`;
}

async function measurePointerStep(page, frame, targetX, targetY, kind) {
  const before = await readFrameGeometry(frame, kind);
  const signatureBefore = geometrySignature(before, kind);
  const startedAt = await page.evaluate(() => performance.now());
  await page.mouse.move(targetX, targetY);

  const changed = await frame.evaluate(
    (element, mode, previousSignature) => {
      const signature =
        mode === "resize"
          ? `${element.style.width}|${element.style.height}`
          : `${element.style.left}|${element.style.top}`;
      return signature !== previousSignature;
    },
    kind,
    signatureBefore,
  );

  if (!changed) {
    try {
      await page.waitForFunction(
        ({ mode, previousSignature }) => {
          const element = document.querySelector("[data-testid='studio-widget-frame-delta-main']");
          if (!element) {
            return false;
          }
          const signature =
            mode === "resize"
              ? `${element.style.width}|${element.style.height}`
              : `${element.style.left}|${element.style.top}`;
          return signature !== previousSignature;
        },
        { mode: kind, previousSignature: signatureBefore },
        { timeout: MOVE_STEP_TIMEOUT_MS },
      );
    } catch {
      return { lagMs: MOVE_STEP_TIMEOUT_MS, dropped: true };
    }
  }

  const endedAt = await page.evaluate(() => performance.now());
  return { lagMs: endedAt - startedAt, dropped: false };
}

/**
 * @param {import('playwright').Page} page
 * @param {Record<string, unknown>} trace
 * @param {Record<string, unknown>} config
 */
async function replayTrace(page, trace, config) {
  const widgetTestId = config.harness.widgetTestId;
  const frame = page.locator(`[data-testid='${widgetTestId}']`);
  await frame.waitFor();

  const box = await frame.boundingBox();
  if (!box) {
    throw new Error(`${trace.name}: widget frame has no bounding box`);
  }

  let anchorX = box.x + box.width / 2;
  let anchorY = box.y + box.height / 2;
  let currentX = anchorX;
  let currentY = anchorY;

  const geometryBefore = await readFrameGeometry(frame, trace.kind);
  const stepLags = [];
  let droppedMoves = 0;
  let moveSteps = 0;

  for (const step of trace.steps) {
    if (step.delayMs) {
      await page.waitForTimeout(step.delayMs);
    }

    switch (step.type) {
      case "select": {
        await frame.click();
        if (trace.handle) {
          const handle = page.locator(`[data-testid='studio-resize-handle-${trace.handle}-delta-main']`);
          await handle.waitFor({ state: "visible" });
          const handleBox = await handle.boundingBox();
          if (!handleBox) {
            throw new Error(`${trace.name}: resize handle has no bounding box`);
          }
          anchorX = handleBox.x + handleBox.width / 2;
          anchorY = handleBox.y + handleBox.height / 2;
          currentX = anchorX;
          currentY = anchorY;
        }
        break;
      }
      case "pointerdown": {
        if (step.target === "handle" && trace.handle) {
          const handle = page.locator(`[data-testid='studio-resize-handle-${trace.handle}-delta-main']`);
          const handleBox = await handle.boundingBox();
          if (!handleBox) {
            throw new Error(`${trace.name}: resize handle has no bounding box`);
          }
          anchorX = handleBox.x + handleBox.width / 2;
          anchorY = handleBox.y + handleBox.height / 2;
          currentX = anchorX;
          currentY = anchorY;
        }
        await installLongTaskObserver(page);
        await page.mouse.move(currentX, currentY);
        await page.mouse.down();
        break;
      }
      case "pointermove": {
        currentX += step.dx ?? 0;
        currentY += step.dy ?? 0;
        moveSteps += 1;
        const measurement = await measurePointerStep(page, frame, currentX, currentY, trace.kind);
        stepLags.push(measurement.lagMs);
        if (measurement.dropped) {
          droppedMoves += 1;
        }
        break;
      }
      case "pointerup": {
        await page.mouse.up();
        break;
      }
      default:
        throw new Error(`${trace.name}: unknown step type ${step.type}`);
    }
  }

  await page.waitForTimeout(80);

  const interaction = await page
    .locator("[data-testid='studio-canvas-viewport']")
    .getAttribute("data-interaction");
  if (interaction !== "idle") {
    throw new Error(`${trace.name}: expected idle after gesture, got ${interaction ?? "null"}`);
  }

  const geometryAfter = await readFrameGeometry(frame, trace.kind);
  const changed =
    geometryBefore.left !== geometryAfter.left
    || geometryBefore.top !== geometryAfter.top
    || geometryBefore.width !== geometryAfter.width
    || geometryBefore.height !== geometryAfter.height;
  if (!changed) {
    throw new Error(`${trace.name}: geometry did not change during gesture`);
  }

  if (
    trace.kind === "resize"
    && geometryBefore.width
    && geometryBefore.height
    && geometryAfter.width
    && geometryAfter.height
  ) {
    const ratioBefore = Number.parseFloat(geometryBefore.width) / Number.parseFloat(geometryBefore.height);
    const ratioAfter = Number.parseFloat(geometryAfter.width) / Number.parseFloat(geometryAfter.height);
    if (Number.isFinite(ratioBefore) && Number.isFinite(ratioAfter) && Math.abs(ratioAfter - ratioBefore) > 0.08) {
      throw new Error(
        `${trace.name}: aspect ratio drift ${ratioBefore.toFixed(3)} -> ${ratioAfter.toFixed(3)}`,
      );
    }
  }

  const longTaskStats = await readLongTaskStats(page);
  const metrics = computeTraceMetrics({
    stepLags,
    frameDeltaMs: longTaskStats.frameDeltaMs,
    longTaskCount: longTaskStats.longTaskCount,
    droppedMoves,
    moveSteps,
  });
  const gateResult = evaluateGates(metrics, config, trace.kind);

  return {
    trace: trace.name,
    kind: trace.kind,
    metrics,
    gates: gateResult,
  };
}

function aggregateResults(traceResults, config) {
  const keys = [
    "pointerLagMs_p50",
    "pointerLagMs_p95",
    "maxPointerLagMs",
    "avgFrameTimeMs",
    "p95FrameTimeMs",
    "droppedFramesPct",
    "jitterPx",
    "longTaskCount",
  ];

  /** @type {Record<string, number>} */
  const aggregate = {};
  for (const key of keys) {
    aggregate[key] = average(traceResults.map((entry) => entry.metrics[key] ?? 0));
  }

  aggregate.compositeScore = computeCompositeScore(aggregate, config);
  const gateFailures = traceResults.flatMap((entry) =>
    entry.gates.failures.map((failure) => `${entry.trace}: ${failure}`),
  );

  return {
    aggregate,
    gateFailures,
    ok: gateFailures.length === 0,
  };
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const config = readJson(CONFIG_PATH);
  const traces = config.traces.map((name) => readJson(path.join(TRACES_DIR, `${name}.json`)));

  const { chromium } = await import("playwright");
  const { server, baseUrl } = await startHarnessServer();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: config.harness.viewport,
      deviceScaleFactor: config.harness.deviceScaleFactor ?? 1,
    });
    const page = await context.newPage();

    const harnessUrl = `${baseUrl}${config.harness.urlPath}?${config.harness.query}`;
    await page.goto(harnessUrl, { waitUntil: "networkidle" });
    await waitForStudioShell(page, config.harness.widgetTestId);

    const traceResults = [];
    for (const trace of traces) {
      await page.goto(harnessUrl, { waitUntil: "networkidle" });
      await waitForStudioShell(page, config.harness.widgetTestId);
      const result = await replayTrace(page, trace, config);
      traceResults.push(result);
      console.log(
        `ok ${trace.name} lag_p95=${result.metrics.pointerLagMs_p95.toFixed(2)}ms score=${computeCompositeScore(result.metrics, config).toFixed(1)}`,
      );
    }

    const summary = aggregateResults(traceResults, config);
    if (!summary.ok) {
      throw new Error(`gate failures:\n- ${summary.gateFailures.join("\n- ")}`);
    }

    const output = {
      generatedAt: new Date().toISOString(),
      variant: config.variant,
      harnessUrl,
      traces: traceResults,
      aggregate: summary.aggregate,
      compositeScore: summary.aggregate.compositeScore,
    };

    const stamp = output.generatedAt.replace(/[:.]/g, "-");
    const runPath = path.join(RESULTS_DIR, `run-${stamp}.json`);
    writeFileSync(runPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`wrote ${runPath}`);
    console.log(`compositeScore=${output.compositeScore.toFixed(2)}`);

    if (updateBaseline) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
      console.log(`updated baseline ${BASELINE_PATH}`);
      return;
    }

    if (existsSync(BASELINE_PATH)) {
      const baseline = readJson(BASELINE_PATH);
      const drop = baseline.compositeScore - output.compositeScore;
      const tolerance = config.regression?.scoreDropTolerance ?? 8;
      if (drop > tolerance) {
        throw new Error(
          `regression: compositeScore dropped ${drop.toFixed(2)} (baseline ${baseline.compositeScore.toFixed(2)} -> ${output.compositeScore.toFixed(2)}, tolerance ${tolerance})`,
        );
      }
      console.log(`regression ok (delta ${drop.toFixed(2)} <= ${tolerance})`);
    } else {
      console.log(`no baseline at ${BASELINE_PATH}; run with --update-baseline to create one`);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});