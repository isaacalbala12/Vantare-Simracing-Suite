import { buildWeekRange, formatMonthTitle } from "../../calendar/calendar-view-math";

const SPANISH_MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

const SPANISH_WEEKDAYS_FULL = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"
];

export type CalendarToolbarProps = {
  view: "month" | "week" | "day";
  anchorDate: Date;
  onViewChange: (view: "month" | "week" | "day") => void;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function CalendarToolbar({
  view,
  anchorDate,
  onViewChange,
  onToday,
  onPrevious,
  onNext,
}: CalendarToolbarProps) {
  // Format title
  const getTitle = () => {
    if (view === "month") {
      return formatMonthTitle(anchorDate);
    }
    if (view === "week") {
      const weekDays = buildWeekRange(anchorDate);
      const monday = weekDays[0];
      return `Semana del ${monday.getDate()} ${SPANISH_MONTHS_SHORT[monday.getMonth()]}`;
    }
    return `${SPANISH_WEEKDAYS_FULL[anchorDate.getDay()]} ${anchorDate.getDate()} ${SPANISH_MONTHS_SHORT[anchorDate.getMonth()]}`;
  };

  const title = getTitle();

  const views: { id: "month" | "week" | "day"; label: string }[] = [
    { id: "month", label: "Mes" },
    { id: "week", label: "Semana" },
    { id: "day", label: "Día" },
  ];

  return (
    <div
      className="glass-panel rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-4 w-full"
      data-testid="calendar-toolbar"
    >
      {/* Date Navigation & Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrevious}
            className="btn-secondary p-1.5 rounded-lg text-white hover:text-white flex items-center justify-center"
            aria-label="Anterior"
            data-testid="calendar-nav-prev"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onToday}
            className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:text-white"
            data-testid="calendar-nav-today"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={onNext}
            className="btn-secondary p-1.5 rounded-lg text-white hover:text-white flex items-center justify-center"
            aria-label="Siguiente"
            data-testid="calendar-nav-next"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        <span
          className="text-base font-bold text-white tracking-tight"
          data-testid="calendar-toolbar-title"
        >
          {title}
        </span>
      </div>

      {/* View Switcher */}
      <div
        className="flex bg-white/[0.02] border border-white/10 rounded-lg p-0.5"
        role="group"
        aria-label="Vista de calendario"
      >
        {views.map((v) => {
          const isActive = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onViewChange(v.id)}
              aria-pressed={isActive}
              data-testid={`calendar-view-btn-${v.id}`}
              className={[
                "px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 border cursor-pointer",
                isActive
                  ? "bg-vantare-red-700/20 border-vantare-red-500/30 text-white shadow-[0_0_12px_rgba(255,59,59,0.15)]"
                  : "bg-transparent border-transparent text-vantare-textMuted hover:text-white hover:bg-white/5",
              ].join(" ")}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
