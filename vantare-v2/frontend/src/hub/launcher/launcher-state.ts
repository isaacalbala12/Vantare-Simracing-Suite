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
  isFavorite?: boolean;
};

export type LaunchStep = { appId: string; delay: number };

export type LaunchProfile = {
  id: string;
  name: string;
  description?: string;
  steps: LaunchStep[];
  isFavorite?: boolean;
  notes?: string;
  launchCount?: number;
  lastLaunchedAt?: string | null;
  avgChainDurationMs?: number;
  launchOnWindowsStartup?: boolean;
  hotkey?: string;
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

// estimateChainDuration estima la duración total de una cadena en ms.
// Si el profile ya tiene avgChainDurationMs (telemetría real), se prefiere.
// Si no hay steps, devuelve 0. En otro caso suma delay*1000 + overhead por app
// (1s para steam-uri, 2s para executable).
export function estimateChainDuration(
  profile: LaunchProfile,
  apps: LauncherAppEntry[],
): number {
  if (profile.avgChainDurationMs) return profile.avgChainDurationMs;
  if (profile.steps.length === 0) return 0;
  let totalMs = 0;
  for (const step of profile.steps) {
    const app = apps.find((a) => a.id === step.appId);
    const launchOverheadMs = app?.launchMethod === "steam-uri" ? 1000 : 2000;
    totalMs += step.delay * 1000 + launchOverheadMs;
  }
  return totalMs;
}

// Hotkeys reservadas del sistema que no deben asignarse a perfiles.
const RESERVED_HOTKEYS = new Set([
  "ctrl+c",
  "ctrl+v",
  "ctrl+x",
  "ctrl+a",
  "ctrl+z",
  "ctrl+y",
  "ctrl+s",
  "ctrl+o",
  "ctrl+n",
  "ctrl+p",
  "ctrl+w",
  "ctrl+q",
  "ctrl+r",
  "ctrl+t",
  "ctrl+f",
  "ctrl+h",
  "ctrl+d",
  "ctrl+e",
  "ctrl+b",
  "ctrl+u",
  "ctrl+i",
  "ctrl+l",
  "ctrl+k",
  "ctrl+j",
  "win+l",
]);

export function isHotkeyAllowed(hotkey: string): boolean {
  return !RESERVED_HOTKEYS.has(hotkey.toLowerCase().trim());
}

/** Format a relative time string (e.g. "hace 10m", "hace 2h", "hace 3d"). */
export function formatRelativeTime(ms: number): string {
  if (ms < 0) return "";
  const diffMin = Math.floor(ms / 60000);
  if (diffMin < 1) return "hace unos segundos";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr}h`;
  const diffDays = Math.round(diffHr / 24);
  return `hace ${diffDays}d`;
}

// newProfileId genera un id único para un perfil o app nuevos.
export function newProfileId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
