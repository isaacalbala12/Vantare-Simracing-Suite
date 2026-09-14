import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
  Overlayv2DeltaHistoryV2,
} from "../../../generated/telemetry";
import type { DeltaTraceContent } from "./delta-trace-definition";
import type { DeltaTraceViewModel } from "./delta-trace-view-model";

const MAX_POINTS = 120;

type Point = { capturedAt: number; deltaSeconds: number };

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  return value.v ?? 0;
}

function resolveStatus(state: string): DeltaTraceViewModel["status"] {
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

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function computeTrend(points: readonly Point[]): DeltaTraceViewModel["trend"] {
  if (points.length < 20) return "unknown";
  const previous = mean(points.slice(-20, -10).map((p) => p.deltaSeconds));
  const current = mean(points.slice(-10).map((p) => p.deltaSeconds));
  if (current < previous - 0.01) return "gaining";
  if (current > previous + 0.01) return "losing";
  return "stable";
}

// Serie canónica del wire: instantes Unix absolutos + segundos sin
// cuantizar, siempre alineados, tope 120. Sin calidad utilizable, sin
// alineación o con un valor no finito no hay serie: se publica vacía, nunca
// reconstruida desde generatedAt ni desde el reloj del navegador.
function decodeHistory(history: Overlayv2DeltaHistoryV2): Point[] {
  if (history.q !== "fresh" && history.q !== "stale") return [];
  const capturedAtMS = history.capturedAtMS ?? [];
  const seconds = history.seconds ?? [];
  if (capturedAtMS.length !== seconds.length || capturedAtMS.length > MAX_POINTS) return [];
  const points: Point[] = [];
  for (let index = 0; index < capturedAtMS.length; index += 1) {
    const at = capturedAtMS[index];
    const value = seconds[index];
    if (at === undefined || value === undefined) return [];
    if (!Number.isSafeInteger(at) || at < 0 || typeof value !== "number" || !Number.isFinite(value)) return [];
    points.push({ capturedAt: at, deltaSeconds: value });
  }
  return points;
}

/**
 * Delta-trace view model over the Overlay v2 contract.
 *
 * El frame v2 transporta la serie temporal en `delta.history`: 120 instantes
 * Unix absolutos como máximo, medidos en Go desde `derive.SelfDelta.History`.
 * Este VM solo decodifica y presenta: no acumula estado entre llamadas, no
 * usa `Date.now` ni edades relativas a `generatedAt`. La ventana
 * `content.windowSeconds` se recorta contra el instante más nuevo del wire.
 *
 * Campos sin señal canónica quedan declarados como gaps: sectorDeltas,
 * turnInsight, trackPath.
 */
export function buildDeltaTraceViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: DeltaTraceContent,
): DeltaTraceViewModel {
  const status = resolveStatus(source.state);
  const unavailable = status === "missing" || status === "disconnected" || status === "error";

  if (unavailable) {
    return {
      type: "delta-trace",
      status,
      statusMessage: source.reason || undefined,
      points: [],
      currentDelta: undefined,
      trend: "unknown",
      sectorDeltas: [],
      showSectors: content.showSectors,
      showTrackMap: content.showTrackMap,
    };
  }

  const current = displayedNumber(frame.delta.seconds);
  const series = decodeHistory(frame.delta.history);

  const windowSeconds = Math.max(1, Math.min(8, content.windowSeconds));
  const newest = series.at(-1)?.capturedAt;
  const points = newest === undefined ? [] : series.filter((p) => p.capturedAt >= newest - windowSeconds * 1000);

  const trend = computeTrend(points);

  return {
    type: "delta-trace",
    status: status === "stale" ? "stale" : "ready",
    statusMessage: source.reason || undefined,
    points,
    currentDelta: points.at(-1)?.deltaSeconds ?? current,
    trend,
    sectorDeltas: [],
    showSectors: content.showSectors,
    showTrackMap: content.showTrackMap,
  };
}

export function deltaTraceDisplayedValues(model: DeltaTraceViewModel): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    trend: model.trend,
    points: String(model.points.length),
    currentDelta: model.currentDelta !== undefined ? model.currentDelta.toFixed(3) : "—",
  });
}

/** Campos sin señal canónica en el frame v2; declarados, no comparados. */
export const OVERLAY_V2_DELTA_TRACE_DECLARED_GAPS: readonly string[] = Object.freeze([
  "sectorDeltas",
  "turnInsight",
  "trackPath",
]);
