import type { StrategyOrbitCalculationInputV1 } from "../../strategy/strategy-application-client";
import { effectiveRecordedDriverOrder, type RecordedWizardDraft } from "./strategy-recorded-wizard";
import { recordedWizardErrors } from "./strategy-recorded-validation";

type CalculationEvent = StrategyOrbitCalculationInputV1["event"];
type CalculationVariant = StrategyOrbitCalculationInputV1["variants"][number];

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
    || order.ids.some(id => !expected.has(id)) || (draft.race.format === "timed" && order.mode === "free")) {
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
