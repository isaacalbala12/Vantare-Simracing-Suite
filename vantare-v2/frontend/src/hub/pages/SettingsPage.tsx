import { useEffect, useState } from 'react';
import { Events } from '@wailsio/runtime';
import { ObsSetup } from '../components/ObsSetup';
import { AccountSettings } from '../settings/AccountSettings';
import { V52SectionHeader } from '../components/V52SectionHeader';

export type Channel = 'stable' | 'prerelease';

export type Asset = {
  name: string;
  size: number;
  browser_download_url: string;
};

export type Release = {
  tag_name: string;
  name: string;
  body: string;
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
  isDowngrade: boolean;
  releases?: Release[];
  ignoredVersion?: string;
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
  return release.assets.find((a) => a.name === 'vantare-amd64-installer.exe');
}

function findChecksumAsset(release: Release): Asset | undefined {
  return release.assets.find((a) => a.name === 'vantare-amd64-installer.exe.sha256');
}
export type AppSettings = {
  deltaMode: string;
  cpuSampling: boolean;
  hotkeys: Record<string, string>;
  activeOverlayProfileId?: string;
  betaWelcomeCompleted?: boolean;
  betaUserRole?: string;
  launchers?: Record<string, LauncherConfig>;
};

export type LauncherConfig = {
  simulatorId: string;
  launchMethod: string;
  executablePath?: string;
  steamAppId?: number;
  associatedApps?: string[];
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  deltaMode: 'self',
  cpuSampling: true,
  hotkeys: {
    toggleOverlay: 'ctrl+shift+v',
    nextProfile: 'ctrl+shift+right',
    prevProfile: 'ctrl+shift+left',
  },
};

const DELTA_MODES = [
  { value: 'self', label: 'Personal (mejor vuelta propia)' },
  { value: 'session', label: 'Sesion (mejor vuelta de la sesion)' },
  { value: 'global', label: 'Global (mejor vuelta global)' },
] as const;

const HOTKEY_NAMES: Record<string, string> = {
  toggleOverlay: 'Toggle overlay',
  nextProfile: 'Siguiente perfil',
  prevProfile: 'Perfil anterior',
};

export function SettingsPage() {
  const [settings, setSettings] = useState<UpdaterSettings>({ channel: 'stable' });
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [installingTag, setInstallingTag] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDowngrade, setConfirmDowngrade] = useState<Release | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);


  useEffect(() => {
    const handlers: (() => void)[] = [];

    const unsubSettings = Events.On(
      'updater:settings',
      (event: { data: { settings?: UpdaterSettings } }) => {
        if (event.data.settings) {
          setSettings(event.data.settings);
        }
      },
    );
    handlers.push(unsubSettings);

    const unsubAvailable = Events.On(
      'updater:available',
      (event: { data: { info?: UpdateInfo } }) => {
        setLoading(false);
        if (event.data.info) {
          setInfo(event.data.info);
          setStatus(`Versión instalada: ${event.data.info.currentVersion}`);
        }
      },
    );
    handlers.push(unsubAvailable);

    const unsubProgress = Events.On('updater:progress', (event: { data: { percent?: number } }) => {
      setProgress(event.data.percent ?? null);
      setStatus(`Descargando... ${event.data.percent ?? 0}%`);
    });
    handlers.push(unsubProgress);

    const unsubInstalled = Events.On('updater:installed', () => {
      setInstallingTag(null);
      setProgress(null);
      setStatus('Instalador lanzado. La app se cerrará para completar la actualización.');
    });
    handlers.push(unsubInstalled);

    const unsubIgnored = Events.On('updater:ignored', (event: { data: { version?: string } }) => {
      setStatus(`Versión ${event.data.version ?? ''} ignorada.`);
      Events.Emit('updater:check');
    });
    handlers.push(unsubIgnored);

    const unsubSaved = Events.On('updater:settings-saved', () => {
      setStatus('Preferencias guardadas.');
      Events.Emit('updater:check');
      setLoading(true);
    });
    handlers.push(unsubSaved);

    const unsubError = Events.On('updater:error', (event: { data: { message?: string } }) => {
      setLoading(false);
      setInstallingTag(null);
      setProgress(null);
      setError(event.data.message ?? 'Error desconocido');
    });
    handlers.push(unsubError);

    const unsubAppSettings = Events.On(
      'settings',
      (event: { data: AppSettings }) => {
        if (event.data && event.data.deltaMode) {
          setAppSettings(event.data);
        }
      },
    );
    handlers.push(unsubAppSettings);

    const unsubAppSettingsSaved = Events.On('settings-saved', () => {
      setSettingsStatus('Ajustes guardados.');
      setTimeout(() => setSettingsStatus(null), 3000);
    });
    handlers.push(unsubAppSettingsSaved);

    Events.Emit('settings:get');

    Events.Emit('updater:settings:get');
    Events.Emit('updater:check');

    const unsubProfile = Events.On(
      'profile:loaded',
      (event: { data: { profile?: { id: string } } }) => {
        if (event.data?.profile?.id) {
          setActiveProfileId(event.data.profile.id);
        }
      }
    );
    handlers.push(unsubProfile);
    Events.Emit('profile:request');

    const unsubDiagnostics = Events.On(
      'diagnostics',
      (event: { data: unknown }) => {
        setDiagLoading(false);
        try {
          const payload = JSON.stringify(event.data, null, 2);
          navigator.clipboard.writeText(payload)
            .then(() => {
              setDiagCopied(true);
              setDiagError(null);
              setTimeout(() => setDiagCopied(false), 3000);
            })
            .catch((err) => {
              console.error('Error al copiar al portapapeles:', err);
              setDiagError('Error al copiar al portapapeles. Por favor copia manualmente.');
            });
        } catch {
          setDiagError('Error al procesar el paquete de diagnóstico.');
        }
      },
    );
    handlers.push(unsubDiagnostics);

    const unsubDiagError = Events.On(
      'diagnostics:error',
      (event: { data?: { message?: string } }) => {
        setDiagLoading(false);
        setDiagError(event.data?.message ?? 'Error al generar los diagnósticos');
      },
    );
    handlers.push(unsubDiagError);


    return () => {
      handlers.forEach((h) => h?.());
    };
  }, []);

  function handleChannelChange(channel: Channel) {
    const next = { ...settings, channel };
    setSettings(next);
    Events.Emit('updater:settings:save', next);
  }

  function handleInstall(release: Release) {
    const current = info?.currentVersion;
    if (current && isDowngrade(current, release.tag_name)) {
      setConfirmDowngrade(release);
      return;
    }
    startInstall(release);
  }

  function startInstall(release: Release) {
    const asset = findInstallerAsset(release);
    if (!asset) {
      setError('No se encontró el instalador para esta versión.');
      return;
    }
    setConfirmDowngrade(null);
    setInstallingTag(release.tag_name);
    setError(null);
    setStatus(`Preparando instalación de ${release.tag_name}...`);
    Events.Emit('updater:install:verified', release);
  }

  function handleIgnore(release: Release) {
    Events.Emit('updater:ignore', { version: release.tag_name });
  }

  function handleRefresh() {
    setError(null);
    setLoading(true);
    Events.Emit('updater:check');
  }

  function handleDeltaModeChange(deltaMode: string) {
    const next = { ...appSettings, deltaMode };
    setAppSettings(next);
    setSettingsStatus('Guardando...');
    Events.Emit('settings:save', next);
  }

  function handleCpuToggle() {
    const next = { ...appSettings, cpuSampling: !appSettings.cpuSampling };
    setAppSettings(next);
    setSettingsStatus('Guardando...');
    Events.Emit('settings:save', next);
  }

  function handleHotkeyChange(name: string, value: string) {
    const next = { ...appSettings, hotkeys: { ...appSettings.hotkeys, [name]: value } };
    setAppSettings(next);
  }

  function handleSaveHotkeys() {
    setSettingsStatus('Guardando...');
    Events.Emit('settings:save', appSettings);
  }

  function handleCopyDiagnostics() {
    setDiagLoading(true);
    setDiagError(null);
    Events.Emit('diagnostics:get');
  }

  function isDowngrade(current: string, target: string): boolean {
    // Simple semver comparison: strip leading v and compare numeric parts.
    const parse = (v: string) =>
      v
        .replace(/^v/i, '')
        .split(/[-+]/)[0]
        .split('.')
        .map((n) => parseInt(n, 10) || 0);
    const cur = parse(current);
    const tgt = parse(target);
    for (let i = 0; i < Math.max(cur.length, tgt.length); i++) {
      const a = cur[i] ?? 0;
      const b = tgt[i] ?? 0;
      if (a !== b) return b < a;
    }
    return false;
  }

  return (
    <div className="flex flex-col gap-5">
      <V52SectionHeader
        title="Ajustes"
        description="Cuenta, OBS, actualizaciones, atajos y diagnósticos. Las pestañas profundas quedan para SETTINGS-01."
      />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        <div className="xl:col-span-8 flex flex-col gap-6">
          {/* Delta Mode */}
          <div className="card-sleek rounded-xl p-5 border border-white/5">
            <h2 className="font-display font-semibold text-lg text-white mb-4">
              Modo delta
            </h2>
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
                    onChange={() => handleDeltaModeChange(mode.value)}
                    className="accent-vantare-red-500"
                  />
                  {mode.label}
                </label>
              ))}
            </div>
          </div>

          {/* CPU Sampling */}
          <div className="card-sleek rounded-xl p-5 border border-white/5">
            <h2 className="font-display font-semibold text-lg text-white mb-4">
              Rendimiento
            </h2>
            <label className="flex items-center gap-3 text-sm text-vantare-textMuted cursor-pointer">
              <input
                type="checkbox"
                checked={appSettings.cpuSampling}
                onChange={handleCpuToggle}
                className="accent-vantare-red-500 w-4 h-4"
              />
              <span>Monitorizar uso de CPU</span>
            </label>
          </div>

          {/* Hotkeys */}
          <div className="card-sleek rounded-xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-lg text-white">
                Atajos de teclado globales
              </h2>
              <button
                type="button"
                onClick={handleSaveHotkeys}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy transition-all"
              >
                Guardar atajos
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(HOTKEY_NAMES).map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-sm text-vantare-textMuted w-36">{label}</span>
                  <input
                    type="text"
                    value={appSettings.hotkeys[key] ?? ''}
                    onChange={(e) => handleHotkeyChange(key, e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white font-mono"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* OBS Setup */}
          <div className="card-sleek rounded-xl p-5 border border-white/5">
            <h2 className="font-display font-semibold text-lg text-white mb-4">
              OBS Browser Source
            </h2>
            <ObsSetup url={window.location.origin + '/overlay?profile=' + encodeURIComponent(appSettings.activeOverlayProfileId || activeProfileId || 'example-racing.json')} />
          </div>

          {/* Soporte Técnico y Diagnósticos */}
          <div className="card-sleek rounded-xl p-5 border border-white/5 bg-gradient-to-br from-white/[0.01] to-white/[0.03]">
            <h2 className="font-display font-semibold text-lg text-white mb-2">
              Soporte Técnico y Diagnósticos
            </h2>
            <p className="text-sm text-vantare-textMuted mb-4">
              Si experimentas un error, puedes copiar un paquete de diagnóstico seguro con la configuración actual
              de la aplicación para compartirlo en el canal de soporte. Las rutas personales de tu equipo se sanitizan automáticamente.
            </p>
            <button
              type="button"
              onClick={handleCopyDiagnostics}
              disabled={diagLoading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {diagLoading ? 'Generando...' : diagCopied ? '✓ ¡Copiado al Portapapeles!' : 'Copiar paquete de diagnóstico'}
            </button>
            {diagError && (
              <div className="mt-3 text-xs text-red-400 font-mono">
                {diagError}
              </div>
            )}
          </div>

          {settingsStatus && (
            <div className="text-xs text-vantare-textMuted font-mono">{settingsStatus}</div>
          )}
          <div className="card-sleek rounded-xl p-5 border border-white/5">
            <h2 className="font-display font-semibold text-lg text-white mb-4">
              Canal de actualizaciones
            </h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-vantare-textMuted cursor-pointer">
                <input
                  type="radio"
                  name="channel"
                  value="stable"
                  checked={settings.channel === 'stable'}
                  onChange={() => handleChannelChange('stable')}
                  className="accent-vantare-red-500"
                />
                Solo releases estables
              </label>
              <label className="flex items-center gap-2 text-sm text-vantare-textMuted cursor-pointer">
                <input
                  type="radio"
                  name="channel"
                  value="prerelease"
                  checked={settings.channel === 'prerelease'}
                  onChange={() => handleChannelChange('prerelease')}
                  className="accent-vantare-red-500"
                />
                Incluir pre-releases
              </label>
            </div>
          </div>

          <div className="card-sleek rounded-xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-lg text-white">
                Versiones disponibles
              </h2>
              <button
                type="button"
                onClick={handleRefresh}
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
              {info?.releases?.map((release) => {
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
                              onClick={() => handleIgnore(release)}
                              disabled={isInstalling}
                              className="px-3 py-2 rounded-lg text-xs text-vantare-textMuted hover:text-white hover:bg-white/5 disabled:opacity-50 transition-colors"
                            >
                              Saltar
                            </button>
                            <button
                              type="button"
                              disabled={isInstalling || !asset}
                              onClick={() => handleInstall(release)}
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

        <div className="xl:col-span-4 flex flex-col gap-6">
          <div className="card-sleek rounded-xl p-5 border border-white/5">
            <AccountSettings />
          </div>
          <div className="card-sleek rounded-xl p-5 border border-white/5">
            <h3 className="font-display font-semibold text-lg text-white mb-4">Información</h3>
            <p className="text-sm text-vantare-textMuted mb-4">
              El instalador descargado reemplazará la versión actual y reiniciará la aplicación.
              Asegúrate de guardar cualquier perfil abierto antes de continuar.
            </p>
            <p className="text-xs text-vantare-textMuted font-mono">
              Versión actual: {info?.currentVersion ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {confirmDowngrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass-panel rounded-xl p-6 border border-white/10 max-w-md w-full">
            <h3 className="font-display font-semibold text-lg text-white mb-2">
              Confirmar downgrade
            </h3>
            <p className="text-sm text-vantare-textMuted mb-4">
              Vas a instalar <strong className="text-white">{confirmDowngrade.tag_name}</strong>,
              que es anterior a la versión actual{' '}
              <strong className="text-white">{info?.currentVersion}</strong>. Esto puede perder
              datos o configuraciones nuevas. ¿Continuar?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDowngrade(null)}
                className="px-4 py-2 rounded-lg text-xs text-vantare-textMuted hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => startInstall(confirmDowngrade)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy transition-all"
              >
                Sí, instalar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
