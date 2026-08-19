import { useCallback, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { isDowngrade } from "../../lib/version-compare";
import { findInstallerAsset, type Channel, type Release, type UpdateInfo, type UpdaterSettings } from "./settings-contract";
import { UPDATER_CHANNEL_EVENT } from "./updater-channel";

export type UpdaterSettingsOptions = {
  /**
   * Canales que la licencia permite. Elegir uno fuera de la lista no se guarda:
   * se devuelve en `channelDenied` para que la tarjeta diga el motivo en vez de
   * quedarse muda, que es como lo vivia Isaac (clic sin efecto ni razon).
   */
  allowed?: readonly Channel[];
};

/**
 * Everything the updates section needs: the channel, the release list, and the
 * download lifecycle. Lifted out of SettingsPage so the page renders sections
 * instead of also owning nine pieces of updater state and seven subscriptions.
 */
export function useUpdaterSettings(options?: UpdaterSettingsOptions) {
  const allowed = options?.allowed;
  const [settings, setSettings] = useState<UpdaterSettings>({ channel: "stable" });
  // Ultimo canal que el backend confirmo: si el guardado falla se vuelve a el
  // en lugar de dejar el radio marcando algo que no esta en disco.
  const confirmedRef = useRef<UpdaterSettings>({ channel: "stable" });
  const [channelDenied, setChannelDenied] = useState<Channel | null>(null);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [installingTag, setInstallingTag] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDowngrade, setConfirmDowngrade] = useState<Release | null>(null);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  useEffect(() => {
    const handlers: (() => void)[] = [];

    handlers.push(
      Events.On("updater:settings", (event: { data: { settings?: UpdaterSettings } }) => {
        if (!event.data.settings) return;
        confirmedRef.current = event.data.settings;
        setSettings(event.data.settings);
        // El resto de la app (shell, rail, Testing Center) se entera por aqui.
        Events.Emit(UPDATER_CHANNEL_EVENT, { channel: event.data.settings.channel });
      }),
    );

    handlers.push(
      Events.On("updater:available", (event: { data: { info?: UpdateInfo } }) => {
        setLoading(false);
        if (event.data.info) {
          setInfo(event.data.info);
          setStatus(`Versión instalada: ${event.data.info.currentVersion}`);
        }
      }),
    );

    handlers.push(
      Events.On("updater:progress", (event: { data: { percent?: number } }) => {
        setProgress(event.data.percent ?? null);
        setStatus(`Descargando... ${event.data.percent ?? 0}%`);
      }),
    );

    handlers.push(
      Events.On("updater:installed", () => {
        setInstallingTag(null);
        setProgress(null);
        setStatus("Instalador lanzado. La app se cerrará para completar la actualización.");
      }),
    );

    handlers.push(
      Events.On("updater:ignored", (event: { data: { version?: string } }) => {
        setStatus(`Versión ${event.data.version ?? ""} ignorada.`);
        Events.Emit("updater:check");
      }),
    );

    handlers.push(
      Events.On("updater:settings-saved", () => {
        setStatus("Preferencias guardadas.");
        // El backend confirma con un `ok` pelado: sin volver a pedir los ajustes
        // nadie sabia si lo que se ve es lo que quedo guardado. Ahora se relee.
        Events.Emit("updater:settings:get");
        Events.Emit("updater:check");
        setLoading(true);
      }),
    );

    handlers.push(
      Events.On("updater:error", (event: { data: { message?: string } }) => {
        setLoading(false);
        setInstallingTag(null);
        setProgress(null);
        setError(event.data.message ?? "Error desconocido");
        // Un guardado que falla no puede dejar el radio en el canal nuevo.
        setSettings(confirmedRef.current);
      }),
    );

    Events.Emit("updater:settings:get");
    Events.Emit("updater:check");

    return () => {
      handlers.forEach((h) => h?.());
    };
  }, []);

  const changeChannel = useCallback(
    (channel: Channel) => {
      if (allowed && !allowed.includes(channel)) {
        setChannelDenied(channel);
        return;
      }
      setChannelDenied(null);
      const next = { ...settings, channel };
      // Se refleja al instante (radio, hero y eyebrow leen `settings.channel`) y
      // el guardado real lo confirma o lo revierte desde los eventos de arriba.
      setSettings(next);
      Events.Emit("updater:settings:save", next);
      Events.Emit(UPDATER_CHANNEL_EVENT, { channel });
    },
    [allowed, settings],
  );

  function startInstall(release: Release) {
    const asset = findInstallerAsset(release);
    if (!asset) {
      setError("No se encontró el instalador para esta versión.");
      return;
    }
    setConfirmDowngrade(null);
    setInstallingTag(release.tag_name);
    setError(null);
    setStatus(`Preparando instalación de ${release.tag_name}...`);
    Events.Emit("updater:install:verified", release);
  }

  // A downgrade asks first; anything else installs straight away.
  function install(release: Release) {
    const current = info?.currentVersion;
    if (current && isDowngrade(current, release.tag_name)) {
      setConfirmDowngrade(release);
      return;
    }
    startInstall(release);
  }

  function ignore(release: Release) {
    Events.Emit("updater:ignore", { version: release.tag_name });
  }

  function refresh() {
    setError(null);
    setLoading(true);
    Events.Emit("updater:check");
  }

  return {
    settings,
    channelDenied,
    info,
    loading,
    installingTag,
    progress,
    status,
    error,
    confirmDowngrade,
    expandedTag,
    setExpandedTag,
    setConfirmDowngrade,
    changeChannel,
    install,
    startInstall,
    ignore,
    refresh,
  };
}
