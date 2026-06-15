import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";

export type Channel = "stable" | "prerelease";

export type Asset = {
  name: string;
  size: number;
  browser_download_url: string;
};

export type Release = {
  tag_name: string;
  name: string;
  prerelease: boolean;
  published_at: string;
  html_url: string;
  assets: Asset[];
};

export type UpdateInfo = {
  currentVersion: string;
  latestVersion?: string;
  latestRelease?: Release;
  hasUpdate: boolean;
  releases?: Release[];
};

export type UpdaterSettings = {
  channel: Channel;
  ignoreVersion?: string;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function findInstallerAsset(release: Release): Asset | undefined {
  return release.assets.find((a) => a.name === "vantare-amd64-installer.exe");
}

export function SettingsPage() {
  const [settings, setSettings] = useState<UpdaterSettings>({ channel: "stable" });
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [installingTag, setInstallingTag] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handlers: (() => void)[] = [];

    const unsubSettings = Events.On(
      "updater:settings",
      (event: { data: { settings?: UpdaterSettings } }) => {
        if (event.data.settings) {
          setSettings(event.data.settings);
        }
      }
    );
    handlers.push(unsubSettings);

    const unsubAvailable = Events.On(
      "updater:available",
      (event: { data: { info?: UpdateInfo } }) => {
        setLoading(false);
        if (event.data.info) {
          setInfo(event.data.info);
          setStatus(`Versión instalada: ${event.data.info.currentVersion}`);
        }
      }
    );
    handlers.push(unsubAvailable);

    const unsubProgress = Events.On(
      "updater:progress",
      (event: { data: { percent?: number } }) => {
        setProgress(event.data.percent ?? null);
        setStatus(`Descargando... ${event.data.percent ?? 0}%`);
      }
    );
    handlers.push(unsubProgress);

    const unsubInstalled = Events.On("updater:installed", () => {
      setInstallingTag(null);
      setProgress(null);
      setStatus("Instalador lanzado. La app se cerrará para completar la actualización.");
    });
    handlers.push(unsubInstalled);

    const unsubSaved = Events.On("updater:settings-saved", () => {
      setStatus("Preferencias guardadas.");
      Events.Emit("updater:check");
      setLoading(true);
    });
    handlers.push(unsubSaved);

    const unsubError = Events.On(
      "updater:error",
      (event: { data: { message?: string } }) => {
        setLoading(false);
        setInstallingTag(null);
        setProgress(null);
        setError(event.data.message ?? "Error desconocido");
      }
    );
    handlers.push(unsubError);

    Events.Emit("updater:settings:get");
    Events.Emit("updater:check");
    setLoading(true);

    return () => {
      handlers.forEach((h) => h?.());
    };
  }, []);

  function handleChannelChange(channel: Channel) {
    const next = { ...settings, channel };
    setSettings(next);
    Events.Emit("updater:settings:save", next);
  }

  function handleInstall(release: Release) {
    const asset = findInstallerAsset(release);
    if (!asset) {
      setError("No se encontró el instalador para esta versión.");
      return;
    }
    setInstallingTag(release.tag_name);
    setError(null);
    setStatus(`Preparando instalación de ${release.tag_name}...`);
    Events.Emit("updater:install", { tag: release.tag_name, downloadURL: asset.browser_download_url });
  }

  function handleRefresh() {
    setError(null);
    setLoading(true);
    Events.Emit("updater:check");
  }

  return (
    <div className="max-w-[1920px] mx-auto px-6 py-6 relative z-20">
      <div className="mb-6">
        <h1 className="font-display font-bold text-3xl text-white mb-2">Ajustes</h1>
        <p className="text-sm text-vantare-textMuted">Actualizaciones y preferencias del updater.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 flex flex-col gap-6">
          <div className="glass-panel rounded-xl p-6 border border-white/5">
            <h2 className="font-display font-semibold text-lg text-white mb-4">Canal de actualizaciones</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-vantare-textMuted cursor-pointer">
                <input
                  type="radio"
                  name="channel"
                  value="stable"
                  checked={settings.channel === "stable"}
                  onChange={() => handleChannelChange("stable")}
                  className="accent-vantare-red-500"
                />
                Solo releases estables
              </label>
              <label className="flex items-center gap-2 text-sm text-vantare-textMuted cursor-pointer">
                <input
                  type="radio"
                  name="channel"
                  value="prerelease"
                  checked={settings.channel === "prerelease"}
                  onChange={() => handleChannelChange("prerelease")}
                  className="accent-vantare-red-500"
                />
                Incluir pre-releases
              </label>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-6 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-lg text-white">Versiones disponibles</h2>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-vantare-surface border border-white/10 text-xs text-white hover:border-vantare-red-500/50 disabled:opacity-50 transition-colors"
              >
                {loading ? "Buscando..." : "Buscar actualizaciones"}
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
              <div className="text-sm text-vantare-textMuted">No hay versiones disponibles para este canal.</div>
            )}

            <div className="space-y-3">
              {info?.releases?.map((release) => {
                const asset = findInstallerAsset(release);
                const isInstalling = installingTag === release.tag_name;
                const isCurrent = release.tag_name === info.currentVersion;
                return (
                  <div
                    key={release.tag_name}
                    className="flex items-center justify-between p-4 rounded-xl bg-vantare-surface border border-white/5"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-white text-sm">{release.tag_name}</span>
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
                      </div>
                      <div className="text-xs text-vantare-textMuted">
                        {release.name} · {formatDate(release.published_at)}
                        {asset && ` · ${(asset.size / 1024 / 1024).toFixed(1)} MB`}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isInstalling || !asset || isCurrent}
                      onClick={() => handleInstall(release)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isInstalling ? `${progress ?? 0}%` : isCurrent ? "Actual" : "Instalar"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="xl:col-span-4">
          <div className="glass-panel rounded-xl p-6 border border-white/5">
            <h3 className="font-display font-semibold text-lg text-white mb-4">Información</h3>
            <p className="text-sm text-vantare-textMuted mb-4">
              El instalador descargado reemplazará la versión actual y reiniciará la aplicación.
              Asegúrate de guardar cualquier perfil abierto antes de continuar.
            </p>
            <p className="text-xs text-vantare-textMuted font-mono">
              Versión actual: {info?.currentVersion ?? "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
