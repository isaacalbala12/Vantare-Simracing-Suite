import { useI18n } from "../../i18n/I18nProvider";
import type { useStartupSettings } from "./useStartupSettings";

type Props = {
  startup: ReturnType<typeof useStartupSettings>;
};

/** Launching Vantare at sign-in, and how the window comes up when it does. */
export function StartupSettings({ startup }: Props) {
  const { t } = useI18n();
  const { startup: options, error, setEnabled, setMinimised } = startup;

  return (
    <div className="card-sleek rounded-xl p-5">
      <h2 className="font-display font-semibold text-lg text-white mb-4">
        {t("settings.startup.title")}
      </h2>

      {!options.supported ? (
        <p className="text-sm text-vantare-textMuted leading-relaxed">
          {t("settings.startup.unsupported")}
        </p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-3 text-sm text-vantare-textMuted cursor-pointer">
            <input
              type="checkbox"
              checked={options.enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="accent-vantare-red-500 w-4 h-4"
            />
            <span>{t("settings.startup.enable")}</span>
          </label>

          {/* Only meaningful while autostart is on: it travels in the
              registered command line, so with autostart off there is no
              command line for it to travel in. */}
          <label
            className={`flex items-center gap-3 text-sm cursor-pointer ${
              options.enabled ? "text-vantare-textMuted" : "text-vantare-textMuted/40"
            }`}
          >
            <input
              type="checkbox"
              checked={options.minimised}
              disabled={!options.enabled}
              onChange={(event) => setMinimised(event.target.checked)}
              className="accent-vantare-red-500 w-4 h-4"
            />
            <span>{t("settings.startup.minimised")}</span>
          </label>

          <p className="text-xs text-vantare-textMuted leading-relaxed">
            {t("settings.startup.help")}
          </p>
        </div>
      )}

      {error !== null && (
        <p className="mt-3 text-xs text-vantare-red-300" role="alert">
          {t("settings.startup.error")}
          {error ? ` ${error}` : ""}
        </p>
      )}
    </div>
  );
}
