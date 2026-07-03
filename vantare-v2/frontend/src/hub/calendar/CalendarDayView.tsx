import { useEffect, useState } from "react";
import {
  expandWeeklySlots,
  getDailyPatternSummary,
  isSameLocalDay,
  startOfLocalDay,
  type CalendarOccurrence,
  type DailyPatternSummary,
} from "../../calendar/calendar-view-math";
import type { Calendar, RaceEvent } from "../../calendar/calendar-types";

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

export type CalendarDayViewProps = {
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

function getEventColorClass(type: "weekly" | "special"): {
  border: string;
  bg: string;
  text: string;
} {
  if (type === "special") {
    return {
      border: "border-amber-500/30",
      bg: "bg-amber-500/5",
      text: "text-amber-200",
    };
  }
  return {
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    text: "text-red-200",
  };
}

export function CalendarDayView({ anchorDate, calendar }: CalendarDayViewProps) {
  const [now, setNow] = useState(new Date());

  // Update current time periodically for live line and indicators
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // 1. Check if selected day is today
  const isToday = isSameLocalDay(anchorDate, now);

  // 2. Expand weekly-slots for the selected day range
  const dayStart = startOfLocalDay(anchorDate);
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const weeklyOccurrences: CalendarOccurrence[] = (calendar.series || []).flatMap((s) =>
    expandWeeklySlots(s, dayStart, dayEnd)
  );

  // 3. Build daily pattern summary for interval series
  const intervalSummaries: DailyPatternSummary[] = getDailyPatternSummary(calendar.series || []);

  // 4. Gather concrete events (special & weekly-slots)
  const cellSpecial = (calendar.events || []).filter((ev: RaceEvent) => {
    // Avoid listing interval series events as concrete
    const associatedSeries = (calendar.series || []).find((s) => s.id === ev.series);
    if (associatedSeries && associatedSeries.recurrence?.kind === "interval") {
      return false;
    }
    return isSameLocalDay(new Date(ev.startTime), anchorDate);
  });

  const concreteItems = [
    ...cellSpecial.map((ev) => ({
      id: ev.id,
      type: "special" as const,
      label: ev.title,
      track: ev.track,
      durationMin: ev.durationMin,
      startTime: new Date(ev.startTime),
    })),
    ...weeklyOccurrences.map((occ) => ({
      id: `${occ.seriesId}-${occ.startTime.getTime()}`,
      type: "weekly" as const,
      label: occ.title,
      track: (calendar.series || []).find((s) => s.id === occ.seriesId)?.track || "",
      durationMin: occ.durationMin,
      startTime: occ.startTime,
    })),
  ].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // 5. Group by start hour
  const eventsByHour: Record<number, typeof concreteItems> = {};
  for (let h = 0; h < 24; h++) {
    eventsByHour[h] = [];
  }
  for (const item of concreteItems) {
    const h = item.startTime.getHours();
    eventsByHour[h].push(item);
  }

  // Formatting date header
  const weekday = SPANISH_WEEKDAYS[anchorDate.getDay()];
  const dayNum = anchorDate.getDate();
  const month = SPANISH_MONTHS[anchorDate.getMonth()];
  const year = anchorDate.getFullYear();
  const formattedDate = `${weekday} ${dayNum} ${month} ${year}`;

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Hours array for vertical axis (24 hours)
  const hours = Array.from({ length: 24 }, (_, i) => i);

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
              · {concreteItems.length} {concreteItems.length === 1 ? "carrera programada" : "carreras programadas"}
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

      {/* Patrones de series diarias (siempre visibles, no se ven afectados por el cap) */}
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
          intervalSummaries.map((sum, idx) => (
            <div
              key={idx}
              data-testid={`calendar-day-interval-${idx}`}
              className={[
                "text-[9px] font-bold px-2 py-0.5 rounded border leading-none",
                getTierColorClass(sum.tier),
              ].join(" ")}
            >
              {getTierDisplay(sum.tier)} · {sum.label}
            </div>
          ))
        )}
      </div>

      {/* Timeline view */}
      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] backdrop-blur-sm w-full">
        <div
          className="max-h-[640px] overflow-y-auto"
          style={{ scrollbarWidth: "thin" }}
        >
          <div className="flex flex-col bg-white/5 gap-[1px]">
            {hours.map((h) => {
              const isNowHour = isToday && h === now.getHours();
              const hourEvents = eventsByHour[h] || [];
              const visibleEvents = hourEvents.slice(0, 2);
              const hiddenCount = hourEvents.length - visibleEvents.length;

              return (
                <div key={`line-${h}`} className="grid grid-cols-[60px_1fr] min-h-[42px] bg-[#0b0b0b] border-t border-white/[0.03] first:border-t-0">
                  {/* Gutter */}
                  <div className="p-2 font-mono text-[10px] text-vantare-textDim text-right flex items-start justify-end select-none">
                    {String(h).padStart(2, "0")}:00
                  </div>
                  {/* Track */}
                  <div className={[
                    "relative p-1 flex flex-col gap-1",
                    isNowHour ? "bg-gradient-to-r from-vantare-red-500/5 to-transparent" : "",
                  ].join(" ")}>
                    {isNowHour && (
                      <div
                        data-testid="calendar-now-line"
                        className="absolute left-0 right-0 h-[1px] bg-[#ff3b3b] shadow-[0_0_8px_rgba(255,59,59,0.6)] z-10 pointer-events-none"
                        style={{ top: `${(now.getMinutes() / 60) * 100}%` }}
                      >
                        <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-[#ff3b3b] shadow-[0_0_8px_rgba(255,59,59,0.8)]" />
                      </div>
                    )}

                    {/* Render concrete events sequentially */}
                    {visibleEvents.map((item, idx) => {
                      const colors = getEventColorClass(item.type);
                      const timeFormatted = item.startTime.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const endFormatted = new Date(
                        item.startTime.getTime() + (item.durationMin || 0) * 60000
                      ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                      return (
                        <div
                          key={item.id}
                          data-testid={`calendar-day-event-${h}-${idx}`}
                          className={[
                            "rounded border px-2 py-1 text-xs flex flex-col justify-between overflow-hidden relative z-20",
                            colors.border,
                            colors.bg,
                            colors.text,
                          ].join(" ")}
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

                    {hiddenCount > 0 && (
                      <div
                        data-testid="calendar-day-more"
                        className="text-[9px] font-bold text-vantare-textDim bg-white/5 border border-white/10 px-1.5 py-0.5 rounded leading-none w-fit mt-0.5"
                      >
                        +{hiddenCount} más
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
