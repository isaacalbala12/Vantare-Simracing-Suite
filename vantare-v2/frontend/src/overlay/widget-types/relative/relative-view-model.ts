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
  /** Nombre ya formateado según `format.mode` de la columna Piloto; si falta, se muestra `driverName`. */
  configuredDriverName?: string;
  gapText: string;
  bestLapText: string;
  lastLapText: string;
  isPlayer: boolean;
  side: RelativeSide;
  tone: "ahead" | "behind" | "player" | "neutral";
  gapSeconds: number | null;
  /** Per-cell provenance stays independent from source lifecycle. */
  fieldQuality?: Partial<Record<string, "fresh" | "stale" | "missing" | "invalid">>;
  /** Vueltas respecto al jugador; solo cuando el dato canónico está fresco en carrera. */
  lapDelta?: number | null;
};

export type RelativeViewModel = WidgetViewModelBase & {
  type: "relative";
  /** Logical V2 scope. Motion must not animate rows across this boundary. */
  presentationKey?: string;
  columns: readonly WidgetColumnV3[];
  rowHeightMode: RelativeContent["rowHeightMode"];
  /** Visual slots around the player; selection remains in `rows`. */
  rangeAhead?: number;
  rangeBehind?: number;
  rows: readonly RelativeRowViewModel[];
  /** Datos extra opcionales para las barras de información (estructura de la
   *  referencia: meta arriba, reloj/ambiente abajo). Solo existen cuando la
   *  fuente V2 los entrega — lo ausente se omite, nunca se inventa. */
  sessionLabel?: string;
  remainingText?: string;
  trackText?: string;
  playerBadgeText?: string;
  ambientTempText?: string;
  trackTempText?: string;
  windText?: string;
};

export function resolveRelativeCellValue(row: RelativeRowViewModel, metricId: string): string {
  switch (metricId) {
    case "position":
      return Number.isInteger(row.position) && row.position > 0 ? String(row.position) : "—";
    case "class":
      return row.vehicleClass;
    case "carNumber":
      return row.driverNumber;
    case "driverName":
      return row.configuredDriverName ?? row.driverName;
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
