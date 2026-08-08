import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import { eventDurationMs } from "../../calendar/calendar-types";

/** One race instance laid out on the timeline. */
export type TimelineBlock = {
  id: string;
  startMs: number;
  endMs: number;
  /** Position within the window, 0..100, ready for a percentage layout. */
  leftPct: number;
  widthPct: number;
};

/** One series and everything it runs inside the window. */
export type TimelineRow = {
  seriesId: string;
  name: string;
  tier: string;
  track: string;
  scheduleLabel: string;
  blocks: TimelineBlock[];
};

/** An hour boundary drawn as a column separator and labelled in the header. */
export type TimelineTick = {
  ms: number;
  leftPct: number;
};

export type TimelineWindow = {
  fromMs: number;
  toMs: number;
};

/**
 * The window the timeline shows: from the top of the current hour, forward.
 *
 * The hour is the one in `timeZone`, because that is the zone the column labels
 * are written in. Anchoring to the browser's local hour instead made the labels
 * read :30 for anyone on a half-hour offset, since the grid and the labels
 * disagreed about where an hour begins.
 */
export function buildTimelineWindow(now: Date, hours: number, timeZone: string): TimelineWindow {
  const minutesPastTheHour = minuteOfHourInZone(now, timeZone);
  const fromMs =
    Math.floor(now.getTime() / 60_000) * 60_000 - minutesPastTheHour * 60_000;
  return { fromMs, toMs: fromMs + hours * 3_600_000 };
}

/** The minute component of an instant as read in the given zone. */
function minuteOfHourInZone(date: Date, timeZone: string): number {
  const minute = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const parsed = Number.parseInt(minute, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Hour boundaries inside the window, including the first one. */
export function buildTimelineTicks(window: TimelineWindow): TimelineTick[] {
  const span = window.toMs - window.fromMs;
  if (span <= 0) return [];
  const ticks: TimelineTick[] = [];
  for (let ms = window.fromMs; ms < window.toMs; ms += 3_600_000) {
    ticks.push({ ms, leftPct: ((ms - window.fromMs) / span) * 100 });
  }
  return ticks;
}

/**
 * Where "now" sits in the window, as a percentage, or null when it falls
 * outside — which happens as soon as the view is scrolled to another day.
 */
export function nowMarkerPct(window: TimelineWindow, now: Date): number | null {
  const span = window.toMs - window.fromMs;
  if (span <= 0) return null;
  const ms = now.getTime();
  if (ms < window.fromMs || ms > window.toMs) return null;
  return ((ms - window.fromMs) / span) * 100;
}

/**
 * Turns the calendar's materialised events into one row per series.
 *
 * The events are already expanded by the Go side over a bounded window, so the
 * recurrence rules are not re-implemented here: a block on screen is an event
 * that exists, which keeps the timeline and the countdown telling the same
 * story.
 *
 * Rows come back in schedule order — beginner, intermediate, advanced, weekly —
 * because that is how the source document reads and how a driver picks a tier.
 */
export function buildTimelineRows(
  calendar: Calendar,
  window: TimelineWindow,
): TimelineRow[] {
  const span = window.toMs - window.fromMs;
  if (span <= 0) return [];

  const series = calendar.series ?? [];
  const seriesById = new Map<string, RaceSeries>(series.map((s) => [s.id, s]));
  const labelById = new Map<string, string>(
    (calendar.seriesPreviews ?? []).map((p) => [p.seriesId, p.scheduleLabel]),
  );

  const blocksBySeries = new Map<string, TimelineBlock[]>();
  for (const event of calendar.events ?? []) {
    if (!event.series || !seriesById.has(event.series)) continue;
    const startMs = new Date(event.startTime).getTime();
    if (Number.isNaN(startMs)) continue;
    const endMs = startMs + eventDurationMs(event);
    // Keep anything that overlaps the window, including a race already running
    // when the window opens.
    if (endMs <= window.fromMs || startMs >= window.toMs) continue;

    const clampedStart = Math.max(startMs, window.fromMs);
    const clampedEnd = Math.min(endMs, window.toMs);
    const block: TimelineBlock = {
      id: event.id,
      startMs,
      endMs,
      leftPct: ((clampedStart - window.fromMs) / span) * 100,
      widthPct: ((clampedEnd - clampedStart) / span) * 100,
    };
    const list = blocksBySeries.get(event.series);
    if (list) list.push(block);
    else blocksBySeries.set(event.series, [block]);
  }

  const rows: TimelineRow[] = [];
  for (const s of series) {
    const blocks = (blocksBySeries.get(s.id) ?? []).sort((a, b) => a.startMs - b.startMs);
    rows.push({
      seriesId: s.id,
      name: s.name,
      tier: s.tier,
      track: s.track,
      scheduleLabel: labelById.get(s.id) ?? "",
      blocks,
    });
  }
  return rows;
}
