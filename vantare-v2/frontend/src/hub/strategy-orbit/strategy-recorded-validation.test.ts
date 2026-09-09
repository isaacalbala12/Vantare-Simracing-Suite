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
])("rejects supplied invalid configuration: %j", (patch, error) => {
  expect(recordedWizardErrors({ ...empty, ...patch }, "rules")).toContain(error);
});
it("does not apply retained VE values after explicitly marking the resource inapplicable", () => {
  expect(recordedWizardErrors({ ...empty, virtualEnergy: { applicability: "not_applicable", capacityPercent: 75, initialPercent: 80 } }, "rules")).toEqual([]);
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
