import type { AppSettings } from "../pages/SettingsPage";

export type LauncherAppCategory =
  | "simulator"
  | "streaming"
  | "audio"
  | "telemetry"
  | "utility";

export type LauncherAppEntry = {
  id: string;
  displayName: string;
  abbreviation: string;
  category: LauncherAppCategory;
  launchMethod: "steam-uri" | "executable";
  steamAppId?: number;
  executablePath?: string;
  args?: string;
  detected: boolean;
  gradientFrom: string;
  gradientTo: string;
};

export type LaunchStep = { appId: string; delay: number };

export type LaunchProfile = {
  id: string;
  name: string;
  description?: string;
  steps: LaunchStep[];
};

export type ChainStatus = "waiting" | "starting" | "started" | "error" | "done";

export type ChainProgress = {
  profileId: string;
  stepIndex: number;
  appId: string;
  status: ChainStatus;
  message?: string;
};

// Helpers puros

export function getAppsFromSettings(
  settings: AppSettings | null | undefined,
): LauncherAppEntry[] {
  if (!settings?.launcherApps) return [];
  return Object.values(settings.launcherApps).sort(appSortOrder);
}

export function getProfilesFromSettings(
  settings: AppSettings | null | undefined,
): LaunchProfile[] {
  return settings?.launcherProfiles ?? [];
}

export function appSortOrder(
  a: LauncherAppEntry,
  b: LauncherAppEntry,
): number {
  // LMU primero, luego por category, luego por displayName
  const catOrder = [
    "simulator",
    "streaming",
    "audio",
    "telemetry",
    "utility",
  ];
  if (a.id === "lmu" && b.id !== "lmu") return -1;
  if (b.id === "lmu" && a.id !== "lmu") return 1;
  const ca = catOrder.indexOf(a.category);
  const cb = catOrder.indexOf(b.category);
  if (ca !== cb) return ca - cb;
  return a.displayName.localeCompare(b.displayName);
}

export function isProfileLaunchable(
  profile: LaunchProfile,
  apps: LauncherAppEntry[],
): boolean {
  const appIds = new Set(apps.map((a) => a.id));
  return (
    profile.steps.length > 0 &&
    profile.steps.every((s) => appIds.has(s.appId))
  );
}

// newProfileId genera un id único para un perfil o app nuevos.
export function newProfileId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
