import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STATUS_META,
  TIPO_META,
  featurePercent,
  getActiveSections,
  getOverallFeatureProgress,
  groupFeaturesByCategory,
} from "./roadmap-features";
import { FEATURES_FALLBACK } from "./features-data";

describe("TIPO_META", () => {
  it("has 4 tipos (no research — research is a status, not a type)", () => {
    expect(Object.keys(TIPO_META).sort()).toEqual(
      ["bugfix", "component", "feature", "improve"].sort(),
    );
  });
  it("every tipo has icon and label", () => {
    for (const v of Object.values(TIPO_META)) {
      expect(v.icon).toBeTruthy();
      expect(v.label).toBeTruthy();
    }
  });
});

describe("STATUS_META", () => {
  it("has exactly 3 statuses", () => {
    expect(Object.keys(STATUS_META).sort()).toEqual(
      ["future", "in-development", "research"].sort(),
    );
  });
  it("every status has label and color", () => {
    for (const v of Object.values(STATUS_META)) {
      expect(v.label).toBeTruthy();
      expect(v.color).toBeTruthy();
    }
  });
});

describe("getActiveSections", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("no network in tests")),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 3 sections and overallProgress", async () => {
    const { sections, overallProgress } = await getActiveSections();
    expect(sections.inDevelopment).toBeDefined();
    expect(sections.research).toBeDefined();
    expect(sections.future).toBeDefined();
    expect(Array.isArray(sections.inDevelopment)).toBe(true);
    expect(Array.isArray(sections.research)).toBe(true);
    expect(Array.isArray(sections.future)).toBe(true);
    expect(overallProgress).toBeGreaterThanOrEqual(0);
    expect(overallProgress).toBeLessThanOrEqual(100);
  });

  it("splits fallback features by status", async () => {
    const { sections } = await getActiveSections();
    const allIds = [
      ...sections.inDevelopment.flatMap((c) => c.features.map((f) => f.id)),
      ...sections.research.flatMap((c) => c.features.map((f) => f.id)),
      ...sections.future.flatMap((c) => c.features.map((f) => f.id)),
    ].sort();
    const expected = FEATURES_FALLBACK.features.map((f) => f.id).sort();
    expect(allIds).toEqual(expected);
  });

  it("every category is sorted by percent desc within the section", async () => {
    const { sections } = await getActiveSections();
    for (const arr of [sections.inDevelopment, sections.research, sections.future]) {
      for (const cat of arr) {
        for (let i = 1; i < cat.features.length; i++) {
          expect(featurePercent(cat.features[i - 1])).toBeGreaterThanOrEqual(
            featurePercent(cat.features[i]),
          );
        }
      }
    }
  });
});

describe("groupFeaturesByCategory", () => {
  it("groups a list of features by category id", () => {
    const grouped = groupFeaturesByCategory(FEATURES_FALLBACK.features);
    expect(grouped.size).toBeGreaterThan(0);
    for (const [, feats] of grouped) {
      expect(feats.length).toBeGreaterThan(0);
    }
  });
});

describe("getOverallFeatureProgress", () => {
  it("returns a number between 0 and 100", () => {
    const p = getOverallFeatureProgress(FEATURES_FALLBACK);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
  });
});
