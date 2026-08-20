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
 * `avgPerLap`, `requiredFuel` and `history` stay undefined: they all derive
 * from a per-lap consumption series that today exists only in the TypeScript
 * snapshot (`derived.fuelHistory`). There is no canonical fuel history and no
 * derivation producing one, so they are declared missing rather than
 * reconstructed in the projection layer — that derivation belongs in derive/.
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
    avgPerLap: undefined,
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
    lapsRemaining: model.lapsRemaining === undefined ? "" : String(model.lapsRemaining),
    historyRows: String(model.history.length),
  });
}

/** Fields with no canonical signal behind them; declared, never compared. */
export const OVERLAY_V2_FUEL_DECLARED_GAPS: readonly string[] = Object.freeze([
  "fuelPercent",
  "avgPerLap",
  "requiredFuel",
  "history",
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
