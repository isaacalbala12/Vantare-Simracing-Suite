// Datos de la pestaña "Desarrollo por features".
//
// Fuente de verdad MANUAL: docs/features-source.json (editado por Isaac). La app
// lo trae por fetch en runtime (ver fetchFeaturesDataset). NO hay script que
// regenere estos datos: se transcriben a mano.
//
// El texto de cada feature vive INLINE en el JSON fuente (es/en/pt/it). El
// "chrome" de la UI (eyebrows, badges, iconos) sigue en TIPO_META / STATUS_META.
// FEATURES_FALLBACK es una copia empaquetada para uso sin red.
//
// Procedimiento y flujo manual: docs/roadmap-maintenance.md.

import {
  PROGRESS_SCALE,
  pickText,
  type LocalizedText,
} from "./roadmap-data";

export type FeatureStatus = "in-development" | "research" | "future";

export type FeatureTipo = "feature" | "bugfix" | "improve" | "component";

export type FeatureCategory = {
  id: string;
  label: LocalizedText;
  order: number;
};

export type RoadmapSubtask = {
  label: LocalizedText;
  done: boolean;
};

export type RoadmapFeature = {
  id: string;
  category: string;
  label: LocalizedText;
  description: LocalizedText;
  tipo: FeatureTipo;
  status: FeatureStatus;
  subtasks: RoadmapSubtask[];
};

/** % derivado del ratio done/total de las subtasks, redondeado a la escala. */
export function featurePercent(f: RoadmapFeature): number {
  if (f.subtasks.length === 0) return 0;
  const done = f.subtasks.filter((s) => s.done).length;
  return nearestOnScale(Math.round((done / f.subtasks.length) * 100));
}

function nearestOnScale(value: number): number {
  return PROGRESS_SCALE.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev,
  );
}

export type FeaturesDataset = {
  categories: ReadonlyArray<FeatureCategory>;
  features: ReadonlyArray<RoadmapFeature>;
};

export const FEATURES_SOURCE_URL =
  "https://raw.githubusercontent.com/isaacalbala12/Vantare-Simracing-Suite/main/docs/features-source.json";

const VALID_STATUS: ReadonlyArray<FeatureStatus> = [
  "in-development",
  "research",
  "future",
];
const VALID_TIPO: ReadonlyArray<FeatureTipo> = [
  "feature",
  "bugfix",
  "improve",
  "component",
];

function isStatus(s: string): s is FeatureStatus {
  return (VALID_STATUS as ReadonlyArray<string>).includes(s);
}

function isTipo(s: string): s is FeatureTipo {
  return (VALID_TIPO as ReadonlyArray<string>).includes(s);
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

export async function fetchFeaturesDataset(
  signal?: AbortSignal,
): Promise<FeaturesDataset> {
  try {
    const res = await fetch(FEATURES_SOURCE_URL, { signal, cache: "no-store" });
    if (!res.ok) throw new Error(`features source HTTP ${res.status}`);
    const raw = (await res.json()) as unknown;
    const parsed = normalizeFeaturesSource(raw);
    if (!parsed) throw new Error("features source shape invalid");
    return parsed;
  } catch {
    return FEATURES_FALLBACK;
  }
}

function normalizeFeaturesSource(raw: unknown): FeaturesDataset | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.categories) || !Array.isArray(obj.features)) {
    return null;
  }

  const categories = obj.categories
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      id: String(c.id ?? "").trim(),
      label: asText(c.label),
      order: Number(c.order) || 0,
    }))
    .filter((c) => c.id.length > 0);
  if (categories.length === 0) return null;
  const catIds = new Set(categories.map((c) => c.id));

  const features = obj.features
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => {
      const rawSubtasks = Array.isArray(f.subtasks) ? f.subtasks : [];
      const subtasks: RoadmapSubtask[] = rawSubtasks
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({ label: asText(s.label), done: Boolean(s.done) }));
      return {
        id: String(f.id ?? "").trim(),
        category: String(f.category ?? "").trim(),
        label: asText(f.label),
        description: asText(f.description),
        tipo: String(f.tipo ?? ""),
        status: String(f.status ?? ""),
        subtasks,
      };
    })
    .filter((f): f is RoadmapFeature => {
      if (!f.id) return false;
      if (!catIds.has(f.category)) return false;
      if (!isStatus(f.status)) return false;
      if (!isTipo(f.tipo)) return false;
      return true;
    }) as RoadmapFeature[];

  if (features.length === 0) return null;
  return { categories, features };
}

export { pickText };

export const FEATURES_FALLBACK: FeaturesDataset = {
  categories: [
    { id: "widget-studio", label: { es: "Widget Studio", en: "Widget Studio", pt: "Widget Studio", it: "Widget Studio" }, order: 1 },
    { id: "launcher", label: { es: "Launcher", en: "Launcher", pt: "Launcher", it: "Launcher" }, order: 2 },
    { id: "onboarding", label: { es: "Onboarding", en: "Onboarding", pt: "Onboarding", it: "Onboarding" }, order: 3 },
    { id: "payments", label: { es: "Pagos", en: "Payments", pt: "Pagamentos", it: "Pagamenti" }, order: 4 },
    { id: "settings", label: { es: "Ajustes", en: "Settings", pt: "Configurações", it: "Impostazioni" }, order: 5 },
  ],
  features: [
    {
      id: "widget-studio-reform", category: "widget-studio",
      label: { es: "Widget Studio — Reforma y code-review", en: "Widget Studio — Reform and code review", pt: "Widget Studio — Reforma e code review", it: "Widget Studio — Riforma e code review" },
      description: { es: "Reformar Widget Studio sección a sección con code-review extenso.", en: "Reform Widget Studio section by section with extensive code review.", pt: "Reformar o Widget Studio seção por seção com code review extenso.", it: "Riformare Widget Studio sezione per sezione con code review esteso." },
      tipo: "feature", status: "in-development",
      subtasks: [
        { label: { es: "Reformar sección a sección", en: "Reform section by section", pt: "Reformar seção por seção", it: "Riformare sezione per sezione" }, done: false },
        { label: { es: "Code-review extenso", en: "Extensive code review", pt: "Code review extenso", it: "Code review esteso" }, done: false },
        { label: { es: "Widgets Crystal restantes", en: "Remaining Crystal widgets", pt: "Widgets Crystal restantes", it: "Widget Crystal rimanenti" }, done: false },
        { label: { es: "Revisión de personalización extensa", en: "Thorough customization review", pt: "Revisão extensa de personalização", it: "Revisione approfondita della personalizzazione" }, done: false },
      ],
    },
    {
      id: "launcher-reform", category: "launcher",
      label: { es: "Launcher — Revisión visual y filtros", en: "Launcher — Visual review and filters", pt: "Launcher — Revisão visual e filtros", it: "Launcher — Revisione visiva e filtri" },
      description: { es: "Revisión visual parcial, filtros de aplicaciones y code-review extenso.", en: "Partial visual review, application filters, and extensive code review.", pt: "Revisão visual parcial, filtros de aplicações e code review extenso.", it: "Revisione visiva parziale, filtri delle applicazioni e code review esteso." },
      tipo: "feature", status: "in-development",
      subtasks: [
        { label: { es: "Revisión visual parcial", en: "Partial visual review", pt: "Revisão visual parcial", it: "Revisione visiva parziale" }, done: false },
        { label: { es: "Filtros de aplicaciones", en: "Application filters", pt: "Filtros de aplicações", it: "Filtri delle applicazioni" }, done: false },
        { label: { es: "Code-Review extenso", en: "Extensive code review", pt: "Code review extenso", it: "Code review esteso" }, done: false },
      ],
    },
    {
      id: "onboarding-login-review", category: "onboarding",
      label: { es: "Onboarding + Inicio de sesión", en: "Onboarding + Login", pt: "Onboarding + Login", it: "Onboarding + Login" },
      description: { es: "Revisión completa visual del flujo de onboarding e inicio de sesión.", en: "Complete visual review of the onboarding and login flow.", pt: "Revisão visual completa do fluxo de onboarding e login.", it: "Revisione visiva completa del flusso di onboarding e login." },
      tipo: "feature", status: "future",
      subtasks: [
        { label: { es: "Revisión completa visual", en: "Complete visual review", pt: "Revisão visual completa", it: "Revisione visiva completa" }, done: false },
      ],
    },
    {
      id: "payments-research", category: "payments",
      label: { es: "Pagos — Investigación", en: "Payments — Research", pt: "Pagamentos — Pesquisa", it: "Pagamenti — Ricerca" },
      description: { es: "Revisión completa del sistema de pagos.", en: "Complete review of the payment system.", pt: "Revisão completa do sistema de pagamentos.", it: "Revisione completa del sistema di pagamenti." },
      tipo: "feature", status: "research",
      subtasks: [
        { label: { es: "Revisión completa", en: "Complete review", pt: "Revisão completa", it: "Revisione completa" }, done: false },
        { label: { es: "¿Polar vs Stripe?", en: "Polar vs Stripe?", pt: "Polar vs Stripe?", it: "Polar vs Stripe?" }, done: false },
        { label: { es: "Reservar GPT 5.6", en: "Reserve GPT 5.6", pt: "Reservar GPT 5.6", it: "Prenotare GPT 5.6" }, done: false },
      ],
    },
    {
      id: "settings-account", category: "settings",
      label: { es: "Ajustes + Cuenta de Vantare", en: "Settings + Vantare Account", pt: "Configurações + Conta Vantare", it: "Impostazioni + Account Vantare" },
      description: { es: "Configuraciones básicas y cuenta de Vantare. Dependiente de pagos.", en: "Basic settings and Vantare account. Dependent on payments.", pt: "Configurações básicas e conta Vantare. Dependente de pagamentos.", it: "Impostazioni di base e account Vantare. Dipendente dai pagamenti." },
      tipo: "feature", status: "future",
      subtasks: [
        { label: { es: "Configuraciones básicas", en: "Basic settings", pt: "Configurações básicas", it: "Impostazioni di base" }, done: false },
        { label: { es: "Cuenta de Vantare", en: "Vantare account", pt: "Conta Vantare", it: "Account Vantare" }, done: false },
      ],
    },
  ],
};
