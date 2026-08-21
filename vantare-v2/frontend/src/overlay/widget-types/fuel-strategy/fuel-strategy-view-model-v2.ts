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
 * `requiredFuel` and `history` stay undefined. `requiredFuel` needs the laps
 * left *of the session*, which `estimatedLaps` no longer always carries once
 * the frame prefers the fuel basis; `history` is the per-lap series itself,
 * which the frame does not publish, only its average.
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
    requiredFuel: undefined,
    history: [],
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
  "requiredFuel",
  "history",
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
