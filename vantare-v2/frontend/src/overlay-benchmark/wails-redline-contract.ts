import type { StandingsViewModel } from "../overlay/widget-types/standings/standings-view-model";

export const TRACE_CONTRACT_VERSION = "isa760-wails-redline-trace-v1";

export const SCENARIOS = {
  overtake: { sceneId: "standings-overtake", replay: "redline-viewmodels-v1.jsonl", manifest: "redline-viewmodels-v1.manifest.json" },
  full: { sceneId: "standings-full", replay: "redline-viewmodels-v1.jsonl", manifest: "redline-viewmodels-v1.manifest.json" },
  enter: { sceneId: "standings-car-enters", replay: "redline-viewmodels-v1.jsonl", manifest: "redline-viewmodels-v1.manifest.json" },
  retirement: { sceneId: "standings-retirement", replay: "redline-viewmodels-v1.jsonl", manifest: "redline-viewmodels-v1.manifest.json" },
  stress104: { sceneId: "standings-full", replay: "redline-viewmodels-stress104-v1.jsonl", manifest: "redline-viewmodels-stress104-v1.manifest.json" },
} as const;

export type ScenarioName = keyof typeof SCENARIOS;

export type ReplayRecord = {
  contractVersion: "redline-viewmodels-v1";
  sequence: number;
  sceneId: string;
  widget: "standings";
  updateHz: number;
  logicalMs: number;
  viewModel: StandingsViewModel;
};

export type ReplayManifest = {
  manifestVersion: "redline-viewmodels-manifest-v1";
  contractVersion: "redline-viewmodels-v1";
  replay: { sha256: string; records: number };
  scenes: Array<{ id: string; widget: string; updateHz: number; records: number; firstSequence: number; lastSequence: number }>;
};

export type TraceFrame = {
  sequence: number;
  logicalMs: number;
  expectedRows: number;
  observedRows: number;
  commitMs: number;
  layoutMs: number;
  rafSubmitMs: number;
  scheduleLatenessMs: number;
};

export type WailsRedlineTrace = {
  contractVersion: typeof TRACE_CONTRACT_VERSION;
  complete: true;
  runId: string;
  scenario: ScenarioName;
  sceneId: string;
  replaySha256: string;
  expectedFrames: number;
  viewport: { width: 1920; height: 1080 };
  runtime: { userAgent: string; wailsBridge: boolean; fontsReady: boolean };
  metricSemantics: {
    commitMs: "flushSync React commit";
    layoutMs: "commit through forced layout";
    rafSubmitMs: "commit through next requestAnimationFrame; not DWM presentation";
  };
  frames: TraceFrame[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isScenarioName(value: string): value is ScenarioName {
  return Object.hasOwn(SCENARIOS, value);
}

export function parseManifest(value: unknown): ReplayManifest {
  if (!isObject(value) || value.manifestVersion !== "redline-viewmodels-manifest-v1") {
    throw new Error("invalid replay manifest version");
  }
  const manifest = value as ReplayManifest;
  if (manifest.contractVersion !== "redline-viewmodels-v1" || !isObject(manifest.replay) || !/^[0-9a-f]{64}$/.test(manifest.replay.sha256) || !Array.isArray(manifest.scenes)) {
    throw new Error("invalid replay manifest contract");
  }
  return manifest;
}

export function parseSceneRecords(text: string, manifest: ReplayManifest, sceneId: string): ReplayRecord[] {
  const scene = manifest.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene || scene.widget !== "standings" || scene.updateHz !== 15) {
    throw new Error(`unsupported scene: ${sceneId}`);
  }
  const records = text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as ReplayRecord).filter((record) => record.sceneId === sceneId);
  if (records.length !== scene.records || records[0]?.sequence !== scene.firstSequence || records.at(-1)?.sequence !== scene.lastSequence || records.some((record) => record.contractVersion !== "redline-viewmodels-v1" || record.widget !== "standings" || record.updateHz !== 15 || record.viewModel?.type !== "standings")) {
    throw new Error(`scene custody mismatch: ${sceneId}`);
  }
  return records;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateCompletedTrace(trace: WailsRedlineTrace): void {
  if (trace.contractVersion !== TRACE_CONTRACT_VERSION || trace.complete !== true) throw new Error("invalid trace contract header");
  if (!isScenarioName(trace.scenario) || trace.sceneId !== SCENARIOS[trace.scenario].sceneId) throw new Error("invalid trace scenario");
  if (trace.frames.length !== trace.expectedFrames || trace.expectedFrames === 0) throw new Error("incomplete trace frames");
  if (!trace.runtime.wailsBridge || !trace.runtime.fontsReady) throw new Error("Wails bridge or fonts not ready");
  const invalidFrame = trace.frames.findIndex((frame) => frame.expectedRows !== frame.observedRows || frame.commitMs < 0 || frame.layoutMs < frame.commitMs || frame.rafSubmitMs < frame.layoutMs);
  if (invalidFrame >= 0) {
    const frame = trace.frames[invalidFrame]!;
    throw new Error(`invalid Wails Redline trace frame ${invalidFrame}: rows=${frame.observedRows}/${frame.expectedRows} commit=${frame.commitMs.toFixed(3)} layout=${frame.layoutMs.toFixed(3)} raf=${frame.rafSubmitMs.toFixed(3)}`);
  }
}
