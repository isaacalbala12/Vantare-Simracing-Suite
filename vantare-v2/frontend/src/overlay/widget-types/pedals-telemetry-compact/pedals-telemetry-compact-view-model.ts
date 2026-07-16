import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import { readNonNegativeNumber, readNormalizedInput } from "../shared/input-readers";
import type { PedalsTelemetryCompactContent } from "./pedals-telemetry-compact-definition";

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

const EMPTY = 0;
const PLACEHOLDER = "—";

function formatSpeed(value: number | undefined): string {
  return value === undefined ? PLACEHOLDER : String(Math.round(value));
}

function formatRpm(value: number | undefined): string {
  return value === undefined ? PLACEHOLDER : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

function buildUnavailableModel(
  status: PedalsTelemetryCompactViewModel["status"],
  content: PedalsTelemetryCompactContent,
  statusMessage?: string,
): PedalsTelemetryCompactViewModel {
  return {
    type: "pedals-telemetry-compact",
    status,
    statusMessage,
    throttle: EMPTY,
    brake: EMPTY,
    clutch: EMPTY,
    speedText: PLACEHOLDER,
    rpmText: PLACEHOLDER,
    gearText: PLACEHOLDER,
    showSpeed: content.showSpeed,
    showRpm: content.showRpm,
    showClutch: content.showClutch,
  };
}

export function buildPedalsTelemetryCompactViewModel(
  snapshot: TelemetrySnapshot,
  content: PedalsTelemetryCompactContent,
): PedalsTelemetryCompactViewModel {
  if (snapshot.status === "disconnected" || snapshot.status === "error" || snapshot.status === "missing") {
    return buildUnavailableModel(snapshot.status, content, snapshot.errorMessage);
  }
  const speedKph = readNonNegativeNumber(snapshot.player.speedKph);
  const rpm = readNonNegativeNumber(snapshot.player.rpm);
  const gear = readNonNegativeNumber(snapshot.player.gear);
  return {
    type: "pedals-telemetry-compact",
    status: snapshot.status === "stale" ? "stale" : "ready",
    throttle: readNormalizedInput(snapshot.player.throttle) ?? EMPTY,
    brake: readNormalizedInput(snapshot.player.brake) ?? EMPTY,
    clutch: readNormalizedInput(snapshot.player.clutch) ?? EMPTY,
    speedKph,
    rpm,
    gear,
    speedText: formatSpeed(speedKph),
    rpmText: formatRpm(rpm),
    gearText: gear === undefined ? PLACEHOLDER : String(Math.round(gear)),
    showSpeed: content.showSpeed,
    showRpm: content.showRpm,
    showClutch: content.showClutch,
  };
}
