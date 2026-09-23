import type { WidgetColumnV3 } from "../shared/widget-column";
import { formatDriverName } from "../shared/driver-name";

export type StandingsSessionMode = "practice" | "qual" | "race" | "other";

export type StandingsScoringRow = Record<string, unknown>;

const PLACEHOLDER = "—";

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampDecimals(value: unknown): 0 | 1 | 2 | 3 {
  const n = readNumber(value);
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  return 3;
}

function formatStandingsDriverName(name: string | undefined, column: WidgetColumnV3): string {
  return formatDriverName(name, column);
}

export function formatStandingsLapTime(seconds: number | undefined, column?: WidgetColumnV3): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return PLACEHOLDER;

  const format = column?.format;
  const display = readString(format?.display) === "compact" ? "compact" : "full";
  const decimals = clampDecimals(format?.decimals);

  let minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  let roundedRemaining = Number(remaining.toFixed(decimals));
  if (roundedRemaining >= 60) {
    minutes += 1;
    roundedRemaining -= 60;
  }

  if (display === "compact") {
    return roundedRemaining.toFixed(decimals);
  }
  return `${minutes}:${roundedRemaining.toFixed(decimals).padStart(decimals === 0 ? 2 : 3 + decimals, "0")}`;
}

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

export function formatStandingsSecondsDifference(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds === 0) return PLACEHOLDER;
  return `${seconds > 0 ? "+" : ""}${seconds.toFixed(2)}s`;
}

export function formatStandingsLapDifference(laps: number | undefined): string {
  if (laps == null || !Number.isFinite(laps) || laps === 0) return PLACEHOLDER;
  const magnitude = Math.abs(laps);
  return `${laps > 0 ? "+" : "-"}${magnitude} ${magnitude === 1 ? "vuelta" : "vueltas"}`;
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
  if (lapsDiff !== 0) {
    return formatStandingsLapDifference(lapsDiff);
  }
  const timeDiff =
    Number(row.timeBehindLeader ?? 0) - Number(classLeader?.timeBehindLeader ?? 0);
  if (timeDiff !== 0) {
    return formatStandingsSecondsDifference(timeDiff);
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
        column,
      );
    case "vehicleClass":
      return String(row.vehicleClass ?? "");
    case "gap":
      return formatStandingsGapForMode(mode, row, classLeader);
    case "interval": {
      const interval = row.timeBehindNext;
      if (typeof interval !== "number" || !Number.isFinite(interval) || interval === 0) {
        return PLACEHOLDER;
      }
      return formatStandingsSecondsDifference(interval);
    }
    case "currentLap":
      return String(row.totalLaps ?? "");
    case "lastLap":
      return formatStandingsLapTime(
        typeof row.lastLapTime === "number" ? row.lastLapTime : undefined,
        column,
      );
    case "bestLap":
      return formatStandingsLapTime(
        typeof row.bestLapTime === "number" ? row.bestLapTime : undefined,
        column,
      );
    case "pit":
      return formatStandingsPit(row);
    case "tireCompound":
      return String(row.tireCompound ?? "");
    default:
      return "";
  }
}
