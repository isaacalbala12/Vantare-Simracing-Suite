import type { CalendarReminderPayload } from "../calendar/calendar-types";

type Props = {
  reminder: CalendarReminderPayload;
  onClose: () => void;
  className?: string;
};

export function OverlayCalendarReminderBanner({
  reminder,
  onClose,
  className = "",
}: Props) {
  return (
    <div
      role="alert"
      data-testid="overlay-calendar-reminder-banner"
      className={className}
    >
      <div className="glass-panel rounded-xl overflow-hidden border border-vantare-red-900/30 shadow-2xl shadow-black/50">
        <div className="relative p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] bg-vantare-red-950 text-vantare-red-400 border border-vantare-red-900/50 font-bold uppercase px-2 py-0.5 rounded tracking-widest inline-block shadow-lg mb-2">
                Próxima carrera
              </span>
              <h3 className="font-display font-bold text-base text-white truncate">
                {reminder.title}
              </h3>
              {reminder.track && (
                <p className="text-xs text-vantare-textMuted mt-0.5">
                  {reminder.track}
                </p>
              )}
              <p className="text-xs font-semibold text-vantare-red-400 mt-1">
                Faltan {reminder.minutesLeft} min
              </p>
            </div>

            <button
              type="button"
              aria-label="Cerrar recordatorio"
              onClick={onClose}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-vantare-textMuted hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {reminder.registrationUrl && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <a
                href={reminder.registrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full inline-flex items-center justify-center px-4 py-2 rounded-lg font-bold text-xs text-white shadow-lg shadow-vantare-red-900/20"
              >
                Abrir registro
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
