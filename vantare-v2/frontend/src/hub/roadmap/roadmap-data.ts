// Datos del roadmap.
//
// Fuente de verdad MANUAL: `docs/roadmap/plan.md` (lo escribe una persona). De
// ahi sale `docs/roadmap/roadmap.json`, que genera
// `.github/scripts/roadmap_digest.py` combinando el plan con los commits ya
// mergeados a nightly. Ese artefacto es lo que se empaqueta aqui: la pantalla
// ya no lleva fases escritas a mano.
//
// El texto de las cards vive INLINE en el JSON (es/en/pt/it), no en los
// diccionarios i18n. El "chrome" de la UI (eyebrows, labels, feedback, hero)
// sigue en i18n.
//
// En runtime la app sigue prefiriendo la copia publicada en master
// (`ROADMAP_SOURCE_URL`); la empaquetada es la que se usa sin red.
//
// Procedimiento: `docs/roadmap/plan.md` y `docs/roadmap-maintenance.md`.

import generatedRoadmapJson from "../../../../docs/roadmap/roadmap.json";

export type RoadmapStatus = "done" | "in-progress" | "planned" | "future";

export type LocalizedText = {
  es: string;
  en: string;
  pt: string;
  it: string;
};

export type RoadmapPhase = {
  id: string;
  phaseLabel: LocalizedText;
  title: LocalizedText;
  status: RoadmapStatus;
  target: LocalizedText;
  progress: number;
  summary: LocalizedText;
  highlights: LocalizedText[];
};

export type RoadmapArea = {
  id: string;
  title: LocalizedText;
  progress: number;
  status: RoadmapStatus;
  /**
   * Ids of the projects in the public projects snapshot that make up this
   * area. When present, the area's percentage is computed from their tasks and
   * the `progress` field above is only a fallback for when that snapshot is
   * unavailable. Hand-maintained numbers sitting next to live ones drift, and
   * did: the editorial roadmap claimed 25% for telemetry while the projects
   * tab, reading the same workspace, showed 94%.
   */
  projects?: ReadonlyArray<string>;
};

export type RoadmapMilestone = {
  id: string;
  type: "release" | "feature" | "fix" | "plan";
  title: LocalizedText;
  body: LocalizedText;
  label: LocalizedText;
};

/**
 * Tipo de una entrega leida de un commit. `change` es lo que queda cuando el
 * asunto no declara un tipo convencional: el generador no adivina uno.
 */
export type RoadmapDeliveredKind = "feat" | "fix" | "perf" | "docs" | "change";

export type RoadmapDeliveredEntry = {
  kind: RoadmapDeliveredKind;
  /** Ambito del commit (`hub`, `overlay`...). Vacio si el asunto no lo declara. */
  scope: string;
  /** Asunto del commit, ya limpio de codigo de issue y numero de PR. */
  text: string;
  breaking?: boolean;
};

/** Un dia de entregas, tal y como lo agrupa el generador. */
export type RoadmapDeliveredDay = {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  entries: ReadonlyArray<RoadmapDeliveredEntry>;
};

export type RoadmapDataset = {
  phases: ReadonlyArray<RoadmapPhase>;
  areas: ReadonlyArray<RoadmapArea>;
  milestones: ReadonlyArray<RoadmapMilestone>;
  /**
   * Lo mergeado a nightly ultimamente, de mas reciente a mas antiguo. Sale de
   * los commits, no del plan manual, y por eso la pantalla lo presenta aparte
   * en vez de mezclarlo con las fases.
   */
  delivered: ReadonlyArray<RoadmapDeliveredDay>;
};

// Copia publicada del MISMO artefacto que se empaqueta aquí. Apunta a
// `nightly` porque es donde la tarea programada deja el digest al día; una
// build antigua puede así enseñar entregas posteriores a su propia fecha.
// Cambiable sin tocar código: solo se sustituye esta constante.
export const ROADMAP_SOURCE_URL =
  "https://raw.githubusercontent.com/isaacalbala12/Vantare-Simracing-Suite/nightly/vantare-v2/docs/roadmap/roadmap.json";

// Escala obligatoria de porcentajes (docs/roadmap-maintenance.md §3).
export const PROGRESS_SCALE = [0, 10, 25, 50, 75, 100] as const;

export function clampProgress(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * Percentage for one area. Areas linked to projects are counted from those
 * projects' tasks, so the figure moves on its own as work closes in Linear.
 * The declared `progress` is the fallback for an unlinked area, or for when
 * the projects snapshot could not be read.
 */
export function resolveAreaProgress(
  area: RoadmapArea,
  projects: ReadonlyMap<string, { done: number; total: number }> | null,
): number {
  if (!projects || !area.projects || area.projects.length === 0) {
    return clampProgress(area.progress);
  }
  let done = 0;
  let total = 0;
  for (const id of area.projects) {
    const project = projects.get(id);
    if (!project) continue;
    done += project.done;
    total += project.total;
  }
  if (total === 0) return clampProgress(area.progress);
  return clampProgress(Math.round((done / total) * 100));
}

/**
 * Indexes a projects snapshot by id, keeping only the task counts the areas
 * need. Projects with no tasks report a null percentage and are skipped, so an
 * empty project cannot drag an area's figure towards zero.
 */
export function indexProjectProgress(
  snapshot: {
    tabs: ReadonlyArray<{
      projects: ReadonlyArray<{ id: string; progress: { done: number; total: number } | null }>;
    }>;
  } | null,
): ReadonlyMap<string, { done: number; total: number }> | null {
  if (!snapshot) return null;
  const index = new Map<string, { done: number; total: number }>();
  for (const tab of snapshot.tabs) {
    for (const project of tab.projects) {
      if (!project.progress || project.progress.total === 0) continue;
      index.set(project.id, { done: project.progress.done, total: project.progress.total });
    }
  }
  return index;
}

/**
 * Overall figure. Averaging the resolved percentages weights every area the
 * same regardless of how many tasks it holds, which is what the areas list
 * shows and therefore what a reader expects the headline to summarise.
 * Reported as measured rather than snapped to the coarse scale: rounding 94%
 * up to 100% would announce finished work that is not finished.
 */
export function getOverallProgress(
  areas: ReadonlyArray<RoadmapArea>,
  projects: ReadonlyMap<string, { done: number; total: number }> | null = null,
): number {
  if (areas.length === 0) return 0;
  const sum = areas.reduce((acc, area) => acc + resolveAreaProgress(area, projects), 0);
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

export function nearestOnScale(value: number): number {
  return PROGRESS_SCALE.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev,
  );
}

// Elige el texto según el locale actual; cae a español si falta la traducción.
export function pickText(text: LocalizedText, locale: string): string {
  if (text && typeof text === "object" && locale in text) {
    const v = (text as Record<string, string>)[locale];
    if (v && v.length > 0) return v;
  }
  return text?.es ?? "";
}

// Copia empaquetada del artefacto generado. Se usa cuando no hay red y como
// base de la pantalla: es exactamente lo que produjo el ultimo digest, no una
// transcripcion a mano que pueda divergir.
export const ROADMAP_FALLBACK: RoadmapDataset = normalizeRoadmapSource(generatedRoadmapJson) ?? {
  phases: [],
  areas: [],
  milestones: [],
  delivered: [],
};

/** Momento en que se genero la copia empaquetada (ISO 8601). */
export const ROADMAP_GENERATED_AT: string = String(
  (generatedRoadmapJson as { generatedAt?: unknown }).generatedAt ?? "",
);

// Trae la fuente manual remota. Si falla (sin red, JSON roto, timeout),
// devuelve el fallback empaquetado. Nunca lanza.
export async function fetchRoadmapDataset(
  signal?: AbortSignal,
): Promise<RoadmapDataset> {
  try {
    const res = await fetch(ROADMAP_SOURCE_URL, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`roadmap source HTTP ${res.status}`);
    const raw = (await res.json()) as unknown;
    const parsed = normalizeRoadmapSource(raw);
    if (!parsed) throw new Error("roadmap source shape invalid");
    return parsed;
  } catch {
    return ROADMAP_FALLBACK;
  }
}

// Valida y mapea el JSON fuente a RoadmapDataset. Devuelve null si falta algo
// esencial, para que el llamador use el fallback.
function normalizeRoadmapSource(raw: unknown): RoadmapDataset | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.phases) || !Array.isArray(obj.areas) || !Array.isArray(obj.milestones)) {
    return null;
  }
  const phases = obj.phases
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      id: String(p.id ?? ""),
      phaseLabel: asText(p.phaseLabel),
      title: asText(p.title),
      status: asStatus(p.status),
      target: asText(p.target),
      progress: clampProgress(Number(p.progress) || 0),
      summary: asText(p.summary),
      highlights: Array.isArray(p.highlights)
        ? (p.highlights as unknown[]).map((h) => asText(h))
        : [],
    }));
  const areas = obj.areas
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      id: String(a.id ?? ""),
      title: asText(a.title),
      progress: clampProgress(Number(a.progress) || 0),
      status: asStatus(a.status),
      projects: Array.isArray(a.projects)
        ? (a.projects as unknown[]).map((p) => String(p)).filter((p) => p.length > 0)
        : undefined,
    }));
  const milestones = obj.milestones
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      id: String(m.id ?? ""),
      type: asMilestoneType(m.type),
      title: asText(m.title),
      body: asText(m.body),
      label: asText(m.label),
    }));
  const delivered = Array.isArray(obj.delivered)
    ? (obj.delivered as unknown[])
        .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
        .map((d) => ({
          date: String(d.date ?? ""),
          entries: Array.isArray(d.entries)
            ? (d.entries as unknown[])
                .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
                .map((e) => ({
                  kind: asDeliveredKind(e.kind),
                  scope: String(e.scope ?? ""),
                  text: String(e.text ?? ""),
                  ...(e.breaking === true ? { breaking: true as const } : {}),
                }))
                .filter((e) => e.text.length > 0)
            : [],
        }))
        .filter((d) => d.date.length > 0 && d.entries.length > 0)
    : [];
  if (phases.length === 0 || areas.length === 0) return null;
  return { phases, areas, milestones, delivered };
}

function asDeliveredKind(v: unknown): RoadmapDeliveredKind {
  const s = String(v);
  if (s === "feat" || s === "fix" || s === "perf" || s === "docs") return s;
  return "change";
}

function asText(v: unknown): LocalizedText {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return {
      es: String(o.es ?? ""),
      en: String(o.en ?? ""),
      pt: String(o.pt ?? ""),
      it: String(o.it ?? ""),
    };
  }
  const s = String(v ?? "");
  return { es: s, en: s, pt: s, it: s };
}

function asStatus(v: unknown): RoadmapStatus {
  const s = String(v);
  if (s === "done" || s === "in-progress" || s === "planned" || s === "future") {
    return s;
  }
  return "planned";
}

function asMilestoneType(v: unknown): "release" | "feature" | "fix" | "plan" {
  const s = String(v);
  if (s === "release" || s === "feature" || s === "fix" || s === "plan") return s;
  return "plan";
}

// Últimas 5 entradas de docs/changelog.md (sincronizado a mano, ver docs/roadmap-maintenance.md §5).
export const ROADMAP_CHANGELOG: ReadonlyArray<RoadmapChangelogEntry> = [
  // Las fechas salen de los tags reales del repositorio, no del texto de
  // changelog.md, que no las lleva.
  {
    id: "v0105",
    version: "v0.1.0.5",
    date: "2026-08-03",
    titleKey: "roadmap.changelog.v0105.title",
    bodyKey: "roadmap.changelog.v0105.body",
  },
  {
    id: "v0104",
    version: "v0.1.0.4",
    date: "2026-07-08",
    titleKey: "roadmap.changelog.v0104.title",
    bodyKey: "roadmap.changelog.v0104.body",
  },
  {
    id: "v0103",
    version: "v0.1.0.3",
    date: "2026-07-08",
    titleKey: "roadmap.changelog.v0103.title",
    bodyKey: "roadmap.changelog.v0103.body",
  },
  {
    id: "v0102",
    version: "v0.1.0.2",
    date: "2026-06-29",
    titleKey: "roadmap.changelog.v0102.title",
    bodyKey: "roadmap.changelog.v0102.body",
  },
];

export type RoadmapChangelogEntry = {
  id: string;
  version: string;
  date: string;
  titleKey: string;
  bodyKey: string;
};

// URL pública del changelog completo.
export const ROADMAP_CHANGELOG_URL =
  "https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/master/vantare-v2/docs/changelog.md";

// Enlaces de feedback (TODO: reemplazar form por URL real cuando se decida).
export const ROADMAP_FEEDBACK_LINKS = {
  github: "https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/new",
  discord: "https://discord.gg/wWjD7CPe74",
  form: "https://forms.gle/TODO-vantare-feedback",
} as const;

export type RoadmapFeedbackType = "bug" | "suggestion" | "general";
export type RoadmapFeedbackDestination = "github" | "discord" | "form";
