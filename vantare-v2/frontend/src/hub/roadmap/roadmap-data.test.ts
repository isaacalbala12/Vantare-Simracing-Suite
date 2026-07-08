import { describe, expect, it } from "vitest";
import {
  clampProgress,
  getOverallProgress,
  getCurrentPhase,
  getRoadmapDataset,
  nearestOnScale,
  PROGRESS_SCALE,
  ROADMAP_PHASES,
  ROADMAP_AREAS,
  ROADMAP_MILESTONES,
  ROADMAP_CURRENT,
  ROADMAP_NEXT,
  ROADMAP_CHANGELOG,
  ROADMAP_FEEDBACK_LINKS,
  ROADMAP_CHANGELOG_URL,
  type RoadmapPhase,
  type RoadmapArea,
} from "./roadmap-data";

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

describe("ROADMAP datasets", () => {
  it("current has 4 phases and 6 areas", () => {
    expect(getRoadmapDataset("current").phases.length).toBe(4);
    expect(getRoadmapDataset("current").areas.length).toBe(6);
  });
  it("next has 15 phases", () => {
    expect(getRoadmapDataset("next").phases.length).toBe(15);
  });
  it("all phase/area progress values are on the scale", () => {
    for (const ds of [ROADMAP_CURRENT, ROADMAP_NEXT]) {
      for (const p of ds.phases) {
        expect(PROGRESS_SCALE).toContain(p.progress);
      }
      for (const a of ds.areas) {
        expect(PROGRESS_SCALE).toContain(a.progress);
      }
    }
  });
  it("current overall progress is on the scale", () => {
    expect(PROGRESS_SCALE).toContain(getOverallProgress(ROADMAP_CURRENT.areas));
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
      { id: "a", titleKey: "a", progress: 50, status: "in-progress" },
      { id: "b", titleKey: "b", progress: 30, status: "in-progress" },
    ];
    expect(getOverallProgress(areas)).toBe(50);
  });

  it("snaps to the progress scale (33 -> 25)", () => {
    const areas: ReadonlyArray<RoadmapArea> = [
      { id: "a", titleKey: "a", progress: 33, status: "in-progress" },
      { id: "b", titleKey: "b", progress: 33, status: "in-progress" },
      { id: "c", titleKey: "c", progress: 33, status: "in-progress" },
    ];
    expect(getOverallProgress(areas)).toBe(25);
  });
});

describe("getCurrentPhase", () => {
  it("returns the first in-progress phase", () => {
    const phases: ReadonlyArray<RoadmapPhase> = [
      { id: "a", phaseLabelKey: "a", titleKey: "a", status: "done", targetLabelKey: "v1", progress: 100, summaryKey: "", highlightsKeys: [] },
      { id: "b", phaseLabelKey: "b", titleKey: "b", status: "in-progress", targetLabelKey: "v2", progress: 50, summaryKey: "", highlightsKeys: [] },
      { id: "c", phaseLabelKey: "c", titleKey: "c", status: "planned", targetLabelKey: "v3", progress: 0, summaryKey: "", highlightsKeys: [] },
    ];
    const result = getCurrentPhase(phases);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("b");
  });

  it("falls back to first planned when no in-progress", () => {
    const phases: ReadonlyArray<RoadmapPhase> = [
      { id: "a", phaseLabelKey: "a", titleKey: "a", status: "done", targetLabelKey: "v1", progress: 100, summaryKey: "", highlightsKeys: [] },
      { id: "c", phaseLabelKey: "c", titleKey: "c", status: "planned", targetLabelKey: "v3", progress: 0, summaryKey: "", highlightsKeys: [] },
    ];
    const result = getCurrentPhase(phases);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("c");
  });

  it("returns null when no in-progress or planned", () => {
    const phases: ReadonlyArray<RoadmapPhase> = [
      { id: "a", phaseLabelKey: "a", titleKey: "a", status: "done", targetLabelKey: "v1", progress: 100, summaryKey: "", highlightsKeys: [] },
      { id: "d", phaseLabelKey: "d", titleKey: "d", status: "future", targetLabelKey: "v4", progress: 0, summaryKey: "", highlightsKeys: [] },
    ];
    expect(getCurrentPhase(phases)).toBeNull();
  });
});

describe("ROADMAP_PHASES data integrity", () => {
  it("does not contain prohibited fake strings", () => {
    const allText = JSON.stringify(ROADMAP_PHASES);
    expect(allText).not.toContain("v0.1.0.3 publicado");
    expect(allText).not.toContain("Q4 2026");
    expect(allText).not.toContain("+30 widgets");
    expect(allText).not.toContain("telemetria completa");
  });

  it("has 4 phases", () => {
    expect(ROADMAP_PHASES.length).toBe(4);
  });

  it("has one in-progress phase", () => {
    const count = ROADMAP_PHASES.filter((p) => p.status === "in-progress").length;
    expect(count).toBe(1);
  });
});

describe("ROADMAP_AREAS data integrity", () => {
  it("does not contain prohibited fake strings", () => {
    const allText = JSON.stringify(ROADMAP_AREAS);
    expect(allText).not.toContain("Q4 2026");
    expect(allText).not.toContain("+30 widgets");
    expect(allText).not.toContain("telemetria completa");
  });

  it("has 6 areas", () => {
    expect(ROADMAP_AREAS.length).toBe(6);
  });
});

describe("ROADMAP_MILESTONES data integrity", () => {
  it("does not contain prohibited fake strings", () => {
    const allText = JSON.stringify(ROADMAP_MILESTONES);
    expect(allText).not.toContain("v0.1.0.3 publicado");
    expect(allText).not.toContain("Q4 2026");
    expect(allText).not.toContain("+30 widgets");
    expect(allText).not.toContain("telemetria completa");
  });

  it("has 4 milestones", () => {
    expect(ROADMAP_MILESTONES.length).toBe(4);
  });
});
