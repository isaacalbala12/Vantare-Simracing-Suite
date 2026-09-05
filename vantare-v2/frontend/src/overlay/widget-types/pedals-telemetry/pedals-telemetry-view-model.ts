import { formatGear } from "../shared/format-gear";
import type { WidgetViewModelBase } from "../../core/widget-definition";

export type PedalsTelemetryViewModel = WidgetViewModelBase & {
  type: "pedals-telemetry";
  throttle: number;
  brake: number;
  clutch: number;
  speedKph?: number;
  rpm?: number;
  gear?: number;
  playerPosition?: number;
  showPosition: boolean;
  showClutch: boolean;
  speedText: string;
  rpmText: string;
  gearText: string;
  positionText: string;
};

const PLACEHOLDER = "—";

export function formatPedalsTelemetrySpeed(value: number | undefined): string {
  return value === undefined ? PLACEHOLDER : String(Math.round(value));
}

export function formatPedalsTelemetryRpm(value: number | undefined): string {
  if (value === undefined) return PLACEHOLDER;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

export function formatPedalsTelemetryGear(value: number | undefined): string {
  return formatGear(value);
}
