import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, gzipSync, gunzipSync, inflateSync } from "node:zlib";
import { chromium } from "playwright";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(frontend, "test-results", "posthog-wails-spike");
const vitePort = 5186;
const capturePort = 5187;
const baseUrl = `http://127.0.0.1:${vitePort}/posthog-wails-spike-harness.html`;
const captureHost = `http://127.0.0.1:${capturePort}`;
const secretValues = [
  "SYNTHETIC_QUERY_SECRET",
  "SYNTHETIC_VISIBLE_TEXT_SECRET",
  "SYNTHETIC_INPUT_SECRET",
  "SYNTHETIC_EVENT_TOKEN_SECRET",
  "SYNTHETIC_EXCEPTION_SECRET",
  "tester@example.invalid",
];
const hardTimeoutMs = 60_000;
const locatorTimeoutMs = 8_000;

fs.mkdirSync(output, { recursive: true });

function portOwners(port) {
  if (process.platform !== "win32") return [];
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ','`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  return result.stdout.trim().split(",").map((value) => value.trim()).filter(Boolean);
}

for (const port of [vitePort, capturePort]) {
  const owners = portOwners(port);
  if (owners.length > 0) {
    throw new Error(`PostHog spike cannot start: port ${port} is owned by PID(s) ${owners.join(", ")}.`);
  }
}

const requests = [];
let offlineMode = false;
let offlineResponses = 0;
const captureServer = http.createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const body = Buffer.concat(chunks);
    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body,
    });
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (offlineMode) {
      offlineResponses += 1;
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end('{"error":"synthetic offline"}');
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    if (request.url?.includes("/array/") && request.url.includes("/config")) {
      response.end(
        JSON.stringify({
          supportedCompression: [],
          autocapture_opt_out: true,
          capturePerformance: false,
          sessionRecording: {
            sampleRate: "1",
            masking: { maskAllInputs: true, maskTextSelector: "*" },
            networkPayloadCapture: { recordBody: false, recordHeaders: false },
          },
          surveys: false,
          productTours: false,
          toolbarParams: {},
          toolbarVersion: "toolbar",
          isAuthenticated: false,
          siteApps: [],
          hasFeatureFlags: false,
        }),
      );
      return;
    }
    response.end(request.url?.includes("flags") ? '{"featureFlags":{}}' : '{"status":1}');
  });
});

await new Promise((resolve, reject) => {
  captureServer.once("error", reject);
  captureServer.listen(capturePort, "127.0.0.1", resolve);
});

const viteEntry = path.join(frontend, "node_modules", "vite", "bin", "vite.js");
const vite = spawn(
  process.execPath,
  [viteEntry, "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"],
  {
    cwd: frontend,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  },
);

let viteOutput = "";
vite.stdout.on("data", (chunk) => {
  viteOutput += chunk.toString();
});
vite.stderr.on("data", (chunk) => {
  viteOutput += chunk.toString();
});

async function waitForVite() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(baseUrl, (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      });
      request.setTimeout(1_000, () => {
        request.destroy();
        resolve(false);
      });
      request.on("error", () => resolve(false));
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Vite did not start for PostHog spike.\n${viteOutput}`);
}

function stopVite() {
  if (!vite.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(vite.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-vite.pid, "SIGTERM");
  } catch {
    // The process group already exited.
  }
}

function closeCaptureServer() {
  return new Promise((resolve) => captureServer.close(resolve));
}

function decodeRequestText(request) {
  let body = request.body;
  const contentEncoding = String(request.headers["content-encoding"] ?? "").toLowerCase();
  try {
    if (contentEncoding === "gzip") body = gunzipSync(body);
    if (contentEncoding === "deflate") body = inflateSync(body);
  } catch (error) {
    throw new Error(`Could not decode ${contentEncoding} request body: ${error}`);
  }

  const raw = body.toString("utf8");
  const decoded = [request.url ?? "", raw];
  try {
    decoded.push(decodeURIComponent(raw.replace(/\+/gu, " ")));
  } catch {
    // The body is not URL encoded.
  }

  const form = new URLSearchParams(raw);
  for (const [key, value] of form) {
    decoded.push(value);
    const usesBase64 =
      key === "data" &&
      (request.url?.includes("compression=base64") ||
        form.get("compression") === "base64");
    if (usesBase64) {
      decoded.push(Buffer.from(value, "base64").toString("utf8"));
    }
  }
  return decoded.join("\n");
}

function validateDecoderFixtures() {
  const base64Secret = "SYNTHETIC_BASE64_DECODER_SECRET";
  const fixtures = [
    {
      name: "gzip",
      expected: "SYNTHETIC_GZIP_DECODER_SECRET",
      request: {
        url: "/e/",
        headers: { "content-encoding": "gzip" },
        body: gzipSync("SYNTHETIC_GZIP_DECODER_SECRET"),
      },
    },
    {
      name: "deflate",
      expected: "SYNTHETIC_DEFLATE_DECODER_SECRET",
      request: {
        url: "/e/",
        headers: { "content-encoding": "deflate" },
        body: deflateSync("SYNTHETIC_DEFLATE_DECODER_SECRET"),
      },
    },
    {
      name: "urlencoded",
      expected: "SYNTHETIC URLENCODED DECODER SECRET",
      request: {
        url: "/e/",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: Buffer.from("payload=SYNTHETIC+URLENCODED+DECODER+SECRET"),
      },
    },
    {
      name: "base64",
      expected: base64Secret,
      request: {
        url: "/e/?compression=base64",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: Buffer.from(
          `data=${encodeURIComponent(Buffer.from(base64Secret).toString("base64"))}&compression=base64`,
        ),
      },
    },
  ];

  for (const fixture of fixtures) {
    if (!decodeRequestText(fixture.request).includes(fixture.expected)) {
      throw new Error(`Request decoder fixture failed: ${fixture.name}`);
    }
  }
  return fixtures.length;
}

const decoderFixturesValidated = validateDecoderFixtures();

async function waitForPortRelease(port) {
  const deadline = Date.now() + 2_000;
  while (portOwners(port).length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

let browser;
let hardTimeout;
try {
  hardTimeout = setTimeout(async () => {
    await browser?.close();
    stopVite();
    await closeCaptureServer();
    await waitForPortRelease(vitePort);
    process.exit(124);
  }, hardTimeoutMs);

  await waitForVite();
  browser = await chromium.launch({ headless: true, timeout: 10_000 });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
  });
  page.setDefaultTimeout(locatorTimeoutMs);

  const pageErrors = [];
  const unexpectedConsoleProblems = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (!["warning", "error"].includes(message.type())) return;
    if (
      offlineMode &&
      (message.text().includes("PostHog") ||
        message.text().includes("Failed to load resource"))
    ) {
      return;
    }
    unexpectedConsoleProblems.push(`${message.type()}: ${message.text()}`);
  });

  const pageUrl = `${baseUrl}?token=SYNTHETIC_QUERY_SECRET&apiHost=${encodeURIComponent(captureHost)}#private`;
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await page.waitForFunction(() => window.__posthogSpike?.ready === true);
  await page.waitForTimeout(500);

  if (requests.length !== 0) {
    throw new Error(
      `SDK sent ${requests.length} request(s) before consent: ${requests
        .map((request) => `${request.method} ${request.url}`)
        .join(", ")}.`,
    );
  }

  await page.getByTestId("consent").click();
  await page.waitForTimeout(250);
  await page.getByTestId("start-recording").click();
  await page.getByTestId("sensitive-input").fill("SYNTHETIC_INPUT_SECRET_CHANGED");
  await page.getByTestId("capture-error").click();
  try {
    await page.waitForFunction(() => {
      const names = window.__posthogSpike.events.map((event) => event.event);
      return names.includes("synthetic_error_triggered") && names.includes("$exception") && names.includes("$snapshot");
    });
  } catch (error) {
    const spikeState = await page.evaluate(() => window.__posthogSpike);
    const captured = spikeState.events.map((event) => event.event);
    const status = await page.getByTestId("status").textContent();
    throw new Error(
      `Timed out waiting for PostHog events. Captured: ${JSON.stringify(captured)}. ` +
        `Status: ${status}. Requests: ${requests.map((request) => `${request.method} ${request.url}`).join(", ")}. ` +
        `Diagnostics: ${JSON.stringify(spikeState.diagnostics)}. Page errors: ${pageErrors.join(" | ")}. ` +
        `Console: ${unexpectedConsoleProblems.join(" | ")}. ${error}`,
    );
  }
  await page.waitForTimeout(750);

  const eventsBeforeStop = await page.evaluate(() => window.__posthogSpike.events);
  const serializedEvents = JSON.stringify(eventsBeforeStop);
  for (const secret of secretValues) {
    if (serializedEvents.includes(secret)) {
      throw new Error(`Sensitive value leaked into captured events: ${secret}`);
    }
  }

  const eventNames = eventsBeforeStop.map((event) => event.event);
  for (const requiredEvent of ["synthetic_error_triggered", "$exception", "$snapshot"]) {
    if (!eventNames.includes(requiredEvent)) {
      throw new Error(`Expected event was not captured: ${requiredEvent}`);
    }
  }

  await page.getByTestId("stop-recording").click();
  await page.waitForTimeout(500);
  const snapshotsAfterStop = await page.evaluate(
    () => window.__posthogSpike.events.filter((event) => event.event === "$snapshot").length,
  );
  await page.getByTestId("sensitive-input").fill("SYNTHETIC_AFTER_STOP_SECRET");
  await page.waitForTimeout(750);
  const snapshotsAfterMutation = await page.evaluate(
    () => window.__posthogSpike.events.filter((event) => event.event === "$snapshot").length,
  );
  if (snapshotsAfterMutation !== snapshotsAfterStop) {
    throw new Error("Session replay continued after stopSessionRecording().");
  }

  await page.getByTestId("start-recording").click();
  await page.waitForFunction(
    (previousCount) =>
      window.__posthogSpike.events.filter((event) => event.event === "$snapshot")
        .length > previousCount,
    snapshotsAfterMutation,
  );
  await page.getByTestId("opt-out").click();
  await page.waitForTimeout(500);
  const eventsAtOptOut = await page.evaluate(() => window.__posthogSpike.events.length);
  const snapshotsAtOptOut = await page.evaluate(
    () => window.__posthogSpike.events.filter((event) => event.event === "$snapshot").length,
  );
  const requestsAtOptOut = requests.length;
  await page.getByTestId("sensitive-input").fill("SYNTHETIC_AFTER_OPTOUT_SECRET");
  await page.getByTestId("capture-error").click();
  await page.waitForTimeout(750);
  const eventsAfterOptOut = await page.evaluate(() => window.__posthogSpike.events.length);
  if (eventsAfterOptOut !== eventsAtOptOut) {
    throw new Error("Events were captured after consent was revoked.");
  }
  const snapshotsAfterOptOut = await page.evaluate(
    () => window.__posthogSpike.events.filter((event) => event.event === "$snapshot").length,
  );
  if (snapshotsAfterOptOut !== snapshotsAtOptOut) {
    throw new Error("Active session replay continued after consent was revoked.");
  }
  if (requests.length !== requestsAtOptOut) {
    throw new Error("Outbound requests continued after consent was revoked.");
  }

  await page.getByTestId("consent").click();
  offlineMode = true;
  await page.getByTestId("offline-capture").click();
  await page.getByTestId("responsiveness").click();
  await page.getByTestId("responsiveness-count").waitFor({ state: "visible" });
  if ((await page.getByTestId("responsiveness-count").textContent()) !== "1") {
    throw new Error("The harness became unresponsive during an offline capture.");
  }
  if ((await page.getByTestId("status").textContent()) !== "offline-call-returned") {
    throw new Error("Offline capture did not return control to the application.");
  }
  const offlineDeadline = Date.now() + 2_000;
  while (offlineResponses === 0 && Date.now() < offlineDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (offlineResponses === 0) {
    throw new Error("The synthetic receiver never exercised the 503 offline path.");
  }

  const finalEvents = await page.evaluate(() => window.__posthogSpike.events);
  const capturedText = JSON.stringify(finalEvents);
  const outboundText = requests.map(decodeRequestText).join("\n");
  for (const secret of secretValues) {
    if (capturedText.includes(secret)) {
      throw new Error(`Sensitive value leaked into captured events: ${secret}`);
    }
    if (outboundText.includes(secret)) {
      throw new Error(`Sensitive value leaked into decoded outbound data: ${secret}`);
    }
  }

  if (pageErrors.length > 0 || unexpectedConsoleProblems.length > 0) {
    throw new Error(
      `Browser problems:\n${[...pageErrors, ...unexpectedConsoleProblems].join("\n")}`,
    );
  }

  const report = {
    initialSdkState: "uninitialized-until-consent",
    preConsentRequests: 0,
    capturedEventNames: [...new Set(eventNames)].sort(),
    outboundRequestsAfterConsent: requests.length,
    privacySecretsChecked: secretValues.length,
    decoderFixturesValidated,
    replayStopped: true,
    optOutStoppedActiveReplayAndCapture: true,
    offlineKeptUiResponsive: true,
    offlineResponsesObserved: offlineResponses,
  };
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearTimeout(hardTimeout);
  await browser?.close();
  stopVite();
  await closeCaptureServer();
  await waitForPortRelease(vitePort);
}
