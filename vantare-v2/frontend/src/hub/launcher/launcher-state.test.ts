import { describe, expect, it } from "vitest";
import type { AppSettings } from "../pages/SettingsPage";
import {
  appSortOrder,
  estimateChainDuration,
  formatRelativeTime,
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

describe("estimateChainDuration", () => {
  it("returns 0 for empty profile", () => {
    const profile = { id: "p", name: "P", steps: [] };
    expect(estimateChainDuration(profile, [])).toBe(0);
  });

  it("sums delays + 2s per executable + 1s per steam-uri", () => {
    const profile = {
      id: "p", name: "P",
      steps: [
        { appId: "lmu", delay: 0 },
        { appId: "obs", delay: 2 },
      ],
    };
    const apps = [
      { id: "lmu", launchMethod: "steam-uri" as const, detected: true, displayName: "LMU", abbreviation: "LMU", category: "simulator" as const, gradientFrom: "", gradientTo: "" },
      { id: "obs", launchMethod: "executable" as const, detected: true, displayName: "OBS", abbreviation: "OBS", category: "streaming" as const, gradientFrom: "", gradientTo: "" },
    ];
    // 0 (lmu delay) + 1 (steam-uri) + 2 (obs delay) + 2 (executable) = 5
    expect(estimateChainDuration(profile, apps)).toBe(5000);
  });

  it("prefers avgChainDurationMs over estimate when present", () => {
    const profile = {
      id: "p", name: "P",
      steps: [{ appId: "lmu", delay: 0 }],
      avgChainDurationMs: 12345,
    };
    expect(estimateChainDuration(profile, [])).toBe(12345);
  });
});

describe("formatRelativeTime", () => {
  it("returns empty string for negative ms", () => {
    expect(formatRelativeTime(-1)).toBe("");
  });

  it("returns 'hace unos segundos' for less than 1 minute", () => {
    expect(formatRelativeTime(0)).toBe("hace unos segundos");
    expect(formatRelativeTime(59000)).toBe("hace unos segundos");
  });

  it("returns minutes for < 60 min", () => {
    expect(formatRelativeTime(60000)).toBe("hace 1m");
    expect(formatRelativeTime(600000)).toBe("hace 10m");
    expect(formatRelativeTime(3540000)).toBe("hace 59m");
  });

  it("returns hours for < 24h", () => {
    expect(formatRelativeTime(3600000)).toBe("hace 1h");
    expect(formatRelativeTime(7200000)).toBe("hace 2h");
    expect(formatRelativeTime(82800000)).toBe("hace 23h");
  });

  it("returns days for >= 24h", () => {
    expect(formatRelativeTime(86400000)).toBe("hace 1d");
    expect(formatRelativeTime(172800000)).toBe("hace 2d");
    expect(formatRelativeTime(864000000)).toBe("hace 10d");
  });
});
