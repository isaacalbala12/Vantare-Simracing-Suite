import { expect, it } from "vitest";
import { RECORDED_DRAFT_VERSION, parseRecordedDraftPayload } from "./strategy-recorded-payload";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";

const payload = { contractVersion: RECORDED_DRAFT_VERSION, eventId: "recorded-event", draft: createRecordedWizardDraft() };
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
