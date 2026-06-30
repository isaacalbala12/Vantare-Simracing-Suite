import { describe, expect, it } from "vitest";
import {
  DEFAULT_LMU_STEAM_APP_ID,
  parseConfigured,
  parseLauncherStatus,
} from "./launcher-state";
import type { AppSettings, LauncherConfig } from "../pages/SettingsPage";

function makeSettings(launchers: Record<string, LauncherConfig> | undefined): AppSettings {
  return {
    deltaMode: "self",
    cpuSampling: true,
    hotkeys: {},
    launchers,
  };
}

describe("parseLauncherStatus", () => {
  it("returns unconfigured when settings are null", () => {
    expect(parseLauncherStatus(null)).toEqual({ kind: "unconfigured" });
  });

  it("returns unconfigured when settings are undefined", () => {
    expect(parseLauncherStatus(undefined)).toEqual({ kind: "unconfigured" });
  });

  it("returns unconfigured when launchers map is missing", () => {
    expect(parseLauncherStatus(makeSettings(undefined))).toEqual({
      kind: "unconfigured",
    });
  });

  it("returns unconfigured when launchers map is empty", () => {
    expect(parseLauncherStatus(makeSettings({}))).toEqual({
      kind: "unconfigured",
    });
  });

  it("returns ready-steam for a configured steam-uri entry with a Steam AppID", () => {
    const settings = makeSettings({
      lmu: {
        simulatorId: "lmu",
        launchMethod: "steam-uri",
        steamAppId: 2399420,
      },
    });
    expect(parseLauncherStatus(settings)).toEqual({
      kind: "ready-steam",
      steamAppId: 2399420,
    });
  });

  it("falls back to the default LMU AppID when steamAppId is missing", () => {
    const settings = makeSettings({
      lmu: { simulatorId: "lmu", launchMethod: "steam-uri" },
    });
    expect(parseLauncherStatus(settings)).toEqual({
      kind: "ready-steam",
      steamAppId: DEFAULT_LMU_STEAM_APP_ID,
    });
  });

  it("returns ready-exec for a configured executable entry", () => {
    const settings = makeSettings({
      lmu: {
        simulatorId: "lmu",
        launchMethod: "executable",
        executablePath: "C:/Games/LMU/LMU.exe",
        steamAppId: 2399420,
      },
    });
    expect(parseLauncherStatus(settings)).toEqual({
      kind: "ready-exec",
      path: "C:/Games/LMU/LMU.exe",
      ok: true,
    });
  });

  it("returns unconfigured when the only entry is for a different simulator", () => {
    const settings = makeSettings({
      iracing: {
        simulatorId: "iracing",
        launchMethod: "steam-uri",
        steamAppId: 266410,
      },
    });
    expect(parseLauncherStatus(settings)).toEqual({ kind: "unconfigured" });
  });

  it("returns stale for an unknown launch method", () => {
    const settings = makeSettings({
      lmu: { simulatorId: "lmu", launchMethod: "magic" },
    });
    expect(parseLauncherStatus(settings)).toEqual({
      kind: "stale",
      reason: expect.stringMatching(/desconocido/i) as unknown as string,
    });
  });

  it("returns stale for executable with empty path", () => {
    const settings = makeSettings({
      lmu: { simulatorId: "lmu", launchMethod: "executable", executablePath: "" },
    });
    expect(parseLauncherStatus(settings)).toEqual({
      kind: "stale",
      reason: expect.stringMatching(/vacía/i) as unknown as string,
    });
  });
});

describe("parseConfigured", () => {
  it("returns stale for an empty config", () => {
    expect(parseConfigured({} as LauncherConfig)).toEqual({
      kind: "stale",
      reason: expect.any(String) as unknown as string,
    });
  });
});
