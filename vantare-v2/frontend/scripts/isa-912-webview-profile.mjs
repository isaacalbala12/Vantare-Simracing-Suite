import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = argument(name, String(fallback));
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`--${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

async function assertMissing(file) {
  try {
    await access(file);
  } catch {
    return;
  }
  throw new Error(`refusing to overwrite existing evidence: ${file}`);
}

async function describePage(page) {
  return page.evaluate(() => {
    const current = new URL(window.location.href);
    return {
      url: `${current.pathname}${current.hash}`,
      title: document.title,
      overlay:
        typeof window.__vantareOverlayV2Diagnostics === "function"
        || document.querySelector('[data-testid="runtime-overlay-surface"]') !== null,
      hub: document.querySelector(".orbit-root") !== null,
    };
  });
}

async function findPage(browser, role, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const pages = browser.contexts().flatMap((context) => context.pages());
    for (const page of pages) {
      try {
        const description = await describePage(page);
        if (description[role]) return { page, description };
      } catch {
        // A target can disappear while WebView2 is enumerating windows.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  throw new Error(`WebView2 did not expose a ${role} target within ${timeoutMs} ms`);
}

function metricMap(response) {
  return Object.fromEntries(response.metrics.map(({ name, value }) => [name, value]));
}

function deltaMetrics(first, last) {
  const cumulative = [
    "TaskDuration",
    "ScriptDuration",
    "LayoutDuration",
    "RecalcStyleDuration",
    "LayoutCount",
    "RecalcStyleCount",
  ];
  return Object.fromEntries(
    cumulative.map((name) => [name, (last[name] ?? 0) - (first[name] ?? 0)]),
  );
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function traceBucket(name, category) {
  if (/GC|GarbageCollect/i.test(name) || /v8\.gc/i.test(category)) return "gc";
  if (/Layout|UpdateLayoutTree/i.test(name)) return "layout";
  if (/Paint|PrePaint/i.test(name)) return "paint";
  if (/Composite|DrawFrame|Raster/i.test(name)) return "composite";
  if (/RunTask|FunctionCall|EvaluateScript|V8\.Execute/i.test(name)) return "script";
  return null;
}

function summarizeTrace(events) {
  const buckets = Object.fromEntries(
    ["gc", "layout", "paint", "composite", "script"].map((name) => [name, {
      count: 0,
      durationMs: 0,
      maxDurationMs: 0,
    }]),
  );
  for (const event of events) {
    const bucket = traceBucket(event.name ?? "", event.cat ?? "");
    if (!bucket) continue;
    const durationMs = typeof event.dur === "number" ? event.dur / 1_000 : 0;
    buckets[bucket].count += 1;
    buckets[bucket].durationMs += durationMs;
    buckets[bucket].maxDurationMs = Math.max(buckets[bucket].maxDurationMs, durationMs);
  }
  return buckets;
}

async function stopRendererProbe(page) {
  return page.evaluate(() => {
    const state = window.__vantareIsa912Profile;
    if (!state) return { frameIntervalsMs: [], longTasks: [] };
    state.stopped = true;
    state.observer?.disconnect();
    const result = { frameIntervalsMs: state.frames, longTasks: state.longTasks };
    delete window.__vantareIsa912Profile;
    return result;
  });
}

const cdp = argument("cdp");
const role = argument("role", "overlay");
const output = path.resolve(argument("output"));
const durationMs = boundedInteger("duration-ms", 30_000, 5_000, 120_000);
const intervalMs = boundedInteger("interval-ms", 500, 100, 5_000);

if (!cdp || !argument("output") || !["overlay", "hub"].includes(role)) {
  throw new Error(
    "usage: node scripts/isa-912-webview-profile.mjs "
      + "--cdp http://127.0.0.1:9232 --role overlay|hub "
      + "--duration-ms 30000 --interval-ms 500 --output <summary.json>",
  );
}

const traceOutput = output.replace(/\.json$/i, "") + ".trace.json";
await assertMissing(output);
await assertMissing(traceOutput);
await mkdir(path.dirname(output), { recursive: true });

const browser = await chromium.connectOverCDP(cdp);
let page;
let session;
let tracingComplete;
let tracingStarted = false;
let rendererProbeInstalled = false;
const traceEvents = [];
let pullRequests = 0;

try {
  const target = await findPage(browser, role);
  page = target.page;
  const { description } = target;
  session = await page.context().newCDPSession(page);
  session.on("Tracing.dataCollected", ({ value }) => traceEvents.push(...value));
  session.on("Network.requestWillBeSent", ({ request }) => {
    if (/\/pull(?:\?|$)/.test(request.url)) pullRequests += 1;
  });

  await session.send("Performance.enable");
  await session.send("Network.enable");
  tracingComplete = new Promise((resolve) => session.once("Tracing.tracingComplete", resolve));
  await session.send("Tracing.start", {
    transferMode: "ReportEvents",
    categories: [
      "devtools.timeline",
      "v8.execute",
      "blink.user_timing",
      "disabled-by-default-v8.gc",
      "disabled-by-default-devtools.timeline.frame",
    ].join(","),
  });
  tracingStarted = true;

  await page.evaluate(() => {
    const previous = window.__vantareIsa912Profile;
    if (previous) {
      previous.stopped = true;
      previous.observer?.disconnect();
    }
    const state = { frames: [], longTasks: [], stopped: false, previous: null, observer: null };
    const tick = (timestamp) => {
      if (state.stopped) return;
      if (state.previous !== null) state.frames.push(timestamp - state.previous);
      state.previous = timestamp;
      requestAnimationFrame(tick);
    };
    if (typeof PerformanceObserver !== "undefined") {
      try {
        state.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          }
        });
        state.observer.observe({ entryTypes: ["longtask"] });
      } catch {
        state.observer = null;
      }
    }
    window.__vantareIsa912Profile = state;
    requestAnimationFrame(tick);
  });
  rendererProbeInstalled = true;

  const startedAt = new Date().toISOString();
  const performanceSamples = [];
  const deadline = Date.now() + durationMs;
  do {
    const response = await session.send("Performance.getMetrics");
    performanceSamples.push({ atMs: Date.now(), metrics: metricMap(response) });
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - Date.now()))));
  } while (Date.now() < deadline);
  performanceSamples.push({
    atMs: Date.now(),
    metrics: metricMap(await session.send("Performance.getMetrics")),
  });

  const renderer = await stopRendererProbe(page);
  rendererProbeInstalled = false;
  const rendererProbeRemoved = await page.evaluate(
    () => typeof window.__vantareIsa912Profile === "undefined",
  );
  await session.send("Tracing.end");
  await tracingComplete;
  tracingStarted = false;

  const first = performanceSamples[0].metrics;
  const last = performanceSamples.at(-1).metrics;
  const elapsedSeconds = (performanceSamples.at(-1).atMs - performanceSamples[0].atMs) / 1_000;
  const summary = {
    schema: "vantare.isa-912.webview-profile.v1",
    startedAt,
    completedAt: new Date().toISOString(),
    role,
    target: description,
    durationMs,
    intervalMs,
    sampleCount: performanceSamples.length,
    pullRequests,
    pullRequestsPerSecond: elapsedSeconds > 0 ? pullRequests / elapsedSeconds : 0,
    performanceDelta: deltaMetrics(first, last),
    heap: {
      firstUsedBytes: first.JSHeapUsedSize ?? null,
      lastUsedBytes: last.JSHeapUsedSize ?? null,
      maximumUsedBytes: Math.max(...performanceSamples.map(({ metrics }) => metrics.JSHeapUsedSize ?? 0)),
      firstTotalBytes: first.JSHeapTotalSize ?? null,
      lastTotalBytes: last.JSHeapTotalSize ?? null,
    },
    frames: {
      count: renderer.frameIntervalsMs.length,
      p50Ms: percentile(renderer.frameIntervalsMs, 0.50),
      p95Ms: percentile(renderer.frameIntervalsMs, 0.95),
      p99Ms: percentile(renderer.frameIntervalsMs, 0.99),
      maxMs: renderer.frameIntervalsMs.length > 0 ? Math.max(...renderer.frameIntervalsMs) : null,
      over32Ms: renderer.frameIntervalsMs.filter((value) => value > 32).length,
    },
    longTasks: {
      count: renderer.longTasks.length,
      totalDurationMs: renderer.longTasks.reduce((total, entry) => total + entry.duration, 0),
      maxDurationMs: renderer.longTasks.length > 0
        ? Math.max(...renderer.longTasks.map((entry) => entry.duration))
        : null,
    },
    trace: summarizeTrace(traceEvents),
    traceEventCount: traceEvents.length,
    rendererProbeRemoved,
    rawTrace: path.basename(traceOutput),
    performanceSamples,
  };

  await writeFile(traceOutput, JSON.stringify({ traceEvents }), { encoding: "utf8", flag: "wx" });
  await writeFile(output, JSON.stringify(summary, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  const consoleSummary = { ...summary };
  delete consoleSummary.performanceSamples;
  console.log(JSON.stringify(consoleSummary));
} finally {
  if (rendererProbeInstalled && page) {
    await stopRendererProbe(page).catch(() => {});
  }
  if (tracingStarted && session) {
    await session.send("Tracing.end").catch(() => {});
  }
  if (session) {
    await session.detach().catch(() => {});
  }
}

// Do not ask a browser owned by the real app to close. Exiting only drops this
// diagnostic connection and leaves Vantare and LMU untouched.
process.exit(0);
