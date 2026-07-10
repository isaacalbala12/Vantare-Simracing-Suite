import type { WidgetColumnV3 } from "../shared/widget-column";
import { formatStandingsDriverName, formatStandingsLapTime } from "../../widgets/standings-format";

export type StandingsSessionMode = "practice" | "qual" | "race" | "other";

export type StandingsScoringRow = Record<string, unknown>;

const PLACEHOLDER = "—";

export function resolveStandingsSessionMode(sessionType: string | undefined): StandingsSessionMode {
  const normalized = (sessionType ?? "").toLowerCase();
  if (normalized === "practice" || normalized === "warmup") {
    return "practice";
  }
  if (normalized === "qualifying" || normalized === "qual") {
    return "qual";
  }
  if (normalized === "race" || normalized === "endurance") {
    return "race";
  }
  return "other";
}

export function formatRemainingTime(seconds: number | undefined): string {
  if (seconds == null || seconds < 0 || !Number.isFinite(seconds)) {
    return PLACEHOLDER;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

export function formatStandingsGap(
  row: StandingsScoringRow,
  classLeader: StandingsScoringRow | undefined,
): string {
  const rowId = row.id;
  const leaderId = classLeader?.id;
  if (classLeader && rowId === leaderId) {
    return "Leader";
  }
  const lapsDiff =
    Number(row.lapsBehindLeader ?? 0) - Number(classLeader?.lapsBehindLeader ?? 0);
  if (lapsDiff > 0) {
    return `+${lapsDiff}L`;
  }
  const timeDiff =
    Number(row.timeBehindLeader ?? 0) - Number(classLeader?.timeBehindLeader ?? 0);
  if (timeDiff > 0) {
    return `+${timeDiff.toFixed(3)}s`;
  }
  return PLACEHOLDER;
}

export function formatStandingsPit(row: StandingsScoringRow): string {
  if (row.inGarageStall) {
    return "GARAGE";
  }
  if (row.pitting || row.inPits || (typeof row.pitState === "string" && row.pitState !== "NONE")) {
    return "PIT";
  }
  return "";
}

function formatLapTime(seconds: unknown): string {
  const value = typeof seconds === "number" ? seconds : undefined;
  if (value == null || value <= 0 || !Number.isFinite(value)) {
    return PLACEHOLDER;
  }
  const minutes = Math.floor(value / 60);
  const remaining = (value % 60).toFixed(3).padStart(6, "0");
  return `${minutes}:${remaining}`;
}

export function formatStandingsGapForMode(
  mode: StandingsSessionMode,
  row: StandingsScoringRow,
  classLeader: StandingsScoringRow | undefined,
): string {
  if (mode === "practice" || mode === "qual") {
    return formatLapTime(row.bestLapTime);
  }
  if (row.fastestLap) {
    return "FASTEST";
  }
  return formatStandingsGap(row, classLeader);
}

export function formatStandingsColumnValue(
  metricId: string,
  row: StandingsScoringRow,
  classLeader: StandingsScoringRow | undefined,
  mode: StandingsSessionMode,
  column: WidgetColumnV3,
): string {
  switch (metricId) {
    case "position":
      return String(row.place ?? PLACEHOLDER);
    case "driverNumber":
      return String(row.driverNumber ?? "");
    case "driverName":
      return formatStandingsDriverName(
        typeof row.driverName === "string" ? row.driverName : undefined,
        column as Parameters<typeof formatStandingsDriverName>[1],
      );
    case "vehicleClass":
      return String(row.vehicleClass ?? "");
    case "gap":
      return formatStandingsGapForMode(mode, row, classLeader);
    case "interval": {
      const interval = row.timeBehindNext;
      if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0) {
        return PLACEHOLDER;
      }
      return `+${interval.toFixed(3)}s`;
    }
    case "currentLap":
      return String(row.totalLaps ?? "");
    case "lastLap":
      return formatStandingsLapTime(
        typeof row.lastLapTime === "number" ? row.lastLapTime : undefined,
        column as Parameters<typeof formatStandingsLapTime>[1],
      );
    case "bestLap":
      return formatStandingsLapTime(
        typeof row.bestLapTime === "number" ? row.bestLapTime : undefined,
        column as Parameters<typeof formatStandingsLapTime>[1],
      );
    case "pit":
      return formatStandingsPit(row);
    case "tireCompound":
      return String(row.tireCompound ?? "");
    default:
      return "";
  }
}