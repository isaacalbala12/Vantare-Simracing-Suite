import {
  buildWeekRange,
  expandWeeklySlots,
  getDailyPatternSummary,
  isSameLocalDay,
  type CalendarOccurrence,
  type DailyPatternSummary,
} from "../../calendar/calendar-view-math";
import type { Calendar } from "../../calendar/calendar-types";
import { filterIntervalSummaries, matchesTierFilter } from "./calendar-filter";
import type { CalendarFilter } from "./CalendarToolbar";

const SHORT_WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const SPANISH_MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const HOUR_HEIGHT = 52;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const TIER_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  beginner: { text: "#CD7F32", bg: "rgba(205,127,50,.12)", border: "rgba(205,127,50,.5)" },
  intermediate: { text: "#B8BFC8", bg: "rgba(184,191,200,.12)", border: "rgba(184,191,200,.5)" },
  advanced: { text: "#D4A017", bg: "rgba(212,160,23,.12)", border: "rgba(212,160,23,.5)" },
  weekly: { text: "#ff3b3b", bg: "rgba(255,59,59,.12)", border: "rgba(255,59,59,.5)" },
  special: { text: "#f59e0b", bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.5)" },
};

function getTierColor(tier: string): { text: string; bg: string; border: string } {
  return TIER_COLORS[tier] ?? { text: "#f5f5f5", bg: "rgba(245,245,245,.05)", border: "rgba(245,245,245,.1)" };
}

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

export type CalendarWeekViewProps = {
  anchorDate: Date;
  calendar: Calendar;
  activeFilter?: CalendarFilter;
  onFilterSelect?: (filter: CalendarFilter) => void;
};

type WeekEvent = {
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

function formatWeekRange(days: Date[]): string {
  const start = days[0];
  const end = days[6];
  const startMonth = SPANISH_MONTHS[start.getMonth()];
  const endMonth = SPANISH_MONTHS[end.getMonth()];
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} - ${end.getDate()} ${startMonth} ${start.getFullYear()}`;
  }
  return `${start.getDate()} ${startMonth} - ${end.getDate()} ${endMonth} ${start.getFullYear()}`;
}

function segmentEvents(events: WeekEvent[]) {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const columns: { start: number; end: number }[][] = [];
  const placements: { ev: WeekEvent; startMin: number; endMin: number; colIndex: number }[] = [];

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
    height: Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 20),
    left: `${(colIndex / totalCols) * 100}%`,
    width: `${100 / totalCols}%`,
  }));
}

export function CalendarWeekView({
  anchorDate,
  calendar,
  activeFilter = "all",
  onFilterSelect,
}: CalendarWeekViewProps) {
  const days = buildWeekRange(anchorDate);
  const gridStart = days[0];
  const gridEnd = new Date(days[6].getTime() + 86400000);
  const now = new Date();

  const weeklyOccurrences: CalendarOccurrence[] = (calendar.series || []).flatMap((s) =>
    expandWeeklySlots(s, gridStart, gridEnd)
  );

  const intervalSummaries: DailyPatternSummary[] = filterIntervalSummaries(
    getDailyPatternSummary(calendar.series || []),
    activeFilter,
  );

  const dayEvents = days.map((dayDate) => {
    const events: WeekEvent[] = [];

    for (const ev of calendar.events || []) {
      const associatedSeries = (calendar.series || []).find((s) => s.id === ev.series);
      if (associatedSeries && associatedSeries.recurrence?.kind === "interval") {
        continue;
      }
      if (!isSameLocalDay(new Date(ev.startTime), dayDate)) continue;
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
      if (!isSameLocalDay(occ.startTime, dayDate)) continue;
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

    return segmentEvents(events);
  });

  return (
    <section className="flex flex-col gap-3 opacity-0 animate-fade-in-up delay-75" data-testid="calendar-week-view">
      <div className="flex flex-col">
        <span className="v52-eyebrow">Vista semanal</span>
        <p className="text-xs text-vantare-textMuted mt-1">
          Semana del {formatWeekRange(days)}
        </p>
      </div>

      {intervalSummaries.length > 0 && (
        <div
          className="flex flex-wrap gap-2 bg-white/[0.02] border border-white/10 rounded-xl p-3"
          data-testid="calendar-week-patterns"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted flex items-center mr-1">
            Frecuencias:
          </span>
          {intervalSummaries.map((sum, idx) => {
            const tc = getTierColor(sum.tier || "");
            return (
              <div
                key={idx}
                data-testid={`calendar-week-interval-${idx}`}
                onClick={() => onFilterSelect?.(sum.tier as CalendarFilter)}
                className="text-[9px] font-bold px-2 py-0.5 rounded border leading-none cursor-pointer"
                style={{ color: tc.text, background: tc.bg, border: `1px solid ${tc.border}` }}
              >
                {getTierDisplay(sum.tier)} · {sum.label}
              </div>
            );
          })}
        </div>
      )}

      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] backdrop-blur-sm w-full">
        {/* Header row */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-white/5 gap-[1px]">
          <div className="bg-[#0b0b0b]" />
          {days.map((dayDate, idx) => {
            const isToday = isSameLocalDay(dayDate, now);
            const weekdayIndex = (dayDate.getDay() + 6) % 7;
            return (
              <div
                key={idx}
                data-testid={`calendar-week-header-${idx}`}
                className={[
                  "flex flex-col items-center justify-center p-3 border-b border-white/10",
                  isToday ? "bg-vantare-red-500/10" : "bg-white/[0.02]",
                ].join(" ")}
              >
                <span className="text-[10px] font-bold uppercase tracking-[.22em] text-vantare-textMuted">
                  {SHORT_WEEKDAYS[weekdayIndex]}
                </span>
                <span
                  data-testid={`calendar-week-day-num-${idx}`}
                  className={[
                    "font-mono text-xl font-extrabold mt-1",
                    isToday ? "text-vantare-red-400" : "text-white",
                  ].join(" ")}
                >
                  {dayDate.getDate()}
                </span>
                {isToday && (
                  <span
                    data-testid="calendar-today-indicator"
                    className="text-[8px] font-bold text-vantare-red-400 uppercase tracking-widest mt-1 bg-vantare-red-500/20 px-1 py-0.5 rounded"
                  >
                    Hoy
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Scrollable timeline */}
        <div className="overflow-y-auto max-h-[640px]" style={{ scrollbarWidth: "thin" }}>
          <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
            {/* Grid lines */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-[1px] bg-white/5 absolute inset-0">
              {/* Gutter */}
              <div className="bg-[#0b0b0b] relative">
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

              {days.map((dayDate, idx) => {
                const isToday = isSameLocalDay(dayDate, now);
                return (
                  <div
                    key={idx}
                    data-testid={`calendar-week-column-${idx}`}
                    className={[
                      "relative",
                      isToday ? "bg-vantare-red-500/[0.03]" : "bg-[#0b0b0b]",
                    ].join(" ")}
                  >
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-white/[0.03]"
                        style={{ top: h * HOUR_HEIGHT }}
                      />
                    ))}

                    {isToday && (
                      <div
                        data-testid="calendar-week-now-line"
                        className="absolute left-0 right-0 h-[1px] bg-[#ff3b3b] shadow-[0_0_8px_rgba(255,59,59,0.6)] z-30 pointer-events-none"
                        style={{ top: (minutesOf(now) / 60) * HOUR_HEIGHT }}
                      >
                        <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-[#ff3b3b] shadow-[0_0_8px_rgba(255,59,59,0.8)]" />
                      </div>
                    )}

                    {/* Interval pattern badges are now shown in the shared header above the grid */}

                    {/* Events positioned by time */}
                    {dayEvents[idx].map((ev, evIdx) => {
                      const tc = getTierColor(ev.tier || (ev.type === "special" ? "special" : "weekly"));
                      const startTime = formatTime(ev.startTime);
                      const endTime = formatTime(new Date(ev.startTime.getTime() + ev.durationMin * 60000));
                      const tooltip = `${ev.type === "special" ? "★ " : ""}${ev.label} · ${getTierDisplay(ev.tier)} · ${startTime}-${endTime}${ev.track ? ` · ${ev.track}` : ""}`;

                      return (
                        <div
                          key={ev.id}
                          data-testid={`calendar-week-event-${idx}-${evIdx}`}
                          title={tooltip}
                          onClick={() => onFilterSelect?.(ev.type === "special" ? "special" : (ev.tier as CalendarFilter))}
                          className="absolute rounded px-1.5 py-1 text-[10px] flex flex-col justify-start overflow-hidden cursor-pointer z-10 hover:z-20 hover:shadow-lg"
                          style={{
                            top: ev.top,
                            height: ev.height,
                            left: ev.left,
                            width: ev.width,
                            background: tc.bg,
                            border: `1px solid ${tc.border}`,
                            color: tc.text,
                          }}
                        >
                          <span className="font-bold truncate leading-tight">
                            {ev.type === "special" ? "★ " : ""}
                            {ev.label}
                          </span>
                          <span className="font-mono text-[8px] opacity-75 mt-0.5 truncate">
                            {startTime} - {endTime}
                            {ev.durationMin > 0 ? ` · ${ev.durationMin}m` : ""}
                          </span>
                          {ev.track && ev.height > 28 && (
                            <span className="text-[8px] opacity-60 truncate mt-0.5">{ev.track}</span>
                          )}
                        </div>
                      );
                    })}
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
