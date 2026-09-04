import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import { buildDeltaTraceViewModel } from "./delta-trace-view-model";
import {
  buildDeltaTraceViewModelV2,
  deltaTraceDisplayedValues,
} from "./delta-trace-view-model-v2";

function golden(vehicles: number): OverlayUpdateV2 {
  return JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`),
      "utf8",
    ),
  ) as OverlayUpdateV2;
}

function goldenFrame(): OverlayFrameV2 {
  const update = golden(20);
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}

function frameWithDelta(
  frame: OverlayFrameV2,
  deltaSeconds: number | undefined,
  capturedAtMS: readonly number[],
  seconds: readonly number[],
): OverlayFrameV2 {
  return {
    ...frame,
    delta: {
      seconds:
        deltaSeconds === undefined ? { q: "missing" } : { v: deltaSeconds, q: "fresh" },
      reference: "personal-best",
      requested: "personal-best",
      available: deltaSeconds === undefined ? [] : ["personal-best"],
      history: { q: "fresh", capturedAtMS: [...capturedAtMS], seconds: [...seconds] },
    },
  };
}

const T0 = 1786711200000;

describe("delta-trace v2 view model", () => {
  it("decodifica la serie del wire y expone el instante actual", () => {
    const base = goldenFrame();
    const content = { windowSeconds: 8, showSectors: true, showTrackMap: true };
    const capturedAtMS = [0, 1, 2, 3, 4, 5].map((index) => T0 + index * 100);
    const seconds = [0.5, 0.4, 0.3, 0.2, 0.1, 0.05];
    const model = buildDeltaTraceViewModelV2(frameWithDelta(base, 0.05, capturedAtMS, seconds), { state: "live" }, content);
    expect(model.points).toEqual(capturedAtMS.map((capturedAt, index) => ({ capturedAt, deltaSeconds: seconds[index] })));
    expect(model.currentDelta).toBeCloseTo(0.05, 9);
    expect(model.showSectors).toBe(true);
    expect(model.showTrackMap).toBe(true);
  });

  it("placeholders cuando delta missing y lifecycle", () => {
    const base = goldenFrame();
    const content = { windowSeconds: 4, showSectors: true, showTrackMap: true };
    const missing = buildDeltaTraceViewModelV2(
      frameWithDelta(base, undefined, [], []),
      { state: "live" },
      content,
    );
    expect(missing.points).toEqual([]);
    expect(missing.currentDelta).toBeUndefined();
    expect(missing.trend).toBe("unknown");

    expect(buildDeltaTraceViewModelV2(base, { state: "error", reason: "boom" }, content).status).toBe("error");
    expect(buildDeltaTraceViewModelV2(base, { state: "stopped" }, content).status).toBe("disconnected");
    expect(buildDeltaTraceViewModelV2(base, { state: "stale" }, content).status).toBe("stale");
  });

  it("trend gaining cuando los últimos 10 promedian mejor que los 10 anteriores", () => {
    const base = goldenFrame();
    const content = { windowSeconds: 8, showSectors: true, showTrackMap: true };
    const capturedAtMS = Array.from({ length: 20 }, (_, index) => T0 + index * 200);
    const seconds = Array.from({ length: 20 }, (_, index) => (index < 10 ? 0.2 : -0.2));
    const model = buildDeltaTraceViewModelV2(frameWithDelta(base, -0.2, capturedAtMS, seconds), { state: "live" }, content);
    expect(model.trend).toBe("gaining");
  });

  it("respeta windowSeconds contra el instante más nuevo del wire", () => {
    const base = goldenFrame();
    const narrow = { windowSeconds: 1, showSectors: false, showTrackMap: false };
    // Tres puntos separados 400 ms y uno final 2,1 s después: con ventana de
    // 1 s solo sobrevive el último.
    const capturedAtMS = [T0, T0 + 400, T0 + 800, T0 + 2500];
    const seconds = [0.0, 0.1, 0.2, 0.9];
    const model = buildDeltaTraceViewModelV2(frameWithDelta(base, 0.9, capturedAtMS, seconds), { state: "live" }, narrow);
    expect(model.points).toEqual([{ capturedAt: T0 + 2500, deltaSeconds: 0.9 }]);
  });

  it("equivalencia de tendencia con v1 sobre historia de 20 puntos", () => {
    const base = goldenFrame();
    const content = { windowSeconds: 8, showSectors: true, showTrackMap: true };
    const capturedAtMS = Array.from({ length: 20 }, (_, index) => T0 + index * 100);
    const seconds = Array.from({ length: 20 }, (_, index) => (index < 10 ? 0.2 : -0.2));
    const v2 = buildDeltaTraceViewModelV2(frameWithDelta(base, -0.2, capturedAtMS, seconds), { state: "live" }, content);

    const deltaHistory = Array.from({ length: 20 }, (_, index) => ({
      capturedAt: index,
      deltaSeconds: index < 10 ? 0.2 : -0.2,
    }));
    const snapshot = {
      status: "ready" as const,
      capturedAt: Date.now(),
      session: { type: "race" as const },
      player: { inPit: false },
      scoring: [],
      derived: { fuelHistory: [], inputHistory: [], deltaHistory },
    };
    const v1 = buildDeltaTraceViewModel(snapshot, content);
    expect(v2.trend).toBe(v1.trend);
    expect(v2.trend).toBe("gaining");
  });

  it("descarta series desalineadas o no finitas sin inventar puntos", () => {
    const base = goldenFrame();
    const content = { windowSeconds: 8, showSectors: true, showTrackMap: true };
    const misaligned = {
      ...frameWithDelta(base, 0.1, [T0, T0 + 100], [0.1]),
      delta: {
        ...frameWithDelta(base, 0.1, [T0, T0 + 100], [0.1]).delta,
        history: { q: "fresh" as const, capturedAtMS: [T0, T0 + 100], seconds: [0.1] },
      },
    };
    expect(buildDeltaTraceViewModelV2(misaligned, { state: "live" }, content).points).toEqual([]);

    const nonFinite = frameWithDelta(base, 0.1, [T0], [Number.NaN]);
    expect(buildDeltaTraceViewModelV2(nonFinite, { state: "live" }, content).points).toEqual([]);
  });

  it("expone proyección estable", () => {
    const base = goldenFrame();
    const model = buildDeltaTraceViewModelV2(
      frameWithDelta(base, 0.1, [T0], [0.1]),
      { state: "live" },
      { windowSeconds: 4, showSectors: true, showTrackMap: true },
    );
    const displayed = deltaTraceDisplayedValues(model);
    expect(Object.keys(displayed).sort()).toEqual(["currentDelta", "points", "status", "trend"]);
  });
});
