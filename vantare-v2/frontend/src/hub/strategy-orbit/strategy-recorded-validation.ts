import { validateStrategyEventRules } from "../../strategy/strategy-event-rules";
import { effectiveRecordedDriverOrder, lmuVirtualEnergyCapability, type RecordedWizardDraft, type RecordedWizardStep } from "./strategy-recorded-wizard";

/** Validate supplied configuration; missing telemetry is not a draft error. */
export function recordedWizardErrors(draft: RecordedWizardDraft, step: RecordedWizardStep): string[] {
  const errors: string[] = [];
  if ((step === "combination" || step === "sessions") && !draft.combination) errors.push("combination");
  if (step === "rules" || step === "sessions") {
    const valid = (value: number | undefined, min: number, max = Number.MAX_VALUE) => value === undefined || (Number.isFinite(value) && value >= min && value <= max);
    if (draft.race.format === "timed" ? !valid(draft.race.durationMin, 1) : !valid(draft.race.laps, 1) || (draft.race.laps !== undefined && !Number.isSafeInteger(draft.race.laps))) errors.push("race");
    if (!valid(draft.tankLiters, 0.001) || !valid(draft.initialFuelLiters, 0) || !valid(draft.fuelReserveLiters, 0) ||
      (draft.tankLiters !== undefined && (draft.initialFuelLiters !== undefined && draft.initialFuelLiters > draft.tankLiters || draft.fuelReserveLiters !== undefined && draft.fuelReserveLiters > draft.tankLiters))) errors.push("fuel");
    if (!valid(draft.pitLossSeconds, 0)) errors.push("pit");
    const energy = draft.virtualEnergy;
    if (energy?.applicability === "applicable" && (lmuVirtualEnergyCapability(draft.combination) === false || !valid(energy.capacityPercent, 0.001, 100) || !valid(energy.initialPercent, 0, 100) || !valid(energy.reservePercent, 0, 100) ||
      (energy.capacityPercent !== undefined && (energy.initialPercent !== undefined && energy.initialPercent > energy.capacityPercent || energy.reservePercent !== undefined && energy.reservePercent > energy.capacityPercent)))) errors.push("energy");
    if (draft.rules) {
      try { validateStrategyEventRules(draft.rules, "rules"); } catch { errors.push("rules"); }
    }
  }
  if (step === "drivers" && draft.rules?.driverLimits) {
    try { validateStrategyEventRules({ driverLimits: draft.rules.driverLimits }, "driver limits"); } catch { errors.push("rules"); }
  }
  if (step === "drivers" || step === "sessions") {
    const byId = new Map(draft.drivers.map(driver => [driver.id, driver]));
    if (byId.size !== draft.drivers.length || draft.drivers.some(driver => !driver.id.trim() || !driver.name.trim())) errors.push("driverNames");
    const order = effectiveRecordedDriverOrder(draft);
    const ordered = new Set(order.ids);
    if (ordered.size !== order.ids.length || ordered.size !== byId.size || order.ids.some(id => !byId.has(id))) errors.push("driverOrder");
    if (draft.drivers.some(driver => {
      if (driver.paceDeltaSeconds !== undefined && !Number.isFinite(driver.paceDeltaSeconds)) return true;
      if (!driver.referenceDriverId) return driver.paceDeltaSeconds !== undefined;
      const seen = new Set([driver.id]);
      let reference: string | undefined = driver.referenceDriverId;
      while (reference) {
        if (seen.has(reference) || !byId.has(reference)) return true;
        seen.add(reference);
        reference = byId.get(reference)?.referenceDriverId;
      }
      return driver.paceDeltaSeconds === undefined;
    })) errors.push("driverReferences");
  }
  return errors;
}
