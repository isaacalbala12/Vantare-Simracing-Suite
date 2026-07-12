import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import { readScoringBoolean, readScoringClass, readScoringGap, readScoringName, readScoringNumber, readScoringString, readScoringTeam } from "../shared/scoring-readers";
import type { BroadcastTowerContent } from "./broadcast-tower-definition";

export type BroadcastTowerRow = { place: number; number: string; name: string; team: string; className: string; gap?: number; isPlayer: boolean };
export type BroadcastTowerViewModel = WidgetViewModelBase & { type: "broadcast-tower"; sessionLabel: string; lap?: number; trackTempC?: number; sof?: number; rows: readonly BroadcastTowerRow[]; rowCount: number; showWeather: boolean; showSof: boolean };

function unavailable(status: BroadcastTowerViewModel["status"], content: BroadcastTowerContent, statusMessage?: string): BroadcastTowerViewModel { return { type: "broadcast-tower", status, statusMessage, sessionLabel: "—", rows: [], rowCount: content.rowCount, showWeather: content.showWeather, showSof: content.showSof }; }

export function buildBroadcastTowerViewModel(snapshot: TelemetrySnapshot, content: BroadcastTowerContent): BroadcastTowerViewModel {
  if (snapshot.status === "disconnected" || snapshot.status === "missing" || snapshot.status === "error") return unavailable(snapshot.status, content, snapshot.errorMessage);
  const rows = [...snapshot.scoring].sort((a, b) => (readScoringNumber(a, "place") ?? 99) - (readScoringNumber(b, "place") ?? 99)).slice(0, Math.min(8, content.rowCount)).map((row, index) => ({ place: readScoringNumber(row, "place") ?? index + 1, number: readScoringString(row, "driverNumber") ?? readScoringString(row, "number") ?? "—", name: readScoringName(row) ?? "—", team: readScoringTeam(row) ?? "—", className: readScoringClass(row) ?? "—", gap: readScoringGap(row), isPlayer: readScoringBoolean(row, "isPlayer") ?? false }));
  return { type: "broadcast-tower", status: snapshot.status === "stale" ? "stale" : "ready", sessionLabel: snapshot.session.type.toUpperCase(), lap: snapshot.player.lapNumber ?? snapshot.player.totalLaps, rows, rowCount: content.rowCount, showWeather: content.showWeather, showSof: content.showSof };
}
