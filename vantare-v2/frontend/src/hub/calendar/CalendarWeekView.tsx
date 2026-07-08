import {
  buildWeekRange,
  expandWeeklySlots,
  getDailyPatternSummary,
  groupEventsByDay,
  indexSeriesById,
  isSameLocalDay,
  type CalendarOccurrence,
  type DailyPatternSummary,
} from "../../calendar/calendar-view-math";
import type { Calendar } from "../../calendar/calendar-types";
import { filterIntervalSummaries, matchesTierFilter } from "./calendar-filter";
import { tierStyle, formatInZone } from "./calendar-shared";
import type { CalendarFilter } from "./CalendarToolbar";

const SHORT_WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const SPANISH_MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const HOUR_HEIGHT = 52;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export type CalendarWeekViewProps = {
  anchorDate: Date;
  calendar: Calendar;
  timeZone: string;
  activeFilter?: CalendarFilter;
  onFilterSelect?: (filter: CalendarFilter) => void;
  onTierClick?: (tier: CalendarFilter) => void;
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

function formatWeekRange(days: Date[], timeZone: string): string {
  const start = days[0];
  const end = days[6];
  const startMonth = SPANISH_MONTHS[start.getMonth()];
  const endMonth = SPANISH_MONTHS[end.getMonth()];
  const startDay = formatInZone(start, timeZone, { day: "numeric" });
  const endDay = formatInZone(end, timeZone, { day: "numeric" });
  if (start.getMonth() === end.getMonth()) {
    return `${startDay} - ${endDay} ${startMonth} ${start.getFullYear()}`;
  }
  return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${start.getFullYear()}`;
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

function tierShort(tier: string): string {
  switch (tier) {
    case "beginner": return "Bronce";
    case "intermediate": return "Plata";
    case "advanced": return "Oro";
    case "weekly": return "Semanal";
    default: return tier;
  }
}

export function CalendarWeekView({
  anchorDate,
  calendar,
  timeZone,
  activeFilter = "all",
  onFilterSelect: _onFilterSelect,
  onTierClick,
}: CalendarWeekViewProps) {
  const days = buildWeekRange(anchorDate);
  const gridStart = days[0];
  const gridEnd = new Date(days[6].getTime() + 86400000);
  const now = new Date();
  const seriesById = indexSeriesById(calendar.series || []);

  const weeklyOccurrences: CalendarOccurrence[] = (calendar.series || []).flatMap((s) =>
    expandWeeklySlots(s, gridStart, gridEnd)
  );

  const intervalSummaries: DailyPatternSummary[] = filterIntervalSummaries(
    getDailyPatternSummary(calendar.series || []),
    activeFilter,
  );
  const eventsByDay = groupEventsByDay(calendar.events || []);

  const dayEvents = days.map((dayDate) => {
    const events: WeekEvent[] = [];

    const year = dayDate.getFullYear();
    const month = String(dayDate.getMonth() + 1).padStart(2, "0");
    const day = String(dayDate.getDate()).padStart(2, "0");
    const dayKey = `${year}-${month}-${day}`;
    const dayEventsList = eventsByDay.get(dayKey) || [];

    for (const ev of dayEventsList) {
      const associatedSeries = seriesById.get(ev.series);
      if (associatedSeries && associatedSeries.recurrence?.kind === "interval") continue;
      const tier = associatedSeries?.tier ?? "special";
      if (!matchesTierFilter({ type: "special", tier }, activeFilter)) continue;
      events.push({
        id: ev.id, type: "special", label: ev.title, track: ev.track,
        durationMin: ev.durationMin || 0, startTime: new Date(ev.startTime), tier,
      });
    }

    for (const occ of weeklyOccurrences) {
      if (!isSameLocalDay(occ.startTime, dayDate)) continue;
      const series = seriesById.get(occ.seriesId);
      const tier = series?.tier ?? "weekly";
      if (!matchesTierFilter({ type: "weekly", tier }, activeFilter)) continue;
      events.push({
        id: `${occ.seriesId}-${occ.startTime.getTime()}`, type: "weekly", label: occ.title,
        track: series?.track || "", durationMin: occ.durationMin || 0, startTime: occ.startTime, tier,
      });
    }

    return segmentEvents(events);
  });

  return (
    <section className="flex flex-col gap-3 opacity-0 animate-fade-in-up delay-75" data-testid="calendar-week-view">
      <div className="flex flex-col">
        <p className="text-xs text-vantare-textMuted mt-1">
          Semana del {formatWeekRange(days, timeZone)}
        </p>
      </div>

      {intervalSummaries.length > 0 && (
        <div
          className="flex flex-wrap gap-2 bg-white/[0.02] border border-white/10 rounded-xl p-3"
          data-testid="calendar-week-patterns"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted flex items-center mr-1">
            Preparación:
          </span>
          {intervalSummaries.map((sum, idx) => {
            const tc = tierStyle(sum.tier || "");
            return (
              <button
                key={idx}
                type="button"
                data-testid={`calendar-week-interval-${idx}`}
                onClick={() => onTierClick?.(sum.tier as CalendarFilter)}
                className="text-[9px] font-bold px-2 py-0.5 rounded border leading-none cursor-pointer"
                style={{ color: tc.text, background: tc.bg, border: `1px solid ${tc.border}` }}
              >
                {tierShort(sum.tier)} · {sum.label} · ver detalle
              </button>
            );
          })}
        </div>
      )}

      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] backdrop-blur-sm w-full flex flex-col">
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
                  {formatInZone(dayDate, timeZone, { day: "numeric" })}
                </span>
                {isToday && (
                  <span data-testid="calendar-today-indicator" className="text-[8px] font-bold text-vantare-red-400 uppercase tracking-widest mt-1 bg-vantare-red-500/20 px-1 py-0.5 rounded">
                    Hoy
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: "thin" }}>
          <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
            <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-[1px] bg-white/5 absolute inset-0">
              <div className="bg-[#0b0b0b] relative">
                {HOURS.map((h) => (
                  <div key={h} className="absolute right-2 font-mono text-[10px] text-vantare-textDim -translate-y-1/2" style={{ top: h * HOUR_HEIGHT }}>
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {days.map((dayDate, idx) => {
                const isToday = isSameLocalDay(dayDate, now);
                return (
                  <div key={idx} data-testid={`calendar-week-column-${idx}`} className={["relative", isToday ? "bg-vantare-red-500/[0.03]" : "bg-[#0b0b0b]"].join(" ")}>
                    {HOURS.map((h) => (
                      <div key={h} className="absolute left-0 right-0 border-t border-white/[0.03]" style={{ top: h * HOUR_HEIGHT }} />
                    ))}

                    {isToday && (
                      <div data-testid="calendar-week-now-line" className="absolute left-0 right-0 h-[1px] bg-[#ff3b3b] shadow-[0_0_8px_rgba(255,59,59,0.6)] z-30 pointer-events-none" style={{ top: (minutesOf(now) / 60) * HOUR_HEIGHT }}>
                        <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-[#ff3b3b] shadow-[0_0_8px_rgba(255,59,59,0.8)]" />
                      </div>
                    )}

                    {dayEvents[idx].map((ev, evIdx) => {
                      const tc = ev.type === "special" ? tierStyle("special") : tierStyle(ev.tier || "weekly");
                      const startTime = formatInZone(ev.startTime, timeZone, { hour: "2-digit", minute: "2-digit" });
                      const endTime = formatInZone(new Date(ev.startTime.getTime() + ev.durationMin * 60000), timeZone, { hour: "2-digit", minute: "2-digit" });
                      const tooltip = `${ev.type === "special" ? "★ " : ""}${ev.label} · ${tierShort(ev.tier)} · ${startTime}-${endTime}${ev.track ? ` · ${ev.track}` : ""}`;

                      return (
                        <div
                          key={ev.id}
                          data-testid={`calendar-week-event-${idx}-${evIdx}`}
                          title={tooltip}
                          onClick={() => onTierClick?.(ev.type === "special" ? "special" : (ev.tier as CalendarFilter))}
                          className="absolute rounded px-1.5 py-1 text-[10px] flex flex-col justify-start overflow-hidden cursor-pointer z-10 hover:z-20 hover:shadow-lg"
                          style={{ top: ev.top, height: ev.height, left: ev.left, width: ev.width, background: tc.bg, border: `1px solid ${tc.border}`, color: tc.text }}
                        >
                          <span className="font-bold truncate leading-tight">{ev.type === "special" ? "★ " : ""}{ev.label}</span>
                          <span className="font-mono text-[8px] opacity-75 mt-0.5 truncate">{startTime} - {endTime}{ev.durationMin > 0 ? ` · ${ev.durationMin}m` : ""}</span>
                          {ev.track && ev.height > 28 && <span className="text-[8px] opacity-60 truncate mt-0.5">{ev.track}</span>}
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
