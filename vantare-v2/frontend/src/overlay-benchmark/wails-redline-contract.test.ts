import { describe, expect, it } from "vitest";
import { parseManifest, parseSceneRecords, TRACE_CONTRACT_VERSION, validateCompletedTrace, type WailsRedlineTrace } from "./wails-redline-contract";

const manifest = {
  manifestVersion: "redline-viewmodels-manifest-v1",
  contractVersion: "redline-viewmodels-v1",
  replay: { sha256: "a".repeat(64), records: 1 },
  scenes: [{ id: "standings-full", widget: "standings", updateHz: 15, records: 1, firstSequence: 4, lastSequence: 4 }],
};

describe("Wails Redline custody contract", () => {
  it("selects only a complete declared standings scene", () => {
    const record = { contractVersion: "redline-viewmodels-v1", sequence: 4, sceneId: "standings-full", widget: "standings", updateHz: 15, logicalMs: 0, viewModel: { type: "standings", rows: [] } };
    expect(parseSceneRecords(`${JSON.stringify(record)}\n`, parseManifest(manifest), "standings-full")).toHaveLength(1);
  });

  it("rejects row parity failures in a completed trace", () => {
    const trace = {
      contractVersion: TRACE_CONTRACT_VERSION,
      complete: true,
      runId: "run-1",
      scenario: "full",
      sceneId: "standings-full",
      replaySha256: "a".repeat(64),
      expectedFrames: 1,
      viewport: { width: 1920, height: 1080 },
      runtime: { userAgent: "WebView2", wailsBridge: true, fontsReady: true },
      metricSemantics: { commitMs: "flushSync React commit", layoutMs: "commit through forced layout", rafSubmitMs: "commit through next requestAnimationFrame; not DWM presentation" },
      frames: [{ sequence: 4, logicalMs: 0, expectedRows: 16, observedRows: 15, commitMs: 1, layoutMs: 2, rafSubmitMs: 3, scheduleLatenessMs: 0 }],
    } satisfies WailsRedlineTrace;
    expect(() => validateCompletedTrace(trace)).toThrow(/trace frame 0/);
  });
});
