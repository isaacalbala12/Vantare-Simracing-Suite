import type {
  CalendarSchedule,
  CalendarSeries,
  CalendarView,
} from "../../../contract/generated/calendar";

const minute = 60_000;
const day = 24 * 60 * minute;
// The frozen GPUI anchors interval recurrences at Gregorian 0001-01-01 UTC.
const epoch = -62_135_596_800_000;
export function starts(
  schedule: CalendarSchedule,
  series: CalendarSeries,
  from: number,
  until: number,
  limit: number,
): number[] {
  const lo = Math.max(from, Date.parse(schedule.validFrom));
  const hi = Math.min(until, Date.parse(schedule.validUntil));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [];
  const r = series.recurrence;
  const out: number[] = [];
  const add = (at: number) => {
    if (at >= lo && at < hi) {
      if (out.length === limit) throw new Error("calendar expansion limit");
      out.push(at);
    }
  };
  if (r.kind === "interval") {
    const every = r.intervalMinutes * minute;
    const base =
      epoch +
      (((series.startOffsetMinute % r.intervalMinutes) + r.intervalMinutes) %
        r.intervalMinutes) *
        minute;
    for (
      let at = base + Math.ceil((lo - base) / every) * every;
      at < hi;
      at += every
    )
      add(at);
  } else {
    const first = new Date(lo);
    first.setUTCHours(0, 0, 0, 0);
    for (let date = first.getTime(); date < hi; date += day) {
      const weekday = new Intl.DateTimeFormat("en", {
        weekday: "short",
        timeZone: "UTC",
      }).format(date);
      if (!r.days.some((d) => d === weekday)) continue;
      for (const time of r.timesUTC) {
        const [h, m] = time.split(":").map(Number);
        add(date + (h * 60 + m) * minute);
      }
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}
function current(schedule: CalendarSchedule | null, now: number) {
  return schedule &&
    Date.parse(schedule.validFrom) <= now &&
    now < Date.parse(schedule.validUntil)
    ? schedule
    : null;
}
const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gu, "");
export function publication(view: CalendarView, now: number, limit: number) {
  const official = current(view.official, now),
    fallback = current(view.fallback, now);
  let schedule = official ?? fallback;
  if (official && fallback) {
    const ids = new Set(official.series.map((s) => s.id));
    const names = new Set(official.series.map((s) => normalized(s.name)));
    const merged = [...official.series];
    for (const series of fallback.series) {
      if (merged.length === limit) break;
      const name = normalized(series.name);
      if (ids.has(series.id) || names.has(name)) continue;
      merged.push({ ...series, source: "racecontrol" });
      ids.add(series.id);
      names.add(name);
    }
    schedule = { ...official, series: merged };
  }
  const previous =
    [view.official, view.previous]
      .filter(
        (s): s is CalendarSchedule =>
          s !== null && Date.parse(s.validUntil) <= now,
      )
      .sort((a, b) => Date.parse(b.validUntil) - Date.parse(a.validUntil))[0] ??
    null;
  return { schedule, previous };
}
