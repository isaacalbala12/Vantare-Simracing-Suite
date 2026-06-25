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

  it("records the recommended preset origin without keeping read-only identity", () => {
    const original = RECOMMENDED_PROFILES[0];
    const clone = cloneRecommendedProfile(original, "My Copy");

    expect(clone.source).toEqual({
      kind: "recommended",
      profileId: original.id,
      name: original.name,
    });
    expect((clone as unknown as { readOnly?: boolean }).readOnly).toBeUndefined();
  });

  it("deep clones widgets so the original preset is not mutated", () => {
    const original = RECOMMENDED_PROFILES[0];
    const clone = cloneRecommendedProfile(original, "Mutate Test");

    clone.widgets[0].enabled = !clone.widgets[0].enabled;
    clone.widgets[0].position.x += 100;

    expect(original.profile.widgets[0].enabled).not.toBe(clone.widgets[0].enabled);
    expect(original.profile.widgets[0].position.x).not.toBe(clone.widgets[0].position.x);
  });

  it("falls back to a copy name when an empty name is provided", () => {
    const original = RECOMMENDED_PROFILES[0];
    const clone = cloneRecommendedProfile(original, "   ");

    expect(clone.name).toBe(`${original.name} Copy`);
    expect(clone.id?.startsWith("custom-")).toBe(true);
  });
});
