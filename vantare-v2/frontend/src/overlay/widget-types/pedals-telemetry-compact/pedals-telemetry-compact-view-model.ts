import type { WidgetViewModelBase } from "../../core/widget-definition";

export type PedalsTelemetryCompactViewModel = WidgetViewModelBase & {
  type: "pedals-telemetry-compact";
  throttle: number;
  brake: number;
  clutch: number;
  speedKph?: number;
  rpm?: number;
  gear?: number;
  speedText: string;
  rpmText: string;
  gearText: string;
  showSpeed: boolean;
  showRpm: boolean;
  showClutch: boolean;
};
