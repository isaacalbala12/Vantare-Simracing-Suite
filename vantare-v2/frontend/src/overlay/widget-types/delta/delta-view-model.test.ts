import { describe, expect, it } from "vitest";
import { buildDeltaViewModel } from "./delta-view-model";
import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";

const baseReady: TelemetrySnapshot = {
  status: "ready",
  capturedAt: 1_720_569_600_000,
  session: { type: "race", remainingSeconds: 3600 },
  player: { inPit: false },
  scoring: [],
};

const negative: TelemetrySnapshot = {
  ...baseReady,
  player: { inPit: false, deltaSeconds: -0.245, lastLapSeconds: 91.221, bestLapSeconds: 90.876 },
};

const positive: TelemetrySnapshot = {
  ...baseReady,
  player: { inPit: false, deltaSeconds: 0.38, lastLapSeconds: 92.1, bestLapSeconds: 90.5 },
};

const zero: TelemetrySnapshot = {
  ...baseReady,
  player: { inPit: false, deltaSeconds: 0, lastLapSeconds: 90.5, bestLapSeconds: 90.5 },
};

const disconnected: TelemetrySnapshot = {
  status: "disconnected",
  capturedAt: 1_720_569_600_000,
  session: { type: "race" },
  player: { inPit: false },
  scoring: [],
};

describe("buildDeltaViewModel", () => {
  it("maps negative delta to gaining tone and signed text", () => {
    expect(buildDeltaViewModel(negative, {})).toMatchObject({
      type: "delta",
      status: "ready",
      tone: "gaining",
      deltaText: "-0.245",
    });
  });

  it("maps positive delta to losing tone and signed text", () => {
    expect(buildDeltaViewModel(positive, {})).toMatchObject({
      tone: "losing",
      deltaText: "+0.380",
    });
  });

  it("maps zero delta to neutral text", () => {
    expect(buildDeltaViewModel(zero, {}).deltaText).toBe("0.000");
    expect(buildDeltaViewModel(zero, {}).tone).toBe("neutral");
  });

  it("propagates disconnected status", () => {
    expect(buildDeltaViewModel(disconnected, {}).status).toBe("disconnected");
  });

  it("propagates stale and error states with messages", () => {
    const stale: TelemetrySnapshot = { ...baseReady, status: "stale" };
    expect(buildDeltaViewModel(stale, {}).status).toBe("stale");

    const error: TelemetrySnapshot = {
      ...baseReady,
      status: "error",
      errorMessage: "telemetry unavailable",
    };
    expect(buildDeltaViewModel(error, {})).toMatchObject({
      status: "error",
      statusMessage: "telemetry unavailable",
    });
  });

  it("marks missing delta on ready snapshots", () => {
    const missingDelta: TelemetrySnapshot = {
      ...baseReady,
      player: { inPit: false, lastLapSeconds: 91.221 },
    };
    expect(buildDeltaViewModel(missingDelta, {})).toMatchObject({
      status: "missing",
      tone: "neutral",
      deltaText: "—",
    });
  });

  it("formats lap times and clamps progress to a two-second scale", () => {
    const model = buildDeltaViewModel(negative, {});
    expect(model.lastLapText).toBe("1:31.221");
    expect(model.bestLapText).toBe("1:30.876");
    expect(model.progress).toBeCloseTo(-0.1225, 4);
  });

  it("reads optional lap, predicted and split fields from available scoring data", () => {
    const snapshot: TelemetrySnapshot = {
      ...negative,
      scoring: [
        {
          isPlayer: true,
          totalLaps: 14,
          estimatedLapTime: 164.659,
        },
      ],
    };

    expect(buildDeltaViewModel(snapshot, {})).toMatchObject({
      lapText: "LAP 14",
      predictedLapText: "2:44.659",
      splitText: "-0.245",
    });
  });

  it("does not mutate snapshot or content", () => {
    const snapshot = structuredClone(negative);
    const content = {};
    buildDeltaViewModel(snapshot, content);
    expect(snapshot).toEqual(negative);
    expect(content).toEqual({});
  });
});
