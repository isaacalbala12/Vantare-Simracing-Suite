/**
 * Shared types and constants for the settings section.
 *
 * These lived inside SettingsPage.tsx, which meant four unrelated modules
 * imported a domain type from a page component. A page is a place to render,
 * not the home of the settings contract.
 */
import type { LauncherAppEntry, LaunchProfile } from "../launcher/launcher-state";

export type Channel = "stable" | "testers" | "nightly";

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

export type AppSettings = {
  deltaMode: string;
  cpuSampling: boolean;
  hotkeys: Record<string, string>;
  activeOverlayProfileId?: string;
  betaWelcomeCompleted?: boolean;
  betaUserRole?: string;
  launcherApps?: Record<string, LauncherAppEntry>;
  launcherProfiles?: LaunchProfile[];
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  deltaMode: "self",
  cpuSampling: true,
  hotkeys: {
    toggleOverlay: "ctrl+shift+v",
    nextProfile: "ctrl+shift+right",
    prevProfile: "ctrl+shift+left",
  },
};

export const DELTA_MODES = [
  { value: "self", label: "Personal (mejor vuelta propia)" },
  { value: "session", label: "Sesion (mejor vuelta de la sesion)" },
  { value: "global", label: "Global (mejor vuelta global)" },
] as const;

export const HOTKEY_NAMES: Record<string, string> = {
  toggleOverlay: "Toggle overlay",
  nextProfile: "Siguiente perfil",
  prevProfile: "Perfil anterior",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  stable: "Stable",
  testers: "Testers",
  nightly: "Nightly",
};

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function findInstallerAsset(release: Release): Asset | undefined {
  return release.assets.find((a) => a.name === "vantare-amd64-installer.exe");
}

export function findChecksumAsset(release: Release): Asset | undefined {
  return release.assets.find((a) => a.name === "vantare-amd64-installer.exe.sha256");
}
