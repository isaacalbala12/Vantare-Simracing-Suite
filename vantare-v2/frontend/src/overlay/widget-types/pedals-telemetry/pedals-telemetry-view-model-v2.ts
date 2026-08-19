import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { PedalsTelemetryContent } from "./pedals-telemetry-definition";
import {
  formatPedalsTelemetryGear,
  formatPedalsTelemetryRpm,
  formatPedalsTelemetrySpeed,
  type PedalsTelemetryViewModel,
} from "./pedals-telemetry-view-model";

export function buildPedalsTelemetryViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: PedalsTelemetryContent,
): PedalsTelemetryViewModel {
  const unavailable = source.state === "error" || source.state === "stopped";
  const speedKph = unavailable ? undefined : speedInKph(frame.player.speed, frame.units.speed);
  const rpm = unavailable ? undefined : displayedNumber(frame.player.rpm);
  const gear = unavailable ? undefined : displayedNumber(frame.player.gear);
  const status = unavailable
    ? source.state === "error" ? "error" : "disconnected"
    : source.state === "stale" || hasStalePlayerValue(frame)
      ? "stale"
      : "ready";
  return {
    type: "pedals-telemetry",
    status,
    statusMessage: source.reason || undefined,
    throttle: unavailable ? 0 : displayedNumber(frame.player.throttle) ?? 0,
    brake: unavailable ? 0 : displayedNumber(frame.player.brake) ?? 0,
    clutch: unavailable ? 0 : displayedNumber(frame.player.clutch) ?? 0,
    speedKph,
    rpm,
    gear,
    speedText: formatPedalsTelemetrySpeed(speedKph),
    rpmText: formatPedalsTelemetryRpm(rpm),
    gearText: formatPedalsTelemetryGear(gear),
    positionText: "—",
    showPosition: content.showPosition,
    showClutch: content.showClutch,
  };
}

export function pedalsTelemetryDisplayedValues(model: PedalsTelemetryViewModel): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    throttle: `${Math.round(model.throttle * 100)}%`,
    brake: `${Math.round(model.brake * 100)}%`,
    clutch: model.showClutch ? `${Math.round(model.clutch * 100)}%` : "hidden",
    speed: model.speedText,
    rpm: model.rpmText,
    gear: model.gearText,
    position: model.showPosition ? model.positionText : "hidden",
  });
}

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  // Go omitempty elides legitimate zeroes. Quality is the presence bit.
  return value.v ?? 0;
}

function speedInKph(value: OverlayQValue<number>, unit: OverlayFrameV2["units"]["speed"]): number | undefined {
  const speed = displayedNumber(value);
  if (speed === undefined) return undefined;
  if (unit === "mps") return speed * 3.6;
  if (unit === "mph") return speed * 1.609344;
  return speed;
}

function hasStalePlayerValue(frame: OverlayFrameV2): boolean {
  return [
    frame.player.speed,
    frame.player.rpm,
    frame.player.gear,
    frame.player.throttle,
    frame.player.brake,
    frame.player.clutch,
  ].some((value) => value.q === "stale");
}
