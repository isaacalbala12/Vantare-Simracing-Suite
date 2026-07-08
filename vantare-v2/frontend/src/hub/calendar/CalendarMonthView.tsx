import {
  buildMonthGrid,
  expandWeeklySlots,
  getDailyPatternSummary,
  groupEventsByDay,
  indexSeriesById,
  isIntervalSeries,
  isSameLocalDay,
  type CalendarDayCell,
  type CalendarOccurrence,
  type DailyPatternSummary,
} from "../../calendar/calendar-view-math";
import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import { filterIntervalSummaries, matchesTierFilter } from "./calendar-filter";
import { tierStyle, formatInZone, cadenceLabel } from "./calendar-shared";
import type { CalendarFilter } from "./CalendarToolbar";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export type CalendarMonthViewProps = {
  anchorDate: Date;
  calendar: Calendar;
  timeZone: string;
  activeFilter?: CalendarFilter;
  onFilterSelect?: (filter: CalendarFilter) => void;
  onTierClick?: (tier: CalendarFilter) => void;
  onDayClick?: (date: Date) => void;
};

type CellItem = {
  type: "weekly" | "special";
  label: string;
  tier: string;
  time?: string;
};

export function CalendarMonthView({
  anchorDate,
  calendar,
  timeZone,
  activeFilter = "all",
  onFilterSelect,
  onTierClick,
  onDayClick,
}: CalendarMonthViewProps) {
  const seriesById = indexSeriesById(calendar.series || []);

  const cells = buildMonthGrid(anchorDate);

  const gridStart = cells[0].date;
  const gridEnd = new Date(cells[41].date.getTime() + 86400000);

  const weeklyOccurrences: CalendarOccurrence[] = (calendar.series || []).flatMap((s) =>
    expandWeeklySlots(s, gridStart, gridEnd)
  );

  // Interval series (Bronce/Plata/Oro) are NOT materialised into the grid.
  // They are summarised once in the shared "preparación" header so a pilot sees
  // cadence + duration at a glance instead of hundreds of identical blocks.
  const intervalSummaries: DailyPatternSummary[] = filterIntervalSummaries(
    getDailyPatternSummary(calendar.series || []),
    activeFilter,
  );

  const eventsByDay = groupEventsByDay(calendar.events || []);

  // Group interval series by tier to show how many tracks share each cadence.
  const intervalSeriesByTier = new Map<string, RaceSeries[]>();
  for (const s of calendar.series || []) {
    if (!isIntervalSeries(s)) continue;
    const list = intervalSeriesByTier.get(s.tier) ?? [];
    list.push(s);
    intervalSeriesByTier.set(s.tier, list);
  }

  const getCellConcreteItems = (cell: CalendarDayCell): CellItem[] => {
    const items: CellItem[] = [];

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
      const tier = associatedSeries?.tier ?? "special";
      if (!matchesTierFilter({ type: "special", tier }, activeFilter)) continue;
      const timeStr = formatInZone(new Date(ev.startTime), timeZone, {
        hour: "2-digit",
        minute: "2-digit",
      });
      items.push({
        type: "special",
        label: ev.title,
        time: timeStr,
        tier,
      });
    }

    const cellWeekly = weeklyOccurrences
      .filter((occ) => isSameLocalDay(occ.startTime, cell.date))
      .filter((occ) => {
        const tier = seriesById.get(occ.seriesId)?.tier ?? "weekly";
        return matchesTierFilter({ type: "weekly", tier }, activeFilter);
      });
    for (const occ of cellWeekly) {
      const timeStr = formatInZone(occ.startTime, timeZone, {
        hour: "2-digit",
        minute: "2-digit",
      });
      items.push({
        type: "weekly",
        label: occ.title,
        time: timeStr,
        tier: seriesById.get(occ.seriesId)?.tier ?? "weekly",
      });
    }

    return items;
  };

  const maxConcreteItemsPerDay = 4;

  return (
    <section
      className="flex flex-col gap-3 opacity-0 animate-fade-in-up delay-75 flex-1 min-h-0"
      data-testid="calendar-month-view"
    >

      {/* Preparación: cadencia + duración por tier (señal primaria, no se materializa) */}
      {intervalSummaries.length > 0 && (
        <div
          className="flex flex-wrap gap-2 bg-white/[0.02] border border-white/10 rounded-xl p-3"
          data-testid="calendar-month-patterns"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted flex items-center mr-1">
            Preparación:
          </span>
          {intervalSummaries.map((sum, idx) => {
            const tc = tierStyle(sum.tier || "");
            const tierSeries = intervalSeriesByTier.get(sum.tier || "") ?? [];
            const tracks = tierSeries.length;
            const duration = tierSeries[0]?.durationMin ?? 0;
            return (
              <button
                key={idx}
                type="button"
                data-testid={`calendar-month-interval-${idx}`}
                onClick={() => onTierClick?.(sum.tier as CalendarFilter)}
                className="text-[9px] font-bold px-2 py-0.5 rounded border leading-none cursor-pointer text-left"
                style={{ color: tc.text, background: tc.bg, border: `1px solid ${tc.border}` }}
                title={`${cadenceLabel(tierSeries[0]?.recurrence.intervalMinutes)} · ${duration}m · ${tracks} pista(s)`}
              >
                {tc.text === "#f5f5f5" ? sum.tier : ""}
                {tierLabelShort(sum.tier)} · {cadenceLabel(tierSeries[0]?.recurrence.intervalMinutes)} · {duration}m
                {tracks > 1 ? ` · ${tracks} pistas` : ""}
              </button>
            );
          })}
        </div>
      )}

      <div className="border border-white/10 rounded-xl bg-white/[0.01] backdrop-blur-sm w-full flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.02] text-center text-[10px] sm:text-xs font-bold text-vantare-textMuted py-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="truncate">
              {day}
            </div>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
        <div className="grid grid-cols-7 bg-white/5 gap-[1px] h-full auto-rows-fr">
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
                <div className="flex justify-between items-center mb-1">
                  <span
                    data-testid={`calendar-month-cell-day-${idx}`}
                    className={[
                      "text-[10px] sm:text-xs font-bold",
                      isToday ? "text-vantare-red-400 font-extrabold" : "text-vantare-textMuted",
                    ].join(" ")}
                  >
                    {formatInZone(cell.date, timeZone, { day: "numeric" })}
                  </span>
                </div>

                <div className="flex-1 flex flex-col gap-1 overflow-hidden justify-start">
                  {visibleConcrete.map((item, itemIdx) => {
                    const tc = item.type === "special" ? tierStyle("special") : tierStyle(item.tier || "");
                    return (
                      <div
                        key={`concrete-${itemIdx}`}
                        data-testid={`calendar-cell-event-${idx}-${itemIdx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.type === "special") {
                            onFilterSelect?.("special");
                          } else {
                            onTierClick?.(item.tier as CalendarFilter);
                          }
                        }}
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
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </section>
  );
}

function tierLabelShort(tier: string): string {
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
