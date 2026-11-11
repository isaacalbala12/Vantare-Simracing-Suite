import type { CalendarBand } from "../../../contract/generated/calendar";
import { civilDay } from "../../ui/calendarDate";
export function weekDates(now: number, utc: boolean) {
  const date = new Date(now);
  const back = (date.getUTCDay() + 5) % 7;
  const tuesday = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - back,
    ),
  );
  const first = utc
    ? tuesday.getTime()
    : new Date(
        tuesday.getUTCFullYear(),
        tuesday.getUTCMonth(),
        tuesday.getUTCDate(),
      ).getTime();
  return Array.from({ length: 7 }, (_, offset) => civilDay(first, offset, utc));
}

// GPUI paints bands in local time on each displayed civil date, regardless of
// the notification's days/mode. Duration arithmetic deliberately matches GPUI.
export function bandSegments(
  dates: readonly number[],
  band: CalendarBand,
  utc: boolean,
) {
  if (!dates.length) return [];
  const from = dates[0],
    until = civilDay(from, 7, utc);
  return dates.flatMap((at) => {
    const d = new Date(at);
    const midnight = utc
      ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime()
      : civilDay(at, 0, false);
    const start = Math.max(from, midnight + band.from * 60_000);
    const end = Math.min(until, midnight + band.to * 60_000);
    return end > start ? [{ from: start, until: end }] : [];
  });
}
