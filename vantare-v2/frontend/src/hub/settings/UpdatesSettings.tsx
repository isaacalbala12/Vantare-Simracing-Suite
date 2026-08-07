import { isDowngrade } from "../../lib/version-compare";
import {
  CHANNEL_LABELS,
  findChecksumAsset,
  findInstallerAsset,
  formatDate,
  type Channel,
  type Release,
} from "./settings-contract";
import type { useUpdaterSettings } from "./useUpdaterSettings";

type Props = {
  updater: ReturnType<typeof useUpdaterSettings>;
  availableChannels: Channel[];
};

/**
 * Update channel and the release list. Markup preserved verbatim from the
 * original page so the existing SettingsPage tests keep passing unchanged --
 * this cut moves code, it does not restyle it.
 */
export function UpdatesSettings({ updater, availableChannels }: Props) {
  const {
    settings,
    info,
    loading,
    installingTag,
    progress,
    status,
    error,
    expandedTag,
    setExpandedTag,
    changeChannel,
    install,
    ignore,
    refresh,
  } = updater;

  return (
    <div className="space-y-4">
      <div className="card-sleek rounded-xl p-5 border border-white/5">
        <h2 className="font-display font-semibold text-lg text-white mb-4">
          Canal de actualizaciones
        </h2>
        <div className="flex items-center gap-4">
          {availableChannels.map((channel) => (
            <label
              key={channel}
              className="flex items-center gap-2 text-sm text-vantare-textMuted cursor-pointer"
            >
              <input
                type="radio"
                name="channel"
                value={channel}
                checked={settings.channel === channel}
                onChange={() => changeChannel(channel)}
                className="accent-vantare-red-500"
              />
              {CHANNEL_LABELS[channel]}
            </label>
          ))}
        </div>
      </div>

      <div className="card-sleek rounded-xl p-5 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg text-white">
            Versiones disponibles
          </h2>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-vantare-surface border border-white/10 text-xs text-white hover:border-vantare-red-500/50 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Buscando...' : 'Buscar actualizaciones'}
          </button>
        </div>

        {status && (
          <div className="mb-4 text-xs text-vantare-textMuted font-mono">{status}</div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-xs text-red-200">
            {error}
          </div>
        )}

        {info?.releases && info.releases.length === 0 && !loading && (
          <div className="text-sm text-vantare-textMuted">
            No hay versiones disponibles para este canal.
          </div>
        )}

        <div className="space-y-3">
          {info?.releases?.map((release: Release) => {
            const asset = findInstallerAsset(release);
            const checksum = findChecksumAsset(release);
            const isInstalling = installingTag === release.tag_name;
            const isCurrent = release.tag_name === info.currentVersion;
            const isIgnored = release.tag_name === info.ignoredVersion;
            const isExpanded = expandedTag === release.tag_name;
            const isDowngradeVersion = info.currentVersion
              ? isDowngrade(info.currentVersion, release.tag_name)
              : false;
            return (
              <div
                key={release.tag_name}
                className="p-4 rounded-xl bg-vantare-surface border border-white/5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white text-sm">
                        {release.tag_name}
                      </span>
                      {release.prerelease && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-vantare-red-950/50 text-vantare-red-300 border border-vantare-red-900/30">
                          Pre-release
                        </span>
                      )}
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950/50 text-emerald-300 border border-emerald-900/30">
                          Instalada
                        </span>
                      )}
                      {isIgnored && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-800 text-gray-300 border border-gray-700">
                          Ignorada
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-vantare-textMuted">
                      {release.name} · {formatDate(release.published_at)}
                      {asset && ` · ${(asset.size / 1024 / 1024).toFixed(1)} MB`}
                      {checksum && ' · SHA256'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isCurrent && !isIgnored && (
                      <>
                        <button
                          type="button"
                          onClick={() => ignore(release)}
                          disabled={isInstalling}
                          className="px-3 py-2 rounded-lg text-xs text-vantare-textMuted hover:text-white hover:bg-white/5 disabled:opacity-50 transition-colors"
                        >
                          Saltar
                        </button>
                        <button
                          type="button"
                          disabled={isInstalling || !asset}
                          onClick={() => install(release)}
                          className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          {isInstalling
                            ? `${progress ?? 0}%`
                            : isDowngradeVersion
                              ? 'Downgrade'
                              : 'Instalar'}
                        </button>
                      </>
                    )}
                    {asset && (
                      <a
                        href={asset.browser_download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-lg text-xs text-vantare-textMuted hover:text-white hover:bg-white/5 transition-colors"
                        title="Descargar manualmente"
                      >
                        ↓
                      </a>
                    )}
                  </div>
                </div>

                {release.body && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setExpandedTag(isExpanded ? null : release.tag_name)}
                      className="text-xs text-vantare-red-300 hover:text-vantare-red-200"
                    >
                      {isExpanded ? 'Ocultar cambios' : 'Ver cambios'}
                    </button>
                    {isExpanded && (
                      <div className="mt-2 p-3 rounded-lg bg-black/20 border border-white/5 text-xs text-vantare-textMuted whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {release.body}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
