import { CHANNEL_LABELS, DELTA_MODES, type UpdateInfo, type UpdaterSettings } from "./settings-contract";
import type { useAppSettings } from "./useAppSettings";

type Props = {
  app: ReturnType<typeof useAppSettings>;
  info: UpdateInfo | null;
  updaterSettings: UpdaterSettings;
};

/**
 * "Avanzado". Both of its controls are inert: nothing in Go or in the frontend
 * reads deltaMode or cpuSampling to change behaviour -- they are only persisted
 * and reported in the diagnostics package. This section is slated for removal
 * in the next cut; it is extracted verbatim here so that removal is a clean
 * delete rather than surgery on a 695-line file.
 */
export function AdvancedSettings({ app, info, updaterSettings }: Props) {
  const { appSettings, changeDeltaMode, toggleCpuSampling } = app;

  return (
    <div className="space-y-4">
      <div className="card-sleek rounded-xl p-5 border border-white/5">
        <h2 className="font-display font-semibold text-lg text-white mb-4">
          Condiciones
        </h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-vantare-textMuted mb-2">Modo delta</p>
            <div className="space-y-2">
              {DELTA_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className="flex items-center gap-2 text-sm text-vantare-textMuted cursor-pointer"
                >
                  <input
                    type="radio"
                    name="deltaMode"
                    value={mode.value}
                    checked={appSettings.deltaMode === mode.value}
                    onChange={() => changeDeltaMode(mode.value)}
                    className="accent-vantare-red-500"
                  />
                  {mode.label}
                </label>
              ))}
            </div>
          </div>
          <div className="border-t border-white/5 pt-4">
            <label className="flex items-center gap-3 text-sm text-vantare-textMuted cursor-pointer">
              <input
                type="checkbox"
                checked={appSettings.cpuSampling}
                onChange={toggleCpuSampling}
                className="accent-vantare-red-500 w-4 h-4"
              />
              <span>Monitorizar uso de CPU</span>
            </label>
          </div>
        </div>
      </div>

      <div className="card-sleek rounded-xl p-5 border border-white/5">
        <h3 className="font-display font-semibold text-lg text-white mb-4">Información</h3>
        <div className="space-y-2 text-xs text-vantare-textMuted font-mono">
          <p>Versión actual: {info?.currentVersion ?? '—'}</p>
          <p>Canal: {CHANNEL_LABELS[updaterSettings.channel]}</p>
        </div>
        <p className="text-xs text-vantare-textMuted mt-4 leading-relaxed">
          Vantare se ejecuta localmente. Los datos de telemetría y configuración permanecen en tu equipo.
          Las actualizaciones se descargan desde GitHub Releases.
        </p>
      </div>
    </div>
  );
}
