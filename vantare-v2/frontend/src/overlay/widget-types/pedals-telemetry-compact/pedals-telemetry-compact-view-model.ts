import type { WidgetViewModelBase } from "../../core/widget-definition";

export type PedalsTelemetryCompactViewModel = WidgetViewModelBase & {
  type: "pedals-telemetry-compact";
  throttle: number;
  brake: number;
  clutch: number;
  speedKph?: number;
  rpm?: number;
  gear?: number;
  /** Volante normalizado -1..1 (negativo = izquierda). */
  steering?: number;
  speedText: string;
  rpmText: string;
  gearText: string;
  showSpeed: boolean;
  showRpm: boolean;
  showClutch: boolean;
};
