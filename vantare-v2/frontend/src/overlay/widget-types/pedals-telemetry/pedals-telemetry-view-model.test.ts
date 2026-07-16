import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import { buildPedalsTelemetryViewModel } from "./pedals-telemetry-view-model";

describe("buildPedalsTelemetryViewModel", () => {
  it("maps live pedal and car telemetry without inventing optional values", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const model = buildPedalsTelemetryViewModel(snapshot, {
      showPosition: true,
      showClutch: true,
    });

    expect(model).toMatchObject({
      type: "pedals-telemetry",
      status: "ready",
      throttle: 0.78,
      brake: 0.12,
      clutch: 0,
      speedKph: 242,
      rpm: 8120,
      gear: 6,
      playerPosition: 5,
    });
    expect(model.speedText).toBe("242");
    expect(model.rpmText).toBe("8.1k");
    expect(model.gearText).toBe("6");
  });

  it("preserves live fields while marking stale data", () => {
    const ready = buildMockTelemetry({ session: "race", location: "track" });
    const stale = { ...ready, status: "stale" as const };
    const model = buildPedalsTelemetryViewModel(stale, {
      showPosition: true,
      showClutch: true,
    });

    expect(model.status).toBe("stale");
    expect(model.speedKph).toBe(242);
    expect(model.playerPosition).toBe(5);
  });

  it("keeps unavailable/error states empty", () => {
    const base = buildMockTelemetry({ session: "race", location: "track" });
    const unavailable: TelemetrySnapshot[] = [
      { ...base, status: "disconnected", player: { inPit: false }, scoring: [] },
      { ...base, status: "error", errorMessage: "offline", player: { inPit: false }, scoring: [] },
    ];

    for (const snapshot of unavailable) {
      const model = buildPedalsTelemetryViewModel(snapshot, {
        showPosition: true,
        showClutch: true,
      });
      expect(model.status).toBe(snapshot.status);
      expect(model.speedKph).toBeUndefined();
      expect(model.rpm).toBeUndefined();
      expect(model.playerPosition).toBeUndefined();
    }
  });
});
