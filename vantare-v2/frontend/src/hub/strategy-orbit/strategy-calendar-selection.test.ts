import { describe, expect, it } from "vitest";
import type { RaceSeries } from "../../calendar/calendar-types";
import type { StrategySessionCombinationV1 } from "../../strategy/strategy-application-client";
import { calendarSessionCombinations } from "./strategy-calendar-selection";

const series: RaceSeries = {
  id: "spa-endurance",
  name: "Spa Endurance",
  tier: "advanced",
  licenseLabel: "Gold",
  track: "Circuit de Spa-Francorchamps",
  vehicleClass: "LMP2",
  classes: [{ name: "LMP2" }],
  setup: "fixed",
  durationMin: 120,
  splits: 2,
  assists: "",
  tyreWarmers: true,
  tyres: 12,
  recurrence: { kind: "weekly" },
};

const combination: StrategySessionCombinationV1 = {
  combinationId: "lmu:spa:lmp2",
  simId: "lmu",
  trackName: "Circuit de Spa-Francorchamps",
  trackLayout: "GP",
  carName: "United Autosports #21",
  carClass: "LMP2",
  sessionCount: 2,
  raceCount: 1,
  lastActivity: "2026-08-23T12:00:00Z",
  climateBuckets: [{ bucket: "dry", laps: 20 }],
  sessions: [],
};

describe("calendarSessionCombinations", () => {
  it("empareja únicamente nombres exactos de circuito y clase", () => {
    expect(calendarSessionCombinations(series, "LMP2", [combination])).toEqual([combination]);
    expect(calendarSessionCombinations(
      { ...series, track: "Spa (WEC)" },
      "LMP2",
      [combination],
    )).toEqual([]);
    expect(calendarSessionCombinations(series, "LMP2_ELMS", [combination])).toEqual([]);
  });
});
