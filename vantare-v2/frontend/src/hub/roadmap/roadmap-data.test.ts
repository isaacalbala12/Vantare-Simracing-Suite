import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampProgress,
  getOverallProgress,
  getCurrentPhase,
  indexProjectProgress,
  resolveAreaProgress,
  nearestOnScale,
  PROGRESS_SCALE,
  ROADMAP_FALLBACK,
  ROADMAP_GENERATED_AT,
  ROADMAP_CHANGELOG,
  ROADMAP_FEEDBACK_LINKS,
  ROADMAP_CHANGELOG_URL,
  ROADMAP_SOURCE_URL,
  fetchRoadmapDataset,
  type RoadmapPhase,
  type RoadmapArea,
  type LocalizedText,
} from "./roadmap-data";

const lt = (s: string): LocalizedText => ({ es: s, en: s, pt: s, it: s });

describe("nearestOnScale", () => {
  it("snaps to the scale", () => {
    for (const v of [3, 12, 27, 49, 73, 98]) {
      expect(PROGRESS_SCALE).toContain(nearestOnScale(v));
    }
  });
  it("maps midpoints correctly", () => {
    expect(nearestOnScale(0)).toBe(0);
    expect(nearestOnScale(10)).toBe(10);
    expect(nearestOnScale(17)).toBe(10);
    expect(nearestOnScale(18)).toBe(25);
    expect(nearestOnScale(37)).toBe(25);
    expect(nearestOnScale(38)).toBe(50);
    expect(nearestOnScale(62)).toBe(50);
  });
});

describe("ROADMAP_FALLBACK dataset", () => {
  // The counts are editorial and change whenever the roadmap is updated
  // (docs/roadmap-maintenance.md), so what is pinned here is the structure the
  // page depends on: every section populated, with ids unique enough to key by.
  it("has the four narrative phases, with populated areas and milestones", () => {
    expect(ROADMAP_FALLBACK.phases.length).toBe(4);
    expect(ROADMAP_FALLBACK.areas.length).toBeGreaterThan(0);
    expect(ROADMAP_FALLBACK.milestones.length).toBeGreaterThan(0);
  });
  it("uses unique ids within each section", () => {
    for (const section of [
      ROADMAP_FALLBACK.phases,
      ROADMAP_FALLBACK.areas,
      ROADMAP_FALLBACK.milestones,
    ]) {
      const ids = section.map((entry) => entry.id);
      expect(ids.every((id) => id.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("all phase/area progress values are on the scale", () => {
    for (const p of ROADMAP_FALLBACK.phases) {
      expect(PROGRESS_SCALE).toContain(p.progress);
    }
    for (const a of ROADMAP_FALLBACK.areas) {
      expect(PROGRESS_SCALE).toContain(a.progress);
    }
  });
  it("reports an overall percentage in range", () => {
    // Not asserted to be on the scale: once the projects snapshot loads, the
    // figure is counted from Linear and lands wherever the real work is.
    const overall = getOverallProgress(ROADMAP_FALLBACK.areas);
    expect(overall).toBeGreaterThanOrEqual(0);
    expect(overall).toBeLessThanOrEqual(100);
  });
  it("does not contain prohibited fake strings", () => {
    const allText = JSON.stringify(ROADMAP_FALLBACK);
    expect(allText).not.toContain("v0.1.0.3 publicado");
    expect(allText).not.toContain("Q4 2026");
    expect(allText).not.toContain("+30 widgets");
    expect(allText).not.toContain("telemetria completa");
  });
  it("has one in-progress phase", () => {
    const count = ROADMAP_FALLBACK.phases.filter((p) => p.status === "in-progress").length;
    expect(count).toBe(1);
  });
  // The packaged dataset is the artefact the digest writes, not a hand copy,
  // so it must carry the part of it no human writes: the delivered window.
  it("carries the delivered window, newest day first", () => {
    expect(ROADMAP_FALLBACK.delivered.length).toBeGreaterThan(0);
    const dates = ROADMAP_FALLBACK.delivered.map((day) => day.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const day of ROADMAP_FALLBACK.delivered) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.entries.length).toBeGreaterThan(0);
      for (const entry of day.entries) {
        expect(entry.text.length).toBeGreaterThan(0);
        expect(["feat", "fix", "perf", "docs", "change"]).toContain(entry.kind);
      }
    }
  });
  it("was generated, and says when", () => {
    expect(ROADMAP_GENERATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("ROADMAP changelog + feedback links", () => {
  it("changelog has 4 entries", () => {
    expect(ROADMAP_CHANGELOG.length).toBe(4);
  });
  it("feedback links use real URLs", () => {
    expect(ROADMAP_FEEDBACK_LINKS.github).toContain("github.com/isaacalbala12");
    expect(ROADMAP_FEEDBACK_LINKS.discord).toContain("discord.gg");
  });
  it("changelog url points to public changelog", () => {
    expect(ROADMAP_CHANGELOG_URL).toBe(
      "https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/master/vantare-v2/docs/changelog.md",
    );
  });
  it("source url points to the generated roadmap artefact on nightly", () => {
    expect(ROADMAP_SOURCE_URL).toBe(
      "https://raw.githubusercontent.com/isaacalbala12/Vantare-Simracing-Suite/nightly/vantare-v2/docs/roadmap/roadmap.json",
    );
  });
});

describe("clampProgress", () => {
  it("clamps negative values to 0", () => {
    expect(clampProgress(-10)).toBe(0);
    expect(clampProgress(-1)).toBe(0);
  });
  it("clamps values above 100 to 100", () => {
    expect(clampProgress(120)).toBe(100);
    expect(clampProgress(101)).toBe(100);
  });
  it("passes through values in range", () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(50)).toBe(50);
    expect(clampProgress(100)).toBe(100);
  });
});

describe("getOverallProgress", () => {
  it("returns 0 for empty array", () => {
    expect(getOverallProgress([])).toBe(0);
  });
  // Percentages are counted from Linear now, so the coarse 0/10/25/50/75/100
  // scale no longer applies to them. Snapping a measured 94% up to 100% would
  // announce finished work that is not finished.
  it("reports the measured mean rather than a scale value", () => {
    const areas: ReadonlyArray<RoadmapArea> = [
      { id: "a", title: lt("a"), progress: 50, status: "in-progress" },
      { id: "b", title: lt("b"), progress: 30, status: "in-progress" },
    ];
    expect(getOverallProgress(areas)).toBe(40);
  });
  it("rounds the mean to a whole percentage", () => {
    const areas: ReadonlyArray<RoadmapArea> = [
      { id: "a", title: lt("a"), progress: 33, status: "in-progress" },
      { id: "b", title: lt("b"), progress: 33, status: "in-progress" },
      { id: "c", title: lt("c"), progress: 34, status: "in-progress" },
    ];
    expect(getOverallProgress(areas)).toBe(33);
  });
  it("counts linked areas from the projects snapshot, not their declared figure", () => {
    const areas: ReadonlyArray<RoadmapArea> = [
      { id: "telemetry", title: lt("t"), progress: 25, status: "in-progress", projects: ["core", "analysis"] },
      { id: "launcher", title: lt("l"), progress: 60, status: "in-progress" },
    ];
    const projects = new Map([
      ["core", { done: 44, total: 47 }],
      ["analysis", { done: 6, total: 9 }],
    ]);
    // 50 of 56 tasks across both projects, so the area reads 89, not 25.
    expect(resolveAreaProgress(areas[0], projects)).toBe(89);
    // An unlinked area keeps its declared figure.
    expect(resolveAreaProgress(areas[1], projects)).toBe(60);
    expect(getOverallProgress(areas, projects)).toBe(75);
  });
  it("falls back to the declared figure when the snapshot is missing a project", () => {
    const area: RoadmapArea = {
      id: "telemetry", title: lt("t"), progress: 25, status: "in-progress", projects: ["absent"],
    };
    expect(resolveAreaProgress(area, new Map())).toBe(25);
    expect(resolveAreaProgress(area, null)).toBe(25);
  });
});

describe("indexProjectProgress", () => {
  it("skips projects with no tasks so they cannot drag an area down", () => {
    const index = indexProjectProgress({
      tabs: [
        {
          projects: [
            { id: "counted", progress: { done: 2, total: 4 } },
            { id: "empty", progress: null },
            { id: "zero", progress: { done: 0, total: 0 } },
          ],
        },
      ],
    });
    expect(index?.get("counted")).toEqual({ done: 2, total: 4 });
    expect(index?.has("empty")).toBe(false);
    expect(index?.has("zero")).toBe(false);
  });
  it("returns null without a snapshot", () => {
    expect(indexProjectProgress(null)).toBeNull();
  });
});

describe("getCurrentPhase", () => {
  it("returns the first in-progress phase", () => {
    const phases: ReadonlyArray<RoadmapPhase> = [
      { id: "a", phaseLabel: lt("a"), title: lt("a"), status: "done", target: lt("v1"), progress: 100, summary: lt(""), highlights: [] },
      { id: "b", phaseLabel: lt("b"), title: lt("b"), status: "in-progress", target: lt("v2"), progress: 50, summary: lt(""), highlights: [] },
      { id: "c", phaseLabel: lt("c"), title: lt("c"), status: "planned", target: lt("v3"), progress: 0, summary: lt(""), highlights: [] },
    ];
    const result = getCurrentPhase(phases);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("b");
  });
  it("falls back to first planned when no in-progress", () => {
    const phases: ReadonlyArray<RoadmapPhase> = [
      { id: "a", phaseLabel: lt("a"), title: lt("a"), status: "done", target: lt("v1"), progress: 100, summary: lt(""), highlights: [] },
      { id: "c", phaseLabel: lt("c"), title: lt("c"), status: "planned", target: lt("v3"), progress: 0, summary: lt(""), highlights: [] },
    ];
    const result = getCurrentPhase(phases);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("c");
  });
  it("returns null when no in-progress or planned", () => {
    const phases: ReadonlyArray<RoadmapPhase> = [
      { id: "a", phaseLabel: lt("a"), title: lt("a"), status: "done", target: lt("v1"), progress: 100, summary: lt(""), highlights: [] },
      { id: "d", phaseLabel: lt("d"), title: lt("d"), status: "future", target: lt("v4"), progress: 0, summary: lt(""), highlights: [] },
    ];
    expect(getCurrentPhase(phases)).toBeNull();
  });
});

describe("fetchRoadmapDataset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and parses the remote source", async () => {
    const fakeJson = {
      phases: [
        { id: "p1", phaseLabel: { es: "F1", en: "F1" }, title: { es: "P1", en: "P1" }, target: { es: "T1", en: "T1" }, status: "done", progress: 100, summary: { es: "S1", en: "S1" }, highlights: [{ es: "H1", en: "H1" }] },
      ],
      areas: [
        { id: "a1", title: { es: "A1", en: "A1" }, progress: 75, status: "in-progress" },
      ],
      milestones: [
        { id: "m1", type: "release", title: { es: "M1", en: "M1" }, body: { es: "B1", en: "B1" }, label: { es: "L1", en: "L1" } },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakeJson,
      }),
    );
    const ds = await fetchRoadmapDataset();
    expect(ds.phases.length).toBe(1);
    expect(ds.areas.length).toBe(1);
    expect(ds.phases[0].title.es).toBe("P1");
  });

  it("falls back to ROADMAP_FALLBACK when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network")),
    );
    const ds = await fetchRoadmapDataset();
    expect(ds.phases.length).toBe(ROADMAP_FALLBACK.phases.length);
    expect(ds.areas.length).toBe(ROADMAP_FALLBACK.areas.length);
  });

  it("falls back when the remote shape is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ foo: "bar" }),
      }),
    );
    const ds = await fetchRoadmapDataset();
    expect(ds.phases.length).toBe(ROADMAP_FALLBACK.phases.length);
  });
});
