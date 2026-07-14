import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildDeltaTraceViewModel } from "./delta-trace-view-model";

describe("buildDeltaTraceViewModel", () => {
  it("derives a gaining trend from the last two ten-sample windows", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const deltaHistory = Array.from({ length: 20 }, (_, index) => ({
      capturedAt: index,
      deltaSeconds: index < 10 ? 0.2 : -0.2,
    }));
    const model = buildDeltaTraceViewModel(
      { ...snapshot, derived: { fuelHistory: [], inputHistory: [], deltaHistory } },
      { windowSeconds: 4, showSectors: true, showTrackMap: true },
    );
    expect(model.points).toHaveLength(20);
    expect(model.trend).toBe("gaining");
    expect(model.currentDelta).toBe(-0.2);
    expect(model.trackPath).toBeUndefined();
  });
});
