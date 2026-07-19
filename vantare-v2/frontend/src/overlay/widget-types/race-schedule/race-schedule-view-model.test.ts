import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildRaceScheduleViewModel } from "./race-schedule-view-model";

describe("buildRaceScheduleViewModel", () => {
  it("sorts and limits injected read-only calendar events", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track" });
    const model = buildRaceScheduleViewModel({
      ...snapshot,
      auxiliary: { scheduleEvents: [
        { id: "b", title: "Race B", track: "Spa", startAt: "2026-07-15T12:00:00Z", durationMinutes: 30, classes: ["LMGT3"], status: "upcoming" },
        { id: "a", title: "Race A", track: "Le Mans", startAt: "2026-07-15T10:00:00Z", durationMinutes: 45, classes: ["Hypercar"], status: "upcoming" },
      ] },
    }, { rowCount: 1, licenseFilter: "all", timeZone: "UTC" });
    expect(model.status).toBe("ready");
    expect(model.events.map((event) => event.id)).toEqual(["a"]);
  });

  it("reports missing when no calendar dataset is provided", () => {
    const model = buildRaceScheduleViewModel(
      buildMockTelemetry({ session: "race", location: "track" }),
      { rowCount: 4, licenseFilter: "all", timeZone: "local" },
    );
    expect(model.status).toBe("missing");
    expect(model.events).toEqual([]);
  });
});
