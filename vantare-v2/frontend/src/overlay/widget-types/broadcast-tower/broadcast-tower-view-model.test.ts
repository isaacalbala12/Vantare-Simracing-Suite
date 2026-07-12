import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildBroadcastTowerViewModel } from "./broadcast-tower-view-model";

describe("buildBroadcastTowerViewModel", () => {
  it("maps scoring rows and keeps unknown weather/SOF unavailable", () => {
    const model = buildBroadcastTowerViewModel(buildMockTelemetry({ session: "race", location: "track" }), { rowCount: 3, showWeather: true, showSof: true });
    expect(model.type).toBe("broadcast-tower");
    expect(model.rows).toHaveLength(3);
    expect(model.rows[0]).toMatchObject({ place: 1, number: "7", name: "PORSCHE PENSKE", isPlayer: false });
    expect(model.trackTempC).toBeUndefined();
    expect(model.sof).toBeUndefined();
  });

  it("caps requested rows at eight", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: index, place: index + 1, driverName: `Driver ${index}`, isPlayer: index === 0 }));
    const model = buildBroadcastTowerViewModel({ ...snapshot, scoring: rows }, { rowCount: 8, showWeather: false, showSof: false });
    expect(model.rows).toHaveLength(8);
  });
});
