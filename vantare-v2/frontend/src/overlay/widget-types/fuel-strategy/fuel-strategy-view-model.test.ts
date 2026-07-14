import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildFuelStrategyViewModel } from "./fuel-strategy-view-model";

describe("buildFuelStrategyViewModel", () => {
  it("derives averages and projections only from available bounded history", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const model = buildFuelStrategyViewModel(
      {
        ...snapshot,
        session: { ...snapshot.session, remainingSeconds: 360 },
        player: { ...snapshot.player, fuelLiters: 20, lastLapSeconds: 90 },
        derived: {
          fuelHistory: [
            { lap: 3, consumedLiters: 2.5 },
            { lap: 4, consumedLiters: 2.7 },
          ],
          inputHistory: [],
          deltaHistory: [],
        },
      },
      { historyRows: 4, units: "liters", showProjection: true },
    );

    expect(model.avgPerLap).toBe(2.6);
    expect(model.lapsRemaining).toBe(4);
    expect(model.requiredFuel).toBe(10.4);
    expect(model.history).toHaveLength(2);
  });

  it("keeps unavailable live projections undefined instead of inventing zero", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "disconnected" });
    const model = buildFuelStrategyViewModel(snapshot, {
      historyRows: 4,
      units: "liters",
      showProjection: true,
    });
    expect(model.status).toBe("disconnected");
    expect(model.avgPerLap).toBeUndefined();
    expect(model.requiredFuel).toBeUndefined();
  });
});
