import { describe, expect, it } from "vitest";
import type {
  LaunchPolicy,
  LauncherApp,
  LauncherCommandError,
  LauncherSnapshot,
} from "./launcher-contract";

describe("launcher wire contract", () => {
  it("keeps availability as four independent wire flags", () => {
    const app: LauncherApp = {
      id: "obs",
      displayName: "OBS Studio",
      abbreviation: "OBS",
      category: "streaming",
      launchMethod: "executable",
      detected: true,
      availability: {
        catalogued: true,
        found: true,
        installed: false,
        launchable: false,
      },
      gradientFrom: "#000",
      gradientTo: "#fff",
    };

    expect(app.detected).toBe(true);
    expect(app.availability).toEqual({
      catalogued: true,
      found: true,
      installed: false,
      launchable: false,
    });
  });

  it("represents policies without weakening their allowed values", () => {
    const policy: LaunchPolicy = {
      alreadyRunning: "ask",
      failure: "continue",
      cancel: "leave",
      exit: "close-started",
      retry: "failed",
      maxRetries: 2,
      firstStepDelay: 0,
    };

    expect(policy.maxRetries).toBe(2);
    expect(policy.retry).toBe("failed");
  });

  it("keeps an empty activeChains list valid in a snapshot", () => {
    const snapshot: LauncherSnapshot = {
      revision: 3,
      apps: [],
      vantareProfiles: [],
      userProfiles: [],
      activeChains: [],
      discovery: { scanning: false, lastScanAt: null, error: null },
    };

    expect(snapshot.activeChains).toEqual([]);
  });

  it("carries typed command errors across the bridge", () => {
    const error: LauncherCommandError = {
      code: "app_not_launchable",
      message: "The selected app cannot be launched.",
      command: "launcher:profile:launch",
      retryable: false,
    };

    expect(error.retryable).toBe(false);
    expect(error.code).toBe("app_not_launchable");
  });
});
