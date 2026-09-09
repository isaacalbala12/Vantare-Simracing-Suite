import { describe, expect, it } from "vitest";
import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import type { StrategySessionCombinationV1 } from "../../strategy/strategy-application-client";
import { createRecordedWizardDraft, moveRecordedWizard, recordedCalendarCombinations, selectRecordedCalendar, selectRecordedCombination, selectRecordedSessions, snapshotRecordedCalendar } from "./strategy-recorded-wizard";

const series: RaceSeries = {
  id: "endurance", name: "Endurance", tier: "advanced", licenseLabel: "Gold", track: "Spa",
  telemetryTrackName: "Spa", vehicleClass: "LMP2", classes: [{ name: "LMP2", telemetryClassName: "LMP2_ELMS" }],
  setup: "fixed", durationMin: 120, splits: 2, assists: "", tyreWarmers: true, tyres: 12, recurrence: { kind: "weekly" },
};
const calendar: Calendar = { version: 4, updated: "2026-09-09T12:00:00Z", timezone: "UTC", events: [], series: [series], reminderMinutes: [] };
const capturedAt = "2026-09-09T13:00:00Z";
const car: StrategySessionCombinationV1 = {
  combinationId: "lmu:car", simId: "lmu", trackName: "Spa", trackLayout: "Endurance", carName: "Car", carClass: "LMP2_ELMS",
  sessionCount: 1, raceCount: 1, climateBuckets: [], sessions: [],
};
const otherCar = { ...car, combinationId: "lmu:other", carName: "Other car" };
const ref = { sessionId: "session", baseDigest: "base", revisionId: "revision", snapshotId: "snapshot" };

describe("recorded wizard working draft", () => {
  it("selects a prepared native identity without requiring or fabricating session statistics", () => {
    const identity = { combinationId: car.combinationId, simId: car.simId, trackName: car.trackName, trackLayout: car.trackLayout, carName: car.carName, carClass: car.carClass };
    const snapshot = snapshotRecordedCalendar(calendar, series.id, "lmu", capturedAt);
    expect(recordedCalendarCombinations(snapshot, [identity])).toEqual([identity]);
    const selected = selectRecordedCombination(selectRecordedCalendar(createRecordedWizardDraft(), snapshot, [identity]), identity.combinationId, [identity]);
    expect(selected.combination).toEqual(identity);
    expect(selected.combination).not.toHaveProperty("sessionCount");
    expect(selected.combination).not.toHaveProperty("climateBuckets");
  });
  it("starts without fabricated resources, drivers, sessions or race duration", () => {
    const draft = createRecordedWizardDraft();
    expect(draft.race).toEqual({ format: "timed" });
    expect(draft.drivers).toEqual([]);
    expect(draft.sessions).toEqual([]);
    expect(draft.tankLiters).toBeUndefined();
    expect(draft.initialFuelLiters).toBeUndefined();
    expect(draft.fuelReserveLiters).toBeUndefined();
    expect(draft.pitLossSeconds).toBeUndefined();
  });

  it("retains configuration and exact revisions when going back and forward", () => {
    let draft = selectRecordedCombination(createRecordedWizardDraft(), car.combinationId, [car]);
    draft = selectRecordedSessions({ ...draft, name: "My race", tankLiters: 70 }, car.combinationId, [ref]);
    draft = moveRecordedWizard(draft, "rules");
    draft = moveRecordedWizard(draft, "combination");
    expect(moveRecordedWizard(draft, "rules")).toMatchObject({ name: "My race", tankLiters: 70, sessions: [ref] });
    expect(moveRecordedWizard(createRecordedWizardDraft(), "sessions").step).toBe("start");
    expect(moveRecordedWizard({ ...createRecordedWizardDraft(), step: "combination" }, "rules").step).toBe("combination");
  });

  it("invalidates only the selected refs after a combination change", () => {
    const original = selectRecordedSessions(selectRecordedCombination(createRecordedWizardDraft(), car.combinationId, [car]), car.combinationId, [ref]);
    expect(selectRecordedCombination(original, car.combinationId, [car]).sessions).toEqual([ref]);
    const changed = selectRecordedCombination({ ...original, tankLiters: 70 }, otherCar.combinationId, [otherCar]);
    expect(changed).toMatchObject({ sessions: [], invalidatedSessionCount: 1, tankLiters: 70, step: "combination" });
    expect(original.sessions).toEqual([ref]);
    expect(() => selectRecordedCombination(original, "unknown", [car])).toThrow("not available");
  });

  it("freezes the selected calendar version and values against later feed refreshes", () => {
    const feed = structuredClone(calendar);
    const snapshot = snapshotRecordedCalendar(feed, series.id, "lmu", capturedAt);
    const draft = selectRecordedCalendar(createRecordedWizardDraft(), snapshot, [car]);
    feed.series![0].durationMin = 240;
    snapshot.series.durationMin = 300;
    expect(draft.calendar).toMatchObject({ version: 4, updated: calendar.updated, capturedAt, series: { durationMin: 120 } });
    expect(draft.race).toEqual({ format: "timed" });
  });

  it("uses canonical simulator, class and track identities without fuzzy matching", () => {
    const snapshot = snapshotRecordedCalendar(calendar, series.id, "lmu", capturedAt);
    expect(recordedCalendarCombinations(snapshot, [car, { ...car, simId: "other" }, { ...car, trackName: "spa" }, { ...car, carClass: "LMP2" }])).toEqual([car]);
    expect(recordedCalendarCombinations({ ...snapshot, series: { ...series, classes: undefined } }, [car])).toEqual([]);
    const draft = selectRecordedCalendar(createRecordedWizardDraft(), snapshot, [car]);
    expect(() => selectRecordedCombination(draft, "other-track", [{ ...car, combinationId: "other-track", trackName: "Monza" }])).toThrow();
  });

  it("clears incompatible selection but preserves the original draft and user settings", () => {
    const draft = selectRecordedSessions(selectRecordedCombination(createRecordedWizardDraft(), car.combinationId, [car]), car.combinationId, [ref]);
    const snapshot = snapshotRecordedCalendar(calendar, series.id, "lmu", capturedAt);
    expect(selectRecordedCalendar(draft, snapshot, [car]).sessions).toEqual([ref]);
    expect(selectRecordedCalendar(draft, { ...snapshot, simulator: "other" }, [car])).toMatchObject({ combination: undefined, sessions: [], invalidatedSessionCount: 1 });
    expect(draft.sessions).toEqual([ref]);
  });

  it("rejects unknown calendar choices, invalid timestamps and foreign/duplicate session refs", () => {
    expect(() => snapshotRecordedCalendar(calendar, "unknown", "lmu", capturedAt)).toThrow();
    expect(() => snapshotRecordedCalendar(calendar, series.id, "lmu", "invalid")).toThrow();
    const draft = selectRecordedCombination(createRecordedWizardDraft(), car.combinationId, [car]);
    expect(() => selectRecordedSessions(draft, "other", [ref])).toThrow("another combination");
    expect(() => selectRecordedSessions(draft, car.combinationId, [ref, ref])).toThrow("Duplicate");
    const refs = [{ ...ref }];
    const selected = selectRecordedSessions(draft, car.combinationId, refs);
    refs[0].revisionId = "changed";
    expect(selected.sessions).toEqual([ref]);
  });
});
