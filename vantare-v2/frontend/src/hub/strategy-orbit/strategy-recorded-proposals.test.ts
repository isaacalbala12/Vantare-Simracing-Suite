import { expect, it } from "vitest";
import type { RecordedSession } from "./strategy-recorded-session";
import { applyRecordedSourceSelection, recordedCombinationOptions } from "./strategy-recorded-proposals";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";

const session = { candidateId: "candidate", combinationId: "combo", combination: { id: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carClass: "LMP2", carName: "Car" }, opened: { sessionId: "handle" }, base: { sessionId: "source" }, revision: { sessionId: "source", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) } } as RecordedSession;
it("offers a prepared identity without accepting sources or manufacturing statistics", () => {
  const draft = createRecordedWizardDraft();
  const choices = recordedCombinationOptions([], [session]);
  expect(choices).toEqual([{ combinationId: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carClass: "LMP2", carName: "Car" }]);
  expect(draft.sessions).toEqual([]);
  expect(draft.combination).toBeUndefined();
});
it("accepts the explicit compatible proposal with all revision fields and without advancing", () => {
  const draft = { ...createRecordedWizardDraft(), step: "combination" as const };
  const selected = applyRecordedSourceSelection(draft, [session], []);
  expect(selected.combination?.combinationId).toBe("combo");
  expect(selected.sessions).toEqual([session.revision]);
  expect(selected.step).toBe("combination");
  expect(draft.sessions).toEqual([]);
});
it("rejects mixed sources and preserves the previous user selection", () => {
  const choices = recordedCombinationOptions([], [session]);
  const draft = { ...createRecordedWizardDraft(), combination: choices[0] };
  expect(() => applyRecordedSourceSelection(draft, [session, { ...session, combinationId: "other" }], choices)).toThrow("recorded_combination_mismatch");
  expect(() => applyRecordedSourceSelection({ ...draft, combination: { ...choices[0], combinationId: "selected-other" } }, [session], choices)).toThrow("recorded_combination_mismatch");
  expect(draft.sessions).toEqual([]);
});
it("rejects conflicting identity metadata instead of overwriting a saved combination", () => {
  const choices = recordedCombinationOptions([], [session]);
  expect(() => recordedCombinationOptions([{ ...choices[0], carName: "Different" }], [session])).toThrow("recorded_combination_conflict");
  expect(recordedCombinationOptions(choices, [session], choices[0])).toHaveLength(1);
});
it("does not bypass the selected calendar's canonical requirements", () => {
  const draft = { ...createRecordedWizardDraft(), calendar: { simulator: "lmu", version: 1, updated: "", capturedAt: "2026-09-10T00:00:00Z", series: { id: "race", name: "Race", tier: "advanced", licenseLabel: "Gold", track: "Monza", telemetryTrackName: "Monza", vehicleClass: "LMP2", classes: [{ name: "LMP2", telemetryClassName: "LMP2" }], setup: "fixed", durationMin: 120, splits: 1, assists: "", tyreWarmers: true, tyres: 12, recurrence: { kind: "weekly" } } } };
  expect(() => applyRecordedSourceSelection(draft, [session], [])).toThrow("not available");
});
