import {
  buildMonthGrid,
  expandWeeklySlots,
  getDailyPatternSummary,
  groupEventsByDay,
  indexSeriesById,
  isSameLocalDay,
  type CalendarDayCell,
  type CalendarOccurrence,
  type DailyPatternSummary,
} from "../../calendar/calendar-view-math";
import type { Calendar } from "../../calendar/calendar-types";
import { filterIntervalSummaries, matchesTierFilter } from "./calendar-filter";
import type { CalendarFilter } from "./CalendarToolbar";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

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
export type CalendarMonthViewProps = {
  anchorDate: Date;
  calendar: Calendar;
  activeFilter?: CalendarFilter;
  onFilterSelect?: (filter: CalendarFilter) => void;
  onDayClick?: (date: Date) => void;
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

type CellItem = {
  type: "weekly" | "special";
  label: string;
  tier?: string;
  time?: string;
};
export function CalendarMonthView({ anchorDate, calendar, activeFilter = "all", onFilterSelect, onDayClick }: CalendarMonthViewProps) {
  // 0. Build series index for O(1) lookups
  const seriesById = indexSeriesById(calendar.series || []);

  // 1. Build grid cells (42 cells)
  const cells = buildMonthGrid(anchorDate);

  // 2. Expand weekly-slots in the grid range
  const gridStart = cells[0].date;
  const gridEnd = new Date(cells[41].date.getTime() + 86400000); // end of grid

  const weeklyOccurrences: CalendarOccurrence[] = (calendar.series || []).flatMap((s) =>
    expandWeeklySlots(s, gridStart, gridEnd)
  );

  // 3. Build daily pattern summary for interval series (shown only in the shared header)
  const intervalSummaries: DailyPatternSummary[] = filterIntervalSummaries(
    getDailyPatternSummary(calendar.series || []),
    activeFilter,
  );
  // 4. Pre-group events by day for O(1) cell lookup
  const eventsByDay = groupEventsByDay(calendar.events || []);

  const getCellConcreteItems = (cell: CalendarDayCell): CellItem[] => {
    const items: CellItem[] = [];

    // 1. Add materialized special events (lookup by day key)
    const year = cell.date.getFullYear();
    const month = String(cell.date.getMonth() + 1).padStart(2, "0");
    const day = String(cell.date.getDate()).padStart(2, "0");
    const dayKey = `${year}-${month}-${day}`;
    const dayEvents = eventsByDay.get(dayKey) || [];

    for (const ev of dayEvents) {
      const associatedSeries = seriesById.get(ev.series);
      if (associatedSeries && associatedSeries.recurrence?.kind === "interval") {
        continue;
      }
      const tier = associatedSeries?.tier;
      if (!matchesTierFilter({ type: "special", tier }, activeFilter)) continue;
      const dateObj = new Date(ev.startTime);
      const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      items.push({
        type: "special",
        label: ev.title,
        time: timeStr,
        tier: seriesById.get(ev.series)?.tier,
      });
    }

    // 2. Add weekly slots occurrences
    const cellWeekly = weeklyOccurrences
      .filter((occ) => isSameLocalDay(occ.startTime, cell.date))
      .filter((occ) => {
        const tier = seriesById.get(occ.seriesId)?.tier;
        return matchesTierFilter({ type: "weekly", tier }, activeFilter);
      });
    for (const occ of cellWeekly) {
      const timeStr = occ.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      items.push({
        type: "weekly",
        label: occ.title,
        time: timeStr,
        tier: seriesById.get(occ.seriesId)?.tier,
      });
    }

    return items;
  };

  const maxConcreteItemsPerDay = 4;

  return (
    <section className="flex flex-col gap-3 opacity-0 animate-fade-in-up delay-75 flex-1 min-h-0" data-testid="calendar-month-view">
      {/* Visual month header */}
      <div className="flex flex-col">
        <span className="v52-eyebrow">Vista mensual</span>
      </div>

      {/* Shared interval-pattern header (keeps filters reachable without cluttering every cell) */}
      {intervalSummaries.length > 0 && (
        <div
          className="flex flex-wrap gap-2 bg-white/[0.02] border border-white/10 rounded-xl p-3"
          data-testid="calendar-month-patterns"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted flex items-center mr-1">
            Frecuencias:
          </span>
          {intervalSummaries.map((sum, idx) => {
            const tc = getTierColor(sum.tier || "");
            return (
              <div
                key={idx}
                data-testid={`calendar-month-interval-${idx}`}
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

      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] backdrop-blur-sm w-full flex-1 min-h-0 flex flex-col">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.02] text-center text-[10px] sm:text-xs font-bold text-vantare-textMuted py-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="truncate">
              {day}
            </div>
          ))}
        </div>

        {/* 42 grid cells */}
        <div className="grid grid-cols-7 bg-white/5 gap-[1px] flex-1 auto-rows-fr">
          {cells.map((cell, idx) => {
            const concreteItems = getCellConcreteItems(cell);
            const visibleConcrete = concreteItems.slice(0, maxConcreteItemsPerDay);
            const remainingCount = concreteItems.length - visibleConcrete.length;
            const hasMore = remainingCount > 0;

            const isCurrentMonth = cell.inCurrentMonth;
            const isToday = cell.isToday;

            return (
              <div
                key={idx}
                data-testid={`calendar-month-cell-${idx}`}
                className={[
                  "min-h-[90px] sm:min-h-[110px] p-1.5 sm:p-2.5 flex flex-col justify-between transition-colors cursor-pointer",
                  isCurrentMonth ? "bg-[#0b0b0b]" : "bg-[#060606] opacity-35",
                  isToday ? "border border-vantare-red-500/50 bg-vantare-red-500/5" : "border border-transparent",
                  "hover:bg-[#141414]",
                ].join(" ")}
                onClick={() => onDayClick?.(cell.date)}
              >
                {/* Cell header: Day number */}
                <div className="flex justify-between items-center mb-1">
                  <span
                    data-testid={`calendar-month-cell-day-${idx}`}
                    className={[
                      "text-[10px] sm:text-xs font-bold",
                      isToday ? "text-vantare-red-400 font-extrabold" : "text-vantare-textMuted",
                    ].join(" ")}
                  >
                    {cell.date.getDate()}
                  </span>
                </div>

                {/* Cell items (concrete events only) */}
                <div className="flex-1 flex flex-col gap-1 overflow-hidden justify-start">
                  {visibleConcrete.map((item, itemIdx) => {
                    const tc = item.type === "special" ? getTierColor("special") : getTierColor(item.tier || "");
                    return (
                      <div
                        key={`concrete-${itemIdx}`}
                        data-testid={`calendar-cell-event-${idx}-${itemIdx}`}
                        onClick={(e) => { e.stopPropagation(); onFilterSelect?.(item.type === "special" ? "special" : (item.tier as CalendarFilter)); }}
                        className="text-[8px] sm:text-[9px] px-1 py-0.5 rounded leading-none flex items-center justify-between gap-1 truncate shrink-0 cursor-pointer"
                        style={{ color: "#f5f5f5", background: tc.bg, border: `1px solid ${tc.border}` }}
                        title={item.label}
                      >
                        <span className="truncate flex-1">{item.label}</span>
                        {item.time && (
                          <span className="text-[7px] sm:text-[8px] text-vantare-textDim font-mono shrink-0">
                            {item.time}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {hasMore && (
                    <div
                      data-testid={`calendar-cell-more-${idx}`}
                      className="text-[8px] sm:text-[9px] text-vantare-textDim font-mono font-bold pl-1 leading-none mt-0.5 shrink-0"
                    >
                      +{remainingCount} más
                    </div>
                  )}

                  {/* Empty cells stay clean; frequencies live in the shared header. */}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
