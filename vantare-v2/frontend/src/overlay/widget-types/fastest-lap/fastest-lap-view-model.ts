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

export type FastestLapNotice = {
  id: number;
  kind: "personal" | "class";
  phase: "visible" | "leaving";
  timing: FastestLapTiming;
};

export type FastestLapViewModel = WidgetViewModelBase & {
  type: "fastest-lap";
  scopeKey: string;
  sequence: number;
  rows: readonly FastestLapTiming[];
  candidate?: FastestLapTiming;
  personal?: FastestLapTiming;
  notification?: FastestLapNotice;
  durationMs: number;
  showDriver: boolean;
  showPersonal: boolean;
  showClass: boolean;
  activeClass?: string;
  preview?: boolean;
};

function milliseconds(value: OverlayQValue<number>): number | undefined {
  if (value.q !== "fresh" || typeof value.v !== "number" || !Number.isFinite(value.v) || value.v <= 0) return undefined;
  const result = Math.round(value.v * 1000);
  return result > 0 && Number.isSafeInteger(result) ? result : undefined;
}

function timing(row: OverlayFrameV2["standings"][number]): FastestLapTiming {
  return {
    id: row.id, driver: row.driver, classId: row.classId,
    bestMs: milliseconds(row.bestLap), lastMs: milliseconds(row.lastLap),
    laps: typeof row.laps === "number" && Number.isInteger(row.laps) && row.laps >= 0 ? row.laps : undefined,
  };
}

/** Presentation input only: the V2 classification remains the timing authority. */
export function buildFastestLapViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: FastestLapContent,
): FastestLapViewModel {
  const player = frame.standings.find(row => row.id === frame.player.id);
  const activeClass = player?.classId?.trim().toUpperCase();
  const rows = activeClass ? frame.standings.filter(row => row.classId?.trim().toUpperCase() === activeClass).map(timing) : [];
  let candidate: FastestLapTiming | undefined;
  for (const row of rows) {
    if (row.bestMs !== undefined && (candidate?.bestMs === undefined || row.bestMs < candidate.bestMs)) candidate = row;
  }
  return {
    type: "fastest-lap",
    status: source.state === "live" ? (!player || (!activeClass && !content.showPersonal) ? "missing" : "ready")
      : source.state === "error" ? "error" : source.state === "stale" ? "stale" : "disconnected",
    scopeKey: JSON.stringify([frame.sessionId, frame.epoch, source.retry, player?.id, player?.driver,
      activeClass, content.showPersonal, content.showClass, content.durationSeconds]),
    sequence: frame.sequence,
    rows, candidate, personal: player ? timing(player) : undefined, durationMs: content.durationSeconds * 1000,
    showDriver: content.showDriver, showPersonal: content.showPersonal, showClass: content.showClass, activeClass,
  };
}
