import {
  buildMonthGrid,
  expandWeeklySlots,
  getDailyPatternSummary,
  isSameLocalDay,
  type CalendarDayCell,
  type CalendarOccurrence,
  type DailyPatternSummary,
} from "../../calendar/calendar-view-math";
import type { Calendar, RaceEvent } from "../../calendar/calendar-types";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export type CalendarMonthViewProps = {
  anchorDate: Date;
  calendar: Calendar;
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

function getTierColorClass(tier: string): string {
  switch (tier) {
    case "beginner":
      return "text-amber-500 bg-amber-500/5 border-amber-500/10";
    case "intermediate":
      return "text-slate-400 bg-slate-400/5 border-slate-400/10";
    case "advanced":
      return "text-yellow-400 bg-yellow-400/5 border-yellow-400/10";
    case "weekly":
      return "text-cyan-400 bg-cyan-400/5 border-cyan-400/10";
    default:
      return "text-white bg-white/5 border-white/10";
  }
}

export function CalendarMonthView({ anchorDate, calendar }: CalendarMonthViewProps) {
  // 1. Build grid cells (42 cells)
  const cells = buildMonthGrid(anchorDate);

  // 2. Expand weekly-slots in the grid range
  const gridStart = cells[0].date;
  const gridEnd = new Date(cells[41].date.getTime() + 86400000); // end of grid

  const weeklyOccurrences: CalendarOccurrence[] = (calendar.series || []).flatMap((s) =>
    expandWeeklySlots(s, gridStart, gridEnd)
  );

  // 3. Build daily pattern summary for interval series
  const intervalSummaries: DailyPatternSummary[] = getDailyPatternSummary(calendar.series || []);

  const getCellConcreteItems = (cell: CalendarDayCell) => {
    const items: {
      type: "weekly" | "special";
      label: string;
      tier?: string;
      time?: string;
    }[] = [];

    // 1. Add materialized special events
    const cellSpecial = (calendar.events || []).filter((ev: RaceEvent) => {
      // Avoid listing interval series events (as requested: "No listar interval series como eventos concretos")
      const associatedSeries = (calendar.series || []).find((s) => s.id === ev.series);
      if (associatedSeries && associatedSeries.recurrence?.kind === "interval") {
        return false;
      }
      return isSameLocalDay(new Date(ev.startTime), cell.date);
    });

    for (const ev of cellSpecial) {
      const dateObj = new Date(ev.startTime);
      const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      items.push({
        type: "special",
        label: ev.title,
        time: timeStr,
        tier: (calendar.series || []).find((s) => s.id === ev.series)?.tier,
      });
    }

    // 2. Add weekly slots occurrences
    const cellWeekly = weeklyOccurrences.filter((occ) => isSameLocalDay(occ.startTime, cell.date));
    for (const occ of cellWeekly) {
      const timeStr = occ.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      items.push({
        type: "weekly",
        label: occ.title,
        time: timeStr,
        tier: (calendar.series || []).find((s) => s.id === occ.seriesId)?.tier,
      });
    }

    return items;
  };

  const maxConcreteItemsPerDay = 3;

  return (
    <section className="flex flex-col gap-3 opacity-0 animate-fade-in-up delay-75" data-testid="calendar-month-view">
      {/* Visual month header */}
      <div className="flex flex-col">
        <span className="v52-eyebrow">Vista mensual</span>
      </div>

      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] backdrop-blur-sm w-full">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.02] text-center text-[10px] sm:text-xs font-bold text-vantare-textMuted py-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="truncate">
              {day}
            </div>
          ))}
        </div>

        {/* 42 grid cells */}
        <div className="grid grid-cols-7 bg-white/5 gap-[1px]">
          {cells.map((cell, idx) => {
            const concreteItems = getCellConcreteItems(cell);
            const visibleConcrete = concreteItems.slice(0, maxConcreteItemsPerDay - 1);
            const remainingCount = concreteItems.length - visibleConcrete.length;
            const hasMore = remainingCount > 0;

            const isCurrentMonth = cell.inCurrentMonth;
            const isToday = cell.isToday;

            return (
              <div
                key={idx}
                data-testid={`calendar-month-cell-${idx}`}
                className={[
                  "min-h-[90px] sm:min-h-[110px] p-1.5 sm:p-2.5 flex flex-col justify-between transition-colors",
                  isCurrentMonth ? "bg-[#0b0b0b]" : "bg-[#060606] opacity-35",
                  isToday ? "border border-vantare-red-500/50 bg-vantare-red-500/5" : "border border-transparent",
                  "hover:bg-[#141414]",
                ].join(" ")}
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

                {/* Cell items (events/summaries) */}
                <div className="flex-1 flex flex-col gap-1 overflow-hidden justify-start">
                  {/* Fixed Pattern Summaries */}
                  {intervalSummaries.map((sum, sumIdx) => (
                    <div
                      key={`interval-${sumIdx}`}
                      data-testid={`calendar-cell-interval-${idx}-${sumIdx}`}
                      className={[
                        "text-[8px] sm:text-[9px] font-bold px-1 py-0.5 rounded border leading-none truncate shrink-0",
                        getTierColorClass(sum.tier || ""),
                      ].join(" ")}
                    >
                      {getTierDisplay(sum.tier)} {sum.label.toLowerCase()}
                    </div>
                  ))}

                  {/* Concrete Events */}
                  {(hasMore ? visibleConcrete : concreteItems).map((item, itemIdx) => {
                    const borderClass = item.type === "special" ? "border-vantare-red-500/30" : "border-white/10";
                    const bgClass = item.type === "special" ? "bg-vantare-red-500/5" : "bg-white/5";
                    const textClass = item.type === "special" ? "text-vantare-red-200" : "text-white";

                    return (
                      <div
                        key={`concrete-${itemIdx}`}
                        data-testid={`calendar-cell-event-${idx}-${itemIdx}`}
                        className={[
                          "text-[8px] sm:text-[9px] px-1 py-0.5 rounded border leading-none flex items-center justify-between gap-1 truncate shrink-0",
                          borderClass,
                          bgClass,
                          textClass,
                        ].join(" ")}
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
                      className="text-[8px] sm:text-[9px] text-vantare-textDim italic font-semibold pl-1 leading-none mt-0.5 shrink-0"
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
    </section>
  );
}
