import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { formatMonthTitle } from "../../calendar/calendar-view-math";

// The month grid keeps the long view for special weekends; "upcoming" answers
// the question a driver actually asks, which is what starts next.
export type CalendarView = "month" | "upcoming" | "timeline";

export type CalendarFilter = "all" | "beginner" | "intermediate" | "advanced" | "weekly" | "special";

export type CalendarToolbarProps = {
  view: CalendarView;
  anchorDate: Date;
  activeFilter: CalendarFilter;
  onViewChange: (view: CalendarView) => void;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onFilterChange: (filter: CalendarFilter) => void;
};

export function CalendarToolbar({
  view,
  anchorDate,
  activeFilter,
  onViewChange,
  onToday,
  onPrevious,
  onNext,
  onFilterChange,
}: CalendarToolbarProps) {
  const getTitle = () => {
    if (view === "upcoming") {
      return "Próximas salidas";
    }
    if (view === "timeline") {
      return "Parrilla del día";
    }
    return formatMonthTitle(anchorDate);
  };

  const title = getTitle();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const toggleFilters = useCallback(() => {
    if (!filtersOpen && toggleRef.current) {
      const rect = toggleRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setFiltersOpen((prev) => !prev);
  }, [filtersOpen]);
  // Close dropdown on click outside
  useEffect(() => {
    if (!filtersOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (toggleRef.current && !toggleRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filtersOpen]);

  const filters: { id: CalendarFilter; label: string; dot: string; cssColor: string }[] = [
    { id: "all", label: "Todas", dot: "bg-white", cssColor: "#ffffff" },
    { id: "beginner", label: "Bronce", dot: "bg-amber-500", cssColor: "#f59e0b" },
    { id: "intermediate", label: "Plata", dot: "bg-slate-400", cssColor: "#94a3b8" },
    { id: "advanced", label: "Oro", dot: "bg-yellow-500", cssColor: "#eab308" },
    { id: "weekly", label: "Semanal", dot: "bg-[#ff3b3b]", cssColor: "#ff3b3b" },
    { id: "special", label: "Especial", dot: "bg-[#f59e0b]", cssColor: "#f59e0b" },
  ];

  const views: { id: CalendarView; label: string }[] = [
    { id: "upcoming", label: "Próximas" },
    { id: "timeline", label: "Timeline" },
    { id: "month", label: "Mes" },
  ];

  return (
    <div
      className="glass-panel rounded-xl p-3 flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-3 w-full"
      data-testid="calendar-toolbar"
    >
      {/* Navigation arrows + Title */}
      <div className="flex items-center gap-2 min-w-0 shrink">
        <button
          type="button"
          onClick={onPrevious}
          data-testid="calendar-nav-prev"
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Anterior"
        >
          <svg className="w-4 h-4 text-vantare-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onToday}
          data-testid="calendar-nav-today"
          className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[.18em] text-vantare-textMuted hover:text-white hover:bg-white/5 transition-colors"
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={onNext}
          data-testid="calendar-nav-next"
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Siguiente"
        >
          <svg className="w-4 h-4 text-vantare-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <h2 className="text-sm font-bold text-white tracking-tight ml-2 truncate min-w-0" data-testid="calendar-toolbar-title">
          {title}
        </h2>
      </div>

      {/* View switcher + Filter dropdown */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        {/* View switcher */}
        <div
          className="flex gap-1 glass-panel rounded-xl p-1.5"
          role="group"
          aria-label="Vista de calendario"
        >
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              data-testid={`calendar-view-${v.id}`}
              onClick={() => onViewChange(v.id)}
              className={[
                "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[.18em] transition-colors",
                view === v.id
                  ? "bg-vantare-red-500/20 text-accent"
                  : "text-vantare-textMuted hover:text-white hover:bg-white/5",
              ].join(" ")}
              aria-pressed={view === v.id}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Filter dropdown */}
        <div className="relative">
          <button
            ref={toggleRef}
            type="button"
            onClick={toggleFilters}
            data-testid="calendar-filter-toggle"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[.18em] glass-panel hover:bg-white/5 transition-colors"
            aria-haspopup="true"
            aria-expanded={filtersOpen}
          >
            <span className="w-2 h-2 rounded-full" style={{
              background: filters.find((f) => f.id === activeFilter)?.cssColor ?? "#fff"
            }} />
            {filters.find((f) => f.id === activeFilter)?.label ?? "Todas"}
            <svg className="w-3 h-3 text-vantare-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {filtersOpen && menuPos && createPortal(
            <div
              className="glass-panel rounded-xl p-1.5 min-w-[140px] shadow-xl"
              style={{ position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
              role="menu"
              aria-label="Filtros de calendario"
              data-testid="calendar-filter-menu"
            >
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="menuitem"
                  data-testid={`calendar-filter-${f.id}`}
                  onClick={() => {
                    onFilterChange(f.id);
                    setFiltersOpen(false);
                  }}
                  className={[
                    "flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[.18em] transition-colors text-left",
                    activeFilter === f.id
                      ? "bg-vantare-red-500/15 text-accent"
                      : "text-vantare-textMuted hover:text-white hover:bg-white/5",
                  ].join(" ")}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: f.cssColor }} />
                  {f.label}
                </button>
              ))}
            </div>,
            document.body,
          )}
        </div>
      </div>
    </div>
  );
}
