import { describe, expect, it } from "vitest";
import {
  clampProgress,
  getOverallProgress,
  getCurrentPhase,
  ROADMAP_PHASES,
  ROADMAP_AREAS,
  ROADMAP_MILESTONES,
  type RoadmapPhase,
  type RoadmapArea,
} from "./roadmap-data";

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

  it("calculates rounded average of area progress", () => {
    const areas: ReadonlyArray<RoadmapArea> = [
      { id: "a", title: "A", progress: 50, status: "in-progress" },
      { id: "b", title: "B", progress: 30, status: "in-progress" },
    ];
    expect(getOverallProgress(areas)).toBe(40);
  });

  it("rounds to nearest integer", () => {
    const areas: ReadonlyArray<RoadmapArea> = [
      { id: "a", title: "A", progress: 33, status: "in-progress" },
      { id: "b", title: "B", progress: 33, status: "in-progress" },
      { id: "c", title: "C", progress: 33, status: "in-progress" },
    ];
    expect(getOverallProgress(areas)).toBe(33);
  });
});

describe("getCurrentPhase", () => {
  it("returns the first in-progress phase", () => {
    const phases: ReadonlyArray<RoadmapPhase> = [
      { id: "a", phaseLabel: "Fase A", title: "A", status: "done", targetLabel: "v1", progress: 100, summary: "", highlights: [] },
      { id: "b", phaseLabel: "Fase B", title: "B", status: "in-progress", targetLabel: "v2", progress: 50, summary: "", highlights: [] },
      { id: "c", phaseLabel: "Fase C", title: "C", status: "planned", targetLabel: "v3", progress: 0, summary: "", highlights: [] },
    ];
    const result = getCurrentPhase(phases);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("b");
  });

  it("falls back to first planned when no in-progress", () => {
    const phases: ReadonlyArray<RoadmapPhase> = [
      { id: "a", phaseLabel: "Fase A", title: "A", status: "done", targetLabel: "v1", progress: 100, summary: "", highlights: [] },
      { id: "c", phaseLabel: "Fase C", title: "C", status: "planned", targetLabel: "v3", progress: 0, summary: "", highlights: [] },
    ];
    const result = getCurrentPhase(phases);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("c");
  });

  it("returns null when no in-progress or planned", () => {
    const phases: ReadonlyArray<RoadmapPhase> = [
      { id: "a", phaseLabel: "Fase A", title: "A", status: "done", targetLabel: "v1", progress: 100, summary: "", highlights: [] },
      { id: "d", phaseLabel: "Fase D", title: "D", status: "future", targetLabel: "v4", progress: 0, summary: "", highlights: [] },
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
