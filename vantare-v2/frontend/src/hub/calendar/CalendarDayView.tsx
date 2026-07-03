import { useEffect, useState } from "react";
import {
  expandWeeklySlots,
  getDailyPatternSummary,
  isSameLocalDay,
  startOfLocalDay,
  type CalendarOccurrence,
  type DailyPatternSummary,
} from "../../calendar/calendar-view-math";
import type { Calendar } from "../../calendar/calendar-types";
import { filterIntervalSummaries, matchesTierFilter } from "./calendar-filter";
import type { CalendarFilter } from "./CalendarToolbar";

const SPANISH_WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

const SPANISH_MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const TIER_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  beginner: { text: "#CD7F32", bg: "rgba(205,127,50,.12)", border: "rgba(205,127,50,.5)" },
  intermediate: { text: "#B8BFC8", bg: "rgba(184,191,200,.12)", border: "rgba(184,191,200,.5)" },
  advanced: { text: "#D4A017", bg: "rgba(212,160,23,.12)", border: "rgba(212,160,23,.5)" },
  weekly: { text: "#ff3b3b", bg: "rgba(255,59,59,.12)", border: "rgba(255,59,59,.5)" },
  special: { text: "#f59e0b", bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.5)" },
};

function getTierDisplay(tier: string): string {
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

function getTierColor(tier: string): { text: string; bg: string; border: string } {
  return TIER_COLORS[tier] ?? { text: "#f5f5f5", bg: "rgba(245,245,245,.05)", border: "rgba(245,245,245,.1)" };
}

export type CalendarDayViewProps = {
  anchorDate: Date;
  calendar: Calendar;
  activeFilter?: CalendarFilter;
  onFilterSelect?: (filter: CalendarFilter) => void;
};

type DayEvent = {
  id: string;
  type: "weekly" | "special";
  label: string;
  track: string;
  durationMin: number;
  startTime: Date;
  tier: string;
};

function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

export function CalendarDayView({ anchorDate, calendar, activeFilter = "all", onFilterSelect }: CalendarDayViewProps) {
  const [now, setNow] = useState(new Date());

  // Update current time periodically for live line and indicators
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const isToday = isSameLocalDay(anchorDate, now);

  // Expand weekly-slots for the selected day range
  const dayStart = startOfLocalDay(anchorDate);
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const weeklyOccurrences: CalendarOccurrence[] = (calendar.series || []).flatMap((s) =>
    expandWeeklySlots(s, dayStart, dayEnd)
  );

  // Daily pattern summary for interval series (shared header)
  const intervalSummaries: DailyPatternSummary[] = filterIntervalSummaries(
    getDailyPatternSummary(calendar.series || []),
    activeFilter,
  );

  // Gather concrete events (special & weekly-slots) for the selected day
  const events: DayEvent[] = [];

  for (const ev of calendar.events || []) {
    const associatedSeries = (calendar.series || []).find((s) => s.id === ev.series);
    if (associatedSeries && associatedSeries.recurrence?.kind === "interval") {
      continue;
    }
    if (!isSameLocalDay(new Date(ev.startTime), anchorDate)) continue;
    const tier = associatedSeries?.tier;
    if (!matchesTierFilter({ type: "special", tier }, activeFilter)) continue;
    events.push({
      id: ev.id,
      type: "special",
      label: ev.title,
      track: ev.track,
      durationMin: ev.durationMin || 0,
      startTime: new Date(ev.startTime),
      tier: tier || "special",
    });
  }

  for (const occ of weeklyOccurrences) {
    if (!isSameLocalDay(occ.startTime, anchorDate)) continue;
    const series = (calendar.series || []).find((s) => s.id === occ.seriesId);
    const tier = series?.tier;
    if (!matchesTierFilter({ type: "weekly", tier }, activeFilter)) continue;
    events.push({
      id: `${occ.seriesId}-${occ.startTime.getTime()}`,
      type: "weekly",
      label: occ.title,
      track: series?.track || "",
      durationMin: occ.durationMin || 0,
      startTime: occ.startTime,
      tier: tier || "weekly",
    });
  }

  const placedEvents = segmentEvents(events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()));

  // Formatting date header
  const weekday = SPANISH_WEEKDAYS[anchorDate.getDay()];
  const dayNum = anchorDate.getDate();
  const month = SPANISH_MONTHS[anchorDate.getMonth()];
  const year = anchorDate.getFullYear();
  const formattedDate = `${weekday} ${dayNum} ${month} ${year}`;

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <section
      className="flex flex-col gap-3 opacity-0 animate-fade-in-up delay-75"
      data-testid="calendar-day-view"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
        <div>
          <span className="v52-eyebrow">Vista diaria</span>
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

      {/* Daily pattern summaries (shared compact header) */}
      <div
        className="flex flex-wrap gap-2 bg-white/[0.02] border border-white/10 rounded-xl p-3"
        data-testid="calendar-day-patterns"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted flex items-center mr-1">
          Frecuencias:
        </span>
        {intervalSummaries.length === 0 ? (
          <span className="text-xs text-vantare-textDim italic">No hay patrones de intervalos activos</span>
        ) : (
          intervalSummaries.map((sum, idx) => {
            const tc = getTierColor(sum.tier || "");
            return (
              <div
                key={idx}
                data-testid={`calendar-day-interval-${idx}`}
                className="text-[9px] font-bold px-2 py-0.5 rounded border leading-none cursor-pointer"
                style={{ color: tc.text, background: tc.bg, border: `1px solid ${tc.border}` }}
                onClick={() => onFilterSelect?.(sum.tier as CalendarFilter)}
              >
                {getTierDisplay(sum.tier)} · {sum.label}
              </div>
            );
          })
        )}
      </div>

      {/* Continuous daily timeline */}
      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] backdrop-blur-sm w-full">
        <div className="overflow-y-auto max-h-[640px]" style={{ scrollbarWidth: "thin" }}>
          <div className="relative grid grid-cols-[60px_1fr]" style={{ height: HOUR_HEIGHT * 24 }}>
            {/* Gutter */}
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

            {/* Track */}
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
                const tc = getTierColor(item.tier || (item.type === "special" ? "special" : "weekly"));
                const timeFormatted = formatTime(item.startTime);
                const endFormatted = formatTime(
                  new Date(item.startTime.getTime() + (item.durationMin || 0) * 60000)
                );
                const tooltip = `${item.type === "special" ? "★ " : ""}${item.label} · ${getTierDisplay(item.tier || item.type)} · ${timeFormatted}-${endFormatted}${item.track ? ` · ${item.track}` : ""}`;

                return (
                  <div
                    key={item.id}
                    data-testid={`calendar-day-event-${idx}`}
                    title={tooltip}
                    onClick={() => onFilterSelect?.(item.type === "special" ? "special" : (item.tier as CalendarFilter))}
                    className="absolute z-20 rounded px-2 py-1 text-xs flex flex-col justify-between overflow-hidden cursor-pointer leading-tight"
                    style={{
                      top: item.top,
                      left: item.left,
                      width: item.width,
                      height: item.height,
                      background: tc.bg,
                      border: `1px solid ${tc.border}`,
                      color: tc.text,
                    }}
                  >
                    <div className="font-bold truncate pr-3 leading-tight">
                      {item.type === "special" ? "★ " : ""}
                      {item.label}
                    </div>
                    <div className="font-mono text-[9px] opacity-75 mt-0.5 truncate">
                      {item.track ? `${item.track} · ` : ""}
                      {timeFormatted} - {endFormatted}
                      {item.durationMin > 0 ? ` (${item.durationMin}m)` : ""}
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
