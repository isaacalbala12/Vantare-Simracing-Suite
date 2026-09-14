import type { WidgetViewModelBase } from "../../core/widget-definition";

export type InputTelemetrySample = {
  capturedAt: number;
  throttle: number;
  brake: number;
  clutch: number;
  speedKph?: number;
  rpm?: number;
  gear?: number;
};

export type InputTelemetryViewModel = WidgetViewModelBase & { type: "input-telemetry"; throttle: number; brake: number; clutch: number; speedKph?: number; rpm?: number; gear?: number; history: readonly InputTelemetrySample[]; historySeconds: number; showClutch: boolean };
