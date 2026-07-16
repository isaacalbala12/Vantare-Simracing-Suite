import { describe, expect, it } from "vitest";
import { parseDeltaSettings } from "./delta-settings";

describe("parseDeltaSettings", () => {
  it("defaults v1 settings without a template to the canonical bar", () => {
    expect(parseDeltaSettings({ showHeader: false })).toMatchObject({
      templateId: "delta-bar",
      showHeader: false,
    });
  });

  it("accepts the simple composition", () => {
    expect(parseDeltaSettings({ templateId: "delta-simple" })).toMatchObject({
      templateId: "delta-simple",
      showHeader: true,
    });
  });

  it("falls back to the bar and exposes a diagnostic for unknown templates", () => {
    expect(parseDeltaSettings({ templateId: "delta-advanced" })).toMatchObject({
      templateId: "delta-bar",
      templateDiagnostic: "unknown-template",
    });
  });
});

