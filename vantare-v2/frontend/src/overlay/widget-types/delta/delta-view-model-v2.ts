import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { DeltaContent, DeltaReference } from "./delta-content";
import type { DeltaTone, DeltaViewModel } from "./delta-view-model";

const PLACEHOLDER = "—";
const DELTA_PROGRESS_SCALE_SECONDS = 1.5;

/** Format the Go-resolved response for this widget's requested reference.
 * No lap reconstruction or fallback resolution takes place in the frontend.
 */
export function buildDeltaViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: DeltaContent = {},
): DeltaViewModel {
  if (!["live", "degraded", "stale"].includes(source.state)) {
    return unavailable(source.state === "error" ? "error" : "disconnected", source.reason || undefined);
  }

  const requestedReference = content.reference ?? "personal-best";
  const resolved = resolvedReference(frame, content);
  const seconds = displayedNumber(resolved?.seconds);
  const playerRow = playerStandingRow(frame);
  const lastLapText = formatLapTime(displayedNumber(playerRow?.lastLap));
  const bestLapText = formatLapTime(displayedNumber(playerRow?.bestLap));
  const completedLap = playerRow?.laps;
  const reference = deltaReference(resolved?.reference);
  const sessionIdentity = `${frame.sessionId}:${frame.epoch}`;
  const hasStaleField = [resolved?.seconds, playerRow?.lastLap, playerRow?.bestLap].some((value) => value?.q === "stale");
  const status = source.state === "stale" || hasStaleField ? "stale" : seconds === undefined ? "missing" : "ready";
  if (seconds === undefined) {
    return {
      type: "delta",
      status,
      statusMessage: source.reason || undefined,
      tone: "neutral",
      deltaText: PLACEHOLDER,
      lastLapText,
      bestLapText,
      progress: 0,
      completedLap,
      reference,
      requestedReference,
      sessionIdentity,
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
    bestLapText,
    progress: clampProgress(seconds),
    splitText: deltaText,
    completedLap,
    reference,
    requestedReference,
    sessionIdentity,
  };
}

/** Effective reference actually rendered, for the inspector and the evidence. */
export function deltaEffectiveReference(frame: OverlayFrameV2, content: DeltaContent = {}): string | undefined {
  return resolvedReference(frame, content)?.reference || undefined;
}

/** Whether the frame could honour the reference this widget asked for. */
export function deltaHonoursRequest(frame: OverlayFrameV2, content: DeltaContent): boolean {
  const requested = content.reference ?? "personal-best";
  return deltaEffectiveReference(frame, content) === requested;
}

function resolvedReference(frame: OverlayFrameV2, content: DeltaContent) {
  const requested = content.reference ?? "personal-best";
  if (frame.delta.references !== undefined) {
    return frame.delta.references.find((entry) => entry.requested === requested);
  }
  // Older frames carry one response. Only consume it for its actual request;
  // an unavailable per-widget response must never borrow another comparison.
  return (frame.delta.requested ?? frame.delta.reference) === requested ? frame.delta : undefined;
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

function playerStandingRow(frame: OverlayFrameV2) {
  return frame.standings.find((candidate) => candidate.id === frame.player.id);
}

function deltaReference(value: string | undefined): DeltaReference | undefined {
  if (value === "personal-best" || value === "session-best" || value === "previous-lap") {
    return value;
  }
  return undefined;
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

function displayedNumber(value: OverlayQValue<number> | undefined): number | undefined {
  if (value === undefined || value.q === "missing" || value.q === "invalid") return undefined;
  // Go omitempty elides legitimate zeroes. Quality is the presence bit.
  const number = value.v ?? 0;
  return Number.isFinite(number) ? number : undefined;
}
