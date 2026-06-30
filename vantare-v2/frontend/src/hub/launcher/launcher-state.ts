import type { AppSettings, LauncherConfig } from "../pages/SettingsPage";

export type LauncherView =
  | { kind: "unconfigured" }
  | { kind: "ready-steam"; steamAppId: number }
  | { kind: "ready-exec"; path: string; ok: boolean }
  | { kind: "stale"; reason: string };

export const DEFAULT_LMU_STEAM_APP_ID = 2399420;

export function parseLauncherStatus(
  settings: Pick<AppSettings, "launchers"> | null | undefined,
  simulatorId: string = "lmu",
): LauncherView {
  const launchers = settings?.launchers;
  if (!launchers || Object.keys(launchers).length === 0) {
    return { kind: "unconfigured" };
  }
  const cfg = launchers[simulatorId];
  if (!cfg) {
    return { kind: "unconfigured" };
  }
  return parseConfigured(cfg);
}

export function parseConfigured(cfg: LauncherConfig): LauncherView {
  if (!cfg || !cfg.simulatorId || !cfg.launchMethod) {
    return { kind: "stale", reason: "configuración incompleta" };
  }
  switch (cfg.launchMethod) {
    case "steam-uri": {
      const id = cfg.steamAppId ?? DEFAULT_LMU_STEAM_APP_ID;
      if (!id) {
        return { kind: "stale", reason: "Steam AppID no configurado" };
      }
      return { kind: "ready-steam", steamAppId: id };
    }
    case "executable": {
      if (!cfg.executablePath) {
        return { kind: "stale", reason: "Ruta del ejecutable vacía" };
      }
      return { kind: "ready-exec", path: cfg.executablePath, ok: true };
    }
    default:
      return {
        kind: "stale",
        reason: `Método de lanzamiento desconocido: ${cfg.launchMethod}`,
      };
  }
}
