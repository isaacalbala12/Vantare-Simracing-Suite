import type { WidgetViewModelBase } from "../../core/widget-definition";

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
