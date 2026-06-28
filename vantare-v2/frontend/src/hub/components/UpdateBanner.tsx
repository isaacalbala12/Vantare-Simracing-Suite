import { useEffect, useRef, useState } from 'react';
import { Events } from '@wailsio/runtime';

type UpdateNotify = {
  tag: string;
  name: string;
  prerelease: boolean;
  downloadURL: string;
};

type Asset = {
  name: string;
  browser_download_url: string;
};

type Release = {
  tag_name: string;
  name: string;
  prerelease: boolean;
  assets: Asset[];
};

type UpdateInfo = {
  latestRelease?: Release;
  releases?: Release[];
};

export function UpdateBanner() {
  const [notify, setNotify] = useState<UpdateNotify | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingTagRef = useRef<string | null>(null);
  const dismissedTagRef = useRef<string | null>(null);

  useEffect(() => {
    const handlers: (() => void)[] = [];

    handlers.push(
      Events.On('updater:notify', (event: { data: UpdateNotify }) => {
        setNotify(event.data);
        setDismissed(false);
        setInstalling(false);
        setProgress(null);
        setError(null);
        dismissedTagRef.current = null;
      }),
    );

    handlers.push(
      Events.On('updater:available', (event: { data: { info?: UpdateInfo } }) => {
        const tag = pendingTagRef.current;
        if (!tag) return;
        pendingTagRef.current = null;
        if (dismissedTagRef.current === tag) return;

        const info = event.data.info;
        const allReleases = info?.releases ?? [];
        const release = allReleases.find((r) => r.tag_name === tag);

        if (!release) {
          setInstalling(false);
          setError('No se encontró la versión solicitada.');
          return;
        }

        Events.Emit('updater:install:verified', release);
      }),
    );

    handlers.push(
      Events.On('updater:progress', (event: { data: { percent?: number } }) => {
        setProgress(event.data.percent ?? null);
      }),
    );

    handlers.push(
      Events.On('updater:installed', () => {
        setInstalling(false);
        setProgress(null);
      }),
    );

    handlers.push(
      Events.On('updater:error', (event: { data: { message?: string } }) => {
        setInstalling(false);
        setProgress(null);
        setError(event.data.message ?? 'Error desconocido');
      }),
    );

    return () => handlers.forEach((h) => h?.());
  }, []);

  function handleDismiss() {
    setDismissed(true);
    pendingTagRef.current = null;
    setInstalling(false);
    setProgress(null);
    setError(null);
    if (notify) {
      dismissedTagRef.current = notify.tag;
      Events.Emit('updater:ignore', { version: notify.tag });
    }
  }

  function handleInstall() {
    if (!notify) return;
    setInstalling(true);
    setError(null);
    setProgress(null);
    pendingTagRef.current = notify.tag;
    Events.Emit('updater:check');
  }

  if (!notify || dismissed) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-gradient-to-r from-vantare-red-900/90 to-vantare-burgundy/90 border-b border-vantare-red-500/30 px-6 py-2">
      <div className="max-w-[1920px] mx-auto flex items-center justify-between gap-4">
        <div className="text-sm text-white">
          Nueva versión disponible: <span className="font-semibold">{notify.tag}</span>
          {notify.prerelease && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-white/10">
              Pre-release
            </span>
          )}
          {progress !== null && (
            <span className="ml-2 text-xs text-white/70">{progress}%</span>
          )}
          {error && (
            <span className="ml-2 text-xs text-red-300">{error}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleInstall}
            disabled={installing}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-white bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors"
          >
            {installing
              ? progress !== null
                ? `${progress}%`
                : 'Buscando...'
              : 'Instalar actualización'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-1 rounded-lg text-xs text-white/70 hover:text-white transition-colors"
          >
            Saltar
          </button>
        </div>
      </div>
    </div>
  );
}
