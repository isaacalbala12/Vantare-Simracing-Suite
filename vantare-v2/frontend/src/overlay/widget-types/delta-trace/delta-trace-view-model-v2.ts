import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { DeltaTraceContent } from "./delta-trace-definition";
import type { DeltaTraceViewModel } from "./delta-trace-view-model";

const MAX_POINTS = 120;

type Point = { capturedAt: number; deltaSeconds: number };

type HistoryState = {
  sessionKey: string;
  samples: Point[];
  lastCapturedAt?: number;
};

let history: HistoryState | null = null;

function sessionKey(frame: OverlayFrameV2): string {
  return `${frame.sessionId}:${frame.epoch}`;
}

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

/**
 * Resetea el historial acumulado. Exportado para tests.
 */
export function resetDeltaTraceHistory(): void {
  history = null;
}

/**
 * Delta-trace view model over the Overlay v2 contract.
 *
 * El frame v2 NO transporta una serie temporal de delta; solo el instante
 * `delta.seconds`. Para que delta-trace pueda pintar su traza este VM acumula
 * localmente los valores válidos que van llegando, acotado a 120 puntos y
 * reiniciado al cambiar de sesión/epoch. Es el mismo patrón que
 * `input-telemetry` usaba en TS antes de que Go publicara `controls.history`;
 * aquí se mantiene porque Go no deriva historial de delta.
 *
 * La acumulación es global (no por widget id) porque la firma v2 es
 * `buildXViewModelV2(frame, source, content)` sin id; dos widgets
 * delta-trace comparten la misma serie, igual que `controls.history` es única
 * por sesión. El corte por ventana lo aplica `content.windowSeconds` al leer.
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

  // Mantener historial solo en estados live/stale y con delta válido.
  const current = displayedNumber(frame.delta.seconds);
  const key = sessionKey(frame);
  if (history === null || history.sessionKey !== key) {
    history = { sessionKey: key, samples: [] };
  }

  if (current !== undefined && Number.isFinite(current)) {
    const capturedAt = Date.parse(frame.generatedAt);
    const millis = Number.isFinite(capturedAt) ? capturedAt : Date.now();
    if (history.lastCapturedAt !== millis) {
      history.samples.push({ capturedAt: millis, deltaSeconds: current });
      history.lastCapturedAt = millis;
      if (history.samples.length > MAX_POINTS) {
        history.samples.splice(0, history.samples.length - MAX_POINTS);
      }
    }
  }

  const windowSeconds = Math.max(1, Math.min(8, content.windowSeconds));
  const newest = history.samples.at(-1)?.capturedAt ?? Date.parse(frame.generatedAt);
  const cutoff = (Number.isFinite(newest) ? newest : Date.now()) - windowSeconds * 1000;
  const points = history.samples.filter((p) => p.capturedAt >= cutoff);

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
