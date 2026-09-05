import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import { buildDeltaTraceViewModelV2 } from "./delta-trace-view-model-v2";

function goldenFrame(): OverlayFrameV2 {
  const update = JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json`),
      "utf8",
    ),
  ) as OverlayUpdateV2;
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}

function wireFrame(
  base: OverlayFrameV2,
  capturedAtMS: readonly number[],
  seconds: readonly number[],
  generatedAt: string,
): OverlayFrameV2 {
  return {
    ...base,
    generatedAt,
    delta: {
      seconds: { v: seconds[seconds.length - 1], q: "fresh" },
      reference: "personal-best",
      requested: "personal-best",
      available: ["personal-best"],
      history: { q: "fresh", capturedAtMS: [...capturedAtMS], seconds: [...seconds] },
    },
  };
}

const content = { windowSeconds: 8, showSectors: true, showTrackMap: true };

describe("delta-trace v2 wire history (A3)", () => {
  it("usa los instantes absolutos del wire, sin Date.now ni generatedAt", () => {
    const base = goldenFrame();
    // generatedAt deliberadamente lejos de la serie: cualquier edad
    // relativa o reloj del navegador daría otros puntos.
    const frame = wireFrame(
      base,
      [1786711200000, 1786711200100, 1786711200200],
      [0.5, 0.4, 0.3],
      "2020-01-01T00:00:00.000Z",
    );
    const model = buildDeltaTraceViewModelV2(frame, { state: "live" }, content);
    expect(model.points).toEqual([
      { capturedAt: 1786711200000, deltaSeconds: 0.5 },
      { capturedAt: 1786711200100, deltaSeconds: 0.4 },
      { capturedAt: 1786711200200, deltaSeconds: 0.3 },
    ]);
    expect(model.currentDelta).toBeCloseTo(0.3, 9);
  });

  it("calcula trend desde la serie del wire en una sola llamada", () => {
    const base = goldenFrame();
    const capturedAtMS = Array.from({ length: 20 }, (_, index) => 1786711200000 + index * 100);
    const seconds = Array.from({ length: 20 }, (_, index) => (index < 10 ? 0.2 : -0.2));
    const model = buildDeltaTraceViewModelV2(
      wireFrame(base, capturedAtMS, seconds, base.generatedAt),
      { state: "live" },
      content,
    );
    expect(model.points.length).toBe(20);
    expect(model.trend).toBe("gaining");
  });

  it("no acumula entre llamadas: cada frame trae su propia serie", () => {
    const base = goldenFrame();
    const first = buildDeltaTraceViewModelV2(
      wireFrame(base, [1786711200000, 1786711200100], [0.5, 0.4], base.generatedAt),
      { state: "live" },
      content,
    );
    expect(first.points.length).toBe(2);
    const second = buildDeltaTraceViewModelV2(
      wireFrame(base, [1786711300000, 1786711300100, 1786711300200], [0.1, 0.0, -0.1], base.generatedAt),
      { state: "live" },
      content,
    );
    expect(second.points).toEqual([
      { capturedAt: 1786711300000, deltaSeconds: 0.1 },
      { capturedAt: 1786711300100, deltaSeconds: 0.0 },
      { capturedAt: 1786711300200, deltaSeconds: -0.1 },
    ]);
  });
});
