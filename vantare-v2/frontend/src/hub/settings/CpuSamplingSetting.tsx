import { useI18n } from "../../i18n/I18nProvider";
import { SaveStatus } from "./SaveStatus";
import type { useAppSettings } from "./useAppSettings";

type Props = {
  app: ReturnType<typeof useAppSettings>;
};

/**
 * Runtime CPU sampling.
 *
 * This one is real: cmd/vantare wires it to RuntimeSampler.SetCPUEnabled, which
 * starts and stops the sampler. It sat in the "Avanzado" tab next to deltaMode,
 * which was inert, and nearly went out with it. It belongs beside diagnostics,
 * because what it controls is instrumentation.
 */
export function CpuSamplingSetting({ app }: Props) {
  const { t } = useI18n();
  const { appSettings, toggleCpuSampling, settingsStatus } = app;

  return (
    <div className="card-sleek rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-lg text-white">
          {t("settings.cpu.title")}
        </h3>
        <SaveStatus status={settingsStatus} />
      </div>
      <label className="flex items-center gap-3 text-sm text-vantare-textMuted cursor-pointer">
        <input
          type="checkbox"
          checked={appSettings.cpuSampling}
          onChange={toggleCpuSampling}
          className="accent-vantare-red-500 w-4 h-4"
        />
        <span>{t("settings.cpu.enable")}</span>
      </label>
      <p className="text-xs text-vantare-textMuted mt-3 leading-relaxed">
        {t("settings.cpu.help")}
      </p>
    </div>
  );
}
