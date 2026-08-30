import type { WidgetRuntimeStatus, WidgetViewModelBase } from "../../core/widget-definition";
import type { RaceScheduleContent } from "./race-schedule-definition";

export type RaceScheduleEvent = Readonly<{
  id: string;
  title: string;
  track: string;
  startAt: string;
  durationMinutes: number;
  classes: readonly string[];
  status: string;
  license?: string;
}>;

export type RaceScheduleViewModel = WidgetViewModelBase & {
  type: "race-schedule";
  events: readonly RaceScheduleEvent[];
  timeZone: string;
};

export function buildRaceScheduleViewModel(
  events: readonly RaceScheduleEvent[],
  content: RaceScheduleContent,
  sourceStatus: WidgetRuntimeStatus = "missing",
): RaceScheduleViewModel {
  const filtered = [...events]
    .filter((event) => content.licenseFilter === "all" || event.license === content.licenseFilter)
    .sort((left, right) => left.startAt.localeCompare(right.startAt))
    .slice(0, content.rowCount);
  const unavailable = sourceStatus === "error" || sourceStatus === "disconnected";

  return {
    type: "race-schedule",
    status: unavailable
      ? sourceStatus
      : filtered.length > 0
        ? sourceStatus === "stale" ? "stale" : "ready"
        : "missing",
    events: filtered,
    timeZone: content.timeZone,
  };
}
