import { describe, expect, it } from "vitest";
import type { AppSettings } from "../pages/SettingsPage";
import {
  appSortOrder,
  getAppsFromSettings,
  getProfilesFromSettings,
  isProfileLaunchable,
  type LauncherAppEntry,
} from "./launcher-state";

function makeApp(over: Partial<LauncherAppEntry>): LauncherAppEntry {
  return {
    id: over.id ?? "x",
    displayName: over.displayName ?? "X",
    abbreviation: over.abbreviation ?? "X",
    category: over.category ?? "utility",
    launchMethod: over.launchMethod ?? "executable",
    detected: over.detected ?? false,
    gradientFrom: over.gradientFrom ?? "#000",
    gradientTo: over.gradientTo ?? "#fff",
  };
}

describe("getAppsFromSettings", () => {
  it("returns empty array for null settings", () => {
    expect(getAppsFromSettings(null)).toEqual([]);
  });

  it("returns empty array for undefined settings", () => {
    expect(getAppsFromSettings(undefined)).toEqual([]);
  });

  it("returns empty array when launcherApps is missing", () => {
    expect(getAppsFromSettings({} as AppSettings)).toEqual([]);
  });

  it("sorts LMU first, then by category, then by display name", () => {
    const settings = {
      launcherApps: {
        spotify: makeApp({
          id: "spotify",
          displayName: "Spotify",
          category: "audio",
        }),
        lmu: makeApp({ id: "lmu", displayName: "LMU", category: "simulator" }),
        obs: makeApp({
          id: "obs",
          displayName: "OBS Studio",
          category: "streaming",
        }),
      },
    } as unknown as AppSettings;
    const ids = getAppsFromSettings(settings).map((a) => a.id);
    expect(ids).toEqual(["lmu", "obs", "spotify"]);
  });
});

describe("getProfilesFromSettings", () => {
  it("returns empty array for null settings", () => {
    expect(getProfilesFromSettings(null)).toEqual([]);
  });

  it("returns the profiles slice", () => {
    const profiles = [
      { id: "pro", name: "Pro", steps: [] },
      { id: "creator", name: "Creator", steps: [] },
    ];
    const settings = {
      launcherProfiles: profiles,
    } as unknown as AppSettings;
    expect(getProfilesFromSettings(settings)).toEqual(profiles);
  });
});

describe("appSortOrder", () => {
  it("puts LMU before any other app", () => {
    expect(
      appSortOrder(
        makeApp({ id: "lmu", category: "simulator" }),
        makeApp({ id: "obs", category: "simulator" }),
      ),
    ).toBe(-1);
  });

  it("orders by category when neither is LMU", () => {
    expect(
      appSortOrder(
        makeApp({ id: "obs", category: "streaming" }),
        makeApp({ id: "spotify", category: "audio" }),
      ),
    ).toBeLessThan(0);
  });

  it("orders by display name within the same category", () => {
    expect(
      appSortOrder(
        makeApp({ id: "a", displayName: "Alpha", category: "audio" }),
        makeApp({ id: "b", displayName: "Beta", category: "audio" }),
      ),
    ).toBeLessThan(0);
  });
});

describe("isProfileLaunchable", () => {
  const apps = [
    makeApp({ id: "lmu", category: "simulator" }),
    makeApp({ id: "obs", category: "streaming" }),
  ];

  it("returns false for a profile with no steps", () => {
    expect(
      isProfileLaunchable({ id: "p", name: "P", steps: [] }, apps),
    ).toBe(false);
  });

  it("returns false when a step references an unknown app", () => {
    expect(
      isProfileLaunchable(
        { id: "p", name: "P", steps: [{ appId: "missing", delay: 0 }] },
        apps,
      ),
    ).toBe(false);
  });

  it("returns true when every step references a known app", () => {
    expect(
      isProfileLaunchable(
        {
          id: "p",
          name: "P",
          steps: [
            { appId: "lmu", delay: 0 },
            { appId: "obs", delay: 2 },
          ],
        },
        apps,
      ),
    ).toBe(true);
  });
});
