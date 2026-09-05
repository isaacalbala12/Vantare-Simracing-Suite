import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { InputTelemetrySample } from "./input-telemetry-accumulator";

export type InputTelemetryViewModel = WidgetViewModelBase & { type: "input-telemetry"; throttle: number; brake: number; clutch: number; speedKph?: number; rpm?: number; gear?: number; history: readonly InputTelemetrySample[]; historySeconds: number; showClutch: boolean };
