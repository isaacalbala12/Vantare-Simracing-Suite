import type { RaceSeries, VehicleClass } from "../../calendar/calendar-types";
import type { StrategySessionCombinationV1 } from "../../strategy/strategy-application-client";

export function calendarSessionCombinations(
  series: Pick<RaceSeries, "telemetryTrackName">,
  vehicleClass: Pick<VehicleClass, "telemetryClassName">,
  combinations: readonly StrategySessionCombinationV1[],
  trackLayout?: string,
): StrategySessionCombinationV1[] {
  if (!series.telemetryTrackName || !vehicleClass.telemetryClassName) return [];
  return combinations.filter((combination) =>
    combination.trackName === series.telemetryTrackName
      && combination.carClass === vehicleClass.telemetryClassName
      && (trackLayout === undefined || combination.trackLayout === trackLayout),
  );
}

export type CalendarSessionLayout = {
  readonly trackLayout: string;
  readonly sessionCount: number;
};

/** Agrupa los trazados observados; no decide cuál representa al calendario. */
export function calendarSessionLayouts(
  series: Pick<RaceSeries, "telemetryTrackName">,
  vehicleClass: Pick<VehicleClass, "telemetryClassName">,
  combinations: readonly StrategySessionCombinationV1[],
): CalendarSessionLayout[] {
  const totals = new Map<string, number>();
  for (const combination of calendarSessionCombinations(series, vehicleClass, combinations)) {
    totals.set(
      combination.trackLayout,
      (totals.get(combination.trackLayout) ?? 0) + combination.sessionCount,
    );
  }
  return [...totals.entries()]
    .map(([trackLayout, sessionCount]) => ({ trackLayout, sessionCount }))
    .sort((left, right) => left.trackLayout.localeCompare(right.trackLayout));
}
