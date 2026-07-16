import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildPedalsTelemetryCompactViewModel } from "./pedals-telemetry-compact-view-model";

describe("buildPedalsTelemetryCompactViewModel", () => {
  it("builds the compact live model with optional display fields", () => {
    const model = buildPedalsTelemetryCompactViewModel(
      buildMockTelemetry({ session: "race", location: "track" }),
      { showSpeed: true, showRpm: true, showClutch: false },
    );
    expect(model).toMatchObject({
      type: "pedals-telemetry-compact",
      status: "ready",
      throttle: 0.78,
      brake: 0.12,
      clutch: 0,
      speedKph: 242,
      rpm: 8120,
      gear: 6,
      showSpeed: true,
      showRpm: true,
      showClutch: false,
    });
  });

  it("keeps stale values and empties disconnected values", () => {
    const ready = buildMockTelemetry({ session: "race", location: "track" });
    const stale = buildPedalsTelemetryCompactViewModel({ ...ready, status: "stale" }, {
      showSpeed: true,
      showRpm: true,
      showClutch: true,
    });
    expect(stale.status).toBe("stale");
    expect(stale.rpm).toBe(8120);

    const disconnected = buildPedalsTelemetryCompactViewModel(
      { ...ready, status: "disconnected", player: { inPit: false }, scoring: [] },
      { showSpeed: true, showRpm: true, showClutch: true },
    );
    expect(disconnected.speedKph).toBeUndefined();
    expect(disconnected.gear).toBeUndefined();
  });
});
