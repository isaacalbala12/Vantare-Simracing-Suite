import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { isDowngrade } from "../../lib/version-compare";
import { findInstallerAsset, type Channel, type Release, type UpdateInfo, type UpdaterSettings } from "./settings-contract";

/**
 * Everything the updates section needs: the channel, the release list, and the
 * download lifecycle. Lifted out of SettingsPage so the page renders sections
 * instead of also owning nine pieces of updater state and seven subscriptions.
 */
export function useUpdaterSettings() {
  const [settings, setSettings] = useState<UpdaterSettings>({ channel: "stable" });
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
        if (event.data.settings) setSettings(event.data.settings);
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
      }),
    );

    Events.Emit("updater:settings:get");
    Events.Emit("updater:check");

    return () => {
      handlers.forEach((h) => h?.());
    };
  }, []);

  function changeChannel(channel: Channel) {
    const next = { ...settings, channel };
    setSettings(next);
    Events.Emit("updater:settings:save", next);
  }

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
