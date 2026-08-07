import { HOTKEY_NAMES } from "./settings-contract";
import type { useAppSettings } from "./useAppSettings";

type Props = {
  app: ReturnType<typeof useAppSettings>;
};

/**
 * Global hotkeys. Markup preserved verbatim from the original page so the
 * existing SettingsPage tests keep passing unchanged.
 */
export function HotkeysSettings({ app }: Props) {
  const { appSettings, capturingKey, startCapture, cancelCapture, saveHotkeys } = app;

  return (
    <div className="card-sleek rounded-xl p-5 border border-white/5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-white">
          Atajos de teclado globales
        </h2>
        <button
          type="button"
          onClick={saveHotkeys}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy transition-all"
        >
          Guardar atajos
        </button>
      </div>
      <div className="space-y-3">
        {Object.entries(HOTKEY_NAMES).map(([key, label]) => {
          const isCapturing = capturingKey === key;
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm text-vantare-textMuted w-36">{label}</span>
              {isCapturing ? (
                <div
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-vantare-red-950/30 border border-vantare-red-500/50 text-sm text-vantare-red-200 font-mono"
                >
                  <span className="animate-pulse">Pulsa una combinación...</span>
                  <button
                    type="button"
                    onClick={cancelCapture}
                    className="ml-auto px-2 py-0.5 rounded text-[10px] text-vantare-textMuted hover:text-white border border-white/10 hover:border-white/30 transition-colors"
                  >
                    Cancelar
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
                    Cambiar
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
