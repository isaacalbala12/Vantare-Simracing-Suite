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
  const { unavailable, speedKph, rpm, gear } = readPedalsTelemetryInstruments(frame, source);
  const throttle = unavailable ? undefined : pedalValue(frame.player.throttle);
  const brake = unavailable ? undefined : pedalValue(frame.player.brake);
  const clutch = unavailable ? undefined : pedalValue(frame.player.clutch);
  const steering = unavailable ? 0 : Math.max(-1, Math.min(1, displayedNumber(frame.player.steering) ?? 0));
  const status = unavailable
    ? source.state === "error" ? "error" : "disconnected"
    : source.state === "stale" || hasStalePlayerValue(frame, content.showClutch)
      ? "stale"
      : [throttle, brake, speedKph, rpm, gear, ...(content.showClutch ? [clutch] : [])].some((value) => value === undefined)
        ? "missing"
        : "ready";
  return {
    type: "pedals-telemetry",
    status,
    statusMessage: source.reason || undefined,
    throttle: throttle ?? 0,
    brake: brake ?? 0,
    clutch: clutch ?? 0,
    speedKph,
    rpm,
    gear,
    steering,
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
  const number = value.v ?? 0;
  return Number.isFinite(number) ? number : undefined;
}

export function pedalValue(value: OverlayQValue<number>): number | undefined {
  const number = displayedNumber(value);
  return number === undefined ? undefined : Math.max(0, Math.min(1, number));
}

/**
 * Converts the frame speed to the km/h the widgets render. It is exported so
 * every v2 view model that shows a speed shares one conversion instead of
 * keeping a private copy of the same three constants.
 */
export function speedInKph(value: OverlayQValue<number>, unit: OverlayFrameV2["units"]["speed"]): number | undefined {
  const speed = displayedNumber(value);
  if (speed === undefined) return undefined;
  if (unit === "mps") return speed * 3.6;
  if (unit === "mph") return speed * 1.609344;
  return speed;
}

function hasStalePlayerValue(frame: OverlayFrameV2, showClutch: boolean): boolean {
  return [
    frame.player.speed,
    frame.player.rpm,
    frame.player.gear,
    frame.player.throttle,
    frame.player.brake,
    ...(showClutch ? [frame.player.clutch] : []),
  ].some((value) => value.q === "stale");
}

/** Shared instruments; each presentation retains its own input clamps and stale policy. */
export function readPedalsTelemetryInstruments(frame: OverlayFrameV2, source: OverlaySourceStatusV2) {
  const unavailable = !["live", "degraded", "stale"].includes(source.state);
  const speedKph = unavailable ? undefined : speedInKph(frame.player.speed, frame.units.speed);
  const rpm = unavailable ? undefined : displayedNumber(frame.player.rpm);
  const gear = unavailable ? undefined : displayedNumber(frame.player.gear);
  return { unavailable, speedKph, rpm, gear };
}
