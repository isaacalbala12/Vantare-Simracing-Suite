import type {
  CalendarAlerts,
  CalendarSchedule,
  CalendarSeries,
} from "../../../contract/generated/calendar";
import { civilDay } from "../../ui/calendarDate";
import { alertAt, daily } from "./rows";
import { starts } from "./schedule";

export type CalendarDayEntry = {
  series: CalendarSeries;
  kind: "band" | "open" | "event";
  starts: number[];
  from?: number;
  to?: number;
};
// Uses civil midnights, including 23/25-hour days, and the publication's exclusive end.
export function days(
  schedule: CalendarSchedule,
  now: number,
  utc: boolean,
  following: readonly string[],
  alerts: CalendarAlerts,
  limit: number,
) {
  const until = Date.parse(schedule.validUntil);
  const result: { at: number; entries: CalendarDayEntry[] }[] = [];
  for (let offset = 0; civilDay(now, offset, utc) < until; offset++) {
    const at = civilDay(now, offset, utc);
    const from = Math.max(now, at),
      to = civilDay(now, offset + 1, utc);
    const entries: CalendarDayEntry[] = [];
    for (const series of schedule.series) {
      const band = alerts.bands.find((b) => b.seriesId === series.id);
      if (!following.includes(series.id) && !band) continue;
      const slots = starts(schedule, series, from, to, limit);
      if (!slots.length) continue;
      if (!daily(series))
        entries.push({ series, kind: "event", starts: slots });
      else if (band) {
        const covered = slots.filter((at) =>
          alertAt(schedule, series, at, alerts, limit),
        );
        if (covered.length)
          entries.push({
            series,
            kind: "band",
            starts: covered,
            from: band.from,
            to: band.to,
          });
      } else entries.push({ series, kind: "open", starts: [slots[0]] });
    }
    entries.sort(
      (a, b) =>
        a.starts[0] - b.starts[0] ||
        (a.series.name < b.series.name
          ? -1
          : a.series.name > b.series.name
            ? 1
            : 0),
    );
    if (entries.length) result.push({ at, entries });
  }
  return result;
}
