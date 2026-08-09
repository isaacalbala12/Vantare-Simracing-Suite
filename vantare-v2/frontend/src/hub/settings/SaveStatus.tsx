import { useI18n } from "../../i18n/I18nProvider";
import type { SettingsSaveStatus } from "./useAppSettings";

/**
 * Save feedback, rendered next to the control that triggers it. Every section
 * that writes settings shows its own copy: the status used to live once at the
 * foot of the page, so toggling something in one tab reported it somewhere the
 * user was not looking.
 */
export function SaveStatus({ status }: { status: SettingsSaveStatus }) {
  const { t } = useI18n();
  if (!status) {
    return null;
  }
  return (
    <span className="text-xs text-vantare-textMuted font-mono" role="status" aria-live="polite">
      {t(status === "saving" ? "settings.status.saving" : "settings.status.saved")}
    </span>
  );
}
