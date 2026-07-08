/**
 * roadmap-features.ts
 *
 * Lee roadmap-progress.json (generado por scripts/generate-roadmap-progress.mjs).
 * Parsea current-plan.md para planes con "Estado: 🟢 ACTIVO" o "🔮 FUTURO".
 * Sin overrides manuales — todo es automático.
 */

import progressData from "./roadmap-progress.json";

// ── Types ──────────────────────────────────────────────────────────

export type FeatureTipo = "feature" | "bugfix" | "improve" | "research" | "component";

export type RoadmapFeature = {
  slug: string;
  label: string;
  description: string;
  tipo: FeatureTipo;
  future: boolean;
  percent: number;
  checkProgress: { done: number; total: number } | null;
};

export type RoadmapCategory = {
  id: string;
  label: string;
  features: ReadonlyArray<RoadmapFeature>;
  percent: number;
};

// ── Data ───────────────────────────────────────────────────────────

type ProgressEntry = {
  label: string;
  description: string;
  tipo: string;
  future: boolean;
  done: number;
  total: number;
  percent: number;
};

const progressMap: Record<string, ProgressEntry> = progressData as Record<
  string,
  ProgressEntry
>;

// ── Constants ──────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  "calendar-interval-races-dayview": "calendar",
  "calendar-refactor": "calendar",
  "roadmap-features-from-plans": "roadmap",
  "launcher-extensive": "launcher",
  "release-02-licensing-auth": "auth-licensing",
  "sql-01-migration": "auth-licensing",
  "stripe-01-products": "auth-licensing",
  "deploy-01-webhook": "auth-licensing",
  "checkout-01": "auth-licensing",
  "auth-04-signup": "auth-licensing",
  "audit-01": "auth-licensing",
  "e2e-01": "auth-licensing",
  "support-01-cli": "auth-licensing",
  "runbook-01": "auth-licensing",
  "i18n-03b-auth": "auth-licensing",
  "obslan-double-pc": "releases",
  "overlay-performance-fixes": "overlays",
  "profile-hardening-fixes": "overlays",
  "p1-pedals-inventory": "widgets",
  "vantare-suite-ingeniero-integration": "engineer",
};

const CATEGORY_LABELS: Record<string, string> = {
  calendar: "Calendario",
  launcher: "Launcher",
  "auth-licensing": "Auth & Licencias",
  roadmap: "Roadmap",
  widgets: "Widgets",
  "widget-studio": "Widget Studio",
  hub: "Hub UI",
  engineer: "Ingeniero",
  releases: "Releases",
  overlays: "Overlays",
  other: "Otros",
};

export const TIPO_META: Record<FeatureTipo, { icon: string; label: string; color: string }> = {
  feature: { icon: "⚡", label: "Feature", color: "text-vantare-red-400" },
  bugfix: { icon: "🐛", label: "Bugfix", color: "text-amber-400" },
  improve: { icon: "🔧", label: "Mejora", color: "text-blue-400" },
  research: { icon: "🔬", label: "Investigación", color: "text-violet-400" },
  component: { icon: "🧩", label: "Componente", color: "text-emerald-400" },
};

// ── Public API ─────────────────────────────────────────────────────

function buildFeatures(): RoadmapFeature[] {
  return Object.entries(progressMap).map(([slug, entry]) => ({
    slug,
    label: entry.label,
    description: entry.description,
    tipo: (entry.tipo as FeatureTipo) ?? "feature",
    future: entry.future,
    percent: entry.percent,
    checkProgress:
      entry.total > 0 ? { done: entry.done, total: entry.total } : null,
  }));
}

function groupByCategory(features: RoadmapFeature[]): Map<string, RoadmapFeature[]> {
  const grouped = new Map<string, RoadmapFeature[]>();
  for (const f of features) {
    const cat = CATEGORY_MAP[f.slug] ?? "other";
    const arr = grouped.get(cat) ?? [];
    arr.push(f);
    grouped.set(cat, arr);
  }
  return grouped;
}

const CATEGORY_ORDER = [
  "calendar",
  "launcher",
  "auth-licensing",
  "roadmap",
  "widgets",
  "widget-studio",
  "hub",
  "engineer",
  "releases",
  "overlays",
  "other",
];

/**
 * Features activas (🟢 ACTIVO), agrupadas por categoría.
 */
export function getFeatureCategories(): ReadonlyArray<RoadmapCategory> {
  const active = buildFeatures().filter((f) => !f.future);
  const grouped = groupByCategory(active);

  const categories: RoadmapCategory[] = [];
  for (const catId of CATEGORY_ORDER) {
    const feats = grouped.get(catId);
    if (!feats || feats.length === 0) continue;

    feats.sort((a, b) => b.percent - a.percent);
    const avg = feats.reduce((sum, f) => sum + f.percent, 0) / feats.length;

    categories.push({
      id: catId,
      label: CATEGORY_LABELS[catId] ?? catId,
      features: feats,
      percent: Math.round(avg),
    });
  }

  return categories;
}

/**
 * Features futuras (🔮 FUTURO), agrupadas por categoría.
 */
export function getFutureCategories(): ReadonlyArray<RoadmapCategory> {
  const future = buildFeatures().filter((f) => f.future);
  const grouped = groupByCategory(future);

  const categories: RoadmapCategory[] = [];
  for (const catId of CATEGORY_ORDER) {
    const feats = grouped.get(catId);
    if (!feats || feats.length === 0) continue;

    feats.sort((a, b) => b.percent - a.percent);
    const avg = feats.reduce((sum, f) => sum + f.percent, 0) / feats.length;

    categories.push({
      id: catId,
      label: CATEGORY_LABELS[catId] ?? catId,
      features: feats,
      percent: Math.round(avg),
    });
  }

  return categories;
}

/**
 * % global de features activas.
 */
export function getOverallFeatureProgress(): number {
  const categories = getFeatureCategories();
  const allFeatures = categories.flatMap((c) => [...c.features]);
  if (allFeatures.length === 0) return 0;
  const sum = allFeatures.reduce((acc, f) => acc + f.percent, 0);
  return Math.round(sum / allFeatures.length);
}
