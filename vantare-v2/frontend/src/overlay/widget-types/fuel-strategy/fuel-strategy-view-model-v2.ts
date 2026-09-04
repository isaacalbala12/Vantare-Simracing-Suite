import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { FuelStrategyContent } from "./fuel-strategy-definition";
import type { FuelStrategyViewModel } from "./fuel-strategy-view-model";

/**
 * Fuel strategy view model over the Overlay v2 contract.
 *
 * The laps projection is NOT recomputed here. Overlay v1 divided
 * `session.remainingSeconds` by `player.lastLapSeconds` inside
 * fuel-strategy-view-model.ts (:27-32); both inputs are canonical, so the Go
 * builder now publishes the result as `fuel.estimatedLaps` with the worst
 * quality of the two inputs, and this module only reads it.
 *
 * `avgPerLap` is `fuel.perLap`, read and never recomputed. ISA-678 put the
 * per-lap consumption derivation in derive/, so the value now has a single
 * canonical authority. It is an INTENTIONAL DIFFERENCE against Overlay v1, not
 * a port: v1 averaged `derived.fuelHistory` over the widget's own
 * `historyRows` window, accumulated in the browser from the moment the widget
 * mounted; the canonical value averages the last valid laps measured from the
 * stream since the stint began. The two windows are different, so the two
 * numbers can differ, and the canonical one is the authority. See
 * docs/telemetry-core/evidence/isa-678-fuel-perlap.md.
 *
 * `requiredFuel` is `fuel.requiredFuel`, read verbatim: Go already computed
 * perLap x sessionLaps with the worst quality of both, never from
 * `estimatedLaps`. `history` decodes `fuel.history` (lap numbers plus litre
 * figures, index-aligned) into `{lap, consumedLiters}` rows in canonical
 * litres, clipped to the widget `historyRows` window for presentation only.
 * No unit conversion and no clock read happen here: the frame already carries
 * the preferred fuel unit and absolute history needs no `Date.now()`.
 *
 * `fuel.sessionLaps` stays on the wire for future consumers: this widget
 * keeps the v1 shape (`lapsRemaining` only), so it is not decoded here.
 *
 * `fuelPercent` is left undefined to match Overlay v1, which never populated
 * it, even though the frame does carry the tank capacity.
 */
export function buildFuelStrategyViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: FuelStrategyContent,
): FuelStrategyViewModel {
  const status = resolveStatus(source.state);
  const unavailable = status === "missing" || status === "disconnected" || status === "error";
  return {
    type: "fuel-strategy",
    status,
    statusMessage: source.reason || undefined,
    fuelLiters: unavailable ? undefined : displayedNumber(frame.fuel.remaining),
    avgPerLap: unavailable ? undefined : displayedNumber(frame.fuel.perLap),
    lapsRemaining: unavailable || !content.showProjection
      ? undefined
      : displayedNumber(frame.fuel.estimatedLaps),
    requiredFuel: unavailable || !content.showProjection
      ? undefined
      : displayedNumber(frame.fuel.requiredFuel),
    history: unavailable ? [] : decodeFuelHistory(frame, content.historyRows),
    units: content.units,
    showProjection: content.showProjection,
  };
}

export function fuelStrategyDisplayedValues(
  model: FuelStrategyViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    fuelLiters: model.fuelLiters === undefined ? "" : model.fuelLiters.toFixed(6),
    avgPerLap: model.avgPerLap === undefined ? "" : model.avgPerLap.toFixed(6),
    lapsRemaining: model.lapsRemaining === undefined ? "" : String(model.lapsRemaining),
    historyRows: String(model.history.length),
  });
}

/** Fields with no canonical signal behind them; declared, never compared. */
export const OVERLAY_V2_FUEL_DECLARED_GAPS: readonly string[] = Object.freeze([
  "fuelPercent",
]);

/**
 * Fields both contracts populate with a different, deliberate criterion. They
 * are accounted and never compared as values, because a difference here is not
 * a defect: it is the canonical authority replacing a browser-side estimate.
 */
export const OVERLAY_V2_FUEL_INTENTIONAL_DIFFERENCES: readonly string[] = Object.freeze([
  // Different averaging window; see the module comment above.
  "avgPerLap",
  // Only when the frame publishes basis "fuel": v1 always shows the session
  // projection, the frame prefers the laps the tank allows.
  "lapsRemaining",
]);

function resolveStatus(state: string): FuelStrategyViewModel["status"] {
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

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  // Go omitempty elides legitimate zeroes. Quality is the presence bit.
  return value.v ?? 0;
}

/**
 * Decodes the canonical fuel history into `{lap, consumedLiters}` rows in the
 * frame unit (litres for this widget), oldest first, clipped to the newest
 * `historyRows` for presentation only. A non-fresh quality, a length mismatch
 * or a non-finite figure decodes to no rows instead of inventing any.
 */
function decodeFuelHistory(
  frame: OverlayFrameV2,
  historyRows: number,
): FuelStrategyViewModel["history"] {
  const history = frame.fuel.history;
  if (history.q === "missing" || history.q === "invalid") return [];
  const laps = history.lap ?? [];
  const consumed = history.consumed ?? [];
  if (laps.length !== consumed.length) return [];
  const rows: { lap: number; consumedLiters: number }[] = [];
  for (let index = 0; index < laps.length; index++) {
    const lap = laps[index];
    const litres = consumed[index];
    if (!Number.isFinite(lap) || !Number.isFinite(litres)) return [];
    rows.push({ lap, consumedLiters: litres });
  }
  return rows.slice(-Math.max(1, historyRows));
}
