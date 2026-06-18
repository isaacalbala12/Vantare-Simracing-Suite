import { describe, expect, it } from "vitest";
import { RECOMMENDED_PROFILES, cloneRecommendedProfile } from "./recommended-profiles";

describe("recommended-profiles", () => {
  it("contains fixed read-only Vantare presets", () => {
    expect(RECOMMENDED_PROFILES.length).toBeGreaterThanOrEqual(3);
    expect(RECOMMENDED_PROFILES.every((profile) => profile.readOnly)).toBe(true);
  });

  it("only uses currently implemented widget types", () => {
    const allowed = new Set(["delta", "relative", "standings", "telemetry", "telemetry-vertical", "pedals"]);
    for (const recommended of RECOMMENDED_PROFILES) {
      for (const widget of recommended.profile.widgets) {
        expect(allowed.has(widget.type)).toBe(true);
      }
    }
  });

  it("clones a preset as an editable custom profile", () => {
    const clone = cloneRecommendedProfile(RECOMMENDED_PROFILES[0], "My Copy");

    expect(clone.name).toBe("My Copy");
    expect(clone.id?.startsWith("custom-")).toBe(true);
    expect(clone.widgets.length).toBe(RECOMMENDED_PROFILES[0].profile.widgets.length);
    expect(clone).not.toBe(RECOMMENDED_PROFILES[0].profile);
  });
});
