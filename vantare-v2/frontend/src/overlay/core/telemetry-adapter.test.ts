import { describe, expect, it } from "vitest";
import {
  snapshotFromDisconnected,
  snapshotFromError,
  snapshotFromStale,
} from "./telemetry-adapter";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

const CAPTURED_AT = 1_720_569_600_000;

describe("telemetry status snapshots", () => {
  it("returns explicit disconnected and error snapshots", () => {
    expect(snapshotFromDisconnected(CAPTURED_AT)).toEqual({
      status: "disconnected",
      capturedAt: CAPTURED_AT,
      session: { type: "race" },
      player: { inPit: false },
      scoring: [],
    } satisfies TelemetrySnapshot);
    expect(snapshotFromError(CAPTURED_AT, "parse failed")).toEqual({
      status: "error",
      capturedAt: CAPTURED_AT,
      session: { type: "race" },
      player: { inPit: false },
      scoring: [],
      errorMessage: "parse failed",
    });
  });

  it("marks the last canonical snapshot stale without changing its data", () => {
    const ready: TelemetrySnapshot = {
      status: "ready",
      capturedAt: CAPTURED_AT,
      session: { type: "race", trackName: "Le Mans" },
      player: { inPit: false, speedKph: 250 },
      scoring: [],
    };
    expect(snapshotFromStale(ready, CAPTURED_AT + 1_000)).toEqual({
      ...ready,
      status: "stale",
      capturedAt: CAPTURED_AT + 1_000,
    });
  });
});
