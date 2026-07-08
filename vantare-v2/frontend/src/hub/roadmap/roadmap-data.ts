// Datos del roadmap. Los strings visibles viven en los diccionarios i18n bajo
// el namespace `roadmap.*` (ver frontend/src/i18n/locales/*). Aquí solo hay keys.
// Procedimiento de porcentajes y changelog: docs/roadmap-maintenance.md.

export type RoadmapStatus = "done" | "in-progress" | "planned" | "future";

export type RoadmapPhase = {
  id: string;
  phaseLabelKey: string;
  titleKey: string;
  status: RoadmapStatus;
  targetLabelKey: string;
  progress: number;
  summaryKey: string;
  highlightsKeys: string[];
};

export type RoadmapArea = {
  id: string;
  titleKey: string;
  progress: number;
  status: RoadmapStatus;
};

export type RoadmapMilestone = {
  id: string;
  type: "release" | "feature" | "fix" | "plan";
  titleKey: string;
  bodyKey: string;
  labelKey: string;
};

export type RoadmapChangelogEntry = {
  id: string;
  version: string;
  date: string;
  titleKey: string;
  bodyKey: string;
};

export type RoadmapDatasetKey = "current" | "next";

export type RoadmapDataset = {
  key: RoadmapDatasetKey;
  phases: ReadonlyArray<RoadmapPhase>;
  areas: ReadonlyArray<RoadmapArea>;
  milestones: ReadonlyArray<RoadmapMilestone>;
};

// Escala obligatoria de porcentajes (docs/roadmap-maintenance.md §3).
export const PROGRESS_SCALE = [0, 10, 25, 50, 75, 100] as const;

export function clampProgress(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function getOverallProgress(areas: ReadonlyArray<RoadmapArea>): number {
  if (areas.length === 0) return 0;
  const sum = areas.reduce((acc, a) => acc + a.progress, 0);
  return nearestOnScale(Math.round(sum / areas.length));
}

export function getCurrentPhase(
  phases: ReadonlyArray<RoadmapPhase>,
): RoadmapPhase | null {
  const inProgress = phases.find((p) => p.status === "in-progress");
  if (inProgress) return inProgress;
  const planned = phases.find((p) => p.status === "planned");
  if (planned) return planned;
  return null;
}

export function nearestOnScale(value: number): number {
  return PROGRESS_SCALE.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev,
  );
}

// Roadmap actual (v0.1.x): datos manuales editados por el producto.
export const ROADMAP_CURRENT: RoadmapDataset = {
  key: "current",
  phases: [
    {
      id: "beta-foundation",
      phaseLabelKey: "roadmap.current.phase.beta-foundation.phaseLabel",
      titleKey: "roadmap.current.phase.beta-foundation.title",
      status: "done",
      targetLabelKey: "roadmap.current.phase.beta-foundation.target",
      progress: 100,
      summaryKey: "roadmap.current.phase.beta-foundation.summary",
      highlightsKeys: [
        "roadmap.current.phase.beta-foundation.h1",
        "roadmap.current.phase.beta-foundation.h2",
        "roadmap.current.phase.beta-foundation.h3",
      ],
    },
    {
      id: "beta-iteration",
      phaseLabelKey: "roadmap.current.phase.beta-iteration.phaseLabel",
      titleKey: "roadmap.current.phase.beta-iteration.title",
      status: "in-progress",
      targetLabelKey: "roadmap.current.phase.beta-iteration.target",
      progress: 50,
      summaryKey: "roadmap.current.phase.beta-iteration.summary",
      highlightsKeys: [
        "roadmap.current.phase.beta-iteration.h1",
        "roadmap.current.phase.beta-iteration.h2",
        "roadmap.current.phase.beta-iteration.h3",
      ],
    },
    {
      id: "engineer",
      phaseLabelKey: "roadmap.current.phase.engineer.phaseLabel",
      titleKey: "roadmap.current.phase.engineer.title",
      status: "planned",
      targetLabelKey: "roadmap.current.phase.engineer.target",
      progress: 25,
      summaryKey: "roadmap.current.phase.engineer.summary",
      highlightsKeys: [
        "roadmap.current.phase.engineer.h1",
        "roadmap.current.phase.engineer.h2",
        "roadmap.current.phase.engineer.h3",
      ],
    },
    {
      id: "ecosystem",
      phaseLabelKey: "roadmap.current.phase.ecosystem.phaseLabel",
      titleKey: "roadmap.current.phase.ecosystem.title",
      status: "future",
      targetLabelKey: "roadmap.current.phase.ecosystem.target",
      progress: 10,
      summaryKey: "roadmap.current.phase.ecosystem.summary",
      highlightsKeys: [
        "roadmap.current.phase.ecosystem.h1",
        "roadmap.current.phase.ecosystem.h2",
        "roadmap.current.phase.ecosystem.h3",
      ],
    },
  ],
  areas: [
    { id: "overlays-studio", titleKey: "roadmap.current.area.overlays-studio", progress: 75, status: "in-progress" },
    { id: "launcher-lmu", titleKey: "roadmap.current.area.launcher-lmu", progress: 75, status: "in-progress" },
    { id: "calendar-local", titleKey: "roadmap.current.area.calendar-local", progress: 25, status: "in-progress" },
    { id: "engineer", titleKey: "roadmap.current.area.engineer", progress: 25, status: "planned" },
    { id: "telemetry", titleKey: "roadmap.current.area.telemetry", progress: 10, status: "planned" },
    { id: "ui-v52", titleKey: "roadmap.current.area.ui-v52", progress: 75, status: "in-progress" },
  ],
  milestones: [
    {
      id: "v0102",
      type: "release",
      titleKey: "roadmap.current.milestone.v0102.title",
      bodyKey: "roadmap.current.milestone.v0102.body",
      labelKey: "roadmap.current.milestone.v0102.label",
    },
    {
      id: "hub-v52",
      type: "feature",
      titleKey: "roadmap.current.milestone.hub-v52.title",
      bodyKey: "roadmap.current.milestone.hub-v52.body",
      labelKey: "roadmap.current.milestone.hub-v52.label",
    },
    {
      id: "launcher-lmu",
      type: "feature",
      titleKey: "roadmap.current.milestone.launcher-lmu.title",
      bodyKey: "roadmap.current.milestone.launcher-lmu.body",
      labelKey: "roadmap.current.milestone.launcher-lmu.label",
    },
    {
      id: "roadmap-public",
      type: "plan",
      titleKey: "roadmap.current.milestone.roadmap-public.title",
      bodyKey: "roadmap.current.milestone.roadmap-public.body",
      labelKey: "roadmap.current.milestone.roadmap-public.label",
    },
  ],
};

// Roadmap siguiente major (snapshot de docs/release-roadmap-execution-index.md R01-R15).
// % derivado del estado de la fila (docs/roadmap-maintenance.md §4):
// done=100, in-progress=75, next=50, ready=25, planned=10, blocked/later=0.
export const ROADMAP_NEXT: RoadmapDataset = {
  key: "next",
  phases: [
    { id: "r1", phaseLabelKey: "roadmap.next.phase.r1.phaseLabel", titleKey: "roadmap.next.phase.r1.title", status: "done", targetLabelKey: "roadmap.next.phase.r1.target", progress: 100, summaryKey: "roadmap.next.phase.r1.summary", highlightsKeys: [] },
    { id: "r2", phaseLabelKey: "roadmap.next.phase.r2.phaseLabel", titleKey: "roadmap.next.phase.r2.title", status: "planned", targetLabelKey: "roadmap.next.phase.r2.target", progress: 10, summaryKey: "roadmap.next.phase.r2.summary", highlightsKeys: [] },
    { id: "r3", phaseLabelKey: "roadmap.next.phase.r3.phaseLabel", titleKey: "roadmap.next.phase.r3.title", status: "planned", targetLabelKey: "roadmap.next.phase.r3.target", progress: 10, summaryKey: "roadmap.next.phase.r3.summary", highlightsKeys: [] },
    { id: "r4", phaseLabelKey: "roadmap.next.phase.r4.phaseLabel", titleKey: "roadmap.next.phase.r4.title", status: "planned", targetLabelKey: "roadmap.next.phase.r4.target", progress: 10, summaryKey: "roadmap.next.phase.r4.summary", highlightsKeys: [] },
    { id: "r5", phaseLabelKey: "roadmap.next.phase.r5.phaseLabel", titleKey: "roadmap.next.phase.r5.title", status: "planned", targetLabelKey: "roadmap.next.phase.r5.target", progress: 10, summaryKey: "roadmap.next.phase.r5.summary", highlightsKeys: [] },
    { id: "r6", phaseLabelKey: "roadmap.next.phase.r6.phaseLabel", titleKey: "roadmap.next.phase.r6.title", status: "planned", targetLabelKey: "roadmap.next.phase.r6.target", progress: 10, summaryKey: "roadmap.next.phase.r6.summary", highlightsKeys: [] },
    { id: "r7", phaseLabelKey: "roadmap.next.phase.r7.phaseLabel", titleKey: "roadmap.next.phase.r7.title", status: "planned", targetLabelKey: "roadmap.next.phase.r7.target", progress: 10, summaryKey: "roadmap.next.phase.r7.summary", highlightsKeys: [] },
    { id: "r8", phaseLabelKey: "roadmap.next.phase.r8.phaseLabel", titleKey: "roadmap.next.phase.r8.title", status: "planned", targetLabelKey: "roadmap.next.phase.r8.target", progress: 10, summaryKey: "roadmap.next.phase.r8.summary", highlightsKeys: [] },
    { id: "r9", phaseLabelKey: "roadmap.next.phase.r9.phaseLabel", titleKey: "roadmap.next.phase.r9.title", status: "planned", targetLabelKey: "roadmap.next.phase.r9.target", progress: 10, summaryKey: "roadmap.next.phase.r9.summary", highlightsKeys: [] },
    { id: "r10", phaseLabelKey: "roadmap.next.phase.r10.phaseLabel", titleKey: "roadmap.next.phase.r10.title", status: "planned", targetLabelKey: "roadmap.next.phase.r10.target", progress: 10, summaryKey: "roadmap.next.phase.r10.summary", highlightsKeys: [] },
    { id: "r11", phaseLabelKey: "roadmap.next.phase.r11.phaseLabel", titleKey: "roadmap.next.phase.r11.title", status: "planned", targetLabelKey: "roadmap.next.phase.r11.target", progress: 10, summaryKey: "roadmap.next.phase.r11.summary", highlightsKeys: [] },
    { id: "r12", phaseLabelKey: "roadmap.next.phase.r12.phaseLabel", titleKey: "roadmap.next.phase.r12.title", status: "planned", targetLabelKey: "roadmap.next.phase.r12.target", progress: 10, summaryKey: "roadmap.next.phase.r12.summary", highlightsKeys: [] },
    { id: "r13", phaseLabelKey: "roadmap.next.phase.r13.phaseLabel", titleKey: "roadmap.next.phase.r13.title", status: "planned", targetLabelKey: "roadmap.next.phase.r13.target", progress: 10, summaryKey: "roadmap.next.phase.r13.summary", highlightsKeys: [] },
    { id: "r14", phaseLabelKey: "roadmap.next.phase.r14.phaseLabel", titleKey: "roadmap.next.phase.r14.title", status: "planned", targetLabelKey: "roadmap.next.phase.r14.target", progress: 10, summaryKey: "roadmap.next.phase.r14.summary", highlightsKeys: [] },
    { id: "r15", phaseLabelKey: "roadmap.next.phase.r15.phaseLabel", titleKey: "roadmap.next.phase.r15.title", status: "planned", targetLabelKey: "roadmap.next.phase.r15.target", progress: 10, summaryKey: "roadmap.next.phase.r15.summary", highlightsKeys: [] },
  ],
  areas: [
    { id: "overlays-studio", titleKey: "roadmap.next.area.overlays-studio", progress: 75, status: "in-progress" },
    { id: "launcher-lmu", titleKey: "roadmap.next.area.launcher-lmu", progress: 75, status: "in-progress" },
    { id: "calendar-local", titleKey: "roadmap.next.area.calendar-local", progress: 25, status: "in-progress" },
    { id: "engineer", titleKey: "roadmap.next.area.engineer", progress: 25, status: "planned" },
    { id: "telemetry", titleKey: "roadmap.next.area.telemetry", progress: 10, status: "planned" },
    { id: "ui-v52", titleKey: "roadmap.next.area.ui-v52", progress: 75, status: "in-progress" },
  ],
  milestones: [],
};

export const ROADMAP_DATASETS: Record<RoadmapDatasetKey, RoadmapDataset> = {
  current: ROADMAP_CURRENT,
  next: ROADMAP_NEXT,
};

export function getRoadmapDataset(key: RoadmapDatasetKey): RoadmapDataset {
  return ROADMAP_DATASETS[key];
}

// Últimas 5 entradas de docs/changelog.md (sincronizado a mano, ver docs/roadmap-maintenance.md §5).
export const ROADMAP_CHANGELOG: ReadonlyArray<RoadmapChangelogEntry> = [
  {
    id: "v0102",
    version: "v0.1.0.2",
    date: "2026-06-29",
    titleKey: "roadmap.changelog.v0102.title",
    bodyKey: "roadmap.changelog.v0102.body",
  },
  {
    id: "hub-v52",
    version: "v0.1.x",
    date: "2026-07-06",
    titleKey: "roadmap.changelog.hub-v52.title",
    bodyKey: "roadmap.changelog.hub-v52.body",
  },
  {
    id: "launcher-lmu",
    version: "v0.1.x",
    date: "2026-07-06",
    titleKey: "roadmap.changelog.launcher-lmu.title",
    bodyKey: "roadmap.changelog.launcher-lmu.body",
  },
  {
    id: "roadmap-public",
    version: "v0.1.x",
    date: "2026-07-06",
    titleKey: "roadmap.changelog.roadmap-public.title",
    bodyKey: "roadmap.changelog.roadmap-public.body",
  },
];

// URL pública del changelog completo.
export const ROADMAP_CHANGELOG_URL =
  "https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/main/docs/changelog.md";

// Enlaces de feedback (TODO: reemplazar form por URL real cuando se decida).
export const ROADMAP_FEEDBACK_LINKS = {
  github: "https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/new",
  discord: "https://discord.gg/wWjD7CPe74",
  form: "https://forms.gle/TODO-vantare-feedback",
} as const;

export type RoadmapFeedbackType = "bug" | "suggestion" | "general";
export type RoadmapFeedbackDestination = "github" | "discord" | "form";

// Alias de compatibilidad (tests y RoadmapPage consumen el dataset actual).
export const ROADMAP_PHASES = ROADMAP_CURRENT.phases;
export const ROADMAP_AREAS = ROADMAP_CURRENT.areas;
export const ROADMAP_MILESTONES = ROADMAP_CURRENT.milestones;
