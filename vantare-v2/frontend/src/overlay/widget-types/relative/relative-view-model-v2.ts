import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlayRelativeRowV2,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { RelativeContent } from "./relative-content";
import { getEnabledRelativeColumns } from "./relative-content";
import { resolveRelativeTone } from "./relative-row-selection";
import type { RelativeRowViewModel, RelativeViewModel } from "./relative-view-model";

const PLACEHOLDER = "—";

/**
 * Relative view model over the Overlay v2 contract.
 *
 * The row selection is NOT redone here. Overlay v1 walked outwards from the
 * player over a lap-distance ordering inside relative-row-selection.ts (:9-48)
 * and produced [ahead far→near, player, behind near→far]. That selection is
 * domain and now lives in the Go builder, which publishes exactly that order
 * over the canonical relative gap.
 *
 * This module only presents: it trims the already ordered window to the range
 * the widget configured, optionally drops the player anchor, scopes by class
 * and formats the gap. Position and last lap are looked up in `frame.standings`
 * by vehicle id — a join inside the same frame, no arithmetic.
 *
 * Fields with no canonical signal behind them stay at the placeholder and are
 * declared rather than invented: driverNumber and bestLapText.
 */
export function buildRelativeViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: RelativeContent,
): RelativeViewModel {
  const columns = getEnabledRelativeColumns(content);
  if (source.state !== "live") {
    return {
      type: "relative",
      status: unavailableStatus(source.state),
      statusMessage: source.reason || undefined,
      columns,
      rowHeightMode: content.rowHeightMode,
      rows: [],
    };
  }

  const playerId = frame.player.id;
  const playerIndex = frame.relative.findIndex((row) => row.side === "player");
  const scoped = content.classScope === "sameClass"
    ? frame.relative.filter((row) => sameClass(row, frame.relative[playerIndex]))
    : frame.relative;
  const anchor = scoped.findIndex((row) => row.side === "player");
  const window = anchor < 0
    ? []
    : [
        ...scoped.slice(Math.max(0, anchor - content.rangeAhead), anchor),
        ...(content.includePlayer ? [scoped[anchor]] : []),
        ...scoped.slice(anchor + 1, anchor + 1 + content.rangeBehind),
      ];

  const byId = new Map(frame.standings.map((row) => [row.id, row]));
  return {
    type: "relative",
    status: "ready",
    statusMessage: source.reason || undefined,
    columns,
    rowHeightMode: content.rowHeightMode,
    rows: window.map((row, index) => buildRow(row, index, playerId, byId)),
  };
}

export function relativeDisplayedValues(
  model: RelativeViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    rowCount: String(model.rows.length),
    rows: model.rows
      .map((row) => [
        row.id, row.position, row.vehicleClass, row.driverName,
        row.gapText, row.side, row.tone, row.isPlayer ? "player" : "",
      ].join("~"))
      .join("|"),
  });
}

/** Fields with no canonical signal behind them; declared, never compared. */
export const OVERLAY_V2_RELATIVE_DECLARED_GAPS: readonly string[] = Object.freeze([
  "rows[].driverNumber",
  "rows[].bestLapText",
]);

function unavailableStatus(state: string): RelativeViewModel["status"] {
  switch (state) {
    case "error":
      return "error";
    case "stopped":
      return "disconnected";
    case "stale":
      return "stale";
    default:
      return "missing";
  }
}

function sameClass(row: OverlayRelativeRowV2, player: OverlayRelativeRowV2 | undefined): boolean {
  if (player === undefined) return false;
  return (row.classId ?? "").toUpperCase() === (player.classId ?? "").toUpperCase();
}

function buildRow(
  row: OverlayRelativeRowV2,
  index: number,
  playerId: string | undefined,
  standings: ReadonlyMap<string, { readonly position: number; readonly lastLap: OverlayQValue<number> }>,
): RelativeRowViewModel {
  const isPlayer = playerId !== undefined && row.id === playerId;
  const gapSeconds = displayedNumber(row.gap) ?? null;
  const classification = standings.get(row.id);
  return {
    id: row.id,
    position: classification?.position ?? index + 1,
    vehicleClass: row.classId ?? "",
    driverNumber: "",
    driverName: row.name || "?",
    gapText: gapSeconds === null ? PLACEHOLDER : formatGap(gapSeconds),
    bestLapText: PLACEHOLDER,
    lastLapText: formatLapTime(classification && displayedNumber(classification.lastLap)),
    isPlayer,
    side: row.side as RelativeRowViewModel["side"],
    tone: resolveRelativeTone(gapSeconds ?? undefined, isPlayer),
    gapSeconds,
  };
}

function formatGap(seconds: number): string {
  return `${seconds > 0 ? "+" : ""}${seconds.toFixed(1)}`;
}

function formatLapTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return PLACEHOLDER;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  // Go omitempty elides legitimate zeroes. Quality is the presence bit.
  return value.v ?? 0;
}
