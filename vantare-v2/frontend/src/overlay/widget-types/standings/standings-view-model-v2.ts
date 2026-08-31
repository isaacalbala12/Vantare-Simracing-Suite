import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
  OverlayStandingRowV2,
} from "../../../generated/telemetry";
import type { StandingsContent } from "./standings-content";
import { getEnabledStandingsColumns } from "./standings-content";
import { formatRemainingTime } from "./standings-formatting";
import type { StandingsRowViewModel, StandingsViewModel } from "./standings-view-model";

const PLACEHOLDER = "—";

/**
 * Standings view model over the Overlay v2 contract.
 *
 * The ordering is NOT recomputed here: `frame.standings` arrives already
 * resolved by the Go builder, including the fallback that Overlay v1 applied
 * silently inside standings-view-model.ts. This module only formats, filters
 * by the widget's own presentation config (class scope, row count) and picks
 * authorised fields — no business rule, no sorting, no gap arithmetic beyond
 * rendering what the frame declares.
 *
 * Fields the canonical state does not carry stay at the placeholder and are
 * declared unsupported for the shadow comparator rather than invented:
 * driverNumber, teamCode, teamBrandColor, tireCompound and the
 * interval to the car ahead (the frame carries the gap to the leader only).
 */
export function buildStandingsViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: StandingsContent,
): StandingsViewModel {
  const columns = getEnabledStandingsColumns(content);
  if (source.state === "error" || source.state === "stopped") {
    return {
      type: "standings",
      status: source.state === "error" ? "error" : "disconnected",
      statusMessage: source.reason || undefined,
      activeClass: PLACEHOLDER,
      sessionLabel: PLACEHOLDER,
      remainingText: PLACEHOLDER,
      columns,
      rows: [],
    };
  }

  const playerId = frame.player.id;
  const activeClass = resolveActiveClass(frame.standings, playerId);
  const scoped = content.classScope === "all-classes"
    ? frame.standings
    : frame.standings.filter((row) => {
        const rowClass = (row.classId ?? "").toUpperCase();
        return rowClass === "" || rowClass === activeClass;
      });
  const limited = scoped.slice(0, content.rowCount ?? 20);
  const phase = displayedText(frame.session.phase)?.toLowerCase();
  const paceSession = phase === "practice" || phase === "qualifying";
  const sessionBestLap = paceSession ? fastestLap(limited) : undefined;

  return {
    type: "standings",
    status: source.state === "stale" ? "stale" : "ready",
    statusMessage: source.reason || undefined,
    activeClass,
    sessionLabel: displayedText(frame.session.phase)?.toUpperCase() ?? PLACEHOLDER,
    remainingText: formatRemainingTime(displayedNumber(frame.session.remaining)),
    columns,
    rows: limited.map((row, index) => buildRow(row, index, playerId, paceSession, sessionBestLap)),
  };
}

export function standingsDisplayedValues(
  model: StandingsViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    sessionLabel: model.sessionLabel,
    activeClass: model.activeClass,
    remainingText: model.remainingText,
    rowCount: String(model.rows.length),
    rows: model.rows
      .map((row) => [
        row.id,
        row.position,
        row.driverName,
        row.vehicleClass,
        row.currentLapText,
        row.lastLapText,
        row.pitText,
        row.isPlayer ? "player" : "",
        row.isLeader ? "leader" : "",
      ].join("~"))
      .join("|"),
  });
}

function buildRow(
  row: OverlayStandingRowV2,
  index: number,
  playerId: string | undefined,
  paceSession: boolean,
  sessionBestLap: number | undefined,
): StandingsRowViewModel {
  const driverName = row.driver || PLACEHOLDER;
  return {
    id: row.id,
    position: row.position,
    driverNumber: "",
    driverName,
    configuredDriverName: driverName,
    vehicleClass: row.classId ?? "",
    teamCode: "",
    teamBrandColor: "",
    gapText: paceSession ? formatBestLapGap(row, sessionBestLap) : formatGap(row, index),
    intervalText: PLACEHOLDER,
    currentLapText: row.laps === undefined ? "" : String(row.laps),
    lastLapText: formatLapTime(displayedNumber(row.lastLap)),
    bestLapText: formatLapTime(displayedNumber(row.bestLap)),
    pitText: row.pit === "pit" ? "PIT" : "",
    tireCompound: "",
    isPlayer: playerId !== undefined && row.id === playerId,
    isLeader: index === 0,
  };
}

function fastestLap(rows: readonly OverlayStandingRowV2[]): number | undefined {
  let fastest: number | undefined;
  for (const row of rows) {
    const lap = displayedNumber(row.bestLap);
    if (lap !== undefined && lap > 0 && (fastest === undefined || lap < fastest)) {
      fastest = lap;
    }
  }
  return fastest;
}

function formatBestLapGap(row: OverlayStandingRowV2, sessionBestLap: number | undefined): string {
  const lap = displayedNumber(row.bestLap);
  if (lap === undefined || lap <= 0 || sessionBestLap === undefined) return PLACEHOLDER;
  const gap = lap - sessionBestLap;
  return gap <= 0.0005 ? "Leader" : `+${gap.toFixed(3)}s`;
}

function formatGap(row: OverlayStandingRowV2, index: number): string {
  if (index === 0) return "Leader";
  if (row.gapLaps !== undefined && row.gapLaps > 0) return `+${row.gapLaps}L`;
  const gap = displayedNumber(row.gap);
  return gap !== undefined && gap > 0 ? `+${gap.toFixed(3)}s` : PLACEHOLDER;
}

function formatLapTime(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0 || !Number.isFinite(seconds)) return PLACEHOLDER;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}

function resolveActiveClass(
  rows: readonly OverlayStandingRowV2[],
  playerId: string | undefined,
): string {
  const player = rows.find((row) => row.id === playerId);
  const chosen = player?.classId ?? rows[0]?.classId ?? "";
  return chosen === "" ? PLACEHOLDER : chosen.toUpperCase();
}

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  // Go omitempty elides legitimate zeroes. Quality is the presence bit.
  return value.v ?? 0;
}

function displayedText(value: OverlayQValue<string>): string | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  return value.v ?? "";
}
