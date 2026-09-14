import { describe, expect, it } from "vitest";
import { parseDeltaEnduranceSettings, normalizeDeltaEnduranceSettings } from "./delta-endurance-settings";
describe("delta loss colour", () => {
  it("preserves a configured colour through normalization and parsing", () => {
    expect(parseDeltaEnduranceSettings(normalizeDeltaEnduranceSettings({ lossColor: "#d50020" }))).toMatchObject({ lossColor: "#d50020" });
  });
  it("rejects invalid colours using the existing default", () => {
    expect(parseDeltaEnduranceSettings({ lossColor: "url(evil)" })).toMatchObject({ lossColor: "#ff6b76" });
  });
});
