import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { DeltaContent } from "./delta-definition";

const DELTA_PROGRESS_SCALE_SECONDS = 2;
const PLACEHOLDER = "—";

export type DeltaTone = "gaining" | "neutral" | "losing";

export type DeltaViewModel = WidgetViewModelBase & {
  type: "delta";
  tone: DeltaTone;
  deltaText: string;
  lastLapText: string;
  bestLapText: string;
  progress: number;
};

function formatDeltaText(deltaSeconds: number): string {
  if (!Number.isFinite(deltaSeconds)) {
    return PLACEHOLDER;
  }
  if (deltaSeconds === 0) {
    return "0.000";
  }
  const sign = deltaSeconds > 0 ? "+" : "";
  return `${sign}${deltaSeconds.toFixed(3)}`;
}

function formatLapTime(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return PLACEHOLDER;
  }
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
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) {
    return "neutral";
  }
  return deltaSeconds < 0 ? "gaining" : "losing";
}

function clampProgress(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, deltaSeconds / DELTA_PROGRESS_SCALE_SECONDS));
}

function buildUnavailableModel(
  status: DeltaViewModel["status"],
  statusMessage?: string,
): DeltaViewModel {
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

export function buildDeltaViewModel(
  snapshot: TelemetrySnapshot,
  _content: DeltaContent,
): DeltaViewModel {
  if (snapshot.status === "disconnected") {
    return buildUnavailableModel("disconnected");
  }
  if (snapshot.status === "stale") {
    return buildUnavailableModel("stale");
  }
  if (snapshot.status === "error") {
    return buildUnavailableModel("error", snapshot.errorMessage);
  }
  if (snapshot.status === "missing") {
    return buildUnavailableModel("missing");
  }

  const deltaSeconds = snapshot.player.deltaSeconds;
  if (deltaSeconds == null || !Number.isFinite(deltaSeconds)) {
    return {
      type: "delta",
      status: "missing",
      tone: "neutral",
      deltaText: PLACEHOLDER,
      lastLapText: formatLapTime(snapshot.player.lastLapSeconds),
      bestLapText: formatLapTime(snapshot.player.bestLapSeconds),
      progress: 0,
    };
  }

  return {
    type: "delta",
    status: "ready",
    tone: resolveTone(deltaSeconds),
    deltaText: formatDeltaText(deltaSeconds),
    lastLapText: formatLapTime(snapshot.player.lastLapSeconds),
    bestLapText: formatLapTime(snapshot.player.bestLapSeconds),
    progress: clampProgress(deltaSeconds),
  };
}