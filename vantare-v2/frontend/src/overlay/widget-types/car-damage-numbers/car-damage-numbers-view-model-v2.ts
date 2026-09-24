import type {
  OverlayFrameV2,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { CarDamageNumbersContent } from "./car-damage-numbers-definition";
import type { CarDamageNumbersViewModel } from "./car-damage-numbers-view-model";

/**
 * Car damage view model over Overlay v2.
 *
 * The frame carries the observed LMU dents (0=none, 1=some, 2=more, clamped)
 * as bytes from mDentSeverity[8]. The widget expects fractions 0..1 (0.9 is
 * severe), so the mapping is dent/2 clamped to 1. The four displayed fields
 * are derived from those eight dents:
 *
 *   - aero = max(dents[0], dents[1]) / 2
 *   - suspension = max(dents[2], dents[3]) / 2
 *   - body = max(all dents) / 2
 *   - tyres stays undefined: the LMU shared memory exposes wheel detachment as
 *     a count, not per-tyre fractions, so no comparable signal exists.
 *
 * Overheating / detached / wheelDetachedCount are observed but not rendered by
 * this widget; they travel in the frame for future use and are declared gaps
 * for the shadow comparator.
 *
 * `phase=live` is the only gate phase: stale or degraded frames keep the
 * status stale on purpose, and the comparator gates only on live.
 */
export function buildCarDamageNumbersViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: CarDamageNumbersContent,
): CarDamageNumbersViewModel {
  const sourceStatus = resolveStatus(source.state);
  const status = sourceStatus === "ready" && frame.damage.dents.q === "stale" ? "stale" : sourceStatus;
  const unavailable = status === "missing" || status === "disconnected" || status === "error";
  const dents = frame.damage.dents.v;
  if (unavailable || (frame.damage.dents.q !== "fresh" && frame.damage.dents.q !== "stale")
    || !dents || dents.length !== 8 || !dents.every((dent) => Number.isFinite(dent) && dent >= 0)) {
    return {
      type: "car-damage-numbers",
      status: status === "ready" ? "missing" : status,
      showTyres: content.showTyres,
      format: content.format,
    };
  }
  const fractions = dents.map((dent) => Math.min(dent / 2, 1));
  const aero = Math.max(fractions[0]!, fractions[1]!);
  const suspension = Math.max(fractions[2]!, fractions[3]!);
  const body = Math.max(...fractions);
  return {
    type: "car-damage-numbers",
    status,
    body,
    aero,
    suspension,
    tyres: undefined,
    showTyres: content.showTyres,
    format: content.format,
  };
}

export function carDamageNumbersDisplayedValues(
  model: CarDamageNumbersViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    body: model.body === undefined ? "" : model.body.toFixed(3),
    aero: model.aero === undefined ? "" : model.aero.toFixed(3),
    suspension: model.suspension === undefined ? "" : model.suspension.toFixed(3),
    tyres: model.tyres === undefined ? "" : model.tyres.join(","),
  });
}

/** Fields with no canonical signal behind them; declared, never compared. */
export const OVERLAY_V2_DAMAGE_DECLARED_GAPS: readonly string[] = Object.freeze([
  "tyres",
  "overheating",
  "detached",
  "wheelDetachedCount",
]);

/**
 * Fields both contracts populate with a different, deliberate criterion. They
 * are accounted and never compared as values, because a difference here is not
 * a defect: it is the canonical authority (dents/2) replacing the legacy Wails
 * estimate from a different source.
 */
export const OVERLAY_V2_DAMAGE_INTENTIONAL_DIFFERENCES: readonly string[] = Object.freeze([
  "body",
  "aero",
  "suspension",
]);

function resolveStatus(state: string): CarDamageNumbersViewModel["status"] {
  switch (state) {
    case "live":
      return "ready";
    case "stale":
    case "degraded":
      return "stale";
    case "error":
      return "error";
    case "stopped":
    case "stopping":
      return "disconnected";
    default:
      return "missing";
  }
}
