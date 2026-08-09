import { useI18n } from "../../i18n/I18nProvider";
import { HOTKEY_KEYS } from "./settings-contract";
import { SaveStatus } from "./SaveStatus";
import type { useAppSettings } from "./useAppSettings";

type Props = {
  app: ReturnType<typeof useAppSettings>;
};

/** Global hotkeys, with the save status reported next to the save button. */
export function HotkeysSettings({ app }: Props) {
  const { t } = useI18n();
  const { appSettings, capturingKey, startCapture, cancelCapture, saveHotkeys, settingsStatus } =
    app;

  return (
    <div className="card-sleek rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-white">
          {t("settings.hotkeys.title")}
        </h2>
        <div className="flex items-center gap-3">
          <SaveStatus status={settingsStatus} />
          <button
            type="button"
            onClick={saveHotkeys}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy transition-all"
          >
            {t("settings.hotkeys.save")}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {HOTKEY_KEYS.map((key) => {
          const isCapturing = capturingKey === key;
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm text-vantare-textMuted w-36">{t(`settings.hotkeys.${key}`)}</span>
              {isCapturing ? (
                <div
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-vantare-red-950/30 border border-vantare-red-500/50 text-sm text-vantare-red-200 font-mono"
                >
                  <span className="animate-pulse">{t("settings.hotkeys.capturing")}</span>
                  <button
                    type="button"
                    onClick={cancelCapture}
                    className="ml-auto px-2 py-0.5 rounded text-[10px] text-vantare-textMuted hover:text-white border border-white/10 hover:border-white/30 transition-colors"
                  >
                    {t("settings.hotkeys.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startCapture(key)}
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white font-mono hover:border-vantare-red-500/50 transition-colors text-left"
                >
                  <span className="flex-1">{appSettings.hotkeys[key] ?? ''}</span>
                  <span className="text-[10px] text-vantare-textMuted uppercase tracking-wider">
                    {t("settings.hotkeys.change")}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
