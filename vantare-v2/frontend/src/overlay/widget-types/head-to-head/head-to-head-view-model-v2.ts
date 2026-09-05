import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { HeadToHeadContent } from "./head-to-head-definition";
import type { HeadToHeadEntry, HeadToHeadViewModel } from "./head-to-head-view-model";

/**
 * Head-to-head view model over the Overlay v2 contract.
 *
 * Presentacion sobre `frame.standings` (ya ordenado por position) + gap de
 * `frame.relative` cuando existe. No inventa `team` ni `sectorComparisons`:
 * ambos quedan en placeholder porque el frame v2 no los publica.
 *
 * La seleccion del rival es identica al v1: orden por place/position, indice
 * del player, vecino inmediato segun `content.target`.
 */
export function buildHeadToHeadViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: HeadToHeadContent,
): HeadToHeadViewModel {
  if (source.state === "error" || source.state === "stopped" || source.state === "stale") {
    // v1 considera stale como no disponible para este widget.
    if (source.state === "stale") {
      return unavailable("stale", content, source.reason || undefined);
    }
    return unavailable(
      source.state === "error" ? "error" : "disconnected",
      content,
      source.reason || undefined,
    );
  }
  if (source.state !== "live") {
    return unavailable("missing", content, source.reason || undefined);
  }

  const rows = [...frame.standings].sort((a, b) => a.position - b.position);
  const playerIndex = rows.findIndex((row) => row.id === frame.player.id);
  if (playerIndex < 0) {
    return unavailable("missing", content, "Player vehicle unavailable");
  }

  const gapById = new Map(frame.relative.map((row) => [row.id, displayedNumber(row.gap)]));

  const opponentIndex = content.target === "ahead" ? playerIndex - 1 : playerIndex + 1;
  const opponentRow = rows[opponentIndex];
  if (!opponentRow) {
    return unavailable("missing", content, "No nearby rival");
  }

  const playerEntry = entry(rows[playerIndex]!, playerIndex, frame.player.id);
  const opponentEntry = entry(opponentRow, opponentIndex, frame.player.id);
  const aheadRow = rows[playerIndex - 1];
  const behindRow = rows[playerIndex + 1];

  const gapSeconds = gapById.get(opponentRow.id);

  return {
    type: "head-to-head",
    status: "ready",
    player: playerEntry,
    opponent: opponentEntry,
    ahead: aheadRow ? entry(aheadRow, playerIndex - 1, frame.player.id) : undefined,
    behind: behindRow ? entry(behindRow, playerIndex + 1, frame.player.id) : undefined,
    gapSeconds: gapSeconds ?? undefined,
    sectorComparisons: [],
    target: content.target,
    showSectors: content.showSectors,
  };
}

export function headToHeadDisplayedValues(
  model: HeadToHeadViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    target: model.target,
    player: model.player ? `${model.player.place}~${model.player.name}` : "",
    opponent: model.opponent ? `${model.opponent.place}~${model.opponent.name}` : "",
    gapSeconds: model.gapSeconds === undefined ? "" : String(model.gapSeconds),
  });
}

/** Campos sin senal canonica; declarados, nunca comparados. */
export const OVERLAY_V2_HEADTOHEAD_DECLARED_GAPS: readonly string[] = Object.freeze([
  "player.team",
  "opponent.team",
  "sectorComparisons",
]);

function unavailable(
  status: HeadToHeadViewModel["status"],
  content: HeadToHeadContent,
  statusMessage?: string,
): HeadToHeadViewModel {
  return {
    type: "head-to-head",
    status,
    statusMessage,
    sectorComparisons: [],
    target: content.target,
    showSectors: content.showSectors,
  };
}

function entry(
  row: { id: string; position: number; number?: string; driver?: string; classId?: string },
  index: number,
  playerId: string | undefined,
): HeadToHeadEntry {
  return {
    place: row.position ?? index + 1,
    number: row.number ?? "—",
    name: row.driver ?? "—",
    team: "—",
    className: row.classId ?? "—",
    isPlayer: playerId !== undefined && row.id === playerId,
  };
}

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  return value.v !== undefined && Number.isFinite(value.v) ? value.v : undefined;
}
