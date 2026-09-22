import type { OverlayFrameV2, OverlayQValue, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { FastestLapContent } from "./fastest-lap-content";

export type FastestLapTiming = {
  id: string;
  driver?: string;
  classId?: string;
  bestMs?: number;
  lastMs?: number;
  laps?: number;
};

export type FastestLapViewModel = WidgetViewModelBase & {
  type: "fastest-lap";
  scopeKey: string;
  sequence: number;
  rows: readonly FastestLapTiming[];
  candidate?: FastestLapTiming;
  notification?: FastestLapTiming;
  durationMs: number;
  showDriver: boolean;
  scope: FastestLapContent["scope"];
  activeClass?: string;
  preview?: boolean;
};

function milliseconds(value: OverlayQValue<number>): number | undefined {
  if (value.q !== "fresh" || typeof value.v !== "number" || !Number.isFinite(value.v) || value.v <= 0) return undefined;
  const result = Math.round(value.v * 1000);
  return result > 0 && Number.isSafeInteger(result) ? result : undefined;
}

/** Presentation input only: the V2 classification remains the timing authority. */
export function buildFastestLapViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: FastestLapContent,
): FastestLapViewModel {
  const activeClass = frame.standings.find(row => row.id === frame.player.id)?.classId?.trim().toUpperCase();
  const scoped = content.scope === "session" ? frame.standings
    : activeClass ? frame.standings.filter(row => row.classId?.trim().toUpperCase() === activeClass) : [];
  const rows = scoped.map(row => ({
    id: row.id, driver: row.driver, classId: row.classId,
    bestMs: milliseconds(row.bestLap), lastMs: milliseconds(row.lastLap),
    laps: typeof row.laps === "number" && Number.isInteger(row.laps) && row.laps >= 0 ? row.laps : undefined,
  }));
  let candidate: FastestLapTiming | undefined;
  for (const row of rows) {
    if (row.bestMs !== undefined && (candidate?.bestMs === undefined || row.bestMs < candidate.bestMs)) candidate = row;
  }
  return {
    type: "fastest-lap",
    status: source.state === "live" ? (content.scope === "class" && !activeClass ? "missing" : "ready")
      : source.state === "error" ? "error" : source.state === "stale" ? "stale" : "disconnected",
    scopeKey: JSON.stringify([frame.sessionId, frame.epoch, source.retry, content.scope, content.scope === "class" ? activeClass : null, content.durationSeconds]),
    sequence: frame.sequence,
    rows, candidate, durationMs: content.durationSeconds * 1000,
    showDriver: content.showDriver, scope: content.scope, activeClass,
  };
}
