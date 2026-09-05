import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { WidgetColumnV3 } from "../shared/widget-column";
import type { RelativeContent } from "./relative-content";
import type { RelativeSide } from "./relative-row-selection";

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
  side: RelativeSide;
  tone: "ahead" | "behind" | "player" | "neutral";
  gapSeconds: number | null;
};

export type RelativeViewModel = WidgetViewModelBase & {
  type: "relative";
  /** Logical V2 scope. Motion must not animate rows across this boundary. */
  presentationKey?: string;
  columns: readonly WidgetColumnV3[];
  rowHeightMode: RelativeContent["rowHeightMode"];
  rows: readonly RelativeRowViewModel[];
};

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
