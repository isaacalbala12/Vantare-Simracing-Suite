import { describe, expect, it } from "vitest";
import {
  average,
  computeCompositeScore,
  computeTraceMetrics,
  evaluateGates,
  percentile,
  standardDeviation,
} from "./overlay-studio-drag-bench-metrics.mjs";

describe("overlay-studio-drag-bench-metrics", () => {
  it("computes percentiles and averages", () => {
    expect(percentile([4, 8, 16, 32], 50)).toBe(8);
    expect(average([2, 4, 6])).toBe(4);
    expect(standardDeviation([2, 4, 6])).toBeCloseTo(1.633, 2);
  });

  it("computes pointer lag and dropped frame metrics", () => {
    const metrics = computeTraceMetrics({
      stepLags: [4, 6, 5, 7],
      frameDeltaMs: [12, 14, 16],
      longTaskCount: 1,
      droppedMoves: 0,
      moveSteps: 4,
    });

    expect(metrics.pointerLagMs_p50).toBe(5);
    expect(metrics.pointerLagMs_p95).toBe(7);
    expect(metrics.droppedFramesPct).toBe(0);
    expect(metrics.longTaskCount).toBe(1);
  });

  it("scores and evaluates gates per trace kind", () => {
    const metrics = {
      pointerLagMs_p95: 10,
      avgFrameTimeMs: 8,
      droppedFramesPct: 0,
      longTaskCount: 0,
      jitterPx: 2,
      maxPointerLagMs: 12,
    };
    const config = {
      scoreWeights: {
        pointerLagMs_p95: 2,
        avgFrameTimeMs: 1,
        droppedFramesPct: 5,
        longTaskCount: 10,
        jitterPx: 3,
      },
      traceGates: {
        move: {
          pointerLagMs_p95Max: 24,
          maxPointerLagMsMax: 48,
          avgFrameTimeMsMax: 20,
          droppedFramesPctMax: 0,
          longTaskCountMax: 3,
          jitterPxMax: 12,
        },
      },
    };

    expect(computeCompositeScore(metrics, config)).toBeCloseTo(66, 1);
    expect(evaluateGates(metrics, config, "move").ok).toBe(true);
  });
});