import { Events } from "@wailsio/runtime";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import "../fonts.css";
import "../overlay/design-systems/vantare-endurance/tokens.css";
import "./wails-redline-benchmark.css";
import { StandingsEndurance } from "../overlay/design-systems/vantare-endurance/standings/StandingsEndurance";
import { STANDINGS_ENDURANCE_DEFAULT_SETTINGS } from "../overlay/design-systems/vantare-endurance/standings/standings-endurance-settings";
import { isScenarioName, parseManifest, parseSceneRecords, SCENARIOS, sha256Hex, TRACE_CONTRACT_VERSION, validateCompletedTrace, type TraceFrame, type WailsRedlineTrace } from "./wails-redline-contract";

function nextAnimationFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
}

async function run(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const scenarioName = params.get("scenario") ?? "";
  const runId = params.get("runId") ?? "";
  if (!isScenarioName(scenarioName) || !runId) throw new Error("scenario and runId are required");
  const scenario = SCENARIOS[scenarioName];
  const [replayResponse, manifestResponse] = await Promise.all([fetch(`/${scenario.replay}`), fetch(`/${scenario.manifest}`)]);
  if (!replayResponse.ok || !manifestResponse.ok) throw new Error("benchmark replay assets are unavailable");
  const replayText = await replayResponse.text();
  const manifest = parseManifest(await manifestResponse.json());
  const replaySha256 = await sha256Hex(replayText);
  if (replaySha256 !== manifest.replay.sha256) throw new Error("replay sha256 mismatch");
  const records = parseSceneRecords(replayText, manifest, scenario.sceneId);
  await document.fonts.ready;
  await nextAnimationFrame();
  await nextAnimationFrame();

  const container = document.getElementById("root");
  if (!container) throw new Error("benchmark root is unavailable");
  const root = createRoot(container);
  const frames: TraceFrame[] = [];
  const firstLogicalMs = records[0]!.logicalMs;
  const wallStart = performance.now();
  for (const record of records) {
    const targetElapsedMs = record.logicalMs - firstLogicalMs;
    await wait(targetElapsedMs - (performance.now() - wallStart));
    const start = performance.now();
    flushSync(() => root.render(<main className="isa760-benchmark-stage"><StandingsEndurance model={record.viewModel} settings={STANDINGS_ENDURANCE_DEFAULT_SETTINGS} renderMode="desktop" /></main>));
    const commitEnd = performance.now();
    const renderedRows = document.querySelectorAll("[data-standings-row]");
    container.getBoundingClientRect();
    const layoutEnd = performance.now();
    const rafEnd = await nextAnimationFrame();
    frames.push({ sequence: record.sequence, logicalMs: record.logicalMs, expectedRows: record.viewModel.rows.length, observedRows: renderedRows.length, commitMs: commitEnd - start, layoutMs: layoutEnd - start, rafSubmitMs: rafEnd - start, scheduleLatenessMs: Math.max(0, start - wallStart - targetElapsedMs) });
  }

  const trace: WailsRedlineTrace = {
    contractVersion: TRACE_CONTRACT_VERSION,
    complete: true,
    runId,
    scenario: scenarioName,
    sceneId: scenario.sceneId,
    replaySha256,
    expectedFrames: records.length,
    viewport: { width: 1920, height: 1080 },
    runtime: { userAgent: navigator.userAgent, wailsBridge: typeof Events.Emit === "function", fontsReady: document.fonts.status === "loaded" },
    metricSemantics: { commitMs: "flushSync React commit", layoutMs: "commit through forced layout", rafSubmitMs: "commit through next requestAnimationFrame; not DWM presentation" },
    frames,
  };
  validateCompletedTrace(trace);
  Events.Emit("benchmark:complete", trace);
}

void run().catch((error: unknown) => Events.Emit("benchmark:failed", { message: error instanceof Error ? error.message : String(error) }));
