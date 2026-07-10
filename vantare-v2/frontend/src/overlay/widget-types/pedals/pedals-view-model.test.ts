import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import { buildPedalsViewModel } from "./pedals-view-model";

describe("buildPedalsViewModel", () => {
  it("clamps pedal values to 0..1 and formats rounded percentage text", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const model = buildPedalsViewModel(
      {
        ...snapshot,
        player: {
          ...snapshot.player,
          throttle: 0.784,
          brake: 0.126,
          clutch: 1.4,
        },
      },
      {},
    );
    expect(model.status).toBe("ready");
    expect(model.throttle).toBe(0.784);
    expect(model.brake).toBe(0.126);
    expect(model.clutch).toBe(1);
    expect(model.throttleText).toBe("78%");
    expect(model.brakeText).toBe("13%");
    expect(model.clutchText).toBe("100%");
  });

  it("handles zero and full pedal extremes", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const zero = buildPedalsViewModel(
      {
        ...snapshot,
        player: { ...snapshot.player, throttle: 0, brake: 0, clutch: 0 },
      },
      {},
    );
    expect(zero.throttleText).toBe("0%");
    expect(zero.brakeText).toBe("0%");
    expect(zero.clutchText).toBe("0%");

    const full = buildPedalsViewModel(
      {
        ...snapshot,
        player: { ...snapshot.player, throttle: 1, brake: 1, clutch: 1 },
      },
      {},
    );
    expect(full.throttleText).toBe("100%");
    expect(full.brakeText).toBe("100%");
    expect(full.clutchText).toBe("100%");
  });

  it("propagates unavailable telemetry states without throwing", () => {
    for (const state of ["missing", "stale", "disconnected", "error"] as const) {
      const model = buildPedalsViewModel(
        buildMockTelemetry({ session: "race", location: "track", state }),
        {},
      );
      expect(model.status).toBe(state);
      expect(model.throttle).toBe(0);
      expect(model.brake).toBe(0);
      expect(model.clutch).toBe(0);
      expect(model.throttleText).toBe("0%");
    }

    const error = buildPedalsViewModel(
      buildMockTelemetry({ session: "race", location: "track", state: "error" }),
      {},
    );
    expect(error.statusMessage).toBe("mock telemetry error");
  });

  it("defaults missing pedal values to zero", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const model = buildPedalsViewModel(
      {
        ...snapshot,
        player: { inPit: false },
      },
      {},
    );
    expect(model.throttle).toBe(0);
    expect(model.brake).toBe(0);
    expect(model.clutch).toBe(0);
  });

  it("does not mutate the telemetry snapshot", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const frozen = structuredClone(snapshot) as TelemetrySnapshot;
    buildPedalsViewModel(frozen, {});
    expect(frozen).toEqual(snapshot);
  });
});