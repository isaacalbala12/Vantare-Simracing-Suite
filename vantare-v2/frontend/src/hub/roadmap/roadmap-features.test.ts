import { describe, expect, it } from "vitest";
import {
  getFeatureCategories,
  getFutureCategories,
  getOverallFeatureProgress,
} from "./roadmap-features";

describe("roadmap-features", () => {
  describe("getFeatureCategories", () => {
    it("returns categories from active plans", () => {
      const categories = getFeatureCategories();
      expect(categories.length).toBeGreaterThan(0);
    });

    it("each category has features with valid percent", () => {
      const categories = getFeatureCategories();
      for (const cat of categories) {
        expect(cat.percent).toBeGreaterThanOrEqual(0);
        expect(cat.percent).toBeLessThanOrEqual(100);
        expect(cat.features.length).toBeGreaterThan(0);
        for (const feat of cat.features) {
          expect(feat.percent).toBeGreaterThanOrEqual(0);
          expect(feat.percent).toBeLessThanOrEqual(100);
          expect(feat.label).toBeTruthy();
          expect(feat.slug).toBeTruthy();
        }
      }
    });

    it("all features have description", () => {
      const categories = getFeatureCategories();
      const allFeatures = categories.flatMap((c) => [...c.features]);
      for (const feat of allFeatures) {
        expect(feat.description).toBeTruthy();
      }
    });
  });

  describe("getFutureCategories", () => {
    it("returns array (may be empty)", () => {
      const categories = getFutureCategories();
      expect(Array.isArray(categories)).toBe(true);
    });
  });

  describe("getOverallFeatureProgress", () => {
    it("returns a number between 0 and 100", () => {
      const progress = getOverallFeatureProgress();
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(100);
    });
  });
});
