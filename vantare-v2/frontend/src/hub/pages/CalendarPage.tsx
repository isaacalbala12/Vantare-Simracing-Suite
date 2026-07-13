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
import { CalendarRaceDetailPanel } from "../calendar/CalendarRaceDetailPanel";
import { CalendarRaceRail } from "../calendar/CalendarRaceRail";

export function CalendarPage() {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day">("month");
  const [calendarAnchorDate, setCalendarAnchorDate] = useState<Date>(new Date());
  const [activeFilter, setActiveFilter] = useState<CalendarFilter>("all");
  const [panelTier, setPanelTier] = useState<CalendarFilter | null>(null);

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

  const handleNavigate = useCallback((delta: number) => {
    setCalendarAnchorDate((prev) => {
      const newDate = new Date(prev.getTime());
      if (calendarView === "month") {
        newDate.setDate(1);
        newDate.setMonth(newDate.getMonth() + delta);
      } else if (calendarView === "week") {
        newDate.setDate(newDate.getDate() + 7 * delta);
      } else {
        newDate.setDate(newDate.getDate() + delta);
      }
      return newDate;
    });
  }, [calendarView]);

  // Filtering never opens the detail panel — only an explicit tier click does.
  const handleFilterSelect = useCallback((filter: CalendarFilter) => {
    setActiveFilter(filter);
  }, []);

  const handleOpenPanel = useCallback((tier: CalendarFilter) => {
    setPanelTier(tier);
  }, []);

  const handleClearFilter = useCallback(() => {
    setActiveFilter("all");
    setPanelTier(null);
  }, []);

  const handleDayClick = useCallback((date: Date) => {
    setCalendarAnchorDate(date);
    setCalendarView("day");
  }, []);

  const handleClosePanel = useCallback(() => {
    setPanelTier(null);
  }, []);

  const timeZone = calendar?.timezone ?? "UTC";
  const loading = calendar === null && error === null;
  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-6 items-stretch">
      {/* SIDEBAR */}
      <aside className="sticky top-5 max-h-[calc(100vh-6rem)] flex flex-col gap-5 overflow-y-auto pt-1" style={{ scrollbarWidth: "thin" }}>
        <CalendarRaceRail calendar={calendar} activeFilter={activeFilter} onSelectTier={handleOpenPanel} />
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex flex-col min-h-0">
        {/* Page header */}
        <div className="flex-none opacity-0 animate-fade-in-up">
          <span className="v52-eyebrow" style={{ fontSize: "10px" }}>Carreras</span>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">Carreras LMU</h1>
          <p className="text-xs text-vantare-textMuted mt-1">
            Calendario oficial Le Mans Ultimate · datos reales
          </p>
        </div>

        {/* Calendar Toolbar */}
        <div className="flex-none opacity-0 animate-fade-in-up delay-75">
          <CalendarToolbar
            view={calendarView}
            anchorDate={calendarAnchorDate}
            activeFilter={activeFilter}
            timeZone={timeZone}
            onViewChange={setCalendarView}
            onToday={handleToday}
            onPrevious={() => handleNavigate(-1)}
            onNext={() => handleNavigate(1)}
            onFilterChange={setActiveFilter}
          />
        </div>

        {/* Active filter indicator */}
        {activeFilter !== "all" && (
          <div
            className="flex-none flex items-center gap-3 opacity-0 animate-fade-in-up delay-100"
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
          <p className="flex-none text-xs text-red-400 mt-3" data-testid="calendar-error">
            {error}
          </p>
        )}

        {/* Calendar Grid */}
        {loading && (
          <div
            className="flex-1 min-h-0 flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.01]"
            data-testid="calendar-loading"
          >
            <p className="text-sm font-semibold text-white">Cargando calendario LMU…</p>
          </div>
        )}

        {calendar && (
          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto opacity-0 animate-fade-in-up delay-75" style={{ scrollbarWidth: "thin" }}>
            {calendarView === "month" && (
              <CalendarMonthView
                anchorDate={calendarAnchorDate}
                calendar={calendar}
                timeZone={timeZone}
                activeFilter={activeFilter}
                onFilterSelect={handleFilterSelect}
                onTierClick={handleOpenPanel}
                onDayClick={handleDayClick}
              />
            )}
            {calendarView === "week" && (
              <CalendarWeekView
                anchorDate={calendarAnchorDate}
                calendar={calendar}
                timeZone={timeZone}
                activeFilter={activeFilter}
                onFilterSelect={handleFilterSelect}
                onTierClick={handleOpenPanel}
              />
            )}
            {calendarView === "day" && (
              <CalendarDayView
                anchorDate={calendarAnchorDate}
                calendar={calendar}
                timeZone={timeZone}
                activeFilter={activeFilter}
                onFilterSelect={handleFilterSelect}
                onTierClick={handleOpenPanel}
              />
            )}
          </div>
        )}

        {/* Detail panel */}
        {panelTier && calendar && (
          <CalendarRaceDetailPanel
            tier={panelTier}
            calendar={calendar}
            timeZone={timeZone}
            onClose={handleClosePanel}
          />
        )}
        {/* Footer */}
        <div className="flex-none flex items-center justify-center opacity-0 animate-fade-in-up delay-600">
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
