import { expect, it } from "vitest";
import { RECORDED_DRAFT_VERSION, parseRecordedDraftPayload } from "./strategy-recorded-payload";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";

const payload = { contractVersion: RECORDED_DRAFT_VERSION, eventId: "recorded-event", draft: createRecordedWizardDraft() };
const tyre = (id: string) => ({
  id, compound: "medium", origin: "event_allocation",
  condition: { minimumRemainingPercent: 90, maximumRemainingPercent: 100, provenance: { kind: "range", sourceId: "telemetry" }, confidence: { level: "high", basis: "recorded" } },
  state: "free", stints: 0,
});
const physicalInventory = { maximum: 1, tyres: [tyre("M-FL")] };
const validCompoundPace = [{ compound: "medium", presence: "valid", provenance: { kind: "reference", sourceId: "revision-1" }, confidence: { sampleSize: 1, computationVersion: "test.v1" }, paceDeltaSeconds: 0, degradationPerLapSeconds: 0 }];
const pitServices = { transitSeconds: 20, refuelRateLPerS: 2, veRatePPerS: 3, tyreSeconds: 8, serviceMode: "parallel" };
it("round-trips an incomplete draft without manufacturing missing quantities", () => {
  const parsed = parseRecordedDraftPayload(JSON.parse(JSON.stringify(payload)));
  expect(parsed).toEqual(payload);
  expect(parsed.draft.tankLiters).toBeUndefined();
  expect(parsed.draft.race).toEqual({ format: "timed" });
  expect(parsed.draft.sessions).toEqual([]);
  expect(parsed).not.toBe(payload);
});
it.each([
  null, { ...payload, contractVersion: "future" }, { ...payload, eventId: "" },
  ...[{ drivers: null }, { sessions: {} }, { tankLiters: null }, { fuelReserveLiters: "0" }, { mode: "live" }, { step: "event" },
    { race: { format: "laps", durationMin: 120 } }, { virtualEnergy: { applicability: "guessed" } },
    { drivers: [{ id: "driver", name: "Name", paceDeltaSeconds: Infinity }] },
    { sessions: [{ sessionId: "a", baseDigest: "b", revisionId: "c" }] },
    { calendar: { simulator: "lmu", version: 1, updated: "", capturedAt: "invalid", series: {} } },
  ].map(patch => ({ ...payload, draft: { ...payload.draft, ...patch } })),
])("rejects an incompatible persisted shape instead of silently repairing it", value => {
  expect(() => parseRecordedDraftPayload(value)).toThrow();
});
it("preserves zero configuration, signed estimates and full revision refs", () => {
  const draft = { ...payload.draft, fuelReserveLiters: 0, drivers: [{ id: "a", name: "Alex" }, { id: "b", name: "Sam", referenceDriverId: "a", paceDeltaSeconds: -0.5 }], sessions: [{ sessionId: "session", baseDigest: "base", revisionId: "revision", snapshotId: "snapshot" }] };
  expect(parseRecordedDraftPayload({ ...payload, draft }).draft).toEqual(draft);
});
it("round-trips explicit pit services and zero formation without sharing their object", () => {
  const source = { ...payload, draft: { ...payload.draft, pitServices, formationSeconds: 0 } };

  const parsed = parseRecordedDraftPayload(source);

  expect(parsed).toEqual(source);
  expect(parsed.draft.pitServices).not.toBe(pitServices);
  expect(parseRecordedDraftPayload(payload)).toEqual(payload);
});
it("retains calendar version, class identity and published rules in an independent snapshot", () => {
  const calendar = { simulator: "lmu", version: 4, updated: "2026-09-09T12:00:00Z", capturedAt: "2026-09-10T00:00:00Z", series: {
    id: "race", name: "Endurance", tier: "advanced", licenseLabel: "Gold", track: "Spa", telemetryTrackName: "Spa", vehicleClass: "LMP2", classes: [{ name: "LMP2", telemetryClassName: "LMP2_ELMS" }],
    setup: "fixed", durationMin: 120, raceDurationMin: 90, splits: 1, assists: "", tyreWarmers: true, tyres: 12, veLimit: 75, fairShare: true, recurrence: { kind: "weekly", days: ["sat"], timesUTC: ["12:00"] },
  } };
  const parsed = parseRecordedDraftPayload({ ...payload, draft: { ...payload.draft, calendar } });
  expect(parsed.draft.calendar).toEqual(calendar);
  calendar.series.veLimit = 100;
  expect(parsed.draft.calendar?.series.veLimit).toBe(75);
  expect(() => parseRecordedDraftPayload({ ...payload, draft: { ...payload.draft, calendar: { ...calendar, series: { ...calendar.series, classes: "LMP2" } } } })).toThrow();
});
it("round-trips explicit physical tyre inputs while old v1 drafts remain unchanged", () => {
  const tyreInventory = { maximum: 4, tyres: [tyre("M-FL"), tyre("M-FR"), tyre("M-RL"), tyre("M-RR")] };
  const compoundPace = [{ compound: "medium", presence: "valid", provenance: { kind: "reference", sourceId: "revision-1" }, confidence: { sampleSize: 12, computationVersion: "analysis.v1" }, paceDeltaSeconds: 0, degradationPerLapSeconds: 0, curve: [{ lapInStint: 2, deltaSeconds: 0.1 }] }];
  const source = { ...payload, draft: { ...payload.draft, tyreInventory, compoundPace } };

  const parsed = parseRecordedDraftPayload(source);

  expect(parsed).toEqual(source);
  expect(parsed.draft.tyreInventory).not.toBe(tyreInventory);
  expect(parseRecordedDraftPayload(payload)).toEqual(payload);
});
it("rejects the legacy individual-tyre shape instead of inventing physical state", () => {
  const legacy = { id: "M-FL", compound: "medium", remainingPercent: 78 };
  const source = { ...payload, draft: { ...payload.draft, tyreInventory: { maximum: 1, tyres: [legacy] }, compoundPace: [{ compound: "medium", presence: "valid", provenance: { kind: "manual", sourceId: "manual" }, confidence: { sampleSize: 0, computationVersion: "manual.v1" }, paceDeltaSeconds: 0, degradationPerLapSeconds: 0 }] } };

  expect(() => parseRecordedDraftPayload(source)).toThrow();
  expect(source.draft.tyreInventory.tyres[0]).toBe(legacy);
});
it.each([
  { pitServices: null },
  { pitServices: { ...pitServices, tyreSeconds: undefined } },
  { pitServices: { ...pitServices, transitSeconds: "20" } },
  { pitServices: { ...pitServices, refuelRateLPerS: Number.POSITIVE_INFINITY } },
  { pitServices: { ...pitServices, serviceMode: "serial" } },
  { formationSeconds: null },
  { formationSeconds: "0" },
  { formationSeconds: Number.POSITIVE_INFINITY },
  { tyreInventory: { maximum: 4, tyres: [] } },
  { compoundPace: [] },
  { tyreInventory: { maximum: 4, tyres: [tyre("M-FL"), tyre("M-FL")] }, compoundPace: validCompoundPace },
  { tyreInventory: { maximum: 0, tyres: [] }, compoundPace: validCompoundPace },
  { tyreInventory: physicalInventory, compoundPace: [{ compound: "medium", presence: "unknown", provenance: { kind: "reference" }, confidence: { sampleSize: 1, computationVersion: "test.v1" }, paceDeltaSeconds: 0, degradationPerLapSeconds: 0 }] },
  { tyreInventory: physicalInventory, compoundPace: [{ compound: "medium", presence: "valid", provenance: { kind: "derived" }, confidence: { sampleSize: 1, computationVersion: "test.v1" }, paceDeltaSeconds: 0, degradationPerLapSeconds: 0 }] },
  { tyreInventory: physicalInventory, compoundPace: [{ compound: "medium", presence: "valid", provenance: { kind: "reference" }, confidence: { level: "high" }, paceDeltaSeconds: 0, degradationPerLapSeconds: 0 }] },
  { tyreInventory: physicalInventory, compoundPace: [{ compound: "medium", presence: "valid", provenance: { kind: "reference" }, confidence: { sampleSize: 1, computationVersion: "test.v1" }, paceDeltaSeconds: 0, degradationPerLapSeconds: 0, curve: [{ lapInStint: 0, deltaSeconds: 0 }] }] },
  { tyreInventory: { maximum: 1, tyres: [{ ...tyre("M-FL"), condition: { ...tyre("M-FL").condition, confidence: { level: "unknown", basis: 42 } } }] }, compoundPace: [{ compound: "medium", presence: "valid", provenance: { kind: "reference" }, confidence: { sampleSize: 1, computationVersion: "test.v1" }, paceDeltaSeconds: 0, degradationPerLapSeconds: 0 }] },
])("rejects invalid recorded input %#", patch => {
  expect(() => parseRecordedDraftPayload({ ...payload, draft: { ...payload.draft, ...patch } })).toThrow();
});
