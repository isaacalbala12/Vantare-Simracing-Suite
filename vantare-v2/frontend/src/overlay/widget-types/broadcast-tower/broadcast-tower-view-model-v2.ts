import { standingQuality } from "../standings/standings-signals-v2";
import type { OverlayFrameV2, OverlayQValue, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import type { BroadcastTowerContent } from "./broadcast-tower-definition";
import type { BroadcastTowerRow, BroadcastTowerViewModel } from "./broadcast-tower-view-model";

const PLACEHOLDER = "—";

function currentFlag(value: OverlayQValue<string> | undefined): string {
  if (!value || value.q !== "fresh") return "unknown";
  const flag = value.v?.toLowerCase();
  switch (flag) {
    case "green": case "yellow": case "blue": case "red": case "white": case "black": return flag;
    case "checkered": case "chequered": return "checkered";
    default: return "unknown";
  }
}

function displayedNumber(value: OverlayQValue<number> | undefined): number | undefined {
  if (!value || value.q !== "fresh" || (value.v !== undefined && !Number.isFinite(value.v))) return undefined;
  return value.v ?? 0;
}

function unavailable(status: BroadcastTowerViewModel["status"], content: BroadcastTowerContent, statusMessage?: string): BroadcastTowerViewModel {
  return { type: "broadcast-tower", status, statusMessage, sessionLabel: PLACEHOLDER, rows: [], rowCount: content.rowCount, showWeather: content.showWeather, showSof: false };
}

/** Canonical standings/session presentation. Absent and stale signals stay unavailable. */
export function buildBroadcastTowerViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: BroadcastTowerContent,
): BroadcastTowerViewModel {
  if (source.state === "error" || source.state === "stopped" || source.state === "detecting" || source.state === "connecting") {
    return unavailable(source.state === "error" ? "error" : "disconnected", content, source.reason || undefined);
  }
  if (source.state === "degraded" || source.state === "stale") {
    // degraded/stale still renders, but at stale quality when source is not live.
  }

  const standings = frame.standings ?? [];
  const rows: BroadcastTowerRow[] = standings
    .slice(0, Math.min(10, content.rowCount))
    .map((row) => ({
      id: row.id,
      place: standingQuality(row, "position") === "fresh" ? row.position : 0,
      number: row.number ?? PLACEHOLDER,
      name: row.driver ?? PLACEHOLDER,
      team: row.classId ?? PLACEHOLDER,
      className: row.classId ?? PLACEHOLDER,
      brandColor: undefined,
      gap: standingQuality(row, "gapLaps") === "fresh" ? displayedNumber(row.gap) : undefined,
      gapLaps: standingQuality(row, "gapLaps") === "fresh" ? row.gapLaps ?? 0 : undefined,
      isPlayer: row.id === frame.player.id,
    }));

  const sessionLabel = (() => {
    const phase = frame.session?.phase;
    if (!phase || phase.q !== "fresh") return PLACEHOLDER;
    return (phase.v ?? PLACEHOLDER).toUpperCase();
  })();

  // Total laps from session maximum; current lap is canonical player.LapNumber.
  const totalLaps = (() => {
    const max = frame.session?.maxLaps;
    if (!max || max.q !== "fresh") return undefined;
    // LMU reports INT32_MAX for sessions without a finite lap limit.
    const laps = max.v;
    return laps !== undefined && Number.isInteger(laps) && laps > 0 && laps < 2147483647 ? laps : undefined;
  })();

  const currentLap = displayedNumber(frame.player.lapNumber);
  const lap = currentLap !== undefined && Number.isInteger(currentLap) && currentLap >= 0 ? currentLap : undefined;

  const status: BroadcastTowerViewModel["status"] = source.state === "stale" || source.state === "degraded" ? "stale" : "ready";

  const temperature = displayedNumber(frame.weather?.trackC);
  const trackTempText = temperature === undefined ? undefined
    : `${Math.round(frame.units.temperature === "fahrenheit" ? temperature * 9 / 5 + 32 : temperature)}°`;
  const model: BroadcastTowerViewModel = {
    type: "broadcast-tower",
    status,
    statusMessage: source.reason || undefined,
    sessionLabel,
    lap,
    totalLaps,
    trackTempC: temperature,
    trackTempText,
    sof: undefined,
    flag: source.state === "live" ? currentFlag(frame.session?.flag) : "unknown",
    rows,
    rowCount: content.rowCount,
    showWeather: content.showWeather,
    showSof: false,
  };
  // Presentation metadata stays out of the enumerable V2/V1 comparison shape.
  Object.defineProperty(model, "motionIdentity", {
    value: `${frame.sessionId}:${frame.epoch}:${source.retry ?? 0}`,
    enumerable: false,
  });
  return model;
}

export function broadcastTowerDisplayedValuesV2(model: BroadcastTowerViewModel): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    sessionLabel: model.sessionLabel,
    rowCount: String(model.rows.length),
    rows: model.rows.map((row) => [row.place, row.number, row.name, row.team, row.isPlayer ? "player" : ""].join("~")).join("|"),
  });
}
