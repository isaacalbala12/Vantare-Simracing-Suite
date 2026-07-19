import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import { readScoringBoolean, readScoringNumber, readScoringString } from "../shared/scoring-readers";
import type { WidgetColumnV3 } from "../shared/widget-column";
import type { StandingsContent } from "./standings-content";
import { getEnabledStandingsColumns } from "./standings-content";
import {
  formatRemainingTime,
  formatStandingsColumnValue,
  formatStandingsPit,
  resolveStandingsSessionMode,
  type StandingsScoringRow,
} from "./standings-formatting";

const MAX_ROWS = 60;
const PLACEHOLDER = "—";

export type StandingsRowViewModel = {
  id: string;
  position: number;
  driverNumber: string;
  driverName: string;
  vehicleClass: string;
  teamCode: string;
  teamBrandColor: string;
  gapText: string;
  intervalText: string;
  currentLapText: string;
  lastLapText: string;
  bestLapText: string;
  pitText: string;
  tireCompound: string;
  isPlayer: boolean;
  isLeader: boolean;
};

export type StandingsViewModel = WidgetViewModelBase & {
  type: "standings";
  activeClass: string;
  sessionLabel: string;
  remainingText: string;
  columns: readonly WidgetColumnV3[];
  rows: readonly StandingsRowViewModel[];
};

function buildUnavailableModel(
  status: StandingsViewModel["status"],
  content: StandingsContent,
  statusMessage?: string,
): StandingsViewModel {
  return {
    type: "standings",
    status,
    statusMessage,
    activeClass: PLACEHOLDER,
    sessionLabel: PLACEHOLDER,
    remainingText: PLACEHOLDER,
    columns: getEnabledStandingsColumns(content),
    rows: [],
  };
}

function sessionLabelFromSnapshot(snapshot: TelemetrySnapshot): string {
  return snapshot.session.type.toUpperCase();
}

function sortScoringRows(rows: readonly StandingsScoringRow[]): StandingsScoringRow[] {
  return [...rows].sort(
    (left, right) => (readScoringNumber(left, "place") ?? 99) - (readScoringNumber(right, "place") ?? 99),
  );
}

function resolveActiveClass(rows: readonly StandingsScoringRow[]): string {
  const player = rows.find((row) => readScoringBoolean(row, "isPlayer"));
  const fallback = rows[0];
  return String(player?.vehicleClass ?? fallback?.vehicleClass ?? "HYPERCAR");
}

function buildRowViewModel(
  row: StandingsScoringRow,
  classLeader: StandingsScoringRow | undefined,
  mode: ReturnType<typeof resolveStandingsSessionMode>,
  columns: readonly WidgetColumnV3[],
  index: number,
): StandingsRowViewModel | null {
  const id = readScoringString(row, "id") ?? String(readScoringNumber(row, "id") ?? index);
  if (!id) {
    return null;
  }
  const columnValues = Object.fromEntries(
    columns.map((column) => [column.metricId, formatStandingsColumnValue(column.metricId, row, classLeader, mode, column)]),
  ) as Record<string, string>;

  return {
    id,
    position: readScoringNumber(row, "place") ?? index + 1,
    driverNumber: columnValues.driverNumber ?? "",
    driverName: columnValues.driverName ?? PLACEHOLDER,
    vehicleClass: readScoringString(row, "vehicleClass") ?? "",
    teamCode: readScoringString(row, "teamCode") ?? "",
    teamBrandColor: readScoringString(row, "teamBrandColor") ?? "",
    gapText: columnValues.gap ?? PLACEHOLDER,
    intervalText: columnValues.interval ?? PLACEHOLDER,
    currentLapText: columnValues.currentLap ?? "",
    lastLapText: columnValues.lastLap ?? PLACEHOLDER,
    bestLapText: columnValues.bestLap ?? PLACEHOLDER,
    pitText: formatStandingsPit(row),
    tireCompound: String(row.tireCompound ?? ""),
    isPlayer: readScoringBoolean(row, "isPlayer") ?? false,
    isLeader: index === 0,
  };
}

export function resolveStandingsCellValue(
  row: StandingsRowViewModel,
  metricId: string,
): string {
  switch (metricId) {
    case "position":
      return String(row.position);
    case "driverNumber":
      return row.driverNumber;
    case "driverName":
      return row.driverName;
    case "vehicleClass":
      return row.vehicleClass;
    case "gap":
      return row.gapText;
    case "interval":
      return row.intervalText;
    case "currentLap":
      return row.currentLapText;
    case "lastLap":
      return row.lastLapText;
    case "bestLap":
      return row.bestLapText;
    case "pit":
      return row.pitText;
    case "tireCompound":
      return row.tireCompound;
    default:
      return "—";
  }
}

export function buildStandingsViewModel(
  snapshot: TelemetrySnapshot,
  content: StandingsContent,
): StandingsViewModel {
  const columns = getEnabledStandingsColumns(content);
  if (snapshot.status === "disconnected") {
    return buildUnavailableModel("disconnected", content);
  }
  if (snapshot.status === "missing") {
    return buildUnavailableModel("missing", content);
  }
  if (snapshot.status === "stale") {
    return buildUnavailableModel("stale", content);
  }
  if (snapshot.status === "error") {
    return buildUnavailableModel("error", content, snapshot.errorMessage);
  }

  const mode = resolveStandingsSessionMode(snapshot.session.type);
  const sorted = sortScoringRows(snapshot.scoring);
  const activeClass = resolveActiveClass(sorted).toUpperCase();
  const classRows = sorted.filter((row) => {
    const rowClass = String(row.vehicleClass ?? "").toUpperCase();
    if (!rowClass) {
      return true;
    }
    return rowClass === activeClass;
  });
  const limited = classRows.slice(0, MAX_ROWS);
  const leader = limited[0];
  const rows = limited
    .map((row, index) => buildRowViewModel(row, leader, mode, columns, index))
    .filter((row): row is StandingsRowViewModel => row !== null);

  return {
    type: "standings",
    status: "ready",
    activeClass,
    sessionLabel: sessionLabelFromSnapshot(snapshot),
    remainingText: formatRemainingTime(snapshot.session.remainingSeconds),
    columns,
    rows,
  };
}
