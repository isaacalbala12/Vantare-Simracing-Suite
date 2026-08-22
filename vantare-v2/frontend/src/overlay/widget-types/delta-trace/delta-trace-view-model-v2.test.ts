import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import { buildDeltaTraceViewModel } from "./delta-trace-view-model";
import {
  buildDeltaTraceViewModelV2,
  deltaTraceDisplayedValues,
  resetDeltaTraceHistory,
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

function frameWithDelta(frame: OverlayFrameV2, deltaSeconds: number | undefined, at: string): OverlayFrameV2 {
  return {
    ...frame,
    generatedAt: at,
    delta:
      deltaSeconds === undefined
        ? { seconds: { q: "missing" }, requested: "personal-best", available: [] }
        : { seconds: { v: deltaSeconds, q: "fresh" }, reference: "personal-best", requested: "personal-best", available: ["personal-best"] },
  };
}

describe("delta-trace v2 view model", () => {
  beforeEach(() => resetDeltaTraceHistory());

  it("acumula puntos desde el frame v2 y expone serie temporal acotada", () => {
    const base = goldenFrame();
    const content = { windowSeconds: 8, showSectors: true, showTrackMap: true };
    // Simular 5 frames con delta decreciente.
    for (let i = 0; i < 5; i += 1) {
      const at = new Date(Date.parse(base.generatedAt) + i * 100).toISOString();
      buildDeltaTraceViewModelV2(frameWithDelta(base, 0.5 - i * 0.1, at), { state: "live" }, content);
    }
    const lastAt = new Date(Date.parse(base.generatedAt) + 500).toISOString();
    const model = buildDeltaTraceViewModelV2(frameWithDelta(base, 0.05, lastAt), { state: "live" }, content);
    expect(model.points.length).toBe(6);
    expect(model.currentDelta).toBeCloseTo(0.05, 9);
    expect(model.showSectors).toBe(true);
    expect(model.showTrackMap).toBe(true);
  });

  it("placeholders cuando delta missing y lifecycle", () => {
    const base = goldenFrame();
    const content = { windowSeconds: 4, showSectors: true, showTrackMap: true };
    const missing = buildDeltaTraceViewModelV2(frameWithDelta(base, undefined, base.generatedAt), { state: "live" }, content);
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
    // 10 puntos en 0.2 luego 10 en -0.2 -> gaining.
    for (let i = 0; i < 20; i += 1) {
      const delta = i < 10 ? 0.2 : -0.2;
      const at = new Date(Date.parse(base.generatedAt) + i * 200).toISOString();
      buildDeltaTraceViewModelV2(frameWithDelta(base, delta, at), { state: "live" }, content);
    }
    const snap = frameWithDelta(base, -0.2, new Date(Date.parse(base.generatedAt) + 4000).toISOString());
    const model = buildDeltaTraceViewModelV2(snap, { state: "live" }, content);
    expect(model.trend).toBe("gaining");
  });

  it("respeta windowSeconds y reinicia al cambiar de sesión", () => {
    const base = goldenFrame();
    const narrow = { windowSeconds: 1, showSectors: false, showTrackMap: false };
    const t0 = Date.parse(base.generatedAt);
    for (let i = 0; i < 3; i += 1) {
      const at = new Date(t0 + i * 400).toISOString();
      buildDeltaTraceViewModelV2(frameWithDelta(base, i * 0.1, at), { state: "live" }, narrow);
    }
    // Un frame 2s después con ventana de 1s solo debe quedar el último.
    const late = new Date(t0 + 2500).toISOString();
    const model = buildDeltaTraceViewModelV2(frameWithDelta(base, 0.9, late), { state: "live" }, narrow);
    expect(model.points.length).toBe(1);

    // Cambio de sesión resetea.
    const newSession: OverlayFrameV2 = { ...frameWithDelta(base, 0.1, late), sessionId: "other-session", epoch: 99 };
    const reset = buildDeltaTraceViewModelV2(newSession, { state: "live" }, { windowSeconds: 8, showSectors: true, showTrackMap: true });
    expect(reset.points.length).toBe(1);
  });

  it("equivalencia de tendencia con v1 sobre historia sintética de 20 puntos", () => {
    resetDeltaTraceHistory();
    const base = goldenFrame();
    const content = { windowSeconds: 4, showSectors: true, showTrackMap: true };
    // Alimentar v2 con misma serie que v1 usa.
    const t0 = Date.parse(base.generatedAt);
    for (let i = 0; i < 20; i += 1) {
      const delta = i < 10 ? 0.2 : -0.2;
      const at = new Date(t0 + i * 100).toISOString();
      buildDeltaTraceViewModelV2(frameWithDelta(base, delta, at), { state: "live" }, { windowSeconds: 8, showSectors: true, showTrackMap: true });
    }
    const v2 = buildDeltaTraceViewModelV2(frameWithDelta(base, -0.2, new Date(t0 + 2100).toISOString()), { state: "live" }, { windowSeconds: 8, showSectors: true, showTrackMap: true });

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

  it("expone proyección estable", () => {
    const base = goldenFrame();
    const model = buildDeltaTraceViewModelV2(frameWithDelta(base, 0.1, base.generatedAt), { state: "live" }, { windowSeconds: 4, showSectors: true, showTrackMap: true });
    const displayed = deltaTraceDisplayedValues(model);
    expect(Object.keys(displayed).sort()).toEqual(["currentDelta", "points", "status", "trend"]);
  });
});
