import type { StrategyOrbitCalculationInputV1, StrategyPlanningInputsV2 } from "../../strategy/strategy-application-client";
import { effectiveRecordedDriverOrder, type RecordedWizardDraft } from "./strategy-recorded-wizard";
import { recordedWizardErrors } from "./strategy-recorded-validation";

type CalculationEvent = StrategyOrbitCalculationInputV1["event"];
type CalculationVariant = StrategyOrbitCalculationInputV1["variants"][number];

export type RecordedCalculationCoverage = {
  readonly paceSeconds?: number;
  readonly fuelLitersPerLap?: number;
  readonly virtualEnergyPercentPerLap?: number;
  readonly virtualEnergyApplicable: boolean;
  readonly blockers: readonly ("pace" | "fuel" | "virtual_energy")[];
};

export type RecordedCalculationAssessment =
  | { readonly status: "ready"; readonly input: StrategyOrbitCalculationInputV1; readonly coverage: RecordedCalculationCoverage }
  | { readonly status: "partial"; readonly coverage: RecordedCalculationCoverage };

/** Builds the one recorded proposal from exact telemetry inputs, without fallback profiles. */
export function recordedCalculationInput(
  draft: RecordedWizardDraft,
  planningInputs: StrategyPlanningInputsV2,
): StrategyOrbitCalculationInputV1 {
  const assessed = assessRecordedCalculation(draft, planningInputs);
  if (assessed.status !== "ready") invalidInput();
  return assessed.input;
}

/** Uses explicit user estimates with the existing Orbit calculation command. */
export function assessManualCalculation(draft: RecordedWizardDraft): RecordedCalculationAssessment {
  if (draft.mode !== "manual" || draft.sessions.length !== 0 || !draft.combination || !draft.calculationMode) invalidInput();
  const pace = draft.manualInputs?.paceSeconds;
  const fuel = draft.manualInputs?.fuelLitersPerLap;
  const energy = draft.manualInputs?.virtualEnergyPercentPerLap;
  const virtualEnergyApplicable = draft.virtualEnergy?.applicability === "applicable";
  const blockers: RecordedCalculationCoverage["blockers"] = [
    ...(!positive(pace) ? ["pace" as const] : []),
    ...(!positive(fuel) ? ["fuel" as const] : []),
    ...(virtualEnergyApplicable && !nonNegative(energy) ? ["virtual_energy" as const] : []),
  ];
  const coverage: RecordedCalculationCoverage = {
    ...(positive(pace) ? { paceSeconds: pace } : {}),
    ...(positive(fuel) ? { fuelLitersPerLap: fuel } : {}),
    ...(virtualEnergyApplicable && nonNegative(energy) ? { virtualEnergyPercentPerLap: energy } : {}),
    virtualEnergyApplicable, blockers,
  };
  const event = recordedCalculationEvent(draft);
  const deltas = recordedCalculationDriverDeltas(draft);
  const variant = recordedCalculationVariant(draft, draft.calculationMode);
  if (blockers.length) return { status: "partial", coverage };
  const readyPace = pace as number;
  if (draft.drivers.some(driver => !positive(readyPace + deltas[driver.id]))) invalidInput();
  const manual = (value: number) => ({ value, presence: "valid" as const, provenance: { kind: "manual" as const, sourceId: "user" }, confidence: { sampleSize: 0, computationVersion: "manual.v1" } });
  const planningInputs: StrategyPlanningInputsV2 = { overrides: {
    base_pace_seconds: manual(readyPace),
    fuel_per_lap_liters: manual(fuel as number),
    ...(virtualEnergyApplicable ? { ve_per_lap_percent: manual(energy as number) } : {}),
  } };
  return { status: "ready", coverage, input: {
    event,
    drivers: draft.drivers.map(driver => ({ id: driver.id, name: driver.name, paceDeltaSeconds: deltas[driver.id] })),
    variants: [variant], activeVariantId: variant.id,
    planningInputs,
  } };
}

/** Separates incomplete telemetry coverage from an invalid configuration. */
export function assessRecordedCalculation(
  draft: RecordedWizardDraft,
  planningInputs: StrategyPlanningInputsV2,
): RecordedCalculationAssessment {
  const mode = draft.calculationMode;
  const projection = planningInputs.projection;
  if (!mode || !draft.combination || !projection || projection.combinationId !== draft.combination.combinationId
    || !sameRevisions(draft.sessions, projection.sourceRevisions)) invalidInput();

  const paceOverride = planningInputs.overrides.base_pace_seconds;
  const pace = paceOverride?.presence === "valid" ? paceOverride.value : projection.representativePaceByClimateBucket?.[mode];
  const paceValue = typeof pace === "number" ? pace : pace?.presence === "valid" ? pace.medianLapSeconds : undefined;
  const fuelOverride = planningInputs.overrides.fuel_per_lap_liters;
  const fuelValue = fuelOverride?.presence === "valid" ? fuelOverride.value
    : projection.fuelConsumption.presence === "valid" ? projection.fuelConsumption.meanPerLap : undefined;
  let energyValue: number | undefined;
  if (draft.virtualEnergy?.applicability === "applicable") {
    const energyOverride = planningInputs.overrides.ve_per_lap_percent;
    energyValue = energyOverride?.presence === "valid" ? energyOverride.value
      : projection.virtualEnergyConsumption.presence === "valid" ? projection.virtualEnergyConsumption.meanPerLap : undefined;
  }

  const blockers: RecordedCalculationCoverage["blockers"] = [
    ...(!positive(paceValue) ? ["pace" as const] : []),
    ...(!positive(fuelValue) ? ["fuel" as const] : []),
    ...(draft.virtualEnergy?.applicability === "applicable" && !nonNegative(energyValue) ? ["virtual_energy" as const] : []),
  ];
  const coverage: RecordedCalculationCoverage = {
    ...(positive(paceValue) ? { paceSeconds: paceValue } : {}),
    ...(positive(fuelValue) ? { fuelLitersPerLap: fuelValue } : {}),
    ...(nonNegative(energyValue) ? { virtualEnergyPercentPerLap: energyValue } : {}),
    virtualEnergyApplicable: draft.virtualEnergy?.applicability === "applicable",
    blockers,
  };
  // Event validation still fails closed. A partial result only describes
  // telemetry families that were prepared successfully for this exact draft.
  const event = recordedCalculationEvent(draft);
  const deltas = recordedCalculationDriverDeltas(draft);
  const variant = recordedCalculationVariant(draft, mode);
  if (blockers.length > 0) return { status: "partial", coverage };

  const readyPace = paceValue as number;
  if (draft.drivers.some(driver => !positive(readyPace + deltas[driver.id]))) invalidInput();
  return { status: "ready", coverage, input: {
    event,
    drivers: draft.drivers.map(driver => ({ id: driver.id, name: driver.name, paceDeltaSeconds: deltas[driver.id] })),
    variants: [variant], activeVariantId: variant.id,
    planningInputs: structuredClone(planningInputs),
  } };
}

/** Resolves relative driver estimates into the single additive value consumed by Go. */
export function recordedCalculationDriverDeltas(
  draft: Pick<RecordedWizardDraft, "drivers">,
): Readonly<Record<string, number>> {
  const byId = new Map(draft.drivers.map(driver => [driver.id, driver]));
  if (byId.size !== draft.drivers.length || draft.drivers.some(driver => !driver.id.trim())) invalidDriverDelta();
  const resolved = new Map<string, number>();
  const visiting = new Set<string>();
  const resolve = (id: string): number => {
    const known = resolved.get(id);
    if (known !== undefined) return known;
    const driver = byId.get(id);
    if (!driver || visiting.has(id)) invalidDriverDelta();
    if (!driver.referenceDriverId) {
      if (driver.paceDeltaSeconds !== undefined) invalidDriverDelta();
      resolved.set(id, 0);
      return 0;
    }
    if (!Number.isFinite(driver.paceDeltaSeconds) || !byId.has(driver.referenceDriverId)) invalidDriverDelta();
    visiting.add(id);
    const value = resolve(driver.referenceDriverId) + driver.paceDeltaSeconds!;
    visiting.delete(id);
    if (!Number.isFinite(value)) invalidDriverDelta();
    resolved.set(id, value);
    return value;
  };
  for (const driver of draft.drivers) resolve(driver.id);
  return Object.fromEntries(resolved);
}

/** Maps confirmed event inputs only. Telemetry-derived drivers and variants belong to calculation readiness. */
export function recordedCalculationEvent(draft: RecordedWizardDraft): CalculationEvent {
  if (recordedWizardErrors(draft, "rules").length > 0) invalid();
  if (draft.tankLiters === undefined || draft.pitLossSeconds === undefined) invalid();

  const energy = draft.virtualEnergy;
  if (!energy || energy.applicability === "unknown") invalid();
  const virtualEnergy: NonNullable<CalculationEvent["virtualEnergy"]> = energy.applicability === "not_applicable"
    ? { applicability: "not_applicable" }
    : applicableEnergy(energy.capacityPercent, energy.initialPercent, energy.reservePercent);

  const common = {
    tankLiters: draft.tankLiters,
    ...(draft.initialFuelLiters === undefined ? {} : { initialFuelLiters: draft.initialFuelLiters }),
    ...(draft.fuelReserveLiters === undefined ? {} : { fuelReserveLiters: draft.fuelReserveLiters }),
    virtualEnergy,
    pitLossSeconds: draft.pitLossSeconds,
    ...(draft.pitServices === undefined ? {} : { pitServices: structuredClone(draft.pitServices) }),
    ...(draft.formationSeconds === undefined ? {} : { formationSeconds: draft.formationSeconds }),
    ...(draft.rules === undefined ? {} : { rules: structuredClone(draft.rules) }),
    ...(draft.tyreInventory === undefined ? {} : { tyreInventory: structuredClone(draft.tyreInventory) }),
    ...(draft.compoundPace === undefined ? {} : { compoundPace: structuredClone(draft.compoundPace) }),
  };
  if (draft.race.format === "timed") {
    if (draft.race.durationMin === undefined) invalid();
    return { ...common, raceKind: "time", durationMinutes: draft.race.durationMin };
  }
  if (draft.race.laps === undefined) invalid();
  return { ...common, raceKind: "laps", targetLaps: draft.race.laps, durationMinutes: 0 };
}

/** Maps only the confirmed driver criterion. The future caller must supply its explicit pace mode. */
export function recordedCalculationVariant(
  draft: RecordedWizardDraft,
  mode: CalculationVariant["mode"],
): CalculationVariant {
  const order = effectiveRecordedDriverOrder(draft);
  const driverIds = draft.drivers.map(driver => driver.id);
  const expected = new Set(driverIds);
  const actual = new Set(order.ids);
  if (driverIds.length === 0 || actual.size !== order.ids.length || actual.size !== expected.size
    || order.ids.some(id => !expected.has(id))) {
    throw new Error("Invalid recorded calculation variant");
  }
  return {
    id: "recorded-main",
    mode,
    driverOrderMode: order.mode,
    order: [...order.ids],
    overrides: {},
  };
}

function applicableEnergy(capacityPercent?: number, initialPercent?: number, reservePercent?: number) {
  if (capacityPercent === undefined || reservePercent === undefined) invalid();
  return {
    applicability: "applicable" as const,
    capacityPercent,
    ...(initialPercent === undefined ? {} : { initialPercent }),
    reservePercent,
  };
}

function invalid(): never {
  throw new Error("Invalid recorded calculation event");
}

function invalidDriverDelta(): never {
  throw new Error("Invalid recorded driver delta");
}

function sameRevisions(expected: RecordedWizardDraft["sessions"], actual?: RecordedWizardDraft["sessions"]): boolean {
  if (!actual || actual.length !== expected.length || expected.length === 0) return false;
  const bySession = new Map(expected.map(ref => [ref.sessionId, ref]));
  return actual.every(ref => {
    const match = bySession.get(ref.sessionId);
    return match?.baseDigest === ref.baseDigest && match.revisionId === ref.revisionId && match.snapshotId === ref.snapshotId;
  }) && new Set(actual.map(ref => ref.sessionId)).size === actual.length;
}

function positive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function nonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function invalidInput(): never {
  throw new Error("Invalid recorded calculation input");
}
