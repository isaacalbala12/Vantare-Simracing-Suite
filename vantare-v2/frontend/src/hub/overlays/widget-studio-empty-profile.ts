import type { ProfileConfig } from "../../lib/profile";

/**
 * Synthetic empty profile used when the user enters Widget Studio
 * without a real profile loaded. This is a valid ProfileConfig
 * (no position/x/y/w/h, no autosave, no backend persistence).
 *
 * The user can iterate on designs and settings freely, but
 * saving is blocked until they create or select a real profile.
 */
export const EMPTY_PROFILE: ProfileConfig = {
  schemaVersion: 2,
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [],
  variants: [],
  layouts: {},
};

/**
 * Returns true when the profile is synthetic (null or the empty profile).
 * Used to disable save/design controls and show honest copy.
 */
export function isSyntheticProfile(profile: ProfileConfig | null): boolean {
  if (profile === null) return true;
  return profile.id === undefined && profile.widgets.length === 0;
}
