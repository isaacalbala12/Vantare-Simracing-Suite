import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import { speedInKph } from "../pedals-telemetry/pedals-telemetry-view-model-v2";
import type { PedalsTelemetryCompactContent } from "./pedals-telemetry-compact-definition";
import type { PedalsTelemetryCompactViewModel } from "./pedals-telemetry-compact-view-model";
import {
  formatPedalsTelemetryGear,
  formatPedalsTelemetryRpm,
  formatPedalsTelemetrySpeed,
} from "../pedals-telemetry/pedals-telemetry-view-model";

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  return value.v ?? 0;
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

function clampPedal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Pedals-telemetry-compact view model over the Overlay v2 contract.
 *
 * Variante de presentación de `pedals-telemetry`: mismos instrumentos
 * (`player.throttle/brake/clutch/speed/rpm/gear`) y mismos formateadores,
 * pero con flags de visibilidad propios (`showSpeed/showRpm/showClutch`).
 * Reutiliza `speedInKph` y los `format*` del VM hermano para no duplicarlos.
 *
 * `positionText` no existe en compacto y por tanto no se mapea; el frame v2
 * no transporta posición; este VM nunca inventa valores.
 */
export function buildPedalsTelemetryCompactViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: PedalsTelemetryCompactContent,
): PedalsTelemetryCompactViewModel {
  const unavailable = source.state === "error" || source.state === "stopped";
  const speedKph = unavailable ? undefined : speedInKph(frame.player.speed, frame.units.speed);
  const rpm = unavailable ? undefined : displayedNumber(frame.player.rpm);
  const gear = unavailable ? undefined : displayedNumber(frame.player.gear);
  const status = unavailable
    ? source.state === "error"
      ? "error"
      : "disconnected"
    : source.state === "stale" || hasStalePlayerValue(frame)
      ? "stale"
      : "ready";

  const throttle = unavailable ? 0 : clampPedal(displayedNumber(frame.player.throttle) ?? 0);
  const brake = unavailable ? 0 : clampPedal(displayedNumber(frame.player.brake) ?? 0);
  const clutch = unavailable ? 0 : clampPedal(displayedNumber(frame.player.clutch) ?? 0);

  return {
    type: "pedals-telemetry-compact",
    status,
    statusMessage: source.reason || undefined,
    throttle,
    brake,
    clutch,
    speedKph,
    rpm,
    gear,
    speedText: formatPedalsTelemetrySpeed(speedKph),
    rpmText: formatPedalsTelemetryRpm(rpm),
    gearText: formatPedalsTelemetryGear(gear),
    showSpeed: content.showSpeed,
    showRpm: content.showRpm,
    showClutch: content.showClutch,
  };
}

export function pedalsTelemetryCompactDisplayedValues(
  model: PedalsTelemetryCompactViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    throttle: `${Math.round(model.throttle * 100)}%`,
    brake: `${Math.round(model.brake * 100)}%`,
    clutch: model.showClutch ? `${Math.round(model.clutch * 100)}%` : "hidden",
    speed: model.speedText,
    rpm: model.rpmText,
    gear: model.gearText,
  });
}

export const OVERLAY_V2_PEDALS_TELEMETRY_COMPACT_DECLARED_GAPS: readonly string[] = Object.freeze([
  "positionText",
]);
