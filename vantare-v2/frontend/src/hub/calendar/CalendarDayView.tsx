import { useEffect, useState } from "react";
import {
  expandWeeklySlots,
  expandDailyIntervalSeries,
  getDailyPatternSummary,
  indexSeriesById,
  isIntervalSeries,
  isSameLocalDay,
  startOfLocalDay,
  type CalendarOccurrence,
  type DailyPatternSummary,
} from "../../calendar/calendar-view-math";
import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import { matchesTierFilter } from "./calendar-filter";
import { tierStyle, tierBadgeStyle, formatInZone } from "./calendar-shared";
import type { CalendarFilter } from "./CalendarToolbar";

const SPANISH_MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const TIER_TOP_BARS: Record<string, string> = {
  beginner: "linear-gradient(90deg,transparent 5%,#6B3F1C 25%,#CD7F32 50%,#F5C889 75%,transparent 95%)",
  intermediate: "linear-gradient(90deg,transparent 5%,#3D4654 25%,#B8BFC8 50%,#F0F4F8 75%,transparent 95%)",
  advanced: "linear-gradient(90deg,transparent 5%,#7A5C08 25%,#D4A017 50%,#EBB945 75%,transparent 95%)",
  weekly: "linear-gradient(90deg,transparent 5%,#991b1b 25%,#ff3b3b 50%,#ff6b6b 75%,transparent 95%)",
  special: "linear-gradient(90deg,transparent 5%,#92400e 25%,#f59e0b 50%,#fbbf24 75%,transparent 95%)",
};

export type CalendarDayViewProps = {
  anchorDate: Date;
  calendar: Calendar;
  timeZone: string;
  activeFilter?: CalendarFilter;
  onFilterSelect?: (filter: CalendarFilter) => void;
  onTierClick?: (tier: CalendarFilter) => void;
};

type DayEvent = {
  id: string;
  type: "daily" | "weekly" | "special" | "interval";
  label: string;
  track: string;
  durationMin: number;
  startTime: Date;
  tier: string;
};

function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function segmentEvents(events: DayEvent[]) {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const columns: { start: number; end: number }[][] = [];
  const placements: { ev: DayEvent; startMin: number; endMin: number; colIndex: number }[] = [];

  for (const ev of sorted) {
    const startMin = minutesOf(ev.startTime);
    const endMin = startMin + ev.durationMin;
    let colIndex = 0;
    while (true) {
      columns[colIndex] = columns[colIndex] ?? [];
      const overlaps = columns[colIndex].some((c) => startMin < c.end && endMin > c.start);
      if (!overlaps) {
        columns[colIndex].push({ start: startMin, end: endMin });
        break;
      }
      colIndex++;
    }
    placements.push({ ev, startMin, endMin, colIndex });
  }

  const totalCols = columns.length;
  return placements.map(({ ev, startMin, endMin, colIndex }) => ({
    ...ev,
    top: (startMin / 60) * HOUR_HEIGHT,
    height: Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22),
    left: `${(colIndex / totalCols) * 100}%`,
    width: `${100 / totalCols}%`,
  }));
}

function tierShort(tier: string): string {
  switch (tier) {
    case "beginner":
      return "Bronce";
    case "intermediate":
      return "Plata";
    case "advanced":
      return "Oro";
    case "weekly":
      return "Semanal";
    default:
      return tier;
  }
}

export function CalendarDayView({
  anchorDate,
  calendar,
  timeZone,
  activeFilter = "all",
  onFilterSelect: _onFilterSelect,
  onTierClick,
}: CalendarDayViewProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const isToday = isSameLocalDay(anchorDate, now);
  const seriesById = indexSeriesById(calendar.series || []);

  const dayStart = startOfLocalDay(anchorDate);
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const weeklyOccurrences: CalendarOccurrence[] = (calendar.series || []).flatMap((s) =>
    expandWeeklySlots(s, dayStart, dayEnd)
  );

  // Interval series are NOT materialised as 24 blocks/hour. We summarise them
  // as a single preparation band. The tier filter only affects opacity —
  // non-matching tiers are shown dimmed for context.
  const isTierFilter = ["beginner", "intermediate", "advanced"].includes(activeFilter);
  const intervalSeriesByTier = new Map<string, RaceSeries[]>();
  for (const s of calendar.series || []) {
    if (!isIntervalSeries(s)) continue;
    const list = intervalSeriesByTier.get(s.tier) ?? [];
    list.push(s);
    intervalSeriesByTier.set(s.tier, list);
  }
  // Always show all interval summaries; the tier filter only dims non-matching tiers.
  const intervalSummaries: DailyPatternSummary[] = getDailyPatternSummary(calendar.series || []);

  const events: DayEvent[] = [];

  for (const ev of calendar.events || []) {
    const associatedSeries = seriesById.get(ev.series);
    if (associatedSeries && associatedSeries.recurrence?.kind === "interval") {
      continue;
    }
    if (!isSameLocalDay(new Date(ev.startTime), anchorDate)) continue;
    const tier = associatedSeries?.tier ?? "special";
    if (!matchesTierFilter({ type: "special", tier }, activeFilter)) continue;
    events.push({
      id: ev.id,
      type: "special",
      label: ev.title,
      track: ev.track,
      durationMin: ev.durationMin || 0,
      startTime: new Date(ev.startTime),
      tier,
    });
  }

  for (const occ of weeklyOccurrences) {
    if (!isSameLocalDay(occ.startTime, anchorDate)) continue;
    const series = seriesById.get(occ.seriesId);
    const tier = series?.tier ?? "weekly";
    if (!matchesTierFilter({ type: "weekly", tier }, activeFilter)) continue;
    events.push({
      id: `${occ.seriesId}-${occ.startTime.getTime()}`,
      type: "weekly",
      label: occ.title,
      track: series?.track || "",
      durationMin: occ.durationMin || 0,
      startTime: occ.startTime,
      tier,
    });
  }
  // Generate interval series events for the timeline
  const intervalOccurrences = expandDailyIntervalSeries(
    calendar.series || [],
    dayStart,
    dayEnd,
    isTierFilter ? activeFilter : undefined,
  );
  // Limit: 1 event per series per calendar hour to avoid saturation
  const seriesHourSeen = new Set<string>();
  for (const occ of intervalOccurrences) {
    if (!isSameLocalDay(occ.startTime, anchorDate)) continue;
    const series = seriesById.get(occ.seriesId);
    const tier = series?.tier ?? "beginner";
    if (!matchesTierFilter({ type: "interval", tier }, activeFilter)) continue;
    const hour = occ.startTime.getHours();
    const key = `${occ.seriesId}-${hour}`;
    if (seriesHourSeen.has(key)) continue;
    seriesHourSeen.add(key);
    events.push({
      id: `${occ.seriesId}-${occ.startTime.getTime()}`,
      type: "interval",
      label: occ.title,
      track: series?.track || "",
      durationMin: occ.durationMin || 0,
      startTime: occ.startTime,
      tier,
    });
  }

  const placedEvents = segmentEvents(events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()));

  const weekday = formatInZone(anchorDate, timeZone, { weekday: "long" });
  const dayNum = formatInZone(anchorDate, timeZone, { day: "numeric" });
  const month = SPANISH_MONTHS[anchorDate.getMonth()];
  const year = anchorDate.getFullYear();
  const formattedDate = `${weekday} ${dayNum} ${month} ${year}`;

  const timeStr = formatInZone(now, timeZone, { hour: "2-digit", minute: "2-digit" });

  return (
    <section
      className="flex flex-col gap-3 opacity-0 animate-fade-in-up delay-75 flex-1 min-h-0"
      data-testid="calendar-day-view"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
        <div>
          <h2 className="text-base font-bold text-white mt-1">
            <span data-testid="calendar-day-title">{formattedDate}</span>
            {isToday && (
              <span
                data-testid="calendar-today-indicator"
                className="text-[8px] font-bold text-vantare-red-400 uppercase tracking-widest bg-vantare-red-500/20 px-1 py-0.5 rounded ml-2 align-middle"
              >
                Hoy
              </span>
            )}
            <span className="text-vantare-textMuted font-normal text-xs ml-2">
              · {events.length} {events.length === 1 ? "carrera programada" : "carreras programadas"}
            </span>
          </h2>
        </div>
        {isToday && (
          <div
            className="flex items-center gap-2 text-[10px] font-mono text-vantare-textMuted uppercase tracking-[.18em]"
            data-testid="calendar-now-indicator"
          >
            <span className="text-accent animate-pulse">●</span> Ahora {timeStr}
          </div>
        )}
      </div>

      {/* Preparation bands: cadence + duration per interval tier (no 24 blocks/hour) */}
      {intervalSummaries.length > 0 && (
        <div
          className="flex flex-wrap gap-2 bg-white/[0.02] border border-white/10 rounded-xl p-3"
          data-testid="calendar-day-patterns"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted flex items-center mr-1">
            Horario:
          </span>
          {intervalSummaries.map((sum, idx) => {
            const tc = tierStyle(sum.tier || "");
            const tierSeries = intervalSeriesByTier.get(sum.tier || "") ?? [];
            const duration = tierSeries[0]?.durationMin ?? 0;
            const tracks = tierSeries.length;
            const isActive = !isTierFilter || activeFilter === sum.tier;
            return (
              <button
                key={idx}
                type="button"
                data-testid={`calendar-day-interval-${idx}`}
                onClick={() => onTierClick?.(sum.tier as CalendarFilter)}
                className={`text-[9px] font-bold px-2 py-0.5 rounded border leading-none cursor-pointer text-left transition-opacity ${isActive ? "" : "opacity-40"}`}
                style={{ color: tc.text, background: tc.bg, border: `1px solid ${tc.border}` }}
                title={`${sum.label} · ${duration}m · ${tracks} pista(s)`}
              >
                {tierShort(sum.tier)} · {sum.label} · {duration}m{tracks > 1 ? ` · ${tracks} pistas` : ""}
              </button>
            );
          })}
        </div>
      )}

      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] backdrop-blur-sm w-full flex-1 min-h-0 flex flex-col">
        <div className="overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: "thin" }}>
          <div className="relative grid grid-cols-[60px_1fr]" style={{ height: HOUR_HEIGHT * 24 }}>
            <div className="relative bg-[#0b0b0b]">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 font-mono text-[10px] text-vantare-textDim -translate-y-1/2"
                  style={{ top: h * HOUR_HEIGHT }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            <div className="relative bg-[#0b0b0b]">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-white/[0.03]"
                  style={{ top: h * HOUR_HEIGHT }}
                />
              ))}

              {isToday && (
                <div
                  data-testid="calendar-now-line"
                  className="absolute left-0 right-0 h-[1px] bg-[#ff3b3b] shadow-[0_0_8px_rgba(255,59,59,0.6)] z-30 pointer-events-none"
                  style={{ top: (minutesOf(now) / 60) * HOUR_HEIGHT }}
                >
                  <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-[#ff3b3b] shadow-[0_0_8px_rgba(255,59,59,0.8)]" />
                </div>
              )}

              {placedEvents.map((item, idx) => {
                const tc = item.type === "special" ? tierStyle("special") : tierStyle(item.tier || "weekly");
                const tierKey = item.type === "special" ? "special" : (item.tier || "weekly");
                const topBar = TIER_TOP_BARS[tierKey] || TIER_TOP_BARS.weekly;
                const timeFormatted = formatInZone(item.startTime, timeZone, { hour: "2-digit", minute: "2-digit" });
                const endFormatted = formatInZone(new Date(item.startTime.getTime() + (item.durationMin || 0) * 60000), timeZone, { hour: "2-digit", minute: "2-digit" });
                const tooltip = `${item.type === "special" ? "★ " : ""}${item.label} · ${tierShort(item.tier || item.type)} · ${timeFormatted}-${endFormatted}${item.track ? ` · ${item.track}` : ""}`;

                return (
                  <div
                    key={item.id}
                    data-testid={`calendar-day-event-${idx}`}
                    title={tooltip}
                    onClick={() => onTierClick?.(item.type === "special" ? "special" : (item.tier as CalendarFilter))}
                    className="absolute z-20 rounded-lg overflow-hidden cursor-pointer group transition-all hover:scale-[1.02]"
                    style={{
                      top: item.top,
                      left: item.left,
                      width: item.width,
                      height: item.height,
                      background: "rgba(15,15,15,.7)",
                      border: "1px solid rgba(255,255,255,.05)",
                    }}
                  >
                    {/* Top gradient bar — visible on hover */}
                    <div
                      className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: topBar }}
                    />
                    {/* Hover glow */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      style={{ background: `linear-gradient(180deg,${tc.accent}14 0%,transparent 40%)` }}
                    />
                    {/* Content */}
                    <div className="px-2.5 py-2 relative h-full flex flex-col justify-center gap-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-[.15em]"
                          style={tierBadgeStyle(tc.accent)}
                        >
                          {tierShort(tierKey).slice(0, 1)}
                        </span>
                        <span className="font-bold text-[11px] text-white truncate leading-tight">
                          {item.type === "special" ? "★ " : ""}
                          {item.label}
                        </span>
                      </div>
                      <div className="font-mono text-[9px] text-white/40 truncate">
                        {item.track ? `${item.track} · ` : ""}
                        {timeFormatted} - {endFormatted}
                        {item.durationMin > 0 ? ` (${item.durationMin}m)` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}