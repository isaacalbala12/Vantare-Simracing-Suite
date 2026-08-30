import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "./settings-contract";
import goDefaultPerformance from "./testdata/settings-default-performance.go.json";

describe("settings performance contract", () => {
  it("keeps the Go automatic default and the closed seven-choice wire modes", () => {
		expect(DEFAULT_APP_SETTINGS.performance).toEqual(goDefaultPerformance);
		expect(goDefaultPerformance).toEqual({ mode: "auto", level: 3, source: "default" });
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
		performance: { mode: "custom", level: 3, source: "user", overrides: { delta: { hz: "dirty", effects: "flat" } } },
    };
    expect(settings.performance.overrides?.delta).toEqual({ hz: "dirty", effects: "flat" });
  });
});
