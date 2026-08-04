import embeddedRoadmapProjectsSnapshotJson from "../../../../docs/roadmap-public.snapshot.json";

export type RoadmapProjectStatus = "planned" | "in-progress" | "done";

export type RoadmapProjectLocalizedText = {
  es: string;
  en: string;
  pt: string;
  it: string;
};

export type RoadmapProjectTask = {
  id: string;
  title: string;
  status: RoadmapProjectStatus;
  updatedAt: string;
};

export type RoadmapProjectProgress = {
  done: number;
  total: number;
  percent: number | null;
};

export type RoadmapProject = {
  id: string;
  title: RoadmapProjectLocalizedText;
  summary?: RoadmapProjectLocalizedText;
  progress: RoadmapProjectProgress | null;
  tasks: ReadonlyArray<RoadmapProjectTask>;
};

export type RoadmapProjectTab = {
  id: string;
  label: RoadmapProjectLocalizedText;
  projects: ReadonlyArray<RoadmapProject>;
};

export type RoadmapProjectsSnapshot = {
  schemaVersion: 1;
  channel: "nightly";
  generatedAt: string;
  staleAfterSeconds: number;
  tabs: ReadonlyArray<RoadmapProjectTab>;
};

export type RoadmapProjectsLoadStatus =
  | "remote-fresh"
  | "remote-stale"
  | "embedded-fallback";

export type RoadmapProjectsLoadResult = {
  dataset: RoadmapProjectsSnapshot;
  status: RoadmapProjectsLoadStatus;
  state: RoadmapProjectsLoadStatus;
  provenance: "remote" | "embedded";
  reason: "invalid" | "unavailable" | null;
};

/**
 * Public snapshot contract. This master URL becomes a remote source only after
 * that file is published there. Until then, 404/network/invalid content is
 * reported visibly as embedded-fallback; this client does not invent a
 * publishing endpoint or workflow.
 */
export const ROADMAP_PROJECTS_SOURCE_URL =
  (import.meta.env.VITE_ROADMAP_PROJECTS_SOURCE_URL as string | undefined)?.trim() ||
  "https://raw.githubusercontent.com/isaacalbala12/Vantare-Simracing-Suite/master/vantare-v2/docs/roadmap-public.snapshot.json";

export const ROADMAP_PROJECTS_FETCH_TIMEOUT_MS = 8000;

const LOCALES = ["es", "en", "pt", "it"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const FORBIDDEN_PUBLIC_TEXT = [
  /ISA-\d+/i,
  /(?:https?:\/\/|www\.)\S+/i,
  /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i,
] as const;

function isSafePublicText(value: unknown): value is string {
  return isNonEmptyString(value) && FORBIDDEN_PUBLIC_TEXT.every((pattern) => !pattern.test(value));
}

function isLocalizedText(value: unknown): value is RoadmapProjectLocalizedText {
  return isRecord(value) && LOCALES.every((locale) => isSafePublicText(value[locale]));
}

function isStatus(value: unknown): value is RoadmapProjectStatus {
  return value === "planned" || value === "in-progress" || value === "done";
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function normalizeProgress(value: unknown): RoadmapProjectProgress | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return undefined;
  const done = value.done;
  const total = value.total;
  const percent = value.percent;
  if (typeof done !== "number" || typeof total !== "number" || !Number.isInteger(done) || !Number.isInteger(total) || done < 0 || total < 0 || done > total) return undefined;
  if (percent !== null && (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 100)) return undefined;
  if (total === 0 && (done !== 0 || percent !== null)) return undefined;
  if (total > 0 && percent !== Math.round((done / total) * 100)) return undefined;
  return { done, total, percent };
}

export function normalizeRoadmapProjectsSnapshot(raw: unknown): RoadmapProjectsSnapshot | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.channel !== "nightly" || !isIsoDate(raw.generatedAt)) return null;
  const staleAfterSeconds = raw.staleAfterSeconds;
  if (typeof staleAfterSeconds !== "number" || !Number.isInteger(staleAfterSeconds) || staleAfterSeconds < 0 || !Array.isArray(raw.tabs) || raw.tabs.length === 0) return null;

  const tabIds = new Set<string>();
  const projectIds = new Set<string>();
  const taskIds = new Set<string>();
  const tabs: RoadmapProjectTab[] = [];

  for (const rawTab of raw.tabs) {
    if (!isRecord(rawTab) || !isNonEmptyString(rawTab.id) || tabIds.has(rawTab.id) || !isLocalizedText(rawTab.label) || !Array.isArray(rawTab.projects) || rawTab.projects.length === 0) return null;
    tabIds.add(rawTab.id);
    const projects: RoadmapProject[] = [];
    for (const rawProject of rawTab.projects) {
      if (!isRecord(rawProject) || !isNonEmptyString(rawProject.id) || projectIds.has(rawProject.id) || !isLocalizedText(rawProject.title) || !Array.isArray(rawProject.tasks)) return null;
      if (!("progress" in rawProject)) return null;
      const progress = normalizeProgress(rawProject.progress);
      if (progress === undefined) return null;
      if (rawProject.summary !== undefined && !isLocalizedText(rawProject.summary)) return null;
      projectIds.add(rawProject.id);
      const tasks: RoadmapProjectTask[] = [];
      for (const rawTask of rawProject.tasks) {
        if (!isRecord(rawTask) || !isNonEmptyString(rawTask.id) || taskIds.has(rawTask.id) || !isSafePublicText(rawTask.title) || !isStatus(rawTask.status) || !isIsoDate(rawTask.updatedAt)) return null;
        taskIds.add(rawTask.id);
        tasks.push({ id: rawTask.id, title: rawTask.title, status: rawTask.status, updatedAt: rawTask.updatedAt });
      }
      const doneTasks = tasks.filter((taskItem) => taskItem.status === "done").length;
      if (progress === null) {
        if (tasks.length !== 0) return null;
      } else {
        const expectedPercent = tasks.length === 0 ? null : Math.round((doneTasks / tasks.length) * 100);
        if (progress.total !== tasks.length || progress.done !== doneTasks || progress.percent !== expectedPercent) return null;
      }
      projects.push({ id: rawProject.id, title: rawProject.title, summary: rawProject.summary as RoadmapProjectLocalizedText | undefined, progress, tasks });
    }
    tabs.push({ id: rawTab.id, label: rawTab.label, projects });
  }

  return {
    schemaVersion: 1,
    channel: "nightly",
    generatedAt: raw.generatedAt,
    staleAfterSeconds,
    tabs,
  };
}

const embeddedRoadmapProjectsSnapshot: unknown = embeddedRoadmapProjectsSnapshotJson;
const normalizedEmbeddedRoadmapProjectsSnapshot = normalizeRoadmapProjectsSnapshot(
  embeddedRoadmapProjectsSnapshot,
);

if (!normalizedEmbeddedRoadmapProjectsSnapshot) {
  throw new Error("embedded roadmap projects snapshot is invalid");
}

export const ROADMAP_PROJECTS_FALLBACK: RoadmapProjectsSnapshot =
  normalizedEmbeddedRoadmapProjectsSnapshot;

function loadResult(status: RoadmapProjectsLoadStatus, reason: "invalid" | "unavailable" | null, dataset: RoadmapProjectsSnapshot, provenance: "remote" | "embedded"): RoadmapProjectsLoadResult {
  return { dataset, status, state: status, reason, provenance };
}

export async function fetchRoadmapProjectsDataset(
  signal?: AbortSignal,
  now = new Date(),
  timeoutMs = ROADMAP_PROJECTS_FETCH_TIMEOUT_MS,
): Promise<RoadmapProjectsLoadResult> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (signal?.aborted) controller.abort();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error("roadmap projects source timeout"));
      }, Math.max(0, timeoutMs));
    });
    const response = await Promise.race([
      fetch(ROADMAP_PROJECTS_SOURCE_URL, { signal: controller.signal, cache: "no-store" }),
      timeout,
    ]);
    if (!response.ok) return loadResult("embedded-fallback", "unavailable", ROADMAP_PROJECTS_FALLBACK, "embedded");
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return loadResult("embedded-fallback", "invalid", ROADMAP_PROJECTS_FALLBACK, "embedded");
    }
    const dataset = normalizeRoadmapProjectsSnapshot(raw);
    if (!dataset) return loadResult("embedded-fallback", "invalid", ROADMAP_PROJECTS_FALLBACK, "embedded");
    const ageSeconds = (now.getTime() - Date.parse(dataset.generatedAt)) / 1000;
    return loadResult(ageSeconds > dataset.staleAfterSeconds ? "remote-stale" : "remote-fresh", null, dataset, "remote");
  } catch {
    return loadResult("embedded-fallback", "unavailable", ROADMAP_PROJECTS_FALLBACK, "embedded");
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function pickRoadmapProjectText(value: RoadmapProjectLocalizedText, locale: string): string {
  return value[locale as keyof RoadmapProjectLocalizedText] || value.es;
}
