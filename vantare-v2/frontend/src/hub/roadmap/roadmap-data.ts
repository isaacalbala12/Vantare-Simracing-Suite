export type RoadmapStatus = "done" | "in-progress" | "planned" | "future";

export type RoadmapPhase = {
  id: string;
  phaseLabel: string;
  title: string;
  status: RoadmapStatus;
  targetLabel: string;
  progress: number;
  summary: string;
  highlights: string[];
};

export type RoadmapArea = {
  id: string;
  title: string;
  progress: number;
  status: RoadmapStatus;
};

export type RoadmapMilestone = {
  id: string;
  type: "release" | "feature" | "fix" | "plan";
  title: string;
  body: string;
  label: string;
};

export function clampProgress(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function getOverallProgress(areas: ReadonlyArray<RoadmapArea>): number {
  if (areas.length === 0) return 0;
  const sum = areas.reduce((acc, a) => acc + a.progress, 0);
  return Math.round(sum / areas.length);
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

export const ROADMAP_PHASES: ReadonlyArray<RoadmapPhase> = [
  {
    id: "beta-foundation",
    phaseLabel: "Fase 01",
    title: "Beta publica",
    status: "done",
    targetLabel: "v0.1.0",
    progress: 100,
    summary:
      "Login Google, plan Free, overlays recomendados, launcher LMU y Hub v5.2.",
    highlights: [
      "Google OAuth externo y sesion persistente",
      "Perfiles recomendados y editor de overlays",
      "Launcher LMU basico",
    ],
  },
  {
    id: "beta-iteration",
    phaseLabel: "Fase 02",
    title: "Pulido beta v0.1.x",
    status: "in-progress",
    targetLabel: "v0.1.x",
    progress: 35,
    summary:
      "Roadmap publico, calendario local, sistema visual de widgets y limpieza de flujos.",
    highlights: [
      "Roadmap editable desde datos locales",
      "Calendario LMU y recordatorios locales",
      "Nuevo pack visual de widgets",
    ],
  },
  {
    id: "engineer",
    phaseLabel: "Fase 03",
    title: "Ingeniero Vantare",
    status: "planned",
    targetLabel: "Por planear",
    progress: 12,
    summary:
      "Spotter e ingeniero con avisos utiles, sin prometer voz IA completa hasta validar datos.",
    highlights: [
      "Notificaciones contextuales",
      "Reglas locales primero",
      "Voz y perfiles avanzados despues",
    ],
  },
  {
    id: "ecosystem",
    phaseLabel: "Fase 04",
    title: "Ecosistema",
    status: "future",
    targetLabel: "Futuro",
    progress: 5,
    summary:
      "Comunidad, paid tiers, multisim y analiticas reales cuando la base este estable.",
    highlights: [
      "Comunidad de overlays",
      "Licencias paid/suite reales",
      "Datos reales de carrera y progresion",
    ],
  },
];

export const ROADMAP_AREAS: ReadonlyArray<RoadmapArea> = [
  { id: "overlays-studio", title: "Overlays Studio", progress: 55, status: "in-progress" },
  { id: "launcher-lmu", title: "Launcher LMU", progress: 60, status: "in-progress" },
  { id: "calendar-local", title: "Calendario local", progress: 15, status: "in-progress" },
  { id: "engineer", title: "Ingeniero", progress: 12, status: "planned" },
  { id: "telemetry", title: "Telemetria", progress: 5, status: "planned" },
  { id: "ui-v52", title: "UI v5.2", progress: 70, status: "in-progress" },
];

export const ROADMAP_MILESTONES: ReadonlyArray<RoadmapMilestone> = [
  {
    id: "v0102",
    type: "release",
    title: "v0.1.0.2 publicado",
    body: "Fix de login Google OAuth, Free plan funcional, Supabase configurado en build.",
    label: "Release",
  },
  {
    id: "hub-v52",
    type: "feature",
    title: "Hub v5.2 en migracion",
    body: "Migracion del Hub por cortes pequenos: shell, dashboard, launcher, ingeniero, telemetria, ajustes.",
    label: "Feature",
  },
  {
    id: "launcher-lmu",
    type: "feature",
    title: "Launcher LMU disponible",
    body: "Configuracion de Steam o ejecutable local para lanzar Le Mans Ultimate desde Vantare.",
    label: "Feature",
  },
  {
    id: "roadmap-public",
    type: "plan",
    title: "Roadmap publico planificado",
    body: "Pagina de roadmap con datos locales editables, fases, areas de progreso e hitos.",
    label: "Plan",
  },
];
