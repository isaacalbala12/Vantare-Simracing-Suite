import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { FuelStrategyContent } from "./fuel-strategy-definition";

export type FuelStrategyViewModel = WidgetViewModelBase & {
  type: "fuel-strategy";
  fuelLiters?: number;
  fuelPercent?: number;
  avgPerLap?: number;
  lapsRemaining?: number;
  requiredFuel?: number;
  history: readonly { lap: number; consumedLiters: number }[];
  units: "liters";
  showProjection: boolean;
};

export function buildFuelStrategyViewModel(
  snapshot: TelemetrySnapshot,
  content: FuelStrategyContent,
): FuelStrategyViewModel {
  const unavailable = snapshot.status === "missing" || snapshot.status === "disconnected" || snapshot.status === "error";
  const history = unavailable ? [] : [...(snapshot.derived?.fuelHistory ?? [])].slice(-content.historyRows);
  const avgPerLap = history.length > 0
    ? Math.round((history.reduce((sum, row) => sum + row.consumedLiters, 0) / history.length) * 100) / 100
    : undefined;
  const lapSeconds = snapshot.player.lastLapSeconds;
  const lapsRemaining = content.showProjection
    && typeof snapshot.session.remainingSeconds === "number"
    && typeof lapSeconds === "number"
    && lapSeconds > 0
      ? Math.max(0, Math.ceil(snapshot.session.remainingSeconds / lapSeconds))
      : undefined;
  const requiredFuel = avgPerLap !== undefined && lapsRemaining !== undefined
    ? Math.round(avgPerLap * lapsRemaining * 100) / 100
    : undefined;

  return {
    type: "fuel-strategy",
    status: snapshot.status,
    statusMessage: snapshot.errorMessage,
    fuelLiters: unavailable ? undefined : snapshot.player.fuelLiters,
    avgPerLap,
    lapsRemaining,
    requiredFuel,
    history,
    units: content.units,
    showProjection: content.showProjection,
  };
}
