import type {
  OverlayFrameV2,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { CarDamageVisualContent } from "./car-damage-visual-definition";
import type { CarDamageVisualViewModel } from "./car-damage-visual-view-model";

export function buildCarDamageVisualViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: CarDamageVisualContent,
): CarDamageVisualViewModel {
  const status = resolveStatus(source.state);
  const unavailable = status === "missing" || status === "disconnected" || status === "error";
  if (unavailable || frame.damage.dents.q === "missing" || frame.damage.dents.q === "invalid") {
    return {
      type: "car-damage-visual",
      status,
      showPercent: content.showPercent,
      showAero: content.showAero,
    };
  }
  const dents = frame.damage.dents.v ?? [0, 0, 0, 0, 0, 0, 0, 0];
  const fractions = dents.map((d) => Math.min((d ?? 0) / 2, 1));
  const aero = Math.max(fractions[0] ?? 0, fractions[1] ?? 0);
  const suspension = Math.max(fractions[2] ?? 0, fractions[3] ?? 0);
  const body = Math.max(...fractions);
  return {
    type: "car-damage-visual",
    status,
    body: body || undefined,
    aero: aero || undefined,
    suspension: suspension || undefined,
    tyres: undefined,
    showPercent: content.showPercent,
    showAero: content.showAero,
  };
}

export function carDamageVisualDisplayedValues(
  model: CarDamageVisualViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    body: model.body === undefined ? "" : model.body.toFixed(3),
    aero: model.aero === undefined ? "" : model.aero.toFixed(3),
    suspension: model.suspension === undefined ? "" : model.suspension.toFixed(3),
    tyres: model.tyres === undefined ? "" : model.tyres.join(","),
  });
}

export const OVERLAY_V2_DAMAGE_VISUAL_DECLARED_GAPS: readonly string[] = Object.freeze([
  "tyres",
  "overheating",
  "detached",
  "wheelDetachedCount",
]);

export const OVERLAY_V2_DAMAGE_VISUAL_INTENTIONAL_DIFFERENCES: readonly string[] = Object.freeze([
  "body",
  "aero",
  "suspension",
]);

function resolveStatus(state: string): CarDamageVisualViewModel["status"] {
  switch (state) {
    case "live":
      return "ready";
    case "stale":
      return "stale";
    case "error":
      return "error";
    case "stopped":
      return "disconnected";
    default:
      return "missing";
  }
}
