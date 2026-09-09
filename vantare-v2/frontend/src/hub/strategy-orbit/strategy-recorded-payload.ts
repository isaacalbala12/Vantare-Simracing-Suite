import { validateStrategyEventRules } from "../../strategy/strategy-event-rules";
import { RECORDED_WIZARD_STEPS, type RecordedWizardDraft } from "./strategy-recorded-wizard";

export const RECORDED_DRAFT_VERSION = "strategy.recorded.draft.v1" as const;
export type RecordedDraftPayload = { readonly contractVersion: typeof RECORDED_DRAFT_VERSION; readonly eventId: string; readonly draft: RecordedWizardDraft };

/** Validate persisted shape before exposing it to controls. Go owns source validity. */
export function parseRecordedDraftPayload(value: unknown): RecordedDraftPayload {
  const invalid = (field: string): never => { throw new Error(`Invalid recorded draft: ${field}`); };
  const object = (candidate: unknown, field: string): Record<string, unknown> => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return invalid(field);
    return candidate as Record<string, unknown>;
  };
  const string = (candidate: unknown, field: string, nonempty = false) => {
    if (typeof candidate !== "string" || (nonempty && !candidate.trim())) invalid(field);
  };
  const number = (candidate: unknown, field: string) => { if (typeof candidate !== "number" || !Number.isFinite(candidate)) invalid(field); };
  const optionalNumbers = (record: Record<string, unknown>, fields: readonly string[]) => {
    for (const field of fields) if (record[field] !== undefined) number(record[field], field);
  };
  const optionalStrings = (record: Record<string, unknown>, fields: readonly string[]) => {
    for (const field of fields) if (record[field] !== undefined) string(record[field], field);
  };
  const array = (candidate: unknown, field: string): unknown[] => { if (!Array.isArray(candidate)) return invalid(field); return candidate; };
  const timestamp = (candidate: unknown, field: string) => { string(candidate, field, true); if (!Number.isFinite(Date.parse(candidate as string))) invalid(field); };
  const payload = object(value, "payload");
  if (payload.contractVersion !== RECORDED_DRAFT_VERSION) invalid("contractVersion");
  string(payload.eventId, "eventId", true);
  const draft = object(payload.draft, "draft");
  if (!RECORDED_WIZARD_STEPS.some(step => step === draft.step)) invalid("step");
  if (draft.mode !== "manual" && draft.mode !== "automatic") invalid("mode");
  string(draft.name, "name");
  if (!Number.isSafeInteger(draft.invalidatedSessionCount) || (draft.invalidatedSessionCount as number) < 0) invalid("invalidatedSessionCount");
  const race = object(draft.race, "race");
  if (race.format !== "timed" && race.format !== "laps") invalid("race.format");
  if (race.format === "timed" && race.laps !== undefined || race.format === "laps" && race.durationMin !== undefined) invalid("race.units");
  optionalNumbers(race, ["durationMin", "laps"]);
  optionalNumbers(draft, ["tankLiters", "initialFuelLiters", "fuelReserveLiters", "pitLossSeconds"]);
  if (draft.combination !== undefined) {
    const combination = object(draft.combination, "combination");
    for (const field of ["combinationId", "simId", "trackName", "carName", "carClass"]) string(combination[field], field, true);
    string(combination.trackLayout, "trackLayout");
  }
  if (draft.virtualEnergy !== undefined) {
    const energy = object(draft.virtualEnergy, "virtualEnergy");
    if (!["unknown", "applicable", "not_applicable"].includes(energy.applicability as string)) invalid("virtualEnergy.applicability");
    optionalNumbers(energy, ["capacityPercent", "initialPercent", "reservePercent"]);
  }
  if (draft.rules !== undefined) validateStrategyEventRules(draft.rules, "recorded rules");
  for (const candidate of array(draft.drivers, "drivers")) {
    const driver = object(candidate, "driver");
    string(driver.id, "driver.id", true); string(driver.name, "driver.name");
    optionalStrings(driver, ["referenceDriverId"]); optionalNumbers(driver, ["paceDeltaSeconds"]);
  }
  for (const candidate of array(draft.sessions, "sessions")) {
    const session = object(candidate, "session");
    for (const field of ["sessionId", "baseDigest", "revisionId", "snapshotId"]) string(session[field], field, true);
  }
  if (draft.calendar !== undefined) {
    const calendar = object(draft.calendar, "calendar");
    string(calendar.simulator, "calendar.simulator", true);
    if (!Number.isSafeInteger(calendar.version) || (calendar.version as number) < 0) invalid("calendar.version");
    string(calendar.updated, "calendar.updated"); timestamp(calendar.capturedAt, "calendar.capturedAt");
    if (calendar.startAt !== undefined) timestamp(calendar.startAt, "calendar.startAt");
    const series = object(calendar.series, "calendar.series");
    for (const field of ["id", "name", "tier", "licenseLabel", "track", "vehicleClass", "setup", "assists"]) string(series[field], `series.${field}`, field === "id");
    for (const field of ["durationMin", "splits", "tyres"]) number(series[field], `series.${field}`);
    if (typeof series.tyreWarmers !== "boolean") invalid("series.tyreWarmers");
    optionalNumbers(series, ["raceDurationMin", "eventDurationMin", "startOffsetMinute", "timeScale", "veLimit"]);
    optionalStrings(series, ["eventKind", "format", "telemetryTrackName", "safetyRating", "inGameStartTime"]);
    if (series.fairShare !== undefined && typeof series.fairShare !== "boolean") invalid("series.fairShare");
    for (const field of ["notes", "forbiddenBadges"]) if (series[field] !== undefined) for (const item of array(series[field], field)) string(item, field);
    if (series.classes !== undefined) for (const candidate of array(series.classes, "series.classes")) {
      const vehicleClass = object(candidate, "series.class"); string(vehicleClass.name, "class.name"); optionalStrings(vehicleClass, ["qualifier", "telemetryClassName"]);
    }
    if (series.sessions !== undefined) for (const candidate of array(series.sessions, "series.sessions")) {
      const session = object(candidate, "series.session"); string(session.name, "session.name"); number(session.durationMin, "session.durationMin");
      if (typeof session.estimated !== "boolean") invalid("session.estimated");
    }
    const recurrence = object(series.recurrence, "series.recurrence"); string(recurrence.kind, "recurrence.kind"); optionalNumbers(recurrence, ["intervalMinutes"]);
    for (const field of ["days", "timesUTC"]) if (recurrence[field] !== undefined) for (const item of array(recurrence[field], field)) string(item, field);
  }
  return structuredClone(value) as RecordedDraftPayload;
}
