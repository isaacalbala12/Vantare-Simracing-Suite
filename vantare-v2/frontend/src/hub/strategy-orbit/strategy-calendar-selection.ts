import type { RaceSeries } from "../../calendar/calendar-types";
import type { StrategySessionCombinationV1 } from "../../strategy/strategy-application-client";

/**
 * Une calendario y telemetría solo cuando ambos contratos publican exactamente
 * el mismo circuito y la misma clase. No corrige nombres, no usa parciales y no
 * introduce alias: una discrepancia queda visible como ausencia de sesiones.
 */
export function calendarSessionCombinations(
  series: Pick<RaceSeries, "track">,
  className: string,
  combinations: readonly StrategySessionCombinationV1[],
): StrategySessionCombinationV1[] {
  return combinations.filter((combination) =>
    combination.trackName === series.track && combination.carClass === className,
  );
}
