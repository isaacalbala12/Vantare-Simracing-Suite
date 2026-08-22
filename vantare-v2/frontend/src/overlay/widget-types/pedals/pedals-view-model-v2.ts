import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { PedalsContent } from "./pedals-definition";
import type { PedalsViewModel } from "./pedals-view-model";

function clampPedal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function formatPedalPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  return value.v ?? 0;
}

function unavailable(status: PedalsViewModel["status"], statusMessage?: string): PedalsViewModel {
  return {
    type: "pedals",
    status,
    statusMessage,
    throttle: 0,
    brake: 0,
    clutch: 0,
    throttleText: "0%",
    brakeText: "0%",
    clutchText: "0%",
  };
}

/**
 * Pedals view model over the Overlay v2 contract.
 *
 * Consume `player.throttle / brake / clutch` publicados por el frame v2
 * (mismos que `pedals-telemetry` e `input-telemetry`). No reimplementa
 * dominio: solo formatea 0..1 a porcentaje y propaga el lifecycle del source.
 * Cuando el frame omite el valor (q=missing/invalid) se muestra 0%, como en v1
 * cuando `snapshot.player.*` era undefined.
 */
export function buildPedalsViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  _content: PedalsContent,
): PedalsViewModel {
  void _content;
  if (source.state === "error" || source.state === "stopped") {
    return unavailable(source.state === "error" ? "error" : "disconnected", source.reason || undefined);
  }

  const hasStalePedal = [frame.player.throttle, frame.player.brake, frame.player.clutch].some(
    (value) => value.q === "stale",
  );
  const status: PedalsViewModel["status"] =
    source.state === "stale" || hasStalePedal ? "stale" : "ready";

  const throttle = clampPedal(displayedNumber(frame.player.throttle) ?? 0);
  const brake = clampPedal(displayedNumber(frame.player.brake) ?? 0);
  const clutch = clampPedal(displayedNumber(frame.player.clutch) ?? 0);

  return {
    type: "pedals",
    status,
    statusMessage: source.reason || undefined,
    throttle,
    brake,
    clutch,
    throttleText: formatPedalPercent(throttle),
    brakeText: formatPedalPercent(brake),
    clutchText: formatPedalPercent(clutch),
  };
}

export function pedalsDisplayedValues(model: PedalsViewModel): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    throttle: model.throttleText,
    brake: model.brakeText,
    clutch: model.clutchText,
  });
}

export const OVERLAY_V2_PEDALS_DECLARED_GAPS: readonly string[] = Object.freeze([]);
