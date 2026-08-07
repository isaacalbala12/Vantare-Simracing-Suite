import { useI18n } from "../../i18n/I18nProvider";
import { CHANNEL_LABELS, type UpdateInfo, type UpdaterSettings } from "./settings-contract";

type Props = {
  info: UpdateInfo | null;
  updaterSettings: UpdaterSettings;
};

/**
 * Version, channel and the note about everything staying on the machine.
 *
 * This was the only part of the "Avanzado" tab worth keeping: that tab's two
 * controls changed nothing, but this card answers "what am I running and where
 * does my data live". It moves next to the diagnostics panel, which is where a
 * user already goes to look at the state of their installation.
 */
export function AboutSettings({ info, updaterSettings }: Props) {
  const { t } = useI18n();

  return (
    <div className="card-sleek rounded-xl p-5 border border-white/5">
      <h3 className="font-display font-semibold text-lg text-white mb-4">
        {t("settings.about.title")}
      </h3>
      <div className="space-y-2 text-xs text-vantare-textMuted font-mono">
        <p>
          {t("settings.about.currentVersion")}: {info?.currentVersion ?? "—"}
        </p>
        <p>
          {t("settings.about.channel")}: {CHANNEL_LABELS[updaterSettings.channel]}
        </p>
      </div>
      <p className="text-xs text-vantare-textMuted mt-4 leading-relaxed">
        {t("settings.about.local")}
      </p>
    </div>
  );
}
