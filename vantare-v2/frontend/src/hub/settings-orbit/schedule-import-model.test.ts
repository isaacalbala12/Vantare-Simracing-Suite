import { describe, expect, it } from "vitest";
import { scheduleDiff, type SchedulePreview } from "./schedule-import-model";

const preview: SchedulePreview = {
  validFrom: "2026-08-25",
  validUntil: "2026-09-01",
  seriesCount: 2,
  sourceNotesCount: 1,
  series: [
    {
      id: "same",
      name: "Same",
      tier: "beginner",
      licenseLabel: "Bronze SR",
      track: "Fuji",
      classes: ["LMGT3"],
      raceMin: 20,
      eventDurationMin: 31,
      cadence: "cada 15min",
      recurrence: { kind: "interval", intervalMinutes: 15 },
      setup: "fixed",
      startOffsetMinute: 15,
      splits: 20,
      assists: "High assists allowed",
      tyreWarmers: true,
      tyres: 8,
      noteCount: 0,
    },
    {
      id: "new",
      name: "New",
      tier: "weekly",
      licenseLabel: "",
      track: "Daytona",
      classes: ["Hypercar"],
      raceMin: 480,
      eventDurationMin: 491,
      cadence: "3 días × 4 horas",
      recurrence: { kind: "weekly-slots", days: ["Fri"], timesUTC: ["03:00"] },
      setup: "open",
      startOffsetMinute: 0,
      splits: 44,
      assists: "",
      tyreWarmers: false,
      tyres: 30,
      noteCount: 1,
    },
  ],
};

describe("scheduleDiff", () => {
  it("reports added, removed and changed series by stable id", () => {
    const diff = scheduleDiff(preview, [
      {
        id: "same",
        name: "Same",
        tier: "beginner",
        licenseLabel: "",
        track: "Bahrain",
        vehicleClass: "LMGT3",
        setup: "fixed",
        durationMin: 20,
        splits: 20,
        assists: "",
        tyreWarmers: true,
        tyres: 8,
        recurrence: { kind: "interval", intervalMinutes: 15 },
      },
      {
        id: "removed",
        name: "Removed",
        tier: "advanced",
        licenseLabel: "",
        track: "Le Mans",
        vehicleClass: "Hypercar",
        setup: "open",
        durationMin: 40,
        splits: 20,
        assists: "",
        tyreWarmers: false,
        tyres: 8,
        recurrence: { kind: "interval", intervalMinutes: 30 },
      },
    ]);

    expect(diff).toEqual({ added: ["New"], removed: ["Removed"], changed: ["Same"] });
  });

  it("does not manufacture a diff before parsing", () => {
    expect(scheduleDiff(null, [])).toEqual({ added: [], removed: [], changed: [] });
  });
});
