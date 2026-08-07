import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatBytes, type useStorageSettings } from "./useStorageSettings";

type Props = {
  storage: ReturnType<typeof useStorageSettings>;
};

/**
 * Where Vantare keeps things on this machine, how much room it takes and how
 * to reclaim the disposable part.
 *
 * The page tells the user their data stays local. This is what makes that
 * checkable instead of a claim.
 */
export function StorageSettings({ storage }: Props) {
  const { t } = useI18n();
  const { summary, error, loaded, reveal, clear } = storage;
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="card-sleek rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-white">
          {t("settings.storage.title")}
        </h2>
        {loaded && (
          <span className="text-xs text-vantare-textMuted font-mono">
            {formatBytes(summary.totalBytes)}
          </span>
        )}
      </div>

      {!loaded ? (
        <p className="text-sm text-vantare-textMuted">{t("settings.storage.loading")}</p>
      ) : (
        <div className="space-y-3">
          {summary.locations.map((location) => (
            <div
              key={location.key}
              className="p-4 rounded-xl bg-vantare-surface border border-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {t(`settings.storage.${location.key}` as never)}
                  </p>
                  {/* break-all, not truncate: a path the user cannot read in
                      full is a path they cannot go to. */}
                  <p className="mt-1 text-xs text-vantare-textMuted font-mono break-all">
                    {location.path}
                  </p>
                  <p className="mt-1 text-xs text-vantare-textMuted">
                    {location.exists
                      ? `${formatBytes(location.bytes)} · ${location.files}`
                      : t("settings.storage.empty")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => reveal(location.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-vantare-textMuted border border-white/10 hover:text-white hover:border-white/30 transition-colors"
                  >
                    {t("settings.storage.open")}
                  </button>
                  {/* The backend decides what may be emptied. Configs hold the
                      user's profiles and settings and are never clearable. */}
                  {location.clearable && (
                    <button
                      type="button"
                      disabled={!location.exists || location.files === 0}
                      onClick={() => setConfirming(location.key)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-vantare-red-200 border border-vantare-red-500/40 hover:bg-vantare-red-950/40 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      {t("settings.storage.clear")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-vantare-textMuted leading-relaxed">
            {t("settings.storage.help")}
          </p>
        </div>
      )}

      {error !== null && (
        <p className="mt-3 text-xs text-vantare-red-300" role="alert">
          {t("settings.storage.error")}
          {error ? ` ${error}` : ""}
        </p>
      )}

      {confirming && (
        <ConfirmDialog
          title={t("settings.storage.confirmTitle")}
          cancelLabel={t("settings.storage.confirmCancel")}
          confirmLabel={t("settings.storage.confirmAccept")}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            clear(confirming);
            setConfirming(null);
          }}
          testId="settings-storage-clear-overlay"
        >
          {t("settings.storage.confirmBody")}
        </ConfirmDialog>
      )}
    </div>
  );
}
