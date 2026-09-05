import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
  OverlayStandingRowV2,
} from "../../../generated/telemetry";
import type {
  MulticlassRelativeContent,
} from "./multiclass-relative-definition";
import type {
  MulticlassRelativeRow,
  MulticlassRelativeViewModel,
} from "./multiclass-relative-view-model";

/**
 * Multiclass-relative view model over the Overlay v2 contract.
 *
 * Presentación sobre `frame.standings` + `frame.relative` ya ordenados por el
 * builder de Go. No recomputa selección por distancia: ordena por `position`,
 * filtra por clase y centra la ventana alrededor del player igual que el v1
 * (centrado con Math.floor((rowCount-1)/2), capped a 7).
 *
 * Campos sin senal canonica: `classColor` (teamBrandColor) no existe en v2,
 * se deja el fallback "#8b93a7" y se declara la diferencia.
 */
export function buildMulticlassRelativeViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: MulticlassRelativeContent,
): MulticlassRelativeViewModel {
  if (source.state !== "live" && source.state !== "stale") {
    return unavailable(source.state, content, source.reason || undefined);
  }
  const status: MulticlassRelativeViewModel["status"] =
    source.state === "stale" ? "stale" : "ready";

  const sorted = [...frame.standings].sort((a, b) => a.position - b.position);
  const player = sorted.find((row) => row.id === frame.player.id);
  if (!player) {
    return unavailable("missing", content, "Player vehicle unavailable");
  }
  const playerClass = (player.classId ?? "UNKNOWN").toUpperCase();
  const gapById = new Map(frame.relative.map((row) => [row.id, displayedNumber(row.gap)]));

  const candidates = sorted.filter((row) => {
    if (content.classMode === "all") return true;
    const rowClass = (row.classId ?? "UNKNOWN").toUpperCase();
    return content.classMode === "same" ? rowClass === playerClass : rowClass !== playerClass;
  });

  // Other-class mode has no player row; centre on its insertion position.
  const playerIndex = content.classMode === "other"
    ? candidates.filter((row) => row.position < player.position).length
    : candidates.indexOf(player);

  const start = Math.max(
    0,
    Math.min(
      playerIndex - Math.floor((content.rowCount - 1) / 2),
      candidates.length - content.rowCount,
    ),
  );
  const selected = candidates.slice(start, start + Math.min(7, content.rowCount));
  if (content.classMode !== "other" && !selected.includes(player) && selected.length > 0) {
    selected[Math.floor(selected.length / 2)] = player;
  }

  const rows: MulticlassRelativeRow[] = selected.map((row, index) => ({
    place: row.position ?? index + 1,
    classId: row.classId ?? "UNKNOWN",
    classColor: "#8b93a7",
    number: row.number ?? "—",
    name: row.driver ?? "?",
    gap: row.id === frame.player.id ? 0 : gapById.get(row.id),
    isPlayer: row.id === frame.player.id,
  }));

  return {
    type: "multiclass-relative",
    status,
    statusMessage: source.reason || undefined,
    rows,
    rowCount: content.rowCount,
    classMode: content.classMode,
    showClassDivider: content.showClassDivider,
  };
}

export function multiclassRelativeDisplayedValues(
  model: MulticlassRelativeViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    rowCount: String(model.rows.length),
    rows: model.rows
      .map((row) => [row.place, row.classId, row.number, row.name, row.gap ?? "", row.isPlayer ? "player" : ""].join("~"))
      .join("|"),
  });
}

/** Campos sin senal canonica; declarados, nunca comparados. */
export const OVERLAY_V2_MULTICLASS_DECLARED_GAPS: readonly string[] = Object.freeze([
  "rows[].classColor",
]);

function unavailable(
  state: string,
  content: MulticlassRelativeContent,
  statusMessage?: string,
): MulticlassRelativeViewModel {
  const mapped = mapStatus(state);
  return {
    type: "multiclass-relative",
    status: mapped,
    statusMessage,
    rows: [],
    rowCount: content.rowCount,
    classMode: content.classMode,
    showClassDivider: content.showClassDivider,
  };
}

function mapStatus(state: string): MulticlassRelativeViewModel["status"] {
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

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  return value.v !== undefined && Number.isFinite(value.v) ? value.v : undefined;
}

export type { OverlayStandingRowV2 };
