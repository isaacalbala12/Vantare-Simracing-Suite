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

export type RoadmapFeature = {
  id: string;
  category: string;
  label: LocalizedText;
  description: LocalizedText;
  tipo: FeatureTipo;
  status: FeatureStatus;
  percent: 0 | 10 | 25 | 50 | 75 | 100;
};

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

function isProgressScale(n: number): n is RoadmapFeature["percent"] {
  return (PROGRESS_SCALE as ReadonlyArray<number>).includes(n);
}

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
    .map((f) => ({
      id: String(f.id ?? "").trim(),
      category: String(f.category ?? "").trim(),
      label: asText(f.label),
      description: asText(f.description),
      tipo: String(f.tipo ?? ""),
      status: String(f.status ?? ""),
      percent: Number(f.percent),
    }))
    .filter((f): f is RoadmapFeature => {
      if (!f.id) return false;
      if (!catIds.has(f.category)) return false;
      if (!isStatus(f.status)) return false;
      if (!isTipo(f.tipo)) return false;
      if (!isProgressScale(f.percent)) return false;
      return true;
    });

  if (features.length === 0) return null;
  return { categories, features };
}

export { pickText };

export const FEATURES_FALLBACK: FeaturesDataset = {
  categories: [
    { id: "calendar", label: { es: "Calendario", en: "Calendar", pt: "Calendário", it: "Calendario" }, order: 1 },
    { id: "roadmap", label: { es: "Roadmap", en: "Roadmap", pt: "Roadmap", it: "Roadmap" }, order: 2 },
    { id: "widgets", label: { es: "Widgets", en: "Widgets", pt: "Widgets", it: "Widgets" }, order: 3 },
    { id: "engineer", label: { es: "Ingeniero", en: "Engineer", pt: "Engenheiro", it: "Engineer" }, order: 4 },
    { id: "widget-studio", label: { es: "Widget Studio", en: "Widget Studio", pt: "Widget Studio", it: "Widget Studio" }, order: 5 },
    { id: "launcher", label: { es: "Launcher", en: "Launcher", pt: "Launcher", it: "Launcher" }, order: 6 },
    { id: "onboarding", label: { es: "Onboarding", en: "Onboarding", pt: "Onboarding", it: "Onboarding" }, order: 7 },
    { id: "payments", label: { es: "Pagos", en: "Payments", pt: "Pagamentos", it: "Pagamenti" }, order: 8 },
    { id: "settings", label: { es: "Ajustes", en: "Settings", pt: "Configurações", it: "Impostazioni" }, order: 9 },
  ],
  features: [
    { id: "calendar-interval-races-dayview", category: "calendar", label: { es: "Calendar interval races", en: "Calendar interval races", pt: "Calendar interval races", it: "Calendar interval races" }, description: { es: "Mostrar las carreras de intervalo (Bronce/Plata/Oro) como eventos individuales en la línea de tiempo del DayView, con patrón escalonado predecible.", en: "Show interval races (Bronze/Silver/Gold) as individual events on the DayView timeline, with a predictable staggered pattern.", pt: "Mostrar as corridas de intervalo (Bronze/Prata/Ouro) como eventos individuais na linha do tempo do DayView, com padrão escalonado previsível.", it: "Mostrare le gare di intervallo (Bronzo/Argento/Oro) come eventi singoli nella timeline del DayView, con uno schema scaglionato prevedibile." }, tipo: "feature", status: "in-development", percent: 0 },
    { id: "roadmap-features-from-plans", category: "roadmap", label: { es: "Roadmap iteration", en: "Roadmap iteration", pt: "Roadmap iteration", it: "Roadmap iteration" }, description: { es: "Iterar la pantalla RoadmapPage: i18n de datos, doble roadmaps, changelog real, feedback, features desde planes y porcentajes reales.", en: "Iterate the RoadmapPage: data i18n, dual roadmaps, real changelog, feedback, features from plans and real percentages.", pt: "Iterar a tela RoadmapPage: i18n de dados, roadmaps duplos, changelog real, feedback, features a partir de planos e percentuais reais.", it: "Iterare la RoadmapPage: i18n dei dati, doppia roadmap, changelog reale, feedback, feature dai piani e percentuali reali." }, tipo: "feature", status: "in-development", percent: 100 },
    { id: "obslan-double-pc", category: "engineer", label: { es: "OBS LAN double PC", en: "OBS LAN dual PC", pt: "OBS LAN duplo PC", it: "OBS LAN doppio PC" }, description: { es: "Configuración automatizada de OBS LAN para doble PC con Vantare.", en: "Automated OBS LAN setup for dual PC with Vantare.", pt: "Configuração automatizada do OBS LAN para PC duplo com Vantare.", it: "Configurazione automatizzata di OBS LAN per doppio PC con Vantare." }, tipo: "feature", status: "future", percent: 0 },
    { id: "overlay-performance-fixes", category: "engineer", label: { es: "Overlay performance", en: "Overlay performance", pt: "Overlay performance", it: "Overlay performance" }, description: { es: "Optimizaciones de rendimiento en el runtime de overlays.", en: "Performance optimizations in the overlay runtime.", pt: "Otimizações de desempenho no runtime de overlays.", it: "Ottimizzazioni delle prestazioni nel runtime degli overlay." }, tipo: "improve", status: "future", percent: 0 },
    { id: "p1-pedals-inventory", category: "widgets", label: { es: "Pedals inventory", en: "Pedals inventory", pt: "Pedals inventory", it: "Pedals inventory" }, description: { es: "Inventario técnico del widget Pedals y camino a implementación completa.", en: "Technical inventory of the Pedals widget and path to full implementation.", pt: "Inventário técnico do widget Pedals e caminho para implementação completa.", it: "Inventario tecnico del widget Pedals e percorso per l'implementazione completa." }, tipo: "feature", status: "future", percent: 0 },
    { id: "vantare-suite-ingeniero-integration", category: "engineer", label: { es: "Ingeniero integration", en: "Engineer integration", pt: "Ingeniero integration", it: "Engineer integration" }, description: { es: "Integración completa del módulo Ingeniero con LMU live.", en: "Full integration of the Engineer module with LMU live.", pt: "Integração completa do módulo Engenheiro com LMU live.", it: "Integrazione completa del modulo Engineer con LMU live." }, tipo: "feature", status: "future", percent: 0 },
    { id: "widget-studio-reform", category: "widget-studio", label: { es: "Widget Studio — Reforma y code-review", en: "Widget Studio — Reform and code review", pt: "Widget Studio — Reforma e code review", it: "Widget Studio — Riforma e code review" }, description: { es: "Reformar Widget Studio sección a sección, code-review extenso, completar widgets Crystal restantes y revisión de personalización extensa.", en: "Reform Widget Studio section by section, extensive code review, complete remaining Crystal widgets, and thorough customization review.", pt: "Reformar o Widget Studio seção por seção, code review extenso, completar os widgets Crystal restantes e revisão extensa de personalização.", it: "Riformare Widget Studio sezione per sezione, code review esteso, completare i widget Crystal rimanenti e revisione approfondita della personalizzazione." }, tipo: "feature", status: "in-development", percent: 0 },
    { id: "launcher-reform", category: "launcher", label: { es: "Launcher — Revisión visual y filtros", en: "Launcher — Visual review and filters", pt: "Launcher — Revisão visual e filtros", it: "Launcher — Revisione visiva e filtri" }, description: { es: "Revisión visual parcial del Launcher, filtros de aplicaciones y code-review extenso.", en: "Partial visual review of the Launcher, application filters, and extensive code review.", pt: "Revisão visual parcial do Launcher, filtros de aplicações e code review extenso.", it: "Revisione visiva parziale del Launcher, filtri delle applicazioni e code review esteso." }, tipo: "feature", status: "in-development", percent: 0 },
    { id: "onboarding-login-review", category: "onboarding", label: { es: "Onboarding + Inicio de sesión", en: "Onboarding + Login", pt: "Onboarding + Login", it: "Onboarding + Login" }, description: { es: "Revisión completa visual del flujo de onboarding e inicio de sesión.", en: "Complete visual review of the onboarding and login flow.", pt: "Revisão visual completa do fluxo de onboarding e login.", it: "Revisione visiva completa del flusso di onboarding e login." }, tipo: "feature", status: "future", percent: 0 },
    { id: "payments-research", category: "payments", label: { es: "Pagos — Investigación", en: "Payments — Research", pt: "Pagamentos — Pesquisa", it: "Pagamenti — Ricerca" }, description: { es: "Revisión completa del sistema de pagos, evaluación Polar vs Stripe, reservar GPT 5.6.", en: "Complete review of the payment system, evaluate Polar vs Stripe, reserve GPT 5.6.", pt: "Revisão completa do sistema de pagamentos, avaliação Polar vs Stripe, reservar GPT 5.6.", it: "Revisione completa del sistema di pagamenti, valutazione Polar vs Stripe, prenotare GPT 5.6." }, tipo: "feature", status: "research", percent: 0 },
    { id: "settings-account", category: "settings", label: { es: "Ajustes + Cuenta de Vantare", en: "Settings + Vantare Account", pt: "Configurações + Conta Vantare", it: "Impostazioni + Account Vantare" }, description: { es: "Configuraciones básicas y cuenta de Vantare. Dependiente de pagos.", en: "Basic settings and Vantare account. Dependent on payments.", pt: "Configurações básicas e conta Vantare. Dependente de pagamentos.", it: "Impostazioni di base e account Vantare. Dipendente dai pagamenti." }, tipo: "feature", status: "future", percent: 0 },
  ],
};
