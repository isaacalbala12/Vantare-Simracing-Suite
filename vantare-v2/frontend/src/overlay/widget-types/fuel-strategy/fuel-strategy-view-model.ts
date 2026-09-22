import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { FuelStrategySource } from "./fuel-strategy-definition";

export type FuelStrategyViewModel = WidgetViewModelBase & {
  type: "fuel-strategy";
  source?: FuelStrategySource;
  sourceUnavailable?: boolean;
  fuelLiters?: number;
  fuelPercent?: number;
  avgPerLap?: number;
  lapsRemaining?: number;
  requiredFuel?: number;
  history: readonly { lap: number; consumedLiters: number }[];
  units: "liters";
  showProjection: boolean;
};
