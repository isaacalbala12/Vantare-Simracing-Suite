import { standingQuality, standingNumber } from "../standings/standings-signals-v2";
import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
  OverlayStandingRowV2,
} from "../../../generated/telemetry";
import type { StandingsContent } from "./standings-content";
import { getEnabledStandingsColumns } from "./standings-content";
import { selectDefaultStandingsWindow, type StandingsWindowRuntime } from "./standings-window";
import {
  formatRemainingTime,
  formatStandingsLapTime,
  formatStandingsLapDifference,
  formatStandingsSecondsDifference,
} from "./standings-formatting";
import { formatDriverName } from "../shared/driver-name";
import type { WidgetColumnV3 } from "../shared/widget-column";
import {
  withStandingsMotionIdentity,
  withStandingsClassScope,
  withStandingsClassificationMode,
  type StandingsFlag,
  type StandingsInfoValue,
  type StandingsRowViewModel,
  type StandingsViewModel,
} from "./standings-view-model";

const PLACEHOLDER = "—";

/** Formatting and scope only; Go owns ordering, gap reference and signal quality. */
export function buildStandingsViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: StandingsContent,
  window?: StandingsWindowRuntime,
): StandingsViewModel {
  const columns = getEnabledStandingsColumns(content);
  const classificationMode = content.classificationMode
    ?? (content.classScope === "all-classes" ? "multiclass" : "normal");
  if (source.state === "error" || source.state === "stopped" || source.state === "stopping" || source.state === "connecting" || source.state === "detecting") {
    return withStandingsClassificationMode(withStandingsClassScope({
      type: "standings",
      status: source.state === "error" ? "error" : "disconnected",
      statusMessage: source.reason || undefined,
      activeClass: PLACEHOLDER,
      sessionLabel: PLACEHOLDER,
      remainingText: PLACEHOLDER,
      columns,
      rows: [],
    }, content.classScope), classificationMode);
  }

  const playerId = frame.player.id;
  const activeClass = resolveActiveClass(frame.standings, playerId);
  const scoped = content.classScope === "all-classes"
    ? frame.standings
    : frame.standings.filter((row) => {
        const rowClass = (row.classId ?? "").toUpperCase();
        return rowClass === "" || rowClass === activeClass;
      });
  const phase = displayedText(frame.session.phase)?.toLowerCase();
  const paceSession = phase === "practice" || phase === "qualifying";
  const sessionBestLap = paceSession ? fastestLap(scoped) : undefined;
  const sessionBestRow = scoped.reduce<OverlayStandingRowV2 | undefined>((best, row) => {
    const seconds = row.bestLap?.q === "fresh" ? displayedNumber(row.bestLap) : undefined;
    return seconds !== undefined && seconds > 0 && Number.isFinite(seconds)
      && (!best || seconds < best.bestLap.v!) ? row : best;
  }, undefined);
  const classGaps = content.classScope === "player-class" || classificationMode === "multiclass";
  const classBestLaps = new Map<string, number>();
  if (paceSession && classGaps) {
    for (const row of scoped) {
      const classId = (row.classId ?? "").trim().toUpperCase();
      const lap = displayedNumber(row.bestLap);
      if (classId && lap !== undefined && lap > 0 && lap < (classBestLaps.get(classId) ?? Infinity)) {
        classBestLaps.set(classId, lap);
      }
    }
  }
  const nameColumn = columns.find((column) => column.metricId === "driverName");
  const weather = frame.weather;
  const projectedRows = scoped.map((row) =>
    buildRow(row, playerId, paceSession,
      classGaps ? classBestLaps.get((row.classId ?? "").trim().toUpperCase()) : sessionBestLap,
      nameColumn, columns, classGaps,
      !classGaps || hasSameClassPredecessor(row, frame.standings),
      source.state === "live" && frame.session.phase.q === "fresh" && phase === "race"),
  );
  const activeWindow = window ?? (content.playerWindow ? { around: content.windowAround ?? 4 } : undefined);
  const rows = activeWindow
    ? selectDefaultStandingsWindow(projectedRows, activeWindow.around)
    : projectedRows.slice(0, content.rowCount ?? 20);
  const playerRow = projectedRows.find(row => row.isPlayer);

  return withStandingsMotionIdentity(
    withStandingsClassificationMode(withStandingsClassScope({
      type: "standings",
      status: source.state === "stale" || source.state === "degraded" ? "stale" : "ready",
      statusMessage: source.reason || undefined,
      activeClass,
      sessionLabel: displayedText(frame.session.phase)?.toUpperCase() ?? PLACEHOLDER,
      remainingText: formatRemainingTime(displayedNumber(frame.session.remaining)),
      trackName: displayedText(frame.session.track),
      totalRows: scoped.length,
      playerRow,
      lapText: playerRow?.currentLapText,
      sessionBest: sessionBestRow ? { rowId: sessionBestRow.id, seconds: sessionBestRow.bestLap.v! } : undefined,
      ambientTempText: formatTemp(displayedNumber(weather?.ambientC), frame.units.temperature),
      trackTempText: formatTemp(displayedNumber(weather?.trackC), frame.units.temperature),
      windText: formatWind(displayedNumber(weather?.windKph)),
      flag: source.state === "live" ? currentFlag(frame.session.flag) : "unknown",
      sessionInfo: sessionInformation(frame, phase === "race"),
      columns,
      rows,
    }, content.classScope), classificationMode),
    `${frame.sessionId}:${frame.epoch}`,
    frame.sequence,
  );
}

function currentFlag(value: OverlayQValue<string>): StandingsFlag {
  if (value.q !== "fresh") return "unknown";
  switch (value.v?.toLowerCase()) {
    case "green": case "yellow": case "blue": case "red": case "white": case "black": return value.v.toLowerCase() as StandingsFlag;
    case "checkered": case "chequered": return "checkered";
    default: return "unknown";
  }
}

function sessionInformation(frame: OverlayFrameV2, race: boolean): NonNullable<StandingsViewModel["sessionInfo"]> {
  const numberInfo = (value: OverlayQValue<number>, format: (n: number) => string): StandingsInfoValue => {
    const number = value.q === "stale" ? value.v ?? 0 : displayedNumber(value);
    return { text: number !== undefined && Number.isFinite(number) ? format(number) : PLACEHOLDER, stale: value.q === "stale" };
  };
  const temperature = (celsius: number) => {
    const fahrenheit = frame.units.temperature === "fahrenheit";
    return `${Number((fahrenheit ? celsius * 9 / 5 + 32 : celsius).toFixed(1))}°${fahrenheit ? "F" : "C"}`;
  };
  const percent = (n: number) => n >= 0 && n <= 100 ? `${Math.round(n)}%` : PLACEHOLDER;
  return {
    trackTemperature: numberInfo(frame.weather.trackC, temperature),
    airTemperature: numberInfo(frame.weather.ambientC, temperature),
    estimatedLaps: numberInfo(frame.fuel.sessionLaps, n => race && Number.isInteger(n) && n >= 0 && n < 2147483647 ? `≈${n}` : PLACEHOLDER),
    totalLaps: numberInfo(frame.session.maxLaps, n => Number.isInteger(n) && n > 0 && n < 2147483647 ? String(n) : PLACEHOLDER),
    track: { text: displayedText(frame.session.track) || PLACEHOLDER, stale: frame.session.track.q === "stale" },
    remaining: numberInfo(frame.session.remaining, formatRemainingTime),
    rain: numberInfo(frame.weather.rainPercent, percent),
    wetness: numberInfo(frame.weather.wetnessPct, percent),
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
    ambientTemp: model.ambientTempText ?? PLACEHOLDER,
    trackTemp: model.trackTempText ?? PLACEHOLDER,
    wind: model.windText ?? PLACEHOLDER,
    rowCount: String(model.rows.length),
    rows: model.rows
      .map((row) => [
        row.id,
        row.position,
        row.configuredDriverName ?? row.driverName,
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

/** Gaps of the current Core producer, not a ban on optional wire values. */
export const OVERLAY_V2_STANDINGS_DECLARED_GAPS: readonly string[] = Object.freeze([
  "rows[].teamCode",
  "rows[].teamBrandColor",
  "rows[].tireCompound",
]);

function buildRow(
  row: OverlayStandingRowV2,
  playerId: string | undefined,
  paceSession: boolean,
  sessionBestLap: number | undefined,
  nameColumn: WidgetColumnV3 | undefined,
  columns: readonly WidgetColumnV3[],
  classGaps: boolean,
  intervalAvailable: boolean,
  freshRace: boolean,
): StandingsRowViewModel {
  const driverName = row.driver || PLACEHOLDER;
  const gap = row.gap?.q === "fresh" ? displayedNumber(row.gap) : undefined;
  return {
    id: row.id,
    position: standingQuality(row, "position") === "fresh" ? row.position : 0,
    classPosition: standingQuality(row, "classPosition") === "fresh" ? row.classPosition : 0,
    driverNumber: row.number ?? "",
    driverName,
    configuredDriverName: formatDriverName(driverName, nameColumn),
    vehicleClass: row.classId ?? "",
    teamCode: "",
    teamBrandColor: "",
    gapText: paceSession ? formatBestLapGap(row, sessionBestLap) : formatGap(row, classGaps),
    intervalText: intervalAvailable ? formatInterval(row) : PLACEHOLDER,
    currentLapText: standingQuality(row, "laps") === "fresh" ? String(row.laps ?? 0) : PLACEHOLDER,
    lastLapText: formatStandingsLapTime(displayedNumber(row.lastLap), columns.find(column => column.metricId === "lastLap")),
    bestLapText: formatStandingsLapTime(displayedNumber(row.bestLap), columns.find(column => column.metricId === "bestLap")),
    bestLapSeconds: row.bestLap?.q === "fresh" ? displayedNumber(row.bestLap) : undefined,
    battleGapSeconds: freshRace && standingQuality(row, "position") === "fresh" && standingQuality(row, "pit") === "fresh" && row.pit === "track" && standingQuality(row, "gapLaps") === "fresh" && (row.gapLaps ?? 0) === 0
      && gap !== undefined && Number.isFinite(gap) && gap >= 0 ? gap : undefined,
    pitText: standingQuality(row, "pit") === "fresh" && row.pit === "pit" ? "PIT" : "",
    tireCompound: "",
    isPlayer: playerId !== undefined && row.id === playerId,
    isLeader: classGaps ? standingQuality(row, "classPosition") === "fresh" && row.classPosition === 1 : standingQuality(row, "position") === "fresh" && row.position === 1,
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
  return gap <= 0.0005 ? "Leader" : formatStandingsSecondsDifference(gap);
}

function formatGap(row: OverlayStandingRowV2, classGaps: boolean): string {
  if (classGaps && !(row.classRef !== undefined && row.classRef > 0)) return PLACEHOLDER;
  const leader = classGaps
    ? standingQuality(row, "classPosition") === "fresh" && row.classPosition === 1 && row.classRef === row.position
    : standingQuality(row, "position") === "fresh" && row.position === 1;
  if (leader) return "Leader";
  const laps = classGaps ? standingNumber(row, "classGapLaps") : standingQuality(row, "gapLaps") === "fresh" ? row.gapLaps ?? 0 : undefined;
  if (laps === undefined) return PLACEHOLDER;
  if (laps !== 0) return formatStandingsLapDifference(laps);
  const gap = classGaps ? standingNumber(row, "classGap") : displayedNumber(row.gap);
  return gap !== undefined ? formatStandingsSecondsDifference(gap) : PLACEHOLDER;
}

/** Native intervals refer to the overall predecessor. In class views we can
 * only display them when that authoritative predecessor belongs to this class.
 * Otherwise no class interval is available; never reinterpret or subtract it. */
function hasSameClassPredecessor(row: OverlayStandingRowV2, allRows: readonly OverlayStandingRowV2[]): boolean {
  const classId = (row.classId ?? "").trim().toUpperCase();
  if (!classId || standingQuality(row, "position") !== "fresh" || row.position <= 1) return false;
  const predecessors = allRows.filter(candidate => standingQuality(candidate, "position") === "fresh"
    && candidate.position === row.position - 1);
  return predecessors.length === 1 && (predecessors[0]!.classId ?? "").trim().toUpperCase() === classId;
}

function formatInterval(row: OverlayStandingRowV2): string {
  const laps = standingNumber(row, "intervalLaps");
  if (laps === undefined) return PLACEHOLDER;
  if (laps !== 0) return formatStandingsLapDifference(laps);
  return formatStandingsSecondsDifference(standingNumber(row, "interval"));
}

function formatTemp(value: number | undefined, unit: string): string | undefined {
  return value === undefined ? undefined : `${Math.round(unit === "fahrenheit" ? value * 9 / 5 + 32 : value)}°`;
}

function formatWind(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${Math.round(value)} km/h`;
}

function resolveActiveClass(
  rows: readonly OverlayStandingRowV2[],
  playerId: string | undefined,
): string {
  const player = rows.find((row) => row.id === playerId);
  const chosen = player?.classId ?? rows[0]?.classId ?? "";
  return chosen === "" ? PLACEHOLDER : chosen.toUpperCase();
}

function displayedNumber(value: OverlayQValue<number> | null | undefined): number | undefined {
  if (!value || value.q !== "fresh" || (value.v !== undefined && !Number.isFinite(value.v))) return undefined;
  // Go omitempty elides legitimate zeroes. Quality is the presence bit.
  return value.v ?? 0;
}

function displayedText(value: OverlayQValue<string>): string | undefined {
  if (value.q !== "fresh") return undefined;
  return value.v ?? "";
}
