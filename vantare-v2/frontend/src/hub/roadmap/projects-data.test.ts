import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRoadmapProjectsDataset,
  normalizeRoadmapProjectsSnapshot,
  ROADMAP_PROJECTS_FALLBACK,
  ROADMAP_PROJECTS_SOURCE_URL,
} from "./projects-data";

const response = (payload: unknown) => ({ ok: true, json: async () => payload });
const cloneFallback = () => JSON.parse(JSON.stringify(ROADMAP_PROJECTS_FALLBACK));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("projects-data", () => {
  // The URL previously pointed at a path on master that was never published,
  // so every user silently fell back to the snapshot baked into their build.
  // Nothing caught it, because nothing asserted where the source lives.
  it("reads the snapshot from the branch the publishing workflow writes to", () => {
    expect(ROADMAP_PROJECTS_SOURCE_URL).toContain("/roadmap-data/");
    expect(ROADMAP_PROJECTS_SOURCE_URL).toMatch(/roadmap-public\.snapshot\.json$/);
  });

  it("validates the v1 nightly contract and fallback shape", () => {
    // Counts are not pinned: tabs and projects follow the catalog, which grows
    // as areas gain a Linear project, and the task count is whatever Linear
    // held when the exporter last ran. Pinning any of them turned an ordinary
    // refresh into a failing test.
    const normalized = normalizeRoadmapProjectsSnapshot(ROADMAP_PROJECTS_FALLBACK);
    expect(normalized?.tabs.length).toBeGreaterThan(0);
    const projects = ROADMAP_PROJECTS_FALLBACK.tabs.flatMap((tab) => tab.projects);
    expect(projects.length).toBeGreaterThan(0);
    expect(new Set(projects.map((project) => project.id)).size).toBe(projects.length);
    expect(projects.flatMap((project) => project.tasks).length).toBeGreaterThan(0);
    expect(normalizeRoadmapProjectsSnapshot({ ...ROADMAP_PROJECTS_FALLBACK, channel: "master" })).toBeNull();
    expect(normalizeRoadmapProjectsSnapshot({ ...ROADMAP_PROJECTS_FALLBACK, tabs: [] })).toBeNull();
  });

  it("rejects invalid task status and progress inconsistent with tasks", () => {
    const invalidStatus = cloneFallback();
    invalidStatus.tabs[0].projects[0].tasks[0].status = "blocked";
    expect(normalizeRoadmapProjectsSnapshot(invalidStatus)).toBeNull();

    const invalidTotal = cloneFallback();
    invalidTotal.tabs[0].projects[0].progress.total = 4;
    expect(normalizeRoadmapProjectsSnapshot(invalidTotal)).toBeNull();

    const invalidDone = cloneFallback();
    invalidDone.tabs[0].projects[0].progress.done = 2;
    expect(normalizeRoadmapProjectsSnapshot(invalidDone)).toBeNull();

    const invalidPercent = cloneFallback();
    invalidPercent.tabs[0].projects[0].progress.percent = 66;
    expect(normalizeRoadmapProjectsSnapshot(invalidPercent)).toBeNull();
  });

  it("fails closed on private identifiers in every public text boundary", () => {
    const taskIssue = cloneFallback();
    taskIssue.tabs[0].projects[0].tasks[0].title = "Entrega ISA-258";
    expect(normalizeRoadmapProjectsSnapshot(taskIssue)).toBeNull();

    const projectUrl = cloneFallback();
    projectUrl.tabs[0].projects[0].title.es = "Ver https://linear.app/project";
    expect(normalizeRoadmapProjectsSnapshot(projectUrl)).toBeNull();

    const summaryEmail = cloneFallback();
    summaryEmail.tabs[0].projects[0].summary.en = "Contact owner@example.com";
    expect(normalizeRoadmapProjectsSnapshot(summaryEmail)).toBeNull();

    const labelUuid = cloneFallback();
    labelUuid.tabs[0].label.pt = "Projeto 123e4567-e89b-12d3-a456-426614174000";
    expect(normalizeRoadmapProjectsSnapshot(labelUuid)).toBeNull();
  });

  it("reports fresh, stale, invalid and unavailable provenance explicitly", async () => {
    // Freshness is measured against the snapshot's own generatedAt, so the
    // clock is derived from it. Hardcoded dates broke the moment the exporter
    // published a newer snapshot, which it now does on every merge.
    const generatedAt = Date.parse(ROADMAP_PROJECTS_FALLBACK.generatedAt);
    const staleAfterMs = ROADMAP_PROJECTS_FALLBACK.staleAfterSeconds * 1000;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(ROADMAP_PROJECTS_FALLBACK)));
    const fresh = await fetchRoadmapProjectsDataset(undefined, new Date(generatedAt + staleAfterMs / 2));
    expect(fresh.status).toBe("remote-fresh");
    expect(fresh.provenance).toBe("remote");

    const stale = await fetchRoadmapProjectsDataset(undefined, new Date(generatedAt + staleAfterMs * 2));
    expect(stale.status).toBe("remote-stale");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ schemaVersion: 1, channel: "nightly" })));
    const invalid = await fetchRoadmapProjectsDataset();
    expect(invalid.status).toBe("embedded-fallback");
    expect(invalid.reason).toBe("invalid");
    expect(invalid.provenance).toBe("embedded");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const unavailable = await fetchRoadmapProjectsDataset();
    expect(unavailable.status).toBe("embedded-fallback");
    expect(unavailable.reason).toBe("unavailable");
    expect(unavailable.dataset).toBe(ROADMAP_PROJECTS_FALLBACK);
  });

  it("times out a pending remote request and exposes fallback provenance", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const resultPromise = fetchRoadmapProjectsDataset(undefined, new Date("2026-08-03T01:00:00Z"), 50);
    await vi.advanceTimersByTimeAsync(50);
    const result = await resultPromise;
    expect(result.status).toBe("embedded-fallback");
    expect(result.reason).toBe("unavailable");
    expect(result.provenance).toBe("embedded");
  });

  it("treats an HTTP 404 as unavailable embedded fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await fetchRoadmapProjectsDataset();
    expect(result.status).toBe("embedded-fallback");
    expect(result.reason).toBe("unavailable");
  });
});
