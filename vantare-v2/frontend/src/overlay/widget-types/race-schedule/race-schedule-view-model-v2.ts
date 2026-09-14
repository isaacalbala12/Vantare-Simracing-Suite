import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import type { RaceScheduleContent } from "./race-schedule-definition";
import type { RaceScheduleEvent, RaceScheduleViewModel } from "./race-schedule-view-model";

/**
 * Race-schedule view model over the Overlay v2 contract.
 *
 * El schedule es un dataset auxiliar de Calendar y NO forma parte de
 * `OverlayFrameV2` (no hay `session.scheduleEvents` ni equivalente). El VM v2
 * declara el gap sin inventar una señal telemétrica.
 *
 * Este comparador pinta vacío en `missing`; el host productivo recibe los
 * eventos únicamente por `WidgetRuntimeInput.raceScheduleEvents`.
 */
export function buildRaceScheduleViewModelV2(
  _frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: RaceScheduleContent,
): RaceScheduleViewModel {
  const events: readonly RaceScheduleEvent[] = [];
  const filtered = events
    .filter((event) => content.licenseFilter === "all" || event.license === content.licenseFilter)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, content.rowCount);

  const sourceMapped = mapStatus(source.state);
  const status: RaceScheduleViewModel["status"] =
    filtered.length > 0 ? (sourceMapped === "stale" ? "stale" : "ready") : "missing";

  return {
    type: "race-schedule",
    status,
    events: filtered,
    timeZone: content.timeZone,
  };
}

export function raceScheduleDisplayedValues(
  model: RaceScheduleViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    eventCount: String(model.events.length),
    timeZone: model.timeZone,
  });
}

/** Campos sin senal canonica; declarados. */
export const OVERLAY_V2_RACESCHEDULE_DECLARED_GAPS: readonly string[] = Object.freeze([
  "events",
]);

function mapStatus(state: string): RaceScheduleViewModel["status"] {
  switch (state) {
    case "live":
      return "ready";
    case "stale":
      return "stale";
    case "error":
      return "error";
    case "stopped":
      return "disconnected";
    default:
      return "missing";
  }
}
