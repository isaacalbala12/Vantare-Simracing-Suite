import type { LauncherAppEntry } from "./launcher-state";

export type OfficialIconId =
  | "lmu"
  | "obs"
  | "crewchief"
  | "discord"
  | "spotify"
  | "motec"
  | "simhub";

/**
 * Official assets are intentionally empty until the user supplies the seven
 * approved files. Keeping the registry typed makes the omission explicit and
 * prevents a network URL or an invented logo from entering the UI.
 */
export const OFFICIAL_ICON_ASSETS: Record<OfficialIconId, string | undefined> = {
  lmu: undefined,
  obs: undefined,
  crewchief: undefined,
  discord: undefined,
  spotify: undefined,
  motec: undefined,
  simhub: undefined,
};

export function getOfficialIconAsset(id: string): string | undefined {
  return id in OFFICIAL_ICON_ASSETS
    ? OFFICIAL_ICON_ASSETS[id as OfficialIconId]
    : undefined;
}

export function resolveIconCandidates(app: LauncherAppEntry): string[] {
  const candidates: string[] = [];
  const official = getOfficialIconAsset(app.id);
  if (official) candidates.push(official);
  if (app.iconUrl && !/^https?:\/\//i.test(app.iconUrl)) {
    candidates.push(app.iconUrl);
  }
  return candidates;
}
