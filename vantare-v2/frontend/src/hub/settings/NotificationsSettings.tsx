import { useEffect } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { SaveStatus } from "./SaveStatus";
import { useSystemNotifications } from "./useSystemNotifications";
import type { useAppSettings } from "./useAppSettings";

type Props = {
  app: ReturnType<typeof useAppSettings>;
};

/**
 * What Vantare tells you about, and where.
 *
 * Every switch here governs a surface that exists: the update banner in the
 * shell and the toast a launch chain shows when it finishes.
 *
 * The desktop switch goes through Go, which reaches Windows via the Wails
 * notifications service. The browser Notification API is not wired up inside
 * WebView2 -- asking it for permission did nothing at all -- so a first attempt
 * through it could never have delivered anything.
 */
export function NotificationsSettings({ app }: Props) {
  const { t } = useI18n();
  const { appSettings, settingsStatus, setNotifications } = app;
  const notifications = appSettings.notifications ?? {};
  const system = useSystemNotifications();
  // The platform outranks the stored preference: permission revoked from
  // Windows has to show as off, whatever the settings file remembers.
  const systemOn = Boolean(notifications.systemEnabled) && system.status.authorized;

  // Asking is what may prompt the user, so it only happens when they turn the
  // switch on. Once Windows has answered, the choice is stored -- but never
  // stored as "on" when the answer was no.
  useEffect(() => {
    if (notifications.systemEnabled && system.status.supported && !system.status.authorized) {
      setNotifications({ systemEnabled: false });
    }
  }, [notifications.systemEnabled, system.status, setNotifications]);

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

        {system.status.supported ? (
          <>
            <label className="flex items-center gap-3 text-sm text-vantare-textMuted cursor-pointer">
              <input
                type="checkbox"
                checked={systemOn}
                onChange={(event) => {
                  if (!event.target.checked) {
                    setNotifications({ systemEnabled: false });
                    return;
                  }
                  if (system.status.authorized) {
                    setNotifications({ systemEnabled: true });
                    return;
                  }
                  system.authorize();
                  setNotifications({ systemEnabled: true });
                }}
                className="accent-vantare-red-500 w-4 h-4"
              />
              <span>{t("settings.notifications.system")}</span>
            </label>
            {system.refused && (
              <p className="text-xs text-vantare-textMuted leading-relaxed">
                {t("settings.notifications.systemDenied")}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-vantare-textMuted leading-relaxed">
            {t("settings.notifications.systemUnsupported")}
          </p>
        )}

        <p className="text-xs text-vantare-textMuted leading-relaxed">
          {t("settings.notifications.help")}
        </p>
      </div>
    </div>
  );
}
