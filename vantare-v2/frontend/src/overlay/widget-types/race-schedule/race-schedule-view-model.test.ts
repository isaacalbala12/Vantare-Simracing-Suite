import { describe, expect, it } from "vitest";
import { buildRaceScheduleViewModel } from "./race-schedule-view-model";

describe("buildRaceScheduleViewModel", () => {
  it("sorts and limits injected read-only calendar events", () => {
    const model = buildRaceScheduleViewModel([
        { id: "b", title: "Race B", track: "Spa", startAt: "2026-07-15T12:00:00Z", durationMinutes: 30, classes: ["LMGT3"], status: "upcoming" },
        { id: "a", title: "Race A", track: "Le Mans", startAt: "2026-07-15T10:00:00Z", durationMinutes: 45, classes: ["Hypercar"], status: "upcoming" },
      ], { rowCount: 1, licenseFilter: "all", timeZone: "UTC" }, "ready");
    expect(model.status).toBe("ready");
    expect(model.events.map((event) => event.id)).toEqual(["a"]);
  });

  it("reports missing when no calendar dataset is provided", () => {
    const model = buildRaceScheduleViewModel(
      [],
      { rowCount: 4, licenseFilter: "all", timeZone: "local" },
    );
    expect(model.status).toBe("missing");
    expect(model.events).toEqual([]);
  });

  it("mantiene visible un fallo del canal Calendar sin convertirlo en telemetría", () => {
    const model = buildRaceScheduleViewModel(
      [],
      { rowCount: 4, licenseFilter: "all", timeZone: "local" },
      "error",
    );
    expect(model.status).toBe("error");
  });
});
