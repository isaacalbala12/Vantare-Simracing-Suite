import { useCallback, useEffect, useState } from "react";
import {
  requestCalendar,
  subscribeToCalendar,
  subscribeToCalendarErrors,
} from "../../calendar/calendar-store";
import type { Calendar } from "../../calendar/calendar-types";
import { CalendarToolbar, type CalendarFilter } from "../calendar/CalendarToolbar";
import { CalendarMonthView } from "../calendar/CalendarMonthView";
import { CalendarWeekView } from "../calendar/CalendarWeekView";
import { CalendarDayView } from "../calendar/CalendarDayView";
import { CalendarRaceDetailDrawer } from "../calendar/CalendarRaceDetailDrawer";
import { CalendarRaceRail } from "../calendar/CalendarRaceRail";

export function CalendarPage() {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day">("month");
  const [calendarAnchorDate, setCalendarAnchorDate] = useState<Date>(new Date());
  const [activeFilter, setActiveFilter] = useState<CalendarFilter>("all");
  const [drawerTier, setDrawerTier] = useState<CalendarFilter | null>(null);

  useEffect(() => {
    requestCalendar();
    const unsubLoaded = subscribeToCalendar((state) => {
      if (state.kind === "loaded") {
        setCalendar(state.calendar);
        setError(null);
      }
    });
    const unsubErr = subscribeToCalendarErrors((msg) => {
      setError(msg);
    });
    return () => {
      unsubLoaded();
      unsubErr();
    };
  }, []);

  const handleToday = useCallback(() => {
    setCalendarAnchorDate(new Date());
  }, []);

  const handlePrevious = useCallback(() => {
    setCalendarAnchorDate((prev) => {
      const newDate = new Date(prev.getTime());
      if (calendarView === "month") {
        const day = prev.getDate();
        newDate.setDate(1);
        newDate.setMonth(newDate.getMonth() - 1);
        const lastDayOfNewMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
        newDate.setDate(Math.min(day, lastDayOfNewMonth));
      } else if (calendarView === "week") {
        newDate.setDate(newDate.getDate() - 7);
      } else {
        newDate.setDate(newDate.getDate() - 1);
      }
      return newDate;
    });
  }, [calendarView]);

  const handleNext = useCallback(() => {
    setCalendarAnchorDate((prev) => {
      const newDate = new Date(prev.getTime());
      if (calendarView === "month") {
        const day = prev.getDate();
        newDate.setDate(1);
        newDate.setMonth(newDate.getMonth() + 1);
        const lastDayOfNewMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
        newDate.setDate(Math.min(day, lastDayOfNewMonth));
      } else if (calendarView === "week") {
        newDate.setDate(newDate.getDate() + 7);
      } else {
        newDate.setDate(newDate.getDate() + 1);
      }
      return newDate;
    });
  }, [calendarView]);

  const handleFilterSelect = useCallback((filter: CalendarFilter) => {
    setActiveFilter(filter);
    setDrawerTier(filter);
  }, []);

  const handleClearFilter = useCallback(() => {
    setActiveFilter("all");
    setDrawerTier(null);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerTier(null);
  }, []);

  const hasSeries = calendar ? calendar.series && calendar.series.length > 0 : false;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-6">
      {/* SIDEBAR */}
      <aside className="flex flex-col gap-5">
        <CalendarRaceRail activeFilter={activeFilter} onSelectTier={handleFilterSelect} />
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex flex-col gap-5">
        {/* Page header */}
        <div className="opacity-0 animate-fade-in-up">
          <span className="v52-eyebrow" style={{ fontSize: "10px" }}>Carreras</span>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">Carreras LMU</h1>
          <p className="text-xs text-vantare-textMuted mt-1">
            Calendario oficial Le Mans Ultimate · datos reales
          </p>
        </div>

        {/* Calendar Toolbar */}
        <div className="opacity-0 animate-fade-in-up delay-75">
          <CalendarToolbar
            view={calendarView}
            anchorDate={calendarAnchorDate}
            activeFilter={activeFilter}
            onViewChange={setCalendarView}
            onToday={handleToday}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onFilterChange={setActiveFilter}
          />
        </div>

        {activeFilter !== "all" && (
          <div
            className="flex items-center gap-3 opacity-0 animate-fade-in-up delay-100"
            data-testid="calendar-active-filter"
          >
            <span className="text-xs text-vantare-textMuted">
              Filtrando por:
              <span className="text-white font-semibold ml-1 capitalize">
                {activeFilter === "beginner" && "Bronce"}
                {activeFilter === "intermediate" && "Plata"}
                {activeFilter === "advanced" && "Oro"}
                {activeFilter === "weekly" && "Semanal"}
                {activeFilter === "special" && "Especial"}
              </span>
            </span>
            <button
              type="button"
              onClick={handleClearFilter}
              data-testid="calendar-clear-filter"
              className="text-[11px] font-bold uppercase tracking-[.18em] text-accent hover:text-white transition-colors"
            >
              Quitar filtro
            </button>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 mt-3" data-testid="calendar-error">
            {error}
          </p>
        )}

        {/* Visual Calendar Grid or Placeholder */}
        {hasSeries && (
          <div className="opacity-0 animate-fade-in-up delay-75">
            {calendarView === "month" ? (
              <CalendarMonthView
                anchorDate={calendarAnchorDate}
                calendar={calendar!}
                activeFilter={activeFilter}
                onFilterSelect={handleFilterSelect}
              />
            ) : calendarView === "week" ? (
              <CalendarWeekView
                anchorDate={calendarAnchorDate}
                calendar={calendar!}
                activeFilter={activeFilter}
                onFilterSelect={handleFilterSelect}
              />
            ) : (
              <CalendarDayView
                anchorDate={calendarAnchorDate}
                calendar={calendar!}
                activeFilter={activeFilter}
                onFilterSelect={handleFilterSelect}
              />
            )}
          </div>
        )}

        {drawerTier && calendar && (
          <CalendarRaceDetailDrawer
            tier={drawerTier}
            calendar={calendar}
            anchorDate={calendarAnchorDate}
            onClose={handleCloseDrawer}
            onClearFilter={handleClearFilter}
          />
        )}

        {/* Footer/Nota honesta */}
        <div className="flex items-center justify-center opacity-0 animate-fade-in-up delay-600">
          <span className="font-mono text-xs text-[#f5f5f5]/35 uppercase tracking-[.22em] flex items-center gap-4">
            <span className="w-6 h-px bg-[#f5f5f5]/12"></span>
            v0.1 · Calendario LMU
            <span className="w-6 h-px bg-[#f5f5f5]/12"></span>
          </span>
        </div>
      </main>
    </div>
  );
}
