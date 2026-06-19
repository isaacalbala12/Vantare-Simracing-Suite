import type { ProfileConfig } from "../../lib/profile";

export type ProfileEntry = {
  id: string;
  file: string;
  name?: string;
  displayMode: string;
  widgets: number;
  profile?: ProfileConfig;
};

export type ProfileTarget = {
  id: string;
  file: string;
};

export type OverlayStatus = {
  running?: boolean;
  profileId?: string;
  mode?: string;
};

export function profileLabel(profile: ProfileEntry): string {
  return profile.name?.trim() || profile.id;
}

export function profileTarget(profile: ProfileEntry): ProfileTarget {
  return {
    id: profile.id,
    file: profile.file,
  };
}

export function isRunningProfile(profile: ProfileEntry, status: OverlayStatus | null): boolean {
  return Boolean(status?.running && status.profileId === profile.id);
}
