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

export type RoadmapDataset = {
  phases: ReadonlyArray<RoadmapPhase>;
  areas: ReadonlyArray<RoadmapArea>;
  milestones: ReadonlyArray<RoadmapMilestone>;
};

// URL de la fuente manual. Apunta al JSON en el repo (raw GitHub). Cambiable
// sin tocar código: si más adelante usas un Google Doc exportado a JSON o
// Supabase Storage, solo sustituyes esta constante.
export const ROADMAP_SOURCE_URL =
  "https://raw.githubusercontent.com/isaacalbala12/Vantare-Simracing-Suite/master/vantare-v2/docs/roadmap-source.json";

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

// Fallback empaquetado (copia de docs/roadmap-source.json) para cuando no hay
// red. Debe mantenerse sincronizado manualmente con la fuente remota.
export const ROADMAP_FALLBACK: RoadmapDataset = {
  phases: [
    {
      id: "beta-foundation",
      phaseLabel: { es: "Fase 1", en: "Phase 1", pt: "Fase 1", it: "Fase 1" },
      title: { es: "Beta pública", en: "Public beta", pt: "Beta pública", it: "Beta pubblica" },
      target: { es: "v0.1.0", en: "v0.1.0", pt: "v0.1.0", it: "v0.1.0" },
      status: "done",
      progress: 100,
      summary: { es: "Login Google, plan Free, overlays recomendados, launcher LMU y Hub v5.2.", en: "Google login, Free plan, recommended overlays, LMU launcher and Hub v5.2.", pt: "Login Google, plano Free, overlays recomendados, launcher LMU e Hub v5.2.", it: "Login Google, piano Free, overlay consigliati, launcher LMU e Hub v5.2." },
      highlights: [
        { es: "Google OAuth externo y sesión persistente", en: "External Google OAuth and persistent session", pt: "Google OAuth externo e sessão persistente", it: "Google OAuth esterno e sessione persistente" },
        { es: "Perfiles recomendados y editor de overlays", en: "Recommended profiles and overlay editor", pt: "Perfis recomendados e editor de overlays", it: "Profili consigliati e editor di overlay" },
        { es: "Launcher LMU básico", en: "Basic LMU launcher", pt: "Launcher LMU básico", it: "Launcher LMU di base" },
      ],
    },
    {
      id: "beta-iteration",
      phaseLabel: { es: "Fase 2", en: "Phase 2", pt: "Fase 2", it: "Fase 2" },
      title: { es: "Pulido beta v0.1.x", en: "Beta polish v0.1.x", pt: "Polimento beta v0.1.x", it: "Polish beta v0.1.x" },
      target: { es: "v0.1.x", en: "v0.1.x", pt: "v0.1.x", it: "v0.1.x" },
      status: "in-progress",
      progress: 75,
      summary: { es: "Overlay Studio V3, telemetría LMU en vivo, licencias con credencial offline y Launcher con cadenas de lanzamiento.", en: "Overlay Studio V3, live LMU telemetry, offline-credential licensing and a Launcher with launch chains.", pt: "Overlay Studio V3, telemetria LMU ao vivo, licenças com credencial offline e Launcher com cadeias de lançamento.", it: "Overlay Studio V3, telemetria LMU dal vivo, licenze con credenziale offline e Launcher con catene di avvio." },
      highlights: [
        { es: "Overlay Studio V3 con los catálogos Crystal, Neo y Endurance", en: "Overlay Studio V3 with the Crystal, Neo and Endurance catalogues", pt: "Overlay Studio V3 com os catálogos Crystal, Neo e Endurance", it: "Overlay Studio V3 con i cataloghi Crystal, Neo ed Endurance" },
        { es: "Telemetría LMU en vivo con transporte compartido y proyecciones", en: "Live LMU telemetry with a shared transport and projections", pt: "Telemetria LMU ao vivo com transporte partilhado e projeções", it: "Telemetria LMU dal vivo con trasporto condiviso e proiezioni" },
        { es: "Licencias con credencial offline y arranque desde caché", en: "Licensing with offline credentials and cache-first startup", pt: "Licenças com credencial offline e arranque a partir da cache", it: "Licenze con credenziale offline e avvio dalla cache" },
        { es: "Launcher con detección de apps y cadenas de lanzamiento", en: "Launcher with app detection and launch chains", pt: "Launcher com deteção de apps e cadeias de lançamento", it: "Launcher con rilevamento app e catene di avvio" },
      ],
    },
    {
      id: "engineer",
      phaseLabel: { es: "Fase 3", en: "Phase 3", pt: "Fase 3", it: "Fase 3" },
      title: { es: "Ingeniero y estrategia", en: "Engineer and strategy", pt: "Engenheiro e estratégia", it: "Engineer e strategia" },
      target: { es: "Por planear", en: "To plan", pt: "Por planear", it: "Da pianificare" },
      status: "planned",
      progress: 25,
      summary: { es: "Ingeniero y estrategia con avisos útiles sobre datos ya validados; la voz llega cuando los datos la sostengan.", en: "Engineer and strategy with useful alerts over validated data; voice arrives once the data supports it.", pt: "Engenheiro e estratégia com avisos úteis sobre dados validados; a voz chega quando os dados a sustentarem.", it: "Engineer e strategia con avvisi utili su dati validati; la voce arriva quando i dati la sostengono." },
      highlights: [
        { es: "Proyecciones de ingeniero y estrategia sobre telemetría real", en: "Engineer and strategy projections over real telemetry", pt: "Projeções de engenheiro e estratégia sobre telemetria real", it: "Proiezioni engineer e strategia su telemetria reale" },
        { es: "Reglas locales primero", en: "Local rules first", pt: "Regras locais primeiro", it: "Regole locali prima" },
        { es: "Voz y perfiles avanzados después", en: "Voice and advanced profiles later", pt: "Voz e perfis avançados depois", it: "Voce e profili avanzati dopo" },
      ],
    },
    {
      id: "ecosystem",
      phaseLabel: { es: "Fase 4", en: "Phase 4", pt: "Fase 4", it: "Fase 4" },
      title: { es: "Ecosistema", en: "Ecosystem", pt: "Ecossistema", it: "Ecosistema" },
      target: { es: "Futuro", en: "Future", pt: "Futuro", it: "Futuro" },
      status: "future",
      progress: 10,
      summary: { es: "Comunidad, planes de pago, multisim y analíticas reales cuando la base esté estable.", en: "Community, paid plans, multisim and real analytics once the base is stable.", pt: "Comunidade, planos pagos, multisim e analíticas reais quando a base estiver estável.", it: "Community, piani a pagamento, multisim e analitiche reali quando la base è stabile." },
      highlights: [
        { es: "Comunidad de overlays", en: "Overlay community", pt: "Comunidade de overlays", it: "Community di overlay" },
        { es: "Planes de pago y suite reales", en: "Real paid and suite plans", pt: "Planos pagos e suite reais", it: "Piani a pagamento e suite reali" },
        { es: "Datos reales de carrera y progresión", en: "Real race and progression data", pt: "Dados reais de corrida e progressão", it: "Dati reali di gara e progressione" },
      ],
    },
  ],
  areas: [
    { id: "overlays-studio", title: { es: "Overlays Studio", en: "Overlays Studio", pt: "Overlays Studio", it: "Overlays Studio" }, progress: 75, status: "in-progress", projects: ["overlay-studio-v3"] },
    { id: "launcher-lmu", title: { es: "Launcher", en: "Launcher", pt: "Launcher", it: "Launcher" }, progress: 75, status: "in-progress", projects: ["launcher"] },
    { id: "telemetry", title: { es: "Telemetría", en: "Telemetry", pt: "Telemetria", it: "Telemetria" }, progress: 25, status: "in-progress", projects: ["telemetry-core", "telemetry-analysis"] },
    { id: "calendar-local", title: { es: "Carreras", en: "Races", pt: "Corridas", it: "Gare" }, progress: 50, status: "in-progress", projects: ["races-calendar"] },
    { id: "engineer", title: { es: "Ingeniero", en: "Engineer", pt: "Engenheiro", it: "Engineer" }, progress: 25, status: "planned", projects: ["engineer-spotter"] },
    { id: "strategy", title: { es: "Estrategia", en: "Strategy", pt: "Estratégia", it: "Strategia" }, progress: 25, status: "in-progress", projects: ["strategy-planner"] },
    { id: "licensing", title: { es: "Licencias y cuenta", en: "Licensing and account", pt: "Licenças e conta", it: "Licenze e account" }, progress: 50, status: "in-progress", projects: ["billing"] },
  ],
  milestones: [
    {
      id: "v0105",
      type: "release",
      title: { es: "v0.1.0.5 en nightly", en: "v0.1.0.5 on nightly", pt: "v0.1.0.5 em nightly", it: "v0.1.0.5 su nightly" },
      body: { es: "Lote de launcher de Windows, paneles del hub, servicios internos y documentación de marca y diseño.", en: "Windows launcher batch, hub panels, internal services and brand and design documentation.", pt: "Lote de launcher do Windows, painéis do hub, serviços internos e documentação de marca e design.", it: "Lotto di launcher Windows, pannelli hub, servizi interni e documentazione di brand e design." },
      label: { es: "Release", en: "Release", pt: "Release", it: "Release" },
    },
    {
      id: "overlay-studio-v3",
      type: "feature",
      title: { es: "Overlay Studio V3 en marcha", en: "Overlay Studio V3 under way", pt: "Overlay Studio V3 em curso", it: "Overlay Studio V3 in corso" },
      body: { es: "Un único límite de render para estudio, runtime y previsualización, con los catálogos Crystal, Neo y Endurance.", en: "A single render boundary for studio, runtime and preview, with the Crystal, Neo and Endurance catalogues.", pt: "Um único limite de render para estúdio, runtime e pré-visualização, com os catálogos Crystal, Neo e Endurance.", it: "Un unico confine di render per studio, runtime e anteprima, con i cataloghi Crystal, Neo ed Endurance." },
      label: { es: "En desarrollo", en: "In progress", pt: "Em desenvolvimento", it: "In corso" },
    },
    {
      id: "telemetry-live",
      type: "feature",
      title: { es: "Telemetria LMU en vivo", en: "Live LMU telemetry", pt: "Telemetria LMU ao vivo", it: "Telemetria LMU dal vivo" },
      body: { es: "Driver LMU con reconexión acotada, transporte compartido entre ventanas y proyecciones de overlay, ingeniero y estrategia.", en: "LMU driver with bounded reconnects, a transport shared across windows and overlay, engineer and strategy projections.", pt: "Driver LMU com reconexão limitada, transporte partilhado entre janelas e projeções de overlay, engenheiro e estratégia.", it: "Driver LMU con riconnessione limitata, trasporto condiviso tra finestre e proiezioni di overlay, engineer e strategia." },
      label: { es: "En desarrollo", en: "In progress", pt: "Em desenvolvimento", it: "In corso" },
    },
    {
      id: "licensing-offline",
      type: "feature",
      title: { es: "Licencias con credencial offline", en: "Licensing with offline credentials", pt: "Licencas com credencial offline", it: "Licenze con credenziale offline" },
      body: { es: "La app arranca desde la credencial en caché y verifica sin red, de modo que una caída del servicio no cierra la sesión.", en: "The app starts from the cached credential and verifies offline, so a service outage does not sign you out.", pt: "A app arranca a partir da credencial em cache e verifica sem rede, para que uma falha do serviço não encerre a sessão.", it: "L'app parte dalla credenziale in cache e verifica offline, così un guasto del servizio non chiude la sessione." },
      label: { es: "Feature", en: "Feature", pt: "Feature", it: "Feature" },
    },
    {
      id: "channels",
      type: "plan",
      title: { es: "Canales nightly y testers", en: "Nightly and testers channels", pt: "Canais nightly e testers", it: "Canali nightly e tester" },
      body: { es: "Tres canales de actualización (estable, testers y nightly) con acceso según el rol de la cuenta.", en: "Three update channels (stable, testers and nightly) with access driven by the account role.", pt: "Três canais de atualização (estável, testers e nightly) com acesso conforme o papel da conta.", it: "Tre canali di aggiornamento (stabile, tester e nightly) con accesso in base al ruolo dell'account." },
      label: { es: "Plan", en: "Plan", pt: "Plano", it: "Piano" },
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
