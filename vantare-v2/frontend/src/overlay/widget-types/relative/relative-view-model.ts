import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import { readScoringBoolean, readScoringNumber, readScoringString } from "../shared/scoring-readers";
import type { WidgetColumnV3 } from "../shared/widget-column";
import type { RelativeContent } from "./relative-content";
import { getEnabledRelativeColumns } from "./relative-content";
import { formatRelativeColumnValue, type RelativeScoringRow } from "./relative-formatting";
import { resolveRelativeTone, selectRelativeRows } from "./relative-row-selection";

export type RelativeRowViewModel = {
  id: string;
  position: number;
  vehicleClass: string;
  driverNumber: string;
  driverName: string;
  gapText: string;
  bestLapText: string;
  lastLapText: string;
  isPlayer: boolean;
  tone: "ahead" | "behind" | "player" | "neutral";
  gapSeconds: number | null;
};

export type RelativeViewModel = WidgetViewModelBase & {
  type: "relative";
  columns: readonly WidgetColumnV3[];
  rowHeightMode: RelativeContent["rowHeightMode"];
  rows: readonly RelativeRowViewModel[];
};

function buildUnavailableModel(
  status: RelativeViewModel["status"],
  content: RelativeContent,
  statusMessage?: string,
): RelativeViewModel {
  return {
    type: "relative",
    status,
    statusMessage,
    columns: getEnabledRelativeColumns(content),
    rowHeightMode: content.rowHeightMode,
    rows: [],
  };
}

function buildRowViewModel(
  row: RelativeScoringRow,
  columns: readonly WidgetColumnV3[],
  index: number,
): RelativeRowViewModel | null {
  const id = readScoringString(row, "id") ?? String(readScoringNumber(row, "id") ?? index);
  if (!id) {
    return null;
  }
  const gapSeconds = readScoringNumber(row, "timeGapToPlayer") ?? null;
  const isPlayer = readScoringBoolean(row, "isPlayer") ?? false;
  const columnValues = Object.fromEntries(
    columns.map((column) => [column.metricId, formatRelativeColumnValue(column.metricId, row, column)]),
  ) as Record<string, string>;

  return {
    id,
    position: readScoringNumber(row, "place") ?? index + 1,
    vehicleClass: columnValues.class ?? "",
    driverNumber: columnValues.carNumber ?? "",
    driverName: columnValues.driverName ?? "?",
    gapText: columnValues.gap ?? "—",
    bestLapText: columnValues.bestLap ?? "-",
    lastLapText: columnValues.lastLap ?? "-",
    isPlayer,
    tone: resolveRelativeTone(gapSeconds ?? undefined, isPlayer),
    gapSeconds,
  };
}

export function resolveRelativeCellValue(row: RelativeRowViewModel, metricId: string): string {
  switch (metricId) {
    case "position":
      return String(row.position);
    case "class":
      return row.vehicleClass;
    case "carNumber":
      return row.driverNumber;
    case "driverName":
      return row.driverName;
    case "gap":
      return row.gapText;
    case "bestLap":
      return row.bestLapText;
    case "lastLap":
      return row.lastLapText;
    default:
      return "—";
  }
}

export function buildRelativeViewModel(
  snapshot: TelemetrySnapshot,
  content: RelativeContent,
): RelativeViewModel {
  const columns = getEnabledRelativeColumns(content);
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

  const selected = selectRelativeRows(snapshot.scoring, content);
  const rows = selected
    .map((row, index) => buildRowViewModel(row, columns, index))
    .filter((row): row is RelativeRowViewModel => row !== null);

  return {
    type: "relative",
    status: "ready",
    columns,
    rowHeightMode: content.rowHeightMode,
    rows,
  };
}