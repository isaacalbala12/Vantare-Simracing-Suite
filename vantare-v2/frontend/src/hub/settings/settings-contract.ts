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

/**
 * What the user has turned off, not what they have turned on.
 *
 * Stated as opt-outs so that an absent value means the shipping default:
 * banner and toasts on, system notifications off because they cannot work
 * until the operating system grants permission. Mirrors the Go struct.
 */
export type NotificationSettings = {
  updatesMuted?: boolean;
  launcherMuted?: boolean;
  systemEnabled?: boolean;
};

export type AppSettings = {
  cpuSampling: boolean;
  notifications?: NotificationSettings;
  hotkeys: Record<string, string>;
  activeOverlayProfileId?: string;
  betaWelcomeCompleted?: boolean;
  betaUserRole?: string;
  launcherApps?: Record<string, LauncherAppEntry>;
  launcherProfiles?: LaunchProfile[];
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  cpuSampling: true,
  notifications: {},
  hotkeys: {
    toggleOverlay: "ctrl+shift+v",
    nextProfile: "ctrl+shift+right",
    prevProfile: "ctrl+shift+left",
  },
};

/**
 * The hotkeys the user can rebind, in display order. Their labels live in the
 * i18n dictionaries under settings.hotkeys.<key>; this list only decides which
 * ones exist and in what order.
 */
export const HOTKEY_KEYS = ["toggleOverlay", "nextProfile", "prevProfile"] as const;

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
