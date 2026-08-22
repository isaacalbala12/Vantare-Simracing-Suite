import type { OverlayFrameV2, OverlayQValue, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import type { BroadcastTowerContent } from "./broadcast-tower-definition";
import type { BroadcastTowerRow, BroadcastTowerViewModel } from "./broadcast-tower-view-model";

const PLACEHOLDER = "—";

function displayedNumber(value: OverlayQValue<number> | undefined): number | undefined {
  if (!value || value.q === "missing" || value.q === "invalid") return undefined;
  return value.v ?? 0;
}

function unavailable(status: BroadcastTowerViewModel["status"], content: BroadcastTowerContent, statusMessage?: string): BroadcastTowerViewModel {
  return { type: "broadcast-tower", status, statusMessage, sessionLabel: PLACEHOLDER, rows: [], rowCount: content.rowCount, showWeather: content.showWeather, showSof: content.showSof };
}

/**
 * Broadcast-tower view model over the Overlay v2 contract.
 *
 * The widget is a presentation of the standings/session slices, so it reads
 * exclusively from frame.standings and frame.session (already resolved and
 * ordered by the Go builder). No scoring-reader is involved: the v1 snapshot's
 * `scoring[].place/name/teamClass/gap` are replaced by the v2 standings fields.
 *
 * Lap counters for the header (lap/totalLaps) are not a dedicated session
 * signal today; they remain as the player completed laps when available. Weather
 * (trackTempC) and SOF would come from frame.weather when a driver admits them;
 * until then they stay undefined and the renderer keeps the v1 placeholder
 * behaviour (showWeather/showSof flags still gate rendering but have no data).
 */
export function buildBroadcastTowerViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: BroadcastTowerContent,
): BroadcastTowerViewModel {
  if (source.state === "error" || source.state === "stopped" || source.state === "detected" || source.state === "connecting") {
    return unavailable(source.state === "error" ? "error" : "disconnected", content, source.reason || undefined);
  }
  if (source.state === "degraded" || source.state === "stale") {
    // degraded/stale still renders, but at stale quality when source is not live.
  }

  const standings = frame.standings ?? [];
  const rows: BroadcastTowerRow[] = standings
    .slice(0, Math.min(10, content.rowCount))
    .map((row, index) => ({
      place: row.position ?? index + 1,
      number: row.number ?? PLACEHOLDER,
      name: row.driver ?? PLACEHOLDER,
      team: row.classId ?? PLACEHOLDER,
      className: row.classId ?? PLACEHOLDER,
      brandColor: undefined,
      gap: displayedNumber(row.gap),
      isPlayer: row.id === frame.player.id,
    }));

  const sessionLabel = (() => {
    const phase = frame.session?.phase;
    if (!phase || phase.q === "missing" || phase.q === "invalid") return PLACEHOLDER;
    return (phase.v ?? PLACEHOLDER).toUpperCase();
  })();

  // Total laps from session maximum when present; lap from player vehicle completed laps.
  const totalLaps = (() => {
    const max = frame.session?.maxLaps;
    if (!max || max.q === "missing" || max.q === "invalid") return undefined;
    return max.v ?? undefined;
  })();

  const lap = (() => {
    const playerRow = standings.find((row) => row.id === frame.player.id);
    return playerRow?.laps ?? undefined;
  })();

  const status: BroadcastTowerViewModel["status"] = source.state === "stale" || source.state === "degraded" ? "stale" : "ready";

  return {
    type: "broadcast-tower",
    status,
    statusMessage: source.reason || undefined,
    sessionLabel,
    lap,
    totalLaps,
    trackTempC: displayedNumber(frame.weather?.trackC),
    sof: undefined,
    rows,
    rowCount: content.rowCount,
    showWeather: content.showWeather,
    showSof: content.showSof,
  };
}

export function broadcastTowerDisplayedValuesV2(model: BroadcastTowerViewModel): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    sessionLabel: model.sessionLabel,
    rowCount: String(model.rows.length),
    rows: model.rows.map((row) => [row.place, row.number, row.name, row.team, row.isPlayer ? "player" : ""].join("~")).join("|"),
  });
}
