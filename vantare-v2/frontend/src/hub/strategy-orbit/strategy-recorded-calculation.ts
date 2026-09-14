import type { StrategyOrbitCalculationInputV1 } from "../../strategy/strategy-application-client";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import { recordedWizardErrors } from "./strategy-recorded-validation";

type CalculationEvent = StrategyOrbitCalculationInputV1["event"];

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
