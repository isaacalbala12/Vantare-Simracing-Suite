import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { DeltaAdvancedContent } from "./delta-advanced-definition";
import type { DeltaAdvancedViewModel } from "./delta-advanced-view-model";

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  return value.v ?? 0;
}

function unavailable(
  status: DeltaAdvancedViewModel["status"],
  content: DeltaAdvancedContent,
  statusMessage?: string,
): DeltaAdvancedViewModel {
  return {
    type: "delta-advanced",
    status,
    statusMessage,
    availability: { best: false, sector: false, theoretical: false, last: false },
    showUnavailableFields: content.showUnavailableFields,
  };
}

/**
 * Delta-advanced view model over the Overlay v2 contract.
 *
 * Variante de presentación de `delta`: mismo dominio (deltaSeconds) pero con
 * placeholders honestos para las proyecciones no transportadas. El frame v2
 * publica `delta.seconds` resuelto en Go (reference/requested/available);
 * este VM solo formatea ese número a `best` y deja `sector/theoretical/last`
 * sin valor, como v1 hacía con `availability.* = false`.
 *
 * Señales: consume `frame.delta.seconds` (q=missing/invalid => best ausente).
 * Lifecycle: error/stopped -> error/disconnected, stale -> stale, missing
 * delta -> missing (si no hay delta que mostrar).
 */
export function buildDeltaAdvancedViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: DeltaAdvancedContent,
): DeltaAdvancedViewModel {
  if (source.state === "error" || source.state === "stopped") {
    return unavailable(source.state === "error" ? "error" : "disconnected", content, source.reason || undefined);
  }

  const best = displayedNumber(frame.delta.seconds);
  const hasBest = best !== undefined && Number.isFinite(best);
  const availability = {
    best: hasBest,
    sector: false,
    theoretical: false,
    last: false,
  };

  if (!hasBest) {
    const status: DeltaAdvancedViewModel["status"] = source.state === "stale" ? "stale" : "missing";
    return {
      type: "delta-advanced",
      status,
      statusMessage: source.reason || undefined,
      availability,
      showUnavailableFields: content.showUnavailableFields,
    };
  }

  return {
    type: "delta-advanced",
    status: source.state === "stale" ? "stale" : "ready",
    statusMessage: source.reason || undefined,
    best,
    availability,
    showUnavailableFields: content.showUnavailableFields,
  };
}

export function deltaAdvancedDisplayedValues(
  model: DeltaAdvancedViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    best: model.best !== undefined ? model.best.toFixed(3) : "—",
    availabilityBest: String(model.availability.best),
    showUnavailableFields: String(model.showUnavailableFields),
  });
}

/** Campos sin señal canónica en el frame v2; declarados, no comparados. */
export const OVERLAY_V2_DELTA_ADVANCED_DECLARED_GAPS: readonly string[] = Object.freeze([
  "sector",
  "theoretical",
  "last",
]);
