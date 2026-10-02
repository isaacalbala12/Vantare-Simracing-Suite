import type { CalendarReminderPayload } from "../../calendar/calendar-types";
import { useI18n } from "../../i18n/I18nProvider";
import { Chip } from "../../ui/orbit/Chip";
import { formatMessage } from "../orbit/format-message";
import "../../styles/orbit.tokens.css";
import "../../styles/orbit-kit.css";

type Props = {
  reminder: CalendarReminderPayload;
  onClose: () => void;
};

export function CalendarReminderBanner({ reminder, onClose }: Props) {
  const { t } = useI18n();

  return (
    <div
      role="alert"
      data-testid="calendar-reminder-banner"
      className="fixed top-16 right-4 z-50 max-w-sm w-full"
    >
      <div className="rounded-orbit overflow-hidden border border-orbit-line bg-orbit-surface-1 shadow-2xl shadow-black/50">
        <div className="relative p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Chip tone="accent" className="mb-2">
                {t("calendar.reminder.eyebrow")}
              </Chip>
              <h3 className="font-display font-bold text-base text-orbit-ink truncate">
                {reminder.title}
              </h3>
              {reminder.track && (
                <p className="text-xs text-orbit-ink-3 mt-0.5">
                  {reminder.track}
                </p>
              )}
              <p className="text-xs font-semibold text-orbit-coral mt-1">
                {formatMessage(t("calendar.reminder.minutesLeft"), {
                  minutes: reminder.minutesLeft,
                })}
              </p>
            </div>

            <button
              type="button"
              aria-label={t("calendar.reminder.close")}
              onClick={onClose}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-orbit-ink-3 hover:text-orbit-ink"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {reminder.registrationUrl && (
            <div className="mt-3 pt-3 border-t border-orbit-line">
              <a
                href={reminder.registrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="orbit-btn orbit-btn--primary orbit-btn--sm w-full justify-center"
              >
                <span className="orbit-btn__label">
                  {t("calendar.reminder.openRegistration")}
                </span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
