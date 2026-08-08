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
  // The platform still outranks the stored preference, for a platform that can
  // refuse. Windows cannot: it has no per-app permission, so this is the
  // stored value there.
  const systemOn = Boolean(notifications.systemEnabled) && system.status.authorized;

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
                  // Harmless where there is nothing to grant, and the one
                  // chance to prompt where there is.
                  system.authorize();
                  setNotifications({ systemEnabled: true });
                }}
                className="accent-vantare-red-500 w-4 h-4"
              />
              <span>{t("settings.notifications.system")}</span>
            </label>

            {/* Windows drops toasts silently for reasons of its own -- Focus
                Assist, notifications off system-wide, an app id it does not
                recognise. Without this the user has no way to tell a broken
                setup from one that simply had nothing to announce. */}
            <div className="flex flex-wrap items-center gap-3 pl-7">
              <button
                type="button"
                data-testid="notifications-test"
                onClick={system.sendTest}
                disabled={system.test.state === "sending"}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-vantare-textMuted transition-colors hover:text-white hover:border-white/30 disabled:opacity-50"
              >
                {t("settings.notifications.test")}
              </button>
              {system.test.state === "sent" && (
                <span className="text-xs text-vantare-success" role="status">
                  {t("settings.notifications.testSent")}
                </span>
              )}
              {system.test.state === "failed" && (
                <span className="text-xs text-vantare-red-300" role="alert">
                  {t("settings.notifications.testFailed")}
                  {system.test.message ? ` ${system.test.message}` : ""}
                </span>
              )}
            </div>
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
