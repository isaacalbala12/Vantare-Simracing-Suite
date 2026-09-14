import { expect, it } from "vitest";
import { createRecordedWizardDraft, type RecordedWizardDraft } from "./strategy-recorded-wizard";
import { recordedWizardErrors } from "./strategy-recorded-validation";

const empty = createRecordedWizardDraft();
it("allows a partial configuration but never a missing combination at final submission", () => {
  expect(recordedWizardErrors(empty, "rules")).toEqual([]);
  expect(recordedWizardErrors(empty, "drivers")).toEqual([]);
  expect(recordedWizardErrors(empty, "sessions")).toEqual(["combination"]);
});
it.each<[Partial<RecordedWizardDraft>, string]>([
  [{ race: { format: "laps", laps: 2.5 } }, "race"],
  [{ race: { format: "timed", durationMin: NaN } }, "race"],
  [{ tankLiters: 70, initialFuelLiters: 80 }, "fuel"],
  [{ tankLiters: 70, fuelReserveLiters: 80 }, "fuel"],
  [{ pitLossSeconds: -1 }, "pit"],
  [{ virtualEnergy: { applicability: "applicable", capacityPercent: 75, initialPercent: 80 } }, "energy"],
  [{ virtualEnergy: { applicability: "applicable", reservePercent: 101 } }, "energy"],
  [{ rules: { minPitStops: 3, maxPitStops: 2 } }, "rules"],
  [{ rules: { requiredWindows: [{ fromLap: 20, toLap: 10 }] } }, "rules"],
  [{ rules: { requiredWindows: [{ fromLap: 0, toLap: 10 }] } }, "rules"],
  [{ rules: { requiredWindows: [{ fromLap: 10.5, toLap: 20 }] } }, "rules"],
])("rejects supplied invalid configuration: %j", (patch, error) => {
  expect(recordedWizardErrors({ ...empty, ...patch }, "rules")).toContain(error);
});
it("does not apply retained VE values after explicitly marking the resource inapplicable", () => {
  expect(recordedWizardErrors({ ...empty, virtualEnergy: { applicability: "not_applicable", capacityPercent: 75, initialPercent: 80 } }, "rules")).toEqual([]);
});
it.each([
  { minLaps: 40, maxLaps: 12 },
  { minLaps: 12.5 },
  { unavailable: [{ fromLap: 0, toLap: 2 }] },
  { unavailable: [{ fromLap: 2.5, toLap: 4 }] },
  { unavailable: [{ fromLap: 5, toLap: 4 }] },
])("rejects invalid driver lap limits while editing drivers: %j", limits => {
  expect(recordedWizardErrors({ ...empty, drivers: [{ id: "a", name: "Alex" }], rules: { driverLimits: { a: limits } } }, "drivers")).toContain("rules");
});
it.each<RecordedWizardDraft["drivers"]>([
  [{ id: "a", name: "" }],
  [{ id: "a", name: "Alex" }, { id: "a", name: "Sam" }],
  [{ id: "a", name: "Alex", referenceDriverId: "missing", paceDeltaSeconds: 0 }],
  [{ id: "a", name: "Alex", referenceDriverId: "b", paceDeltaSeconds: 0 }, { id: "b", name: "Sam", referenceDriverId: "a", paceDeltaSeconds: 0 }],
  [{ id: "a", name: "Alex", paceDeltaSeconds: 1 }],
])("rejects incomplete or cyclic driver references", (...drivers) => {
  expect(recordedWizardErrors({ ...empty, drivers }, "drivers").length).toBeGreaterThan(0);
});
