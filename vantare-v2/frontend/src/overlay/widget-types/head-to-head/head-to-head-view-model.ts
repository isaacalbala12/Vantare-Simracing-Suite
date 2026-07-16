import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import { readScoringBoolean, readScoringClass, readScoringGap, readScoringName, readScoringNumber, readScoringString, readScoringTeam } from "../shared/scoring-readers";
import type { HeadToHeadContent } from "./head-to-head-definition";

export type HeadToHeadEntry = { place: number; number: string; name: string; team: string; className: string; isPlayer: boolean };
export type HeadToHeadViewModel = WidgetViewModelBase & { type: "head-to-head"; player?: HeadToHeadEntry; opponent?: HeadToHeadEntry; gapSeconds?: number; sectorComparisons: readonly string[]; target: "ahead" | "behind"; showSectors: boolean };
function unavailable(status: HeadToHeadViewModel["status"], content: HeadToHeadContent, statusMessage?: string): HeadToHeadViewModel { return { type: "head-to-head", status, statusMessage, sectorComparisons: [], target: content.target, showSectors: content.showSectors }; }
function entry(row: Record<string, unknown>, index: number): HeadToHeadEntry { return { place: readScoringNumber(row, "place") ?? index + 1, number: readScoringString(row, "driverNumber") ?? "—", name: readScoringName(row) ?? "—", team: readScoringTeam(row) ?? "—", className: readScoringClass(row) ?? "—", isPlayer: readScoringBoolean(row, "isPlayer") ?? false }; }
export function buildHeadToHeadViewModel(snapshot: TelemetrySnapshot, content: HeadToHeadContent): HeadToHeadViewModel {
  if (snapshot.status === "disconnected" || snapshot.status === "error" || snapshot.status === "stale") return unavailable(snapshot.status, content, snapshot.errorMessage);
  const rows = [...snapshot.scoring].sort((a, b) => (readScoringNumber(a, "place") ?? 99) - (readScoringNumber(b, "place") ?? 99));
  const playerIndex = rows.findIndex((row) => readScoringBoolean(row, "isPlayer") === true);
  if (playerIndex < 0) return unavailable("missing", content, "Player vehicle unavailable");
  const player = entry(rows[playerIndex], playerIndex);
  const opponentIndex = content.target === "ahead" ? playerIndex - 1 : playerIndex + 1;
  const opponentRow = rows[opponentIndex];
  if (!opponentRow) return unavailable("missing", content, "No nearby rival");
  return { type: "head-to-head", status: "ready", player, opponent: entry(opponentRow, opponentIndex), gapSeconds: readScoringGap(opponentRow) ?? readScoringGap(rows[playerIndex]), sectorComparisons: [], target: content.target, showSectors: content.showSectors };
}
