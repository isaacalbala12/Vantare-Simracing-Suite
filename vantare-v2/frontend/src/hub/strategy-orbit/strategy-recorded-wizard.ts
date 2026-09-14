import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import type { StrategyAnalysisRevisionRef, StrategyOrbitCalculationInputV1, StrategySessionCombinationV1 } from "../../strategy/strategy-application-client";
import type { StrategyEventRules } from "../../strategy/strategy-event-rules";
import { calendarSessionCombinations } from "./strategy-calendar-selection";

export const RECORDED_WIZARD_STEPS = ["start", "combination", "rules", "drivers", "sessions"] as const;
export type RecordedWizardStep = typeof RECORDED_WIZARD_STEPS[number];
export type RecordedCombination = Pick<StrategySessionCombinationV1, "combinationId" | "simId" | "trackName" | "trackLayout" | "carName" | "carClass">;

export type RecordedCalendarSnapshot = {
  readonly simulator: string;
  readonly version: number;
  readonly updated: string;
  readonly capturedAt: string;
  readonly startAt?: string;
  readonly series: RaceSeries;
};

type RecordedCalculationEvent = StrategyOrbitCalculationInputV1["event"];

/** An unsaved working draft. Missing inputs are not observations or defaults. */
export type RecordedWizardDraft = {
  readonly step: RecordedWizardStep;
  readonly mode: "manual" | "automatic";
  readonly combination?: RecordedCombination;
  readonly calendar?: RecordedCalendarSnapshot;
  readonly name: string;
  readonly race: { readonly format: "timed"; readonly durationMin?: number } | { readonly format: "laps"; readonly laps?: number };
  readonly tankLiters?: number;
  readonly initialFuelLiters?: number;
  readonly fuelReserveLiters?: number;
  readonly pitLossSeconds?: number;
  readonly pitServices?: NonNullable<RecordedCalculationEvent["pitServices"]>;
  readonly formationSeconds?: number;
  readonly virtualEnergy?: {
    readonly applicability: "unknown" | "applicable" | "not_applicable";
    readonly capacityPercent?: number;
    readonly initialPercent?: number;
    readonly reservePercent?: number;
  };
  readonly rules?: StrategyEventRules;
  readonly tyreInventory?: NonNullable<RecordedCalculationEvent["tyreInventory"]>;
  readonly compoundPace?: NonNullable<RecordedCalculationEvent["compoundPace"]>;
  readonly drivers: readonly { readonly id: string; readonly name: string; readonly referenceDriverId?: string; readonly paceDeltaSeconds?: number }[];
  /** Absent only in drafts saved before T15; those retain their listed driver order as fixed. */
  readonly driverOrder?: { readonly mode: "fixed" | "free"; readonly ids: readonly string[] };
  readonly sessions: readonly StrategyAnalysisRevisionRef[];
  readonly invalidatedSessionCount: number;
};

export type RecordedDriverOrder = NonNullable<RecordedWizardDraft["driverOrder"]>;

/** Materializes the additive T15 field without rewriting older stored drafts. */
export function effectiveRecordedDriverOrder(draft: Pick<RecordedWizardDraft, "drivers" | "driverOrder">): RecordedDriverOrder {
  return draft.driverOrder
    ? { mode: draft.driverOrder.mode, ids: [...draft.driverOrder.ids] }
    : { mode: "fixed", ids: draft.drivers.map(driver => driver.id) };
}

/** Keeps the explicit sequence/candidate set aligned when the driver roster changes. */
export function reconcileRecordedDriverOrder(
  draft: Pick<RecordedWizardDraft, "drivers" | "driverOrder">,
  drivers: RecordedWizardDraft["drivers"],
): RecordedDriverOrder {
  const current = effectiveRecordedDriverOrder(draft);
  const available = new Set(drivers.map(driver => driver.id));
  const retained = current.ids.filter(id => available.has(id));
  const present = new Set(retained);
  return {
    mode: current.mode,
    ids: [...retained, ...drivers.map(driver => driver.id).filter(id => !present.has(id))],
  };
}

export function createRecordedWizardDraft(): RecordedWizardDraft {
  return { step: "start", mode: "manual", name: "", race: { format: "timed" }, drivers: [], sessions: [], invalidatedSessionCount: 0 };
}

export function snapshotRecordedCalendar(
  calendar: Calendar, seriesId: string, simulator: string, capturedAt: string, startAt?: string,
): RecordedCalendarSnapshot {
  const series = calendar.series?.find(item => item.id === seriesId);
  if (!series || !simulator.trim() || !Number.isFinite(Date.parse(capturedAt)) || (startAt !== undefined && !Number.isFinite(Date.parse(startAt)))) {
    throw new Error("Invalid recorded calendar selection");
  }
  return { simulator, version: calendar.version, updated: calendar.updated, capturedAt, startAt, series: structuredClone(series) };
}

export function recordedCalendarCombinations<T extends RecordedCombination>(snapshot: RecordedCalendarSnapshot, catalog: readonly T[]): T[] {
  const eligible = catalog.filter(item => item.simId === snapshot.simulator);
  return eligible.filter(item => (snapshot.series.classes ?? []).some(vehicleClass =>
    calendarSessionCombinations(snapshot.series, vehicleClass, [item]).length > 0,
  ));
}

export function selectRecordedCombination(draft: RecordedWizardDraft, id: string | undefined, catalog: readonly RecordedCombination[]): RecordedWizardDraft {
  if (id === undefined) return {
    ...draft, combination: undefined, step: "combination", sessions: [],
    invalidatedSessionCount: draft.invalidatedSessionCount + draft.sessions.length,
  };
  const available = draft.calendar ? recordedCalendarCombinations(draft.calendar, catalog) : catalog;
  const selected = available.find(item => item.combinationId === id);
  if (!selected) throw new Error("Recorded combination is not available");
  const { combinationId, simId, trackName, trackLayout, carName, carClass } = selected;
  const changed = draft.combination?.combinationId !== combinationId;
  return {
    ...draft,
    combination: { combinationId, simId, trackName, trackLayout, carName, carClass },
    step: changed ? "combination" : draft.step,
    sessions: changed ? [] : draft.sessions,
    invalidatedSessionCount: changed ? draft.invalidatedSessionCount + draft.sessions.length : draft.invalidatedSessionCount,
  };
}

/** Applying a calendar choice is explicit; later feed refreshes cannot mutate it. */
export function selectRecordedCalendar(draft: RecordedWizardDraft, snapshot: RecordedCalendarSnapshot | undefined, catalog: readonly RecordedCombination[]): RecordedWizardDraft {
  const compatible = !snapshot || recordedCalendarCombinations(snapshot, catalog).some(item => item.combinationId === draft.combination?.combinationId);
  return {
    ...draft, calendar: snapshot ? structuredClone(snapshot) : undefined, step: "combination",
    combination: compatible ? draft.combination : undefined,
    sessions: compatible ? draft.sessions : [],
    invalidatedSessionCount: draft.invalidatedSessionCount + (compatible ? 0 : draft.sessions.length),
  };
}

/** Navigation only checks context. Calculation readiness belongs to the application. */
export function moveRecordedWizard(draft: RecordedWizardDraft, step: RecordedWizardStep): RecordedWizardDraft {
  const current = RECORDED_WIZARD_STEPS.indexOf(draft.step);
  const target = RECORDED_WIZARD_STEPS.indexOf(step);
  if (target > current + 1 || (target > 1 && !draft.combination)) return draft;
  return { ...draft, step };
}

export function selectRecordedSessions(draft: RecordedWizardDraft, combinationId: string, sessions: readonly StrategyAnalysisRevisionRef[]): RecordedWizardDraft {
  if (!draft.combination || draft.combination.combinationId !== combinationId) throw new Error("Recorded sessions belong to another combination");
  if (new Set(sessions.map(item => item.sessionId)).size !== sessions.length) throw new Error("Duplicate recorded session selection");
  return { ...draft, sessions: sessions.map(item => ({ ...item })) };
}
