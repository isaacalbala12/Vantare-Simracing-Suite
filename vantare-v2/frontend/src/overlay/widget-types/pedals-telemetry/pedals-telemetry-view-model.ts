import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import { readNonNegativeNumber, readNormalizedInput } from "../shared/input-readers";
import { readScoringBoolean, readScoringNumber } from "../shared/scoring-readers";
import type { PedalsTelemetryContent } from "./pedals-telemetry-definition";

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

const EMPTY_INPUT = 0;
const PLACEHOLDER = "—";

function formatSpeed(value: number | undefined): string {
  return value === undefined ? PLACEHOLDER : String(Math.round(value));
}

function formatRpm(value: number | undefined): string {
  if (value === undefined) return PLACEHOLDER;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

function formatGear(value: number | undefined): string {
  return value === undefined ? PLACEHOLDER : String(Math.round(value));
}

function formatPosition(value: number | undefined): string {
  return value === undefined ? PLACEHOLDER : String(Math.round(value));
}

function findPlayerPosition(snapshot: TelemetrySnapshot): number | undefined {
  const player = snapshot.scoring.find((row) => readScoringBoolean(row, "isPlayer") === true);
  return player ? readScoringNumber(player, "place") : undefined;
}

function buildUnavailableModel(
  status: PedalsTelemetryViewModel["status"],
  content: PedalsTelemetryContent,
  statusMessage?: string,
): PedalsTelemetryViewModel {
  return {
    type: "pedals-telemetry",
    status,
    statusMessage,
    throttle: EMPTY_INPUT,
    brake: EMPTY_INPUT,
    clutch: EMPTY_INPUT,
    speedText: PLACEHOLDER,
    rpmText: PLACEHOLDER,
    gearText: PLACEHOLDER,
    positionText: PLACEHOLDER,
    showPosition: content.showPosition,
    showClutch: content.showClutch,
  };
}

export function buildPedalsTelemetryViewModel(
  snapshot: TelemetrySnapshot,
  _content: PedalsTelemetryContent,
): PedalsTelemetryViewModel {
  if (snapshot.status === "disconnected" || snapshot.status === "error" || snapshot.status === "missing") {
    return buildUnavailableModel(snapshot.status, _content, snapshot.errorMessage);
  }

  const speedKph = readNonNegativeNumber(snapshot.player.speedKph);
  const rpm = readNonNegativeNumber(snapshot.player.rpm);
  const gear = readNonNegativeNumber(snapshot.player.gear);
  const playerPosition = findPlayerPosition(snapshot);
  const status = snapshot.status === "stale" ? "stale" : "ready";

  return {
    type: "pedals-telemetry",
    status,
    throttle: readNormalizedInput(snapshot.player.throttle) ?? EMPTY_INPUT,
    brake: readNormalizedInput(snapshot.player.brake) ?? EMPTY_INPUT,
    clutch: readNormalizedInput(snapshot.player.clutch) ?? EMPTY_INPUT,
    speedKph,
    rpm,
    gear,
    playerPosition,
    speedText: formatSpeed(speedKph),
    rpmText: formatRpm(rpm),
    gearText: formatGear(gear),
    positionText: formatPosition(playerPosition),
    showPosition: _content.showPosition,
    showClutch: _content.showClutch,
  };
}
