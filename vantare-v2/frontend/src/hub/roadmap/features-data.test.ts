import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FEATURES_FALLBACK,
  FEATURES_SOURCE_URL,
  fetchFeaturesDataset,
  type FeatureStatus,
  type FeatureTipo,
} from "./features-data";

const lt = (s: string) => ({ es: s, en: s, pt: s, it: s });

describe("FEATURES_FALLBACK dataset", () => {
  it("has 5 categories and 5 features", () => {
    expect(FEATURES_FALLBACK.categories.length).toBe(5);
    expect(FEATURES_FALLBACK.features.length).toBe(5);
  });

  it("every feature has a category id that exists in categories", () => {
    const ids = new Set(FEATURES_FALLBACK.categories.map((c) => c.id));
    for (const f of FEATURES_FALLBACK.features) {
      expect(ids.has(f.category)).toBe(true);
    }
  });

  it("every feature has a valid status", () => {
    const valid: FeatureStatus[] = ["in-development", "research", "future"];
    for (const f of FEATURES_FALLBACK.features) {
      expect(valid).toContain(f.status);
    }
  });

  it("every feature has a valid tipo", () => {
    const valid: FeatureTipo[] = ["feature", "bugfix", "improve", "component"];
    for (const f of FEATURES_FALLBACK.features) {
      expect(valid).toContain(f.tipo);
    }
  });

  it("every feature has subtasks", () => {
    for (const f of FEATURES_FALLBACK.features) {
      expect(Array.isArray(f.subtasks)).toBe(true);
      expect(f.subtasks.length).toBeGreaterThan(0);
    }
  });

  it("every category has a label in es/en/pt/it", () => {
    for (const c of FEATURES_FALLBACK.categories) {
      expect(c.label.es).toBeTruthy();
      expect(c.label.en).toBeTruthy();
      expect(c.label.pt).toBeTruthy();
      expect(c.label.it).toBeTruthy();
    }
  });

  it("every feature has a non-empty id, label.es, description.es", () => {
    for (const f of FEATURES_FALLBACK.features) {
      expect(f.id).toBeTruthy();
      expect(f.label.es).toBeTruthy();
      expect(f.description.es).toBeTruthy();
    }
  });

  it("source url points to the manual features json", () => {
    expect(FEATURES_SOURCE_URL).toContain("docs/features-source.json");
  });
});

describe("fetchFeaturesDataset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and parses the remote source", async () => {
    const fakeJson = {
      categories: [{ id: "calendar", label: lt("Calendar"), order: 1 }],
      features: [{
        id: "x", category: "calendar", label: lt("X"), description: lt("d"),
        tipo: "feature", status: "in-development",
        subtasks: [{ label: lt("task1"), done: false }],
      }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => fakeJson }));
    const ds = await fetchFeaturesDataset();
    expect(ds.categories.length).toBe(1);
    expect(ds.features.length).toBe(1);
    expect(ds.features[0].id).toBe("x");
  });

  it("falls back to FEATURES_FALLBACK when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));
    const ds = await fetchFeaturesDataset();
    expect(ds.features.length).toBe(FEATURES_FALLBACK.features.length);
  });

  it("falls back when the remote shape is invalid (missing categories)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }));
    const ds = await fetchFeaturesDataset();
    expect(ds.categories.length).toBe(FEATURES_FALLBACK.categories.length);
  });

  it("drops features with unknown category and falls back when ALL are dropped", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        categories: [{ id: "calendar", label: lt("Calendar"), order: 1 }],
        features: [
          { id: "x", category: "ghost", label: lt("X"), description: lt("d"), tipo: "feature", status: "in-development", subtasks: [] },
        ],
      }),
    }));
    const ds = await fetchFeaturesDataset();
    expect(ds.features.length).toBe(FEATURES_FALLBACK.features.length);
  });

  it("drops features with invalid status or tipo, keeps valid ones", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        categories: [{ id: "calendar", label: lt("Calendar"), order: 1 }],
        features: [
          { id: "x", category: "calendar", label: lt("X"), description: lt("d"), tipo: "alien", status: "wip", subtasks: [] },
          { id: "y", category: "calendar", label: lt("Y"), description: lt("d"), tipo: "feature", status: "in-development", subtasks: [{ label: lt("t"), done: false }] },
        ],
      }),
    }));
    const ds = await fetchFeaturesDataset();
    expect(ds.features.length).toBe(1);
    expect(ds.features[0].id).toBe("y");
  });
});
