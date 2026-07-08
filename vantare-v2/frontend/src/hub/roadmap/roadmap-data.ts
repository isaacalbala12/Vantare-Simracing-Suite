// Datos del roadmap.
//
// Fuente de verdad MANUAL: docs/roadmap-source.json (editado por Isaac). La app
// lo trae por fetch en runtime (ver fetchRoadmapDataset). NO hay script que
// regenere estos datos desde otros documentos: se transcriben a mano.
//
// El texto de las cards vive INLINE en el JSON fuente (es/en/pt/it), no en los
// diccionarios i18n. El "chrome" de la UI (eyebrows, labels, feedback, hero)
// sigue en i18n. ROADMAP_FALLBACK es una copia empaquetada para uso sin red.
//
// Procedimiento y flujo manual: docs/roadmap-maintenance.md.

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
};

export type RoadmapMilestone = {
  id: string;
  type: "release" | "feature" | "fix" | "plan";
  title: LocalizedText;
  body: LocalizedText;
  label: LocalizedText;
};

export type RoadmapDataset = {
  phases: ReadonlyArray<RoadmapPhase>;
  areas: ReadonlyArray<RoadmapArea>;
  milestones: ReadonlyArray<RoadmapMilestone>;
};

// URL de la fuente manual. Apunta al JSON en el repo (raw GitHub). Cambiable
// sin tocar código: si más adelante usas un Google Doc exportado a JSON o
// Supabase Storage, solo sustituyes esta constante.
export const ROADMAP_SOURCE_URL =
  "https://raw.githubusercontent.com/isaacalbala12/Vantare-Simracing-Suite/main/docs/roadmap-source.json";

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

// Elige el texto según el locale actual; cae a español si falta la traducción.
export function pickText(text: LocalizedText, locale: string): string {
  if (text && typeof text === "object" && locale in text) {
    const v = (text as Record<string, string>)[locale];
    if (v && v.length > 0) return v;
  }
  return text?.es ?? "";
}

// Fallback empaquetado (copia de docs/roadmap-source.json) para cuando no hay
// red. Debe mantenerse sincronizado manualmente con la fuente remota.
export const ROADMAP_FALLBACK: RoadmapDataset = {
  phases: [
    {
      id: "beta-foundation",
      phaseLabel: { es: "Fase 1", en: "Phase 1", pt: "Fase 1", it: "Fase 1" },
      title: { es: "Beta pública", en: "Public beta", "pt": "Beta pública", it: "Beta pubblica" },
      target: { es: "v0.1.0", en: "v0.1.0", "pt": "v0.1.0", it: "v0.1.0" },
      status: "done",
      progress: 100,
      summary: {
        es: "Login Google, plan Free, overlays recomendados, launcher LMU y Hub v5.2.",
        en: "Google login, Free plan, recommended overlays, LMU launcher and Hub v5.2.",
        "pt": "Login Google, plan Free, overlays recomendados, launcher LMU e Hub v5.2.",
        it: "Login Google, piano Free, overlay consigliati, launcher LMU e Hub v5.2.",
      },
      highlights: [
        { es: "Google OAuth externo y sesión persistente", en: "External Google OAuth and persistent session", "pt": "Google OAuth externo e sessão persistente", it: "Google OAuth esterno e sessione persistente" },
        { es: "Perfiles recomendados y editor de overlays", en: "Recommended profiles and overlay editor", "pt": "Perfis recomendados e editor de overlays", it: "Profili consigliati e editor di overlay" },
        { es: "Launcher LMU básico", en: "Basic LMU launcher", "pt": "Launcher LMU básico", it: "Launcher LMU di base" },
      ],
    },
    {
      id: "beta-iteration",
      phaseLabel: { es: "Fase 2", en: "Phase 2", "pt": "Fase 2", it: "Fase 2" },
      title: { es: "Pulido beta v0.1.x", en: "Beta polish v0.1.x", "pt": "Polimento beta v0.1.x", it: "Polish beta v0.1.x" },
      target: { es: "v0.1.x", en: "v0.1.x", "pt": "v0.1.x", it: "v0.1.x" },
      status: "in-progress",
      progress: 75,
      summary: {
        es: "Refactor del calendario LMU, iteración de la página de roadmap y Launcher LMU funcional.",
        en: "LMU calendar refactor, roadmap page iteration and a working LMU Launcher.",
        "pt": "Refactor do calendário LMU, iteração da página de roadmap e Launcher LMU funcional.",
        it: "Refactor del calendario LMU, iterazione della pagina di roadmap e Launcher LMU funzionante.",
      },
      highlights: [
        { es: "Refactor del calendario LMU (cadencia, filtros, zona horaria)", en: "LMU calendar refactor (cadence, filters, timezone)", "pt": "Refactor do calendário LMU (cadência, filtros, fuso)", it: "Refactor calendario LMU (cadenza, filtri, fuso orario)" },
        { es: "Iteración de la página Roadmap (i18n, doble vista, changelog, feedback)", en: "Roadmap page iteration (i18n, dual view, changelog, feedback)", "pt": "Iteração da página Roadmap (i18n, dupla visão, changelog, feedback)", it: "Iterazione pagina Roadmap (i18n, vista doppia, changelog, feedback)" },
        { es: "Launcher LMU para abrir el simulador", en: "LMU Launcher to open the simulator", "pt": "Launcher LMU para abrir o simulador", it: "LMU Launcher per aprire il simulatore" },
      ],
    },
    {
      id: "engineer",
      phaseLabel: { es: "Fase 3", en: "Phase 3", "pt": "Fase 3", it: "Fase 3" },
      title: { es: "Ingeniero Vantare", en: "Vantare Engineer", "pt": "Engenheiro Vantare", it: "Engineer Vantare" },
      target: { es: "Por planear", en: "To plan", "pt": "Por planear", it: "Da pianificare" },
      status: "planned",
      progress: 25,
      summary: {
        es: "Spotter e ingeniero con avisos útiles, sin prometer voz IA completa hasta validar datos.",
        en: "Spotter and engineer with useful alerts, no full AI voice until data is validated.",
        "pt": "Spotter e engenheiro com avisos úteis, sem prometer voz IA completa até validar dados.",
        it: "Spotter e engineer con avvisi utili, senza promettere voce IA completa finché i dati non sono validati.",
      },
      highlights: [
        { es: "Notificaciones contextuales", en: "Contextual notifications", "pt": "Notificações contextuais", it: "Notifiche contestuali" },
        { es: "Reglas locales primero", en: "Local rules first", "pt": "Regras locais primeiro", it: "Regole locali prima" },
        { es: "Voz y perfiles avanzados después", en: "Voice and advanced profiles later", "pt": "Voz e perfis avançados depois", it: "Voce e profili avanzati dopo" },
      ],
    },
    {
      id: "ecosystem",
      phaseLabel: { es: "Fase 4", en: "Phase 4", "pt": "Fase 4", it: "Fase 4" },
      title: { es: "Ecosistema", en: "Ecosystem", "pt": "Ecossistema", it: "Ecosistema" },
      target: { es: "Futuro", en: "Future", "pt": "Futuro", it: "Futuro" },
      status: "future",
      progress: 10,
      summary: {
        es: "Comunidad, paid tiers, multisim y analíticas reales cuando la base esté estable.",
        en: "Community, paid tiers, multisim and real analytics once the base is stable.",
        "pt": "Comunidade, paid tiers, multisim e analíticas reais quando a base estiver estável.",
        it: "Community, paid tier, multisim e analitiche reali quando la base è stabile.",
      },
      highlights: [
        { es: "Comunidad de overlays", en: "Overlay community", "pt": "Comunidade de overlays", it: "Community di overlay" },
        { es: "Licencias paid/suite reales", en: "Real paid/suite licenses", "pt": "Licenças paid/suite reais", it: "Licenze paid/suite reali" },
        { es: "Datos reales de carrera y progresión", en: "Real race and progression data", "pt": "Dados reais de corrida e progressão", it: "Dati reali di gara e progressione" },
      ],
    },
  ],
  areas: [
    { id: "overlays-studio", title: { es: "Overlays Studio", en: "Overlays Studio", "pt": "Overlays Studio", it: "Overlays Studio" }, progress: 75, status: "in-progress" },
    { id: "launcher-lmu", title: { es: "Launcher LMU", en: "LMU Launcher", "pt": "Launcher LMU", it: "LMU Launcher" }, progress: 75, status: "in-progress" },
    { id: "calendar-local", title: { es: "Calendario local", en: "Local calendar", "pt": "Calendário local", it: "Calendario locale" }, progress: 50, status: "in-progress" },
    { id: "engineer", title: { es: "Ingeniero", en: "Engineer", "pt": "Engenheiro", it: "Engineer" }, progress: 25, status: "planned" },
    { id: "telemetry", title: { es: "Telemetría", en: "Telemetry", "pt": "Telemetria", it: "Telemetria" }, progress: 10, status: "planned" },
    { id: "ui-v52", title: { es: "UI v5.2", en: "UI v5.2", "pt": "UI v5.2", it: "UI v5.2" }, progress: 75, status: "in-progress" },
  ],
  milestones: [
    {
      id: "v0102",
      type: "release",
      title: { es: "v0.1.0.2 publicado", en: "v0.1.0.2 released", "pt": "v0.1.0.2 publicado", it: "v0.1.0.2 rilasciato" },
      body: {
        es: "Fix de login Google OAuth, Free plan funcional, Supabase configurado en build.",
        en: "Google OAuth login fix, working Free plan, Supabase configured in build.",
        "pt": "Fix de login Google OAuth, Free plan funcional, Supabase configurado no build.",
        it: "Fix login Google OAuth, Free plan funzionante, Supabase configurato nel build.",
      },
      label: { es: "Release", en: "Release", "pt": "Release", it: "Release" },
    },
    {
      id: "hub-v52",
      type: "feature",
      title: { es: "Hub v5.2 en migración", en: "Hub v5.2 in progress", "pt": "Hub v5.2 em migração", it: "Hub v5.2 in corso" },
      body: {
        es: "Migración del Hub por cortes pequeños: shell, dashboard, launcher, ingeniero, telemetría, ajustes.",
        en: "Hub migration in small cuts: shell, dashboard, launcher, engineer, telemetry, settings.",
        "pt": "Migração do Hub em cortes pequenos: shell, dashboard, launcher, engenheiro, telemetria, ajustes.",
        it: "Migrazione Hub a piccoli tagli: shell, dashboard, launcher, engineer, telemetria, impostazioni.",
      },
      label: { es: "Feature", en: "Feature", "pt": "Feature", it: "Feature" },
    },
    {
      id: "launcher-lmu",
      type: "feature",
      title: { es: "Launcher LMU disponible", en: "LMU Launcher available", "pt": "Launcher LMU disponível", it: "LMU Launcher disponibile" },
      body: {
        es: "Configuración de Steam o ejecutable local para lanzar Le Mans Ultimate desde Vantare.",
        en: "Steam or local executable config to launch Le Mans Ultimate from Vantare.",
        "pt": "Configuração de Steam ou executável local para abrir Le Mans Ultimate pelo Vantare.",
        it: "Config di Steam o eseguibile locale per avviare Le Mans Ultimate da Vantare.",
      },
      label: { es: "Feature", en: "Feature", "pt": "Feature", it: "Feature" },
    },
    {
      id: "calendar-refactor",
      type: "feature",
      title: { es: "Refactor del calendario LMU", en: "LMU calendar refactor", "pt": "Refactor do calendário LMU", it: "Refactor calendario LMU" },
      body: {
        es: "Calendario reescrito para mostrar cadencia de preparación LMU, con filtros y zona horaria correctas.",
        en: "Calendar rewritten to show LMU prep cadence, with correct filters and timezone.",
        "pt": "Calendário reescrito para mostrar cadência de preparação LMU, com filtros e fuso corretos.",
        it: "Calendario riscritto per mostrare la cadenza di preparazione LMU, con filtri e fuso corretti.",
      },
      label: { es: "En desarrollo", en: "In progress", "pt": "Em desenvolvimento", it: "In corso" },
    },
    {
      id: "roadmap-public",
      type: "plan",
      title: { es: "Roadmap público planificado", en: "Public roadmap planned", "pt": "Roadmap público planejado", it: "Roadmap pubblico pianificato" },
      body: {
        es: "Página de roadmap con fuente manual remota, fases, áreas de progreso e hitos que se actualizan solos.",
        en: "Roadmap page with remote manual source, phases, progress areas and self-updating milestones.",
        "pt": "Página de roadmap com fonte remota manual, fases, áreas de progresso e marcos que se atualizam sozinhos.",
        it: "Pagina roadmap con fonte remota manuale, fasi, aree di progresso e traguardi auto-aggiornanti.",
      },
      label: { es: "Plan", en: "Plan", "pt": "Plano", it: "Piano" },
    },
  ],
};

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
  if (phases.length === 0 || areas.length === 0) return null;
  return { phases, areas, milestones };
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

export type RoadmapChangelogEntry = {
  id: string;
  version: string;
  date: string;
  titleKey: string;
  bodyKey: string;
};

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
