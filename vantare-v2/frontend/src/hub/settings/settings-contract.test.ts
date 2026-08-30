import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "./settings-contract";

describe("settings performance contract", () => {
  it("keeps the Go parity default and the closed seven-choice wire modes", () => {
    expect(DEFAULT_APP_SETTINGS.performance).toEqual({ mode: "level", level: 1 });
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      performance: { mode: "custom", level: 3, overrides: { delta: { hz: "dirty", effects: "flat" } } },
    };
    expect(settings.performance.overrides?.delta).toEqual({ hz: "dirty", effects: "flat" });
  });
});
