import { describe, expect, it } from "vitest";
import type { RaceSeries, VehicleClass } from "../../calendar/calendar-types";
import type { StrategySessionCombinationV1 } from "../../strategy/strategy-application-client";
import {
  calendarSessionCombinations,
  calendarSessionLayouts,
} from "./strategy-calendar-selection";

const lmp2: VehicleClass = {
  name: "LMP2",
  telemetryClassName: "LMP2_ELMS",
};

const series: RaceSeries = {
  id: "spa-endurance",
  name: "Spa Endurance",
  tier: "advanced",
  licenseLabel: "Gold",
  track: "Spa (WEC)",
  telemetryTrackName: "Circuit de Spa-Francorchamps",
  vehicleClass: "LMP2",
  classes: [lmp2],
  setup: "fixed",
  durationMin: 120,
  splits: 2,
  assists: "",
  tyreWarmers: true,
  tyres: 12,
  recurrence: { kind: "weekly" },
};

function combination(
  combinationId: string,
  trackLayout: string,
  sessionCount: number,
): StrategySessionCombinationV1 {
  return {
    combinationId,
    simId: "lmu",
    trackName: "Circuit de Spa-Francorchamps",
    trackLayout,
    carName: combinationId,
    carClass: "LMP2_ELMS",
    sessionCount,
    raceCount: 1,
    lastActivity: "2026-08-23T12:00:00Z",
    climateBuckets: [{ bucket: "dry", laps: 20 }],
    sessions: [],
  };
}

describe("selección de telemetría desde calendario", () => {
  it("usa únicamente las identidades declaradas por Go", () => {
    const available = combination("united-21", "Circuit de Spa-Francorchamps", 5);

    expect(calendarSessionCombinations(series, lmp2, [available])).toEqual([available]);
    expect(calendarSessionCombinations(
      { ...series, telemetryTrackName: undefined },
      lmp2,
      [available],
    )).toEqual([]);
    expect(calendarSessionCombinations(
      series,
      { ...lmp2, telemetryClassName: undefined },
      [available],
    )).toEqual([]);
  });

  it("agrupa por trazado y suma las sesiones reales sin elegir uno", () => {
    const combinations = [
      combination("united-21", "Circuit de Spa-Francorchamps", 5),
      combination("alpine-35", "Circuit de Spa-Francorchamps", 17),
      combination("united-22", "Circuit de Spa-Francorchamps Endurance", 2),
    ];

    expect(calendarSessionLayouts(series, lmp2, combinations)).toEqual([
      { trackLayout: "Circuit de Spa-Francorchamps", sessionCount: 22 },
      { trackLayout: "Circuit de Spa-Francorchamps Endurance", sessionCount: 2 },
    ]);
    expect(calendarSessionCombinations(
      series,
      lmp2,
      combinations,
      "Circuit de Spa-Francorchamps Endurance",
    )).toEqual([combinations[2]]);
  });
});
