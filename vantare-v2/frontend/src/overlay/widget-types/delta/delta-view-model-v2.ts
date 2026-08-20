import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { DeltaContent } from "./delta-definition";
import type { DeltaTone, DeltaViewModel } from "./delta-view-model";

const PLACEHOLDER = "—";
const DELTA_PROGRESS_SCALE_SECONDS = 2;

/**
 * Delta view model over the Overlay v2 contract.
 *
 * The reference resolution is NOT redone here. Overlay v1 chose the reference
 * inside delta-view-model.ts (:111-118) — requested reference, then a silent
 * fallback to `player.deltaSeconds` — and never told anybody which one it had
 * used. In v2 the Go builder resolves it and the frame carries `requested`,
 * `reference` (the effective one) and `available`; this module only formats
 * the sign, the decimals and the tone.
 *
 * The widget's own `content.reference` is deliberately NOT used to pick a
 * value: the frame is one per tick and the requested reference is a runtime
 * preference, so a widget asking for another one renders the effective
 * reference the frame does carry instead of recomputing anything. Use
 * `deltaHonoursRequest` to detect and surface that difference.
 *
 * Fields with no canonical signal behind them stay at the placeholder and are
 * declared for the shadow comparator instead of invented: bestLapText (no best
 * lap in the frame), lapText (the frame carries completed laps, not the lap
 * number Overlay v1 displayed) and predictedLapText (no estimated lap time).
 */
export function buildDeltaViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  _content: DeltaContent,
): DeltaViewModel {
  if (source.state === "error" || source.state === "stopped") {
    return unavailable(source.state === "error" ? "error" : "disconnected", source.reason || undefined);
  }

  const seconds = displayedNumber(frame.delta.seconds);
  const lastLapText = formatLapTime(playerLastLapSeconds(frame));
  const status = source.state === "stale" ? "stale" : seconds === undefined ? "missing" : "ready";
  if (seconds === undefined) {
    return {
      type: "delta",
      status,
      statusMessage: source.reason || undefined,
      tone: "neutral",
      deltaText: PLACEHOLDER,
      lastLapText,
      bestLapText: PLACEHOLDER,
      progress: 0,
    };
  }

  const deltaText = formatDeltaText(seconds);
  return {
    type: "delta",
    status,
    statusMessage: source.reason || undefined,
    tone: resolveTone(seconds),
    deltaText,
    lastLapText,
    bestLapText: PLACEHOLDER,
    progress: clampProgress(seconds),
    splitText: deltaText,
  };
}

/** Effective reference actually rendered, for the inspector and the evidence. */
export function deltaEffectiveReference(frame: OverlayFrameV2): string | undefined {
  return frame.delta.reference || undefined;
}

/** Whether the frame could honour the reference this widget asked for. */
export function deltaHonoursRequest(frame: OverlayFrameV2, content: DeltaContent): boolean {
  const requested = content.reference ?? "personal-best";
  return frame.delta.reference === requested;
}

export function deltaDisplayedValues(model: DeltaViewModel): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    tone: model.tone,
    deltaText: model.deltaText,
    lastLapText: model.lastLapText,
    bestLapText: model.bestLapText,
    progress: model.progress.toFixed(6),
    splitText: model.splitText ?? "",
  });
}

/** Fields with no canonical signal behind them; declared, never compared. */
export const OVERLAY_V2_DELTA_DECLARED_GAPS: readonly string[] = Object.freeze([
  "bestLapText",
  "lapText",
  "predictedLapText",
  "trend",
]);

function unavailable(status: DeltaViewModel["status"], statusMessage?: string): DeltaViewModel {
  return {
    type: "delta",
    status,
    statusMessage,
    tone: "neutral",
    deltaText: PLACEHOLDER,
    lastLapText: PLACEHOLDER,
    bestLapText: PLACEHOLDER,
    progress: 0,
  };
}

function playerLastLapSeconds(frame: OverlayFrameV2): number | undefined {
  const row = frame.standings.find((candidate) => candidate.id === frame.player.id);
  return row === undefined ? undefined : displayedNumber(row.lastLap);
}

function formatDeltaText(deltaSeconds: number): string {
  if (!Number.isFinite(deltaSeconds)) return PLACEHOLDER;
  if (deltaSeconds === 0) return "0.000";
  return `${deltaSeconds > 0 ? "+" : ""}${deltaSeconds.toFixed(3)}`;
}

function formatLapTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return PLACEHOLDER;
  const minutes = Math.floor(seconds / 60);
  let remaining = Number((seconds % 60).toFixed(3));
  let mins = minutes;
  if (remaining >= 60) {
    mins += 1;
    remaining -= 60;
  }
  return `${mins}:${remaining.toFixed(3).padStart(6, "0")}`;
}

function resolveTone(deltaSeconds: number): DeltaTone {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return "neutral";
  return deltaSeconds < 0 ? "gaining" : "losing";
}

function clampProgress(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds)) return 0;
  return Math.max(-1, Math.min(1, deltaSeconds / DELTA_PROGRESS_SCALE_SECONDS));
}

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  // Go omitempty elides legitimate zeroes. Quality is the presence bit.
  return value.v ?? 0;
}
