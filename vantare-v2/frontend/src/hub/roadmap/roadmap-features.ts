/**
 * roadmap-features.ts
 *
 * Construye las 3 secciones ("En desarrollo" / "En investigación" /
 * "Próximamente") a partir de features-data.ts (fuente manual). No hay
 * auto-generación: la fuente es docs/features-source.json.
 */

import {
  FEATURES_FALLBACK,
  fetchFeaturesDataset,
  type FeatureStatus,
  type FeatureTipo,
  type FeaturesDataset,
  type RoadmapFeature,
} from "./features-data";

// ── UI chrome (iconos y colores) ─────────────────────────────────────

export const TIPO_META: Record<
  FeatureTipo,
  { icon: string; label: string; color: string }
> = {
  feature: { icon: "⚡", label: "Feature", color: "text-vantare-red-400" },
  bugfix: { icon: "🐛", label: "Bugfix", color: "text-amber-400" },
  improve: { icon: "🔧", label: "Mejora", color: "text-blue-400" },
  component: { icon: "🧩", label: "Componente", color: "text-emerald-400" },
};

export const STATUS_META: Record<
  FeatureStatus,
  { label: string; color: string }
> = {
  "in-development": { label: "En desarrollo", color: "text-vantare-red-400" },
  research: { label: "En investigación", color: "text-violet-400" },
  future: { label: "Próximamente", color: "text-vantare-textDim" },
};

// ── Public types ─────────────────────────────────────────────────────

export type RoadmapCategory = {
  id: string;
  label: { es: string; en: string; pt: string; it: string };
  features: ReadonlyArray<RoadmapFeature>;
  percent: number;
};

export type ActiveSections = {
  inDevelopment: ReadonlyArray<RoadmapCategory>;
  research: ReadonlyArray<RoadmapCategory>;
  future: ReadonlyArray<RoadmapCategory>;
};

export type ActiveSectionsResult = {
  sections: ActiveSections;
  overallProgress: number;
};

// ── Helpers ─────────────────────────────────────────────────────────

export function groupFeaturesByCategory(
  features: ReadonlyArray<RoadmapFeature>,
): Map<string, RoadmapFeature[]> {
  const grouped = new Map<string, RoadmapFeature[]>();
  for (const f of features) {
    const arr = grouped.get(f.category) ?? [];
    arr.push(f);
    grouped.set(f.category, arr);
  }
  return grouped;
}

function buildCategories(
  features: ReadonlyArray<RoadmapFeature>,
  dataset: FeaturesDataset,
): ReadonlyArray<RoadmapCategory> {
  const grouped = groupFeaturesByCategory(features);
  const ordered = [...dataset.categories].sort((a, b) => a.order - b.order);

  const out: RoadmapCategory[] = [];
  for (const cat of ordered) {
    const feats = grouped.get(cat.id);
    if (!feats || feats.length === 0) continue;
    const sorted = [...feats].sort((a, b) => b.percent - a.percent);
    const avg = Math.round(
      sorted.reduce((sum, f) => sum + f.percent, 0) / sorted.length,
    );
    out.push({
      id: cat.id,
      label: cat.label,
      features: sorted,
      percent: avg,
    });
  }
  return out;
}

// ── API pública ─────────────────────────────────────────────────────

/**
 * Devuelve las 3 secciones que pinta la pestaña "Desarrollo por features"
 * Y el progreso global calculado del mismo dataset que las alimenta,
 * para que header y cards nunca se desincronicen.
 * Si el fetch falla, se usa FEATURES_FALLBACK; el resultado nunca es null.
 */
export async function getActiveSections(): Promise<ActiveSectionsResult> {
  const dataset = await fetchFeaturesDataset();
  const byStatus: Record<FeatureStatus, RoadmapFeature[]> = {
    "in-development": [],
    research: [],
    future: [],
  };
  for (const f of dataset.features) {
    byStatus[f.status].push(f);
  }
  return {
    sections: {
      inDevelopment: buildCategories(byStatus["in-development"], dataset),
      research: buildCategories(byStatus.research, dataset),
      future: buildCategories(byStatus.future, dataset),
    },
    overallProgress: getOverallFeatureProgress(dataset),
  };
}

/**
 * % global = media de los % de las features ACTIVAS (in-development + research).
 * Las future no cuentan para el progreso global.
 */
export function getOverallFeatureProgress(dataset: FeaturesDataset): number {
  const active = dataset.features.filter(
    (f) => f.status === "in-development" || f.status === "research",
  );
  if (active.length === 0) return 0;
  return Math.round(
    active.reduce((acc, f) => acc + f.percent, 0) / active.length,
  );
}
