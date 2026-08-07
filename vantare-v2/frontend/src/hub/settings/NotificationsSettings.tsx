import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { SaveStatus } from "./SaveStatus";
import {
  requestSystemNotifications,
  systemNotificationPermission,
} from "./notification-preferences";
import type { useAppSettings } from "./useAppSettings";

type Props = {
  app: ReturnType<typeof useAppSettings>;
};

/**
 * What Vantare tells you about, and where.
 *
 * Every switch here governs a surface that exists: the update banner in the
 * shell, the toast a launch chain shows when it finishes, and the desktop
 * notification raised while the window is hidden.
 */
export function NotificationsSettings({ app }: Props) {
  const { t } = useI18n();
  const { appSettings, settingsStatus, setNotifications } = app;
  const notifications = appSettings.notifications ?? {};
  const [permission, setPermission] = useState(systemNotificationPermission);

  async function toggleSystem(wanted: boolean) {
    if (!wanted) {
      setNotifications({ systemEnabled: false });
      return;
    }
    // Asking first, and storing only what the answer allows: a switch that
    // says "on" while the system refuses to deliver is worse than no switch.
    const granted = await requestSystemNotifications();
    setPermission(systemNotificationPermission());
    setNotifications({ systemEnabled: granted });
  }

  return (
    <div className="card-sleek rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-white">
          {t("settings.notifications.title")}
        </h2>
        <SaveStatus status={settingsStatus} />
      </div>

      <div className="space-y-3">
        {/* Stored as opt-outs, shown as the plain thing: the inversion happens
            here, right next to the box, and nowhere else. */}
        <label className="flex items-center gap-3 text-sm text-vantare-textMuted cursor-pointer">
          <input
            type="checkbox"
            checked={!notifications.updatesMuted}
            onChange={(event) => setNotifications({ updatesMuted: !event.target.checked })}
            className="accent-vantare-red-500 w-4 h-4"
          />
          <span>{t("settings.notifications.updates")}</span>
        </label>

        <label className="flex items-center gap-3 text-sm text-vantare-textMuted cursor-pointer">
          <input
            type="checkbox"
            checked={!notifications.launcherMuted}
            onChange={(event) => setNotifications({ launcherMuted: !event.target.checked })}
            className="accent-vantare-red-500 w-4 h-4"
          />
          <span>{t("settings.notifications.launcher")}</span>
        </label>

        {permission === "unsupported" ? (
          <p className="text-xs text-vantare-textMuted leading-relaxed">
            {t("settings.notifications.systemUnsupported")}
          </p>
        ) : (
          <>
            <label className="flex items-center gap-3 text-sm text-vantare-textMuted cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(notifications.systemEnabled) && permission === "granted"}
                disabled={permission === "denied"}
                onChange={(event) => void toggleSystem(event.target.checked)}
                className="accent-vantare-red-500 w-4 h-4"
              />
              <span>{t("settings.notifications.system")}</span>
            </label>
            {permission === "denied" && (
              <p className="text-xs text-vantare-textMuted leading-relaxed">
                {t("settings.notifications.systemDenied")}
              </p>
            )}
          </>
        )}

        <p className="text-xs text-vantare-textMuted leading-relaxed">
          {t("settings.notifications.help")}
        </p>
      </div>
    </div>
  );
}
