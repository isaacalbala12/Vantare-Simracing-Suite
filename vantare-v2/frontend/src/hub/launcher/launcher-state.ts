import type { AppSettings } from "../settings/settings-contract";
import type {
  LaunchProfile,
  LauncherAppEntry,
} from "./launcher-contract";

export type {
  AlreadyRunningPolicy,
  CancelPolicy,
  ExitPolicy,
  FailurePolicy,
  LaunchPolicy,
  LaunchProfile,
  LaunchStep,
  LauncherApp,
  LauncherAppCategory,
  LauncherAppEntry,
  LauncherAvailability,
  LauncherCommandError,
  LauncherDiscovery,
  LauncherActiveChain,
  LauncherSnapshot,
  RetryPolicy,
} from "./launcher-contract";

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

export function hasDuplicateSteps(profile: LaunchProfile): boolean {
  const ids = profile.steps.map((step) => step.appId).filter(Boolean);
  return new Set(ids).size !== ids.length;
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
  for (const [index, step] of profile.steps.entries()) {
    const app = apps.find((a) => a.id === step.appId);
    const launchOverheadMs = app?.launchMethod === "steam-uri" ? 1000 : 2000;
    const delay = index === 0 ? (profile.policy?.firstStepDelay ?? 0) : step.delay;
    totalMs += delay * 1000 + launchOverheadMs;
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
  "alt+f4",
  "alt+tab",
  "win+l",
]);

export function isHotkeyAllowed(hotkey: string): boolean {
  const combo = hotkey.toLowerCase().trim();
  if (RESERVED_HOTKEYS.has(combo)) return false;
  const parts = combo.split("+");
  if (parts.length < 2) return false;
  const modifiers = parts.slice(0, -1);
  if (new Set(modifiers).size !== modifiers.length ||
      modifiers.some((part) => !["ctrl", "alt", "shift", "win"].includes(part))) return false;
  const key = parts.at(-1) ?? "";
  return /^[a-z0-9]$/.test(key) || /^f(?:[1-9]|1[0-2])$/.test(key) ||
    ["right", "left", "up", "down", "space", "enter", "escape", "tab", "backspace", "delete", "insert", "home", "end", "pageup", "pagedown"].includes(key);
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
