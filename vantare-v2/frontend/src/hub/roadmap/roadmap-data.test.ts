import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampProgress,
  getOverallProgress,
  getCurrentPhase,
  nearestOnScale,
  PROGRESS_SCALE,
  ROADMAP_FALLBACK,
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
  it("has 4 phases and 6 areas", () => {
    expect(ROADMAP_FALLBACK.phases.length).toBe(4);
    expect(ROADMAP_FALLBACK.areas.length).toBe(6);
  });
  it("has 5 milestones", () => {
    expect(ROADMAP_FALLBACK.milestones.length).toBe(5);
  });
  it("all phase/area progress values are on the scale", () => {
    for (const p of ROADMAP_FALLBACK.phases) {
      expect(PROGRESS_SCALE).toContain(p.progress);
    }
    for (const a of ROADMAP_FALLBACK.areas) {
      expect(PROGRESS_SCALE).toContain(a.progress);
    }
  });
  it("overall progress is on the scale", () => {
    expect(PROGRESS_SCALE).toContain(getOverallProgress(ROADMAP_FALLBACK.areas));
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
    expect(ROADMAP_CHANGELOG_URL).toContain("docs/changelog.md");
  });
  it("source url points to the manual roadmap json", () => {
    expect(ROADMAP_SOURCE_URL).toContain("docs/roadmap-source.json");
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
  it("snaps to the progress scale (40 -> 50)", () => {
    const areas: ReadonlyArray<RoadmapArea> = [
      { id: "a", title: lt("a"), progress: 50, status: "in-progress" },
      { id: "b", title: lt("b"), progress: 30, status: "in-progress" },
    ];
    expect(getOverallProgress(areas)).toBe(50);
  });
  it("snaps to the progress scale (33 -> 25)", () => {
    const areas: ReadonlyArray<RoadmapArea> = [
      { id: "a", title: lt("a"), progress: 33, status: "in-progress" },
      { id: "b", title: lt("b"), progress: 33, status: "in-progress" },
      { id: "c", title: lt("c"), progress: 33, status: "in-progress" },
    ];
    expect(getOverallProgress(areas)).toBe(25);
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
