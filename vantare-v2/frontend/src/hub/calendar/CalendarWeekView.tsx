import {
  buildWeekRange,
  expandWeeklySlots,
  getDailyPatternSummary,
  isSameLocalDay,
  type CalendarOccurrence,
  type DailyPatternSummary,
} from "../../calendar/calendar-view-math";
import type { Calendar, RaceEvent } from "../../calendar/calendar-types";

const SHORT_WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type CalendarWeekViewProps = {
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

export function CalendarWeekView({ anchorDate, calendar }: CalendarWeekViewProps) {
  // 1. Build week range (7 days)
  const days = buildWeekRange(anchorDate);

  // 2. Expand weekly-slots in the week range
  const gridStart = days[0];
  const gridEnd = new Date(days[6].getTime() + 86400000); // end of Sunday

  const weeklyOccurrences: CalendarOccurrence[] = (calendar.series || []).flatMap((s) =>
    expandWeeklySlots(s, gridStart, gridEnd)
  );

  // 3. Build daily pattern summary for interval series
  const intervalSummaries: DailyPatternSummary[] = getDailyPatternSummary(calendar.series || []);

  const getCellConcreteItems = (cellDate: Date) => {
    const items: {
      type: "weekly" | "special";
      label: string;
      tier?: string;
      time?: string;
      startTime: Date;
    }[] = [];

    // 1. Add materialized special events
    const cellSpecial = (calendar.events || []).filter((ev: RaceEvent) => {
      // Avoid listing interval series events
      const associatedSeries = (calendar.series || []).find((s) => s.id === ev.series);
      if (associatedSeries && associatedSeries.recurrence?.kind === "interval") {
        return false;
      }
      return isSameLocalDay(new Date(ev.startTime), cellDate);
    });

    for (const ev of cellSpecial) {
      const dateObj = new Date(ev.startTime);
      const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      items.push({
        type: "special",
        label: ev.title,
        time: timeStr,
        tier: (calendar.series || []).find((s) => s.id === ev.series)?.tier,
        startTime: dateObj,
      });
    }

    // 2. Add weekly slots occurrences
    const cellWeekly = weeklyOccurrences.filter((occ) => isSameLocalDay(occ.startTime, cellDate));
    for (const occ of cellWeekly) {
      const timeStr = occ.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      items.push({
        type: "weekly",
        label: occ.title,
        time: timeStr,
        tier: (calendar.series || []).find((s) => s.id === occ.seriesId)?.tier,
        startTime: occ.startTime,
      });
    }

    // Sort by startTime
    return items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  };

  const maxConcrete = 3;

  return (
    <section className="flex flex-col gap-3 opacity-0 animate-fade-in-up delay-75" data-testid="calendar-week-view">
      {/* Visual week header */}
      <div className="flex flex-col">
        <span className="v52-eyebrow">Vista semanal</span>
      </div>

      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] backdrop-blur-sm w-full">
        {/* 7 columns */}
        <div className="grid grid-cols-7 bg-white/5 gap-[1px]">
          {days.map((dayDate, idx) => {
            const isToday = isSameLocalDay(dayDate, new Date());
            const weekdayIndex = (dayDate.getDay() + 6) % 7;
            const weekdayName = SHORT_WEEKDAYS[weekdayIndex];
            const concreteItems = getCellConcreteItems(dayDate);

            const hasMore = concreteItems.length > maxConcrete;
            const visibleConcrete = hasMore ? concreteItems.slice(0, maxConcrete - 1) : concreteItems;
            const remainingCount = concreteItems.length - visibleConcrete.length;

            return (
              <div
                key={idx}
                data-testid={`calendar-week-column-${idx}`}
                className={[
                  "min-h-[220px] pb-3 flex flex-col justify-start transition-colors",
                  isToday ? "bg-vantare-red-500/[0.04]" : "bg-[#0b0b0b]",
                  "hover:bg-[#141414]",
                ].join(" ")}
              >
                {/* Column header */}
                <div
                  data-testid={`calendar-week-header-${idx}`}
                  className={[
                    "flex flex-col items-center justify-center p-3 border-b border-white/10 mb-2.5",
                    isToday ? "bg-vantare-red-500/10" : "bg-white/[0.02]",
                  ].join(" ")}
                >
                  <span className="text-[10px] font-bold uppercase tracking-[.22em] text-vantare-textMuted">
                    {weekdayName}
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

                {/* Column body (events/summaries) */}
                <div className="flex-1 flex flex-col gap-1.5 px-2 overflow-hidden justify-start">
                  {/* Fixed Pattern Summaries */}
                  {intervalSummaries.map((sum, sumIdx) => (
                    <div
                      key={`interval-${sumIdx}`}
                      data-testid={`calendar-week-interval-${idx}-${sumIdx}`}
                      className={[
                        "text-[9px] font-bold px-1.5 py-1 rounded border leading-none truncate shrink-0",
                        getTierColorClass(sum.tier || ""),
                      ].join(" ")}
                    >
                      {getTierDisplay(sum.tier)} · {sum.label}
                    </div>
                  ))}

                  {/* Concrete Events */}
                  {visibleConcrete.map((item, itemIdx) => {
                    const borderClass = item.type === "special" ? "border-vantare-red-500/30" : "border-white/10";
                    const bgClass = item.type === "special" ? "bg-vantare-red-500/5" : "bg-white/5";
                    const textClass = item.type === "special" ? "text-vantare-red-200" : "text-white";

                    return (
                      <div
                        key={`concrete-${itemIdx}`}
                        data-testid={`calendar-week-event-${idx}-${itemIdx}`}
                        className={[
                          "text-[9px] px-1.5 py-1 rounded border leading-none flex items-center justify-between gap-1 truncate shrink-0",
                          borderClass,
                          bgClass,
                          textClass,
                        ].join(" ")}
                        title={item.label}
                      >
                        <span className="truncate flex-1 font-semibold">{item.label}</span>
                        {item.time && (
                          <span className="text-[8px] text-vantare-textDim font-mono shrink-0">
                            {item.time}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {hasMore && (
                    <div
                      data-testid={`calendar-week-more-${idx}`}
                      className="text-[9px] text-vantare-textDim italic font-semibold pl-1.5 leading-none mt-0.5 shrink-0"
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
