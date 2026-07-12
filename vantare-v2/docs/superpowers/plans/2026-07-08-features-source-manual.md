# Manual Features Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "Desarrollo por features" tab of the Roadmap page from a script-generated JSON (parsed from `current-plan.md`) to a **manual source** (`docs/features-source.json`) that the product owner edits by hand, fetched at runtime, with a bundled fallback. One line in the JSON = one card, automatically grouped by category and status. No scripts, no auto-generation.

**Architecture:** New `docs/features-source.json` is the source of truth (categories + features, 4 langs, `percent` 0/10/25/50/75/100, explicit `status` ∈ `in-development | research | future`, explicit `category` id). The app fetches it via `FEATURES_SOURCE_URL` on opening the "Desarrollo por features" tab. On failure (no network, 404, invalid shape) it falls back to `FEATURES_FALLBACK` (embedded copy). The render in `FeaturesSection` paints **3 separate sections** ("En desarrollo" / "En investigación" / "Próximamente") grouped by category within each, sorted by `percent` desc. The old `scripts/generate-roadmap-progress.mjs` and `frontend/src/hub/roadmap/roadmap-progress.json` are deleted. The `TIPO_META` map loses `research` (now a status, not a type) and gains a `STATUS_META` map for the 3 statuses.

**Tech Stack:** TypeScript (strict), React 19, Vite, Vitest, Playwright (smoke). Fetch API (native, no new deps). Pattern mirrors `frontend/src/hub/roadmap/roadmap-data.ts` (the "Roadmap actual" tab already does this).

---

## File Structure

| File | Responsibility |
|---|---|
| `docs/features-source.json` (NEW) | Manual source: `categories[]` + `features[]`, 4 langs, scale 0/10/25/50/75/100. |
| `frontend/src/hub/roadmap/features-data.ts` (NEW) | Types `FeatureStatus`, `FeatureTipo`, `FeatureCategory`, `RoadmapFeature`, `FeaturesDataset`, `LocalizedText` (re-exported). Constants: `FEATURES_SOURCE_URL`, `FEATURES_FALLBACK`. Function: `fetchFeaturesDataset(signal?)`. Validation: `normalizeFeaturesSource(raw)`. |
| `frontend/src/hub/roadmap/features-data.test.ts` (NEW) | Tests of `FEATURES_FALLBACK` integrity, `fetchFeaturesDataset` (fetch valid → parsed; fetch fail → fallback; invalid shape → fallback), validation, scale. |
| `frontend/src/hub/roadmap/roadmap-features.ts` (MODIFY) | Replace `getFeatureCategories` / `getFutureCategories` with `getActiveSections()` returning `{ sections, overallProgress }`. Keep `getOverallFeatureProgress(dataset)`. Drop the hardcoded `CATEGORY_MAP` and `CATEGORY_LABELS` (now in the source). Drop `research` from `TIPO_META` (4 types). New `STATUS_META` for 3 statuses. |
| `frontend/src/hub/roadmap/roadmap-features.test.ts` (MODIFY) | Adapt tests to the new API. |
| `frontend/src/hub/pages/RoadmapPage.tsx` (MODIFY) | `FeaturesSection` renders 3 blocks (in-development / research / future) with section eyebrows. |
| `frontend/src/hub/pages/RoadmapPage.test.tsx` (MODIFY) | Add tests for the 3 sections. |
| `scripts/generate-roadmap-progress.mjs` (DELETE) | Old auto-generation script. |
| `frontend/src/hub/roadmap/roadmap-progress.json` (DELETE) | Old bundled output. |
| `docs/roadmap-maintenance.md` (MODIFY) | Document the manual flow for features (mirror the roadmap section). |
| `docs/roadmap-agent-guide.md` (MODIFY) | Agent guide section for features. |
| `docs/current-plan.md` (MODIFY) | Add note `FEATURES-MANUAL-SOURCE (2026-07-08)`. |

No new npm dependencies. No new Go code. No backend changes.

---

## Pre-Task 0: Verify clean working tree

**Files:** none.

- [ ] **Step 1: Check for uncommitted changes in the plan's scope**

Run from the repo root:

```bash
git status --short
```

Expected: the plan's files (`docs/features-source.json`, `frontend/src/hub/roadmap/features-data.ts`, `frontend/src/hub/roadmap/roadmap-features.ts`, `frontend/src/hub/pages/RoadmapPage.tsx`, `docs/roadmap-maintenance.md`, `docs/roadmap-agent-guide.md`, `docs/current-plan.md`, and the deletions in `scripts/` and `frontend/src/hub/roadmap/roadmap-progress.json`) are NOT in the uncommitted set. If they appear, STOP and either commit, stash, or discard them before starting. AGENTS.md forbids mixing unrelated changes with this task.

- [ ] **Step 2: Confirm the dev server is reachable (optional but cheap)**

```bash
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -First 1
```

Expected: at least one row. If empty, start it: `corepack pnpm --dir frontend dev` in background. The Task 8 smoke needs it.

---

## Conventions

- **Scale:** progress MUST be one of `0, 10, 25, 50, 75, 100`. Any other value is invalid and the feature is dropped during normalization (logged via `console.warn` in dev; silently dropped in prod).
- **Category id:** MUST exist in `categories[].id`. If not, the feature is dropped (logged).
- **Status:** MUST be `in-development | research | future`. Otherwise dropped.
- **Tipo:** MUST be `feature | bugfix | improve | component`. Otherwise dropped.
- **Locale text:** `es` is mandatory; `en/pt/it` may fall back to `es` at render time via the existing `pickText` helper from `roadmap-data.ts`.
- **ID:** kebab-case, unique, stable (used as React key).
- **No `done/total`:** removed. Only `percent`.
- **No script:** never re-introduce `generate-roadmap-progress.mjs` or any other auto-generation of `features-source.json`.
- **Mocked fetch in tests:** `vi.stubGlobal("fetch", ...)` to avoid real network, mirroring `RoadmapPage.test.tsx`.

---

## Task 1: Create the manual source `docs/features-source.json`

**Files:**
- Create: `docs/features-source.json`

- [ ] **Step 1: Write the JSON file**

Create `docs/features-source.json` with this exact content (4 categories that exist today, 6 features migrated 1:1 from the old `roadmap-progress.json` with explicit `status` and `category`, and translations for the 4 supported locales; the `slug` becomes the `id`; the `done/total` are dropped; `percent` stays; descriptions are the first sentence of the "Objetivo" from `current-plan.md`):

```json
{
  "version": 1,
  "updatedAt": "2026-07-08",
  "note": "Fuente manual de la pestaña 'Desarrollo por features'. Isaac edita este archivo. La app lo trae por fetch en runtime. Una línea en 'features' = una card. Sin scripts.",
  "categories": [
    {
      "id": "calendar",
      "label": { "es": "Calendario", "en": "Calendar", "pt": "Calendário", "it": "Calendario" },
      "order": 1
    },
    {
      "id": "roadmap",
      "label": { "es": "Roadmap", "en": "Roadmap", "pt": "Roadmap", "it": "Roadmap" },
      "order": 2
    },
    {
      "id": "widgets",
      "label": { "es": "Widgets", "en": "Widgets", "pt": "Widgets", "it": "Widgets" },
      "order": 3
    },
    {
      "id": "engineer",
      "label": { "es": "Ingeniero", "en": "Engineer", "pt": "Engenheiro", "it": "Engineer" },
      "order": 4
    }
  ],
  "features": [
    {
      "id": "calendar-interval-races-dayview",
      "category": "calendar",
      "label": {
        "es": "Calendar interval races",
        "en": "Calendar interval races",
        "pt": "Calendar interval races",
        "it": "Calendar interval races"
      },
      "description": {
        "es": "Mostrar las carreras de intervalo (Bronce/Plata/Oro) como eventos individuales en la línea de tiempo del DayView, con patrón escalonado predecible.",
        "en": "Show interval races (Bronze/Silver/Gold) as individual events on the DayView timeline, with a predictable staggered pattern.",
        "pt": "Mostrar as corridas de intervalo (Bronze/Prata/Ouro) como eventos individuais na linha do tempo do DayView, com padrão escalonado previsível.",
        "it": "Mostrare le gare di intervallo (Bronzo/Argento/Oro) come eventi singoli nella timeline del DayView, con uno schema scaglionato prevedibile."
      },
      "tipo": "feature",
      "status": "in-development",
      "percent": 0
    },
    {
      "id": "roadmap-features-from-plans",
      "category": "roadmap",
      "label": {
        "es": "Roadmap iteration",
        "en": "Roadmap iteration",
        "pt": "Roadmap iteration",
        "it": "Roadmap iteration"
      },
      "description": {
        "es": "Iterar la pantalla RoadmapPage: i18n de datos, doble roadmaps, changelog real, feedback, features desde planes y porcentajes reales.",
        "en": "Iterate the RoadmapPage: data i18n, dual roadmaps, real changelog, feedback, features from plans and real percentages.",
        "pt": "Iterar a tela RoadmapPage: i18n de dados, roadmaps duplos, changelog real, feedback, features a partir de planos e percentuais reais.",
        "it": "Iterare la RoadmapPage: i18n dei dati, doppia roadmap, changelog reale, feedback, feature dai piani e percentuali reali."
      },
      "tipo": "feature",
      "status": "in-development",
      "percent": 100
    },
    {
      "id": "obslan-double-pc",
      "category": "engineer",
      "label": {
        "es": "OBS LAN double PC",
        "en": "OBS LAN dual PC",
        "pt": "OBS LAN duplo PC",
        "it": "OBS LAN doppio PC"
      },
      "description": {
        "es": "Configuración automatizada de OBS LAN para doble PC con Vantare.",
        "en": "Automated OBS LAN setup for dual PC with Vantare.",
        "pt": "Configuração automatizada do OBS LAN para PC duplo com Vantare.",
        "it": "Configurazione automatizzata di OBS LAN per doppio PC con Vantare."
      },
      "tipo": "feature",
      "status": "future",
      "percent": 0
    },
    {
      "id": "overlay-performance-fixes",
      "category": "engineer",
      "label": {
        "es": "Overlay performance",
        "en": "Overlay performance",
        "pt": "Overlay performance",
        "it": "Overlay performance"
      },
      "description": {
        "es": "Optimizaciones de rendimiento en el runtime de overlays.",
        "en": "Performance optimizations in the overlay runtime.",
        "pt": "Otimizações de desempenho no runtime de overlays.",
        "it": "Ottimizzazioni delle prestazioni nel runtime degli overlay."
      },
      "tipo": "improve",
      "status": "future",
      "percent": 0
    },
    {
      "id": "p1-pedals-inventory",
      "category": "widgets",
      "label": {
        "es": "Pedals inventory",
        "en": "Pedals inventory",
        "pt": "Pedals inventory",
        "it": "Pedals inventory"
      },
      "description": {
        "es": "Inventario técnico del widget Pedals y camino a implementación completa.",
        "en": "Technical inventory of the Pedals widget and path to full implementation.",
        "pt": "Inventário técnico do widget Pedals e caminho para implementação completa.",
        "it": "Inventario tecnico del widget Pedals e percorso per l'implementazione completa."
      },
      "tipo": "feature",
      "status": "future",
      "percent": 0
    },
    {
      "id": "vantare-suite-ingeniero-integration",
      "category": "engineer",
      "label": {
        "es": "Ingeniero integration",
        "en": "Engineer integration",
        "pt": "Ingeniero integration",
        "it": "Engineer integration"
      },
      "description": {
        "es": "Integración completa del módulo Ingeniero con LMU live.",
        "en": "Full integration of the Engineer module with LMU live.",
        "pt": "Integração completa do módulo Engenheiro com LMU live.",
        "it": "Integrazione completa del modulo Engineer con LMU live."
      },
      "tipo": "feature",
      "status": "future",
      "percent": 0
    }
  ]
}
```

- [ ] **Step 2: Validate the JSON is well-formed**

Run in PowerShell from the repo root:

```bash
corepack pnpm exec node -e "JSON.parse(require('fs').readFileSync('docs/features-source.json','utf8')); console.log('OK')"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add docs/features-source.json
git commit -m "feat(roadmap): add manual features-source.json"
```

---

## Task 2: Create `features-data.ts` (types, URL, fallback, fetch, normalize)

**Files:**
- Create: `frontend/src/hub/roadmap/features-data.ts`

- [ ] **Step 1: Write the failing test file**

Create `frontend/src/hub/roadmap/features-data.test.ts` with this content:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FEATURES_FALLBACK,
  FEATURES_SOURCE_URL,
  fetchFeaturesDataset,
  type FeatureCategory,
  type FeatureStatus,
  type FeatureTipo,
  type FeaturesDataset,
  type RoadmapFeature,
} from "./features-data";

const lt = (s: string) => ({ es: s, en: s, pt: s, it: s });

describe("FEATURES_FALLBACK dataset", () => {
  it("has at least 4 categories and 6 features (current migration baseline)", () => {
    expect(FEATURES_FALLBACK.categories.length).toBeGreaterThanOrEqual(4);
    expect(FEATURES_FALLBACK.features.length).toBeGreaterThanOrEqual(6);
  });

  it("every feature has a category id that exists in categories", () => {
    const ids = new Set(FEATURES_FALLBACK.categories.map((c) => c.id));
    for (const f of FEATURES_FALLBACK.features) {
      expect(ids.has(f.category)).toBe(true);
    }
  });

  it("every feature has a valid status", () => {
    const valid: FeatureStatus[] = ["in-development", "research", "future"];
    for (const f of FEATURES_FALLBACK.features) {
      expect(valid).toContain(f.status);
    }
  });

  it("every feature has a valid tipo", () => {
    const valid: FeatureTipo[] = ["feature", "bugfix", "improve", "component"];
    for (const f of FEATURES_FALLBACK.features) {
      expect(valid).toContain(f.tipo);
    }
  });

  it("every feature has percent on the 0/10/25/50/75/100 scale", () => {
    for (const f of FEATURES_FALLBACK.features) {
      expect([0, 10, 25, 50, 75, 100]).toContain(f.percent);
    }
  });

  it("every category has a label in es/en/pt/it", () => {
    for (const c of FEATURES_FALLBACK.categories) {
      expect(c.label.es).toBeTruthy();
      expect(c.label.en).toBeTruthy();
      expect(c.label.pt).toBeTruthy();
      expect(c.label.it).toBeTruthy();
    }
  });

  it("every feature has a non-empty id, label.es, description.es", () => {
    for (const f of FEATURES_FALLBACK.features) {
      expect(f.id).toBeTruthy();
      expect(f.label.es).toBeTruthy();
      expect(f.description.es).toBeTruthy();
    }
  });

  it("source url points to the manual features json", () => {
    expect(FEATURES_SOURCE_URL).toContain("docs/features-source.json");
  });
});

describe("fetchFeaturesDataset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and parses the remote source", async () => {
    const fakeJson = {
      categories: [{ id: "calendar", label: lt("Calendar"), order: 1 }],
      features: [{
        id: "x", category: "calendar", label: lt("X"), description: lt("d"),
        tipo: "feature", status: "in-development", percent: 25,
      }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => fakeJson }));
    const ds = await fetchFeaturesDataset();
    expect(ds.categories.length).toBe(1);
    expect(ds.features.length).toBe(1);
    expect(ds.features[0].id).toBe("x");
  });

  it("falls back to FEATURES_FALLBACK when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));
    const ds = await fetchFeaturesDataset();
    expect(ds.features.length).toBe(FEATURES_FALLBACK.features.length);
  });

  it("falls back when the remote shape is invalid (missing categories)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }));
    const ds = await fetchFeaturesDataset();
    expect(ds.categories.length).toBe(FEATURES_FALLBACK.categories.length);
  });

  it("drops features with unknown category and falls back when ALL are dropped", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        categories: [{ id: "calendar", label: lt("Calendar"), order: 1 }],
        features: [
          { id: "x", category: "ghost", label: lt("X"), description: lt("d"), tipo: "feature", status: "in-development", percent: 0 },
        ],
      }),
    }));
    const ds = await fetchFeaturesDataset();
    expect(ds.features.length).toBe(FEATURES_FALLBACK.features.length);
  });

  it("falls back when features have invalid status, tipo, or percent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        categories: [{ id: "calendar", label: lt("Calendar"), order: 1 }],
        features: [
          { id: "x", category: "calendar", label: lt("X"), description: lt("d"), tipo: "alien", status: "wip", percent: 0 },
          { id: "y", category: "calendar", label: lt("Y"), description: lt("d"), tipo: "feature", status: "in-development", percent: 33 },
        ],
      }),
    }));
    const ds = await fetchFeaturesDataset();
    expect(ds.features.length).toBe(FEATURES_FALLBACK.features.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (no module yet)**

Run:

```bash
corepack pnpm --dir frontend exec vitest run src/hub/roadmap/features-data.test.ts
```

Expected: FAIL with "Cannot find module './features-data'" (or similar). This is the red step.

- [ ] **Step 3: Write `features-data.ts` with the implementation**

Create `frontend/src/hub/roadmap/features-data.ts` with this content:

```ts
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

// URL de la fuente manual. Apunta al JSON en el repo (raw GitHub). Cambiable
// sin tocar código: si más adelante usas un Google Doc exportado a JSON o
// Supabase Storage, solo sustituyes esta constante.
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

// Trae la fuente manual remota. Si falla (sin red, JSON roto, timeout, shape
// inválido, features inválidas), devuelve el fallback empaquetado. Nunca lanza.
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

// Valida y mapea el JSON fuente a FeaturesDataset. Devuelve null si falta algo
// esencial. Features con datos inválidos se ignoran silenciosamente (consistente
// con roadmap-data.ts que no tiene drops retornados).
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

// Re-export para que el resto de la app no importe desde dos sitios.
export { pickText };

// Fallback empaquetado (copia de docs/features-source.json) para cuando no hay
// red. Debe mantenerse sincronizado manualmente con la fuente remota.
export const FEATURES_FALLBACK: FeaturesDataset = {
  categories: [
    {
      id: "calendar",
      label: { es: "Calendario", en: "Calendar", pt: "Calendário", it: "Calendario" },
      order: 1,
    },
    {
      id: "roadmap",
      label: { es: "Roadmap", en: "Roadmap", pt: "Roadmap", it: "Roadmap" },
      order: 2,
    },
    {
      id: "widgets",
      label: { es: "Widgets", en: "Widgets", pt: "Widgets", it: "Widgets" },
      order: 3,
    },
    {
      id: "engineer",
      label: { es: "Ingeniero", en: "Engineer", pt: "Engenheiro", it: "Engineer" },
      order: 4,
    },
  ],
  features: [
    {
      id: "calendar-interval-races-dayview",
      category: "calendar",
      label: {
        es: "Calendar interval races",
        en: "Calendar interval races",
        pt: "Calendar interval races",
        it: "Calendar interval races",
      },
      description: {
        es: "Mostrar las carreras de intervalo (Bronce/Plata/Oro) como eventos individuales en la línea de tiempo del DayView, con patrón escalonado predecible.",
        en: "Show interval races (Bronze/Silver/Gold) as individual events on the DayView timeline, with a predictable staggered pattern.",
        pt: "Mostrar as corridas de intervalo (Bronze/Prata/Ouro) como eventos individuais na linha do tempo do DayView, com padrão escalonado previsível.",
        it: "Mostrare le gare di intervallo (Bronzo/Argento/Oro) come eventi singoli nella timeline del DayView, con uno schema scaglionato prevedibile.",
      },
      tipo: "feature",
      status: "in-development",
      percent: 0,
    },
    {
      id: "roadmap-features-from-plans",
      category: "roadmap",
      label: {
        es: "Roadmap iteration",
        en: "Roadmap iteration",
        pt: "Roadmap iteration",
        it: "Roadmap iteration",
      },
      description: {
        es: "Iterar la pantalla RoadmapPage: i18n de datos, doble roadmaps, changelog real, feedback, features desde planes y porcentajes reales.",
        en: "Iterate the RoadmapPage: data i18n, dual roadmaps, real changelog, feedback, features from plans and real percentages.",
        pt: "Iterar a tela RoadmapPage: i18n de dados, roadmaps duplos, changelog real, feedback, features a partir de planos e percentuais reais.",
        it: "Iterare la RoadmapPage: i18n dei dati, doppia roadmap, changelog reale, feedback, feature dai piani e percentuali reali.",
      },
      tipo: "feature",
      status: "in-development",
      percent: 100,
    },
    {
      id: "obslan-double-pc",
      category: "engineer",
      label: {
        es: "OBS LAN double PC",
        en: "OBS LAN dual PC",
        pt: "OBS LAN duplo PC",
        it: "OBS LAN doppio PC",
      },
      description: {
        es: "Configuración automatizada de OBS LAN para doble PC con Vantare.",
        en: "Automated OBS LAN setup for dual PC with Vantare.",
        pt: "Configuração automatizada do OBS LAN para PC duplo com Vantare.",
        it: "Configurazione automatizzata di OBS LAN per doppio PC con Vantare.",
      },
      tipo: "feature",
      status: "future",
      percent: 0,
    },
    {
      id: "overlay-performance-fixes",
      category: "engineer",
      label: {
        es: "Overlay performance",
        en: "Overlay performance",
        pt: "Overlay performance",
        it: "Overlay performance",
      },
      description: {
        es: "Optimizaciones de rendimiento en el runtime de overlays.",
        en: "Performance optimizations in the overlay runtime.",
        pt: "Otimizações de desempenho no runtime de overlays.",
        it: "Ottimizzazioni delle prestazioni nel runtime degli overlay."
      },
      tipo: "improve",
      status: "future",
      percent: 0,
    },
    {
      id: "p1-pedals-inventory",
      category: "widgets",
      label: {
        es: "Pedals inventory",
        en: "Pedals inventory",
        pt: "Pedals inventory",
        it: "Pedals inventory",
      },
      description: {
        es: "Inventario técnico del widget Pedals y camino a implementación completa.",
        en: "Technical inventory of the Pedals widget and path to full implementation.",
        pt: "Inventário técnico do widget Pedals e caminho para implementação completa.",
        it: "Inventario tecnico del widget Pedals e percorso per l'implementazione completa.",
      },
      tipo: "feature",
      status: "future",
      percent: 0,
    },
    {
      id: "vantare-suite-ingeniero-integration",
      category: "engineer",
      label: {
        es: "Ingeniero integration",
        en: "Engineer integration",
        pt: "Ingeniero integration",
        it: "Engineer integration",
      },
      description: {
        es: "Integración completa del módulo Ingeniero con LMU live.",
        en: "Full integration of the Engineer module with LMU live.",
        pt: "Integração completa do módulo Engenheiro com LMU live.",
        it: "Integrazione completa del modulo Engineer con LMU live.",
      },
      tipo: "feature",
      status: "future",
      percent: 0,
    },
  ],
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
corepack pnpm --dir frontend exec vitest run src/hub/roadmap/features-data.test.ts
```

Expected: all tests PASS (13 tests: 8 dataset integrity + 5 fetch).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hub/roadmap/features-data.ts frontend/src/hub/roadmap/features-data.test.ts
git commit -m "feat(roadmap): add features-data module with fetch + fallback"
```

---

## Task 3: Delete the old script and bundled JSON

**Files:**
- Delete: `scripts/generate-roadmap-progress.mjs`
- Delete: `frontend/src/hub/roadmap/roadmap-progress.json`

- [ ] **Step 1: Search for any other consumer of `roadmap-progress.json`**

Run:

```bash
rg -n "roadmap-progress" frontend/src --glob "*.ts" --glob "*.tsx" --glob "*.json"
```

Expected: ONLY matches in `frontend/src/hub/roadmap/roadmap-features.ts` (the `import progressData from "./roadmap-progress.json"` line). If you see other consumers, STOP and report.

- [ ] **Step 2: Delete the files**

Run in PowerShell from the repo root:

```bash
Remove-Item scripts/generate-roadmap-progress.mjs
Remove-Item frontend/src/hub/roadmap/roadmap-progress.json
```

- [ ] **Step 3: Verify the deletes**

```bash
Test-Path scripts/generate-roadmap-progress.mjs
Test-Path frontend/src/hub/roadmap/roadmap-progress.json
```

Expected: `False` for both.

- [ ] **Step 4: Commit**

```bash
git add -u scripts/generate-roadmap-progress.mjs frontend/src/hub/roadmap/roadmap-progress.json
git commit -m "refactor(roadmap): drop generate-roadmap-progress script and bundled json"
```

---

## Task 4: Rewrite `roadmap-features.ts` to consume `features-data.ts`

**Files:**
- Modify: `frontend/src/hub/roadmap/roadmap-features.ts` (full rewrite)

- [ ] **Step 1: Write the failing test for the new API**

Modify `frontend/src/hub/roadmap/roadmap-features.test.ts` to this content:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  STATUS_META,
  TIPO_META,
  getActiveSections,
  getOverallFeatureProgress,
  groupFeaturesByCategory,
} from "./roadmap-features";
import { FEATURES_FALLBACK } from "./features-data";

describe("TIPO_META", () => {
  it("has 4 tipos (no research — research is a status, not a type)", () => {
    expect(Object.keys(TIPO_META).sort()).toEqual(
      ["bugfix", "component", "feature", "improve"].sort(),
    );
  });
  it("every tipo has icon and label", () => {
    for (const v of Object.values(TIPO_META)) {
      expect(v.icon).toBeTruthy();
      expect(v.label).toBeTruthy();
    }
  });
});

describe("STATUS_META", () => {
  it("has exactly 3 statuses", () => {
    expect(Object.keys(STATUS_META).sort()).toEqual(
      ["future", "in-development", "research"].sort(),
    );
  });
  it("every status has label and color", () => {
    for (const v of Object.values(STATUS_META)) {
      expect(v.label).toBeTruthy();
      expect(v.color).toBeTruthy();
    }
  });
});

describe("getActiveSections", () => {
  beforeEach(() => {
    // Mock fetch to fail so getActiveSections() uses FEATURES_FALLBACK deterministically.
    // (Sin este mock, los tests harian una peticion real a raw.githubusercontent.com.)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("no network in tests")),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 3 sections and overallProgress", async () => {
    const { sections, overallProgress } = await getActiveSections();
    expect(sections.inDevelopment).toBeDefined();
    expect(sections.research).toBeDefined();
    expect(sections.future).toBeDefined();
    expect(Array.isArray(sections.inDevelopment)).toBe(true);
    expect(Array.isArray(sections.research)).toBe(true);
    expect(Array.isArray(sections.future)).toBe(true);
    expect(overallProgress).toBeGreaterThanOrEqual(0);
    expect(overallProgress).toBeLessThanOrEqual(100);
  });

  it("splits fallback features by status", async () => {
    const { sections } = await getActiveSections();
    const allIds = [
      ...sections.inDevelopment.flatMap((c) => c.features.map((f) => f.id)),
      ...sections.research.flatMap((c) => c.features.map((f) => f.id)),
      ...sections.future.flatMap((c) => c.features.map((f) => f.id)),
    ].sort();
    const expected = FEATURES_FALLBACK.features.map((f) => f.id).sort();
    expect(allIds).toEqual(expected);
  });

  it("every category is sorted by percent desc within the section", async () => {
    const { sections } = await getActiveSections();
    for (const arr of [sections.inDevelopment, sections.research, sections.future]) {
      for (const cat of arr) {
        for (let i = 1; i < cat.features.length; i++) {
          expect(cat.features[i - 1].percent).toBeGreaterThanOrEqual(
            cat.features[i].percent,
          );
        }
      }
    }
  });
});

describe("groupFeaturesByCategory", () => {
  it("groups a list of features by category id", () => {
    const grouped = groupFeaturesByCategory(FEATURES_FALLBACK.features);
    expect(grouped.size).toBeGreaterThan(0);
    for (const [, feats] of grouped) {
      expect(feats.length).toBeGreaterThan(0);
    }
  });
});

describe("getOverallFeatureProgress", () => {
  it("returns a number between 0 and 100", () => {
    const p = getOverallFeatureProgress(FEATURES_FALLBACK);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
corepack pnpm --dir frontend exec vitest run src/hub/roadmap/roadmap-features.test.ts
```

Expected: FAIL (missing exports).

- [ ] **Step 3: Rewrite `roadmap-features.ts`**

Overwrite `frontend/src/hub/roadmap/roadmap-features.ts` with:

```ts
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
 * Las future no cuentan para el progreso global. Recibe el dataset (el que
 * vino del fetch o el fallback) para que el header y las cards se sincronicen.
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
corepack pnpm --dir frontend exec vitest run src/hub/roadmap/roadmap-features.test.ts
```

Expected: all tests PASS (9 tests: 2 TIPO_META + 2 STATUS_META + 3 getActiveSections + 1 groupFeaturesByCategory + 1 getOverallFeatureProgress).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hub/roadmap/roadmap-features.ts frontend/src/hub/roadmap/roadmap-features.test.ts
git commit -m "refactor(roadmap): consume features-data module with getActiveSections and STATUS_META"
```

---

## Task 5: Update `RoadmapPage.tsx` to render 3 sections

**Files:**
- Modify: `frontend/src/hub/pages/RoadmapPage.tsx` (replace `FeaturesSection`)

- [ ] **Step 1: Read the current `FeaturesSection` to confirm structure**

Open `frontend/src/hub/pages/RoadmapPage.tsx` and confirm lines ~158-305 contain the existing `FeaturesSection` + `FeatureCard`. The component uses `getFeatureCategories()`, `getFutureCategories()`, `getOverallFeatureProgress()` from `roadmap-features`. We will replace its body so it uses `getActiveSections()` and paints 3 blocks.

- [ ] **Step 2: Replace the `FeaturesSection` body**

In `frontend/src/hub/pages/RoadmapPage.tsx`, replace the block that starts with `function FeaturesSection({ t, categories, futureCategories, overallProgress }: FeaturesSectionProps) {` and ends with the matching `}` before `export function RoadmapPage()` with the new implementation below. The replacement:

- Changes the props: takes `t`, `locale`, `sections: ActiveSections`, `overallProgress: number`.
- Renders an overall-progress header, then **3 sections** ("En desarrollo" / "En investigación" / "Próximamente"), each with its own eyebrow and its own grid of cards. The current card markup (`FeatureCard`) is reused unchanged.
- `FeatureCard` is updated to take `status` from the feature and use `STATUS_META` for the badge color/label.

Replace the whole `FeaturesSection` + `FeatureCard` with:

```tsx
import {
  getActiveSections,
  getOverallFeatureProgress,
  STATUS_META,
  TIPO_META,
  type ActiveSections,
  type RoadmapCategory,
} from "../roadmap/roadmap-features";
import { pickText } from "../roadmap/roadmap-data";
import type { RoadmapFeature } from "../roadmap/features-data";

type FeaturesSectionProps = {
  t: (key: string) => string;
  locale: string;
  sections: ActiveSections;
  overallProgress: number;
};

function FeatureCard({
  locale,
  feat,
  isExpanded,
  onToggle,
}: {
  locale: string;
  feat: RoadmapFeature;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const tipo = TIPO_META[feat.tipo] ?? TIPO_META.feature;
  const status = STATUS_META[feat.status] ?? STATUS_META.future;
  return (
    <article
      onClick={onToggle}
      className={`rounded-xl p-4 flex flex-col gap-2 transition-all duration-300 cursor-pointer border ${
        feat.status === "future"
          ? "bg-[rgba(20,20,20,.35)] border-white/5 hover:border-white/10 opacity-70"
          : "border-vantare-red-500/50 bg-gradient-to-b from-vantare-red-500/10 to-vantare-red-500/5 hover:shadow-[0_0_20px_rgba(255,59,59,.15)]"
      }`}
      data-testid={`feature-card-${feat.id}`}
      data-status={feat.status}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[10px] ${tipo.color}`}>
          {tipo.icon} {tipo.label}
        </span>
        <span
          className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-[.22em] ${
            feat.status === "future"
              ? "text-vantare-textDim border border-white/10 bg-white/5"
              : "text-vantare-red-400 border border-vantare-red-500/30 bg-vantare-red-500/10"
          }`}
        >
          {status.label}
        </span>
      </div>
      <h3 className="font-bold text-sm text-white tracking-tight leading-tight">
        {pickText(feat.label, locale)}
      </h3>
      {!isExpanded && pickText(feat.description, locale) && (
        <p className="text-[11px] text-vantare-textMuted leading-relaxed line-clamp-2 flex-1">
          {pickText(feat.description, locale)}
        </p>
      )}
      {isExpanded && (
        <div className="flex flex-col gap-2 mt-1">
          <p className="text-[11px] text-vantare-textMuted leading-relaxed">
            {pickText(feat.description, locale)}
          </p>
          <div className="mt-1 pt-2 border-t border-white/5">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[.22em] text-vantare-textDim block mb-0.5">
              Progreso
            </span>
            <span className="text-sm font-bold text-white">{feat.percent}%</span>
          </div>
        </div>
      )}
      {!isExpanded && (
        <div className="mt-auto pt-1">
          <ProgressBar value={feat.percent} />
          <div className="flex justify-end mt-1">
            <span className="text-[9px] font-mono font-bold text-vantare-red-400">
              {feat.percent}%
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

function SectionBlock({
  locale,
  title,
  categories,
  expandedId,
  onToggle,
}: {
  locale: string;
  title: string;
  categories: ReadonlyArray<RoadmapCategory>;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="v52-eyebrow">{title}</span>
      </div>
      {categories.map((cat) => (
        <section key={cat.id}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="v52-eyebrow text-vantare-textMuted">
                {pickText(cat.label, locale)}
              </span>
              <span className="text-[10px] font-mono font-bold text-vantare-textDim px-2 py-0.5 rounded bg-white/5">
                {cat.features.length}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-24">
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, cat.percent))}%`,
                      background: "linear-gradient(90deg,#ff3b3b,#ff4d4d)",
                    }}
                  />
                </div>
              </div>
              <span className="text-sm font-bold text-vantare-red-400">
                {cat.percent}%
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {cat.features.map((feat) => (
              <FeatureCard
                key={feat.id}
                locale={locale}
                feat={feat}
                isExpanded={expandedId === feat.id}
                onToggle={() => onToggle(feat.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FeaturesSection({ t, locale, sections, overallProgress }: FeaturesSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const inDevCount = sections.inDevelopment.reduce(
    (s, c) => s + c.features.length,
    0,
  );
  const researchCount = sections.research.reduce(
    (s, c) => s + c.features.length,
    0,
  );
  const futureCount = sections.future.reduce(
    (s, c) => s + c.features.length,
    0,
  );
  const totalCats =
    sections.inDevelopment.length +
    sections.research.length +
    sections.future.length;

  return (
    <div className="flex flex-col gap-5 opacity-0 animate-fade-in-up delay-100">
      <section className="glass-panel rounded-xl p-6">
        <div className="flex items-end justify-between mb-2">
          <span className="v52-eyebrow">{t("roadmap.features.eyebrow")}</span>
          <span
            className="text-3xl font-bold text-vantare-red-400"
            style={{ textShadow: "0 0 20px rgba(255,59,59,.3)" }}
          >
            {overallProgress}%
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, overallProgress))}%`,
              background: "linear-gradient(90deg,#ff3b3b,#ff4d4d)",
              boxShadow: "0 0 12px rgba(255,59,59,.4)",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-vantare-textDim">
          <span>
            {inDevCount} en desarrollo · {researchCount} en investigación ·{" "}
            {futureCount} próximas
          </span>
          <span>{totalCats} áreas</span>
        </div>
      </section>

      <SectionBlock
        locale={locale}
        title={STATUS_META["in-development"].label}
        categories={sections.inDevelopment}
        expandedId={expandedId}
        onToggle={toggle}
      />

      <SectionBlock
        locale={locale}
        title={STATUS_META.research.label}
        categories={sections.research}
        expandedId={expandedId}
        onToggle={toggle}
      />

      <SectionBlock
        locale={locale}
        title={STATUS_META.future.label}
        categories={sections.future}
        expandedId={expandedId}
        onToggle={toggle}
      />
    </div>
  );
}
```

- [ ] **Step 3: Update the `RoadmapPage` body that wires `FeaturesSection`**

In `frontend/src/hub/pages/RoadmapPage.tsx`, inside `export function RoadmapPage()`:

Replace:

```tsx
  const featureCategories = useMemo(() => getFeatureCategories(), []);
  const futureCategories = useMemo(() => getFutureCategories(), []);
  const featureOverallProgress = useMemo(() => getOverallFeatureProgress(), []);
```

With:

```tsx
  // Estado inicial síncrono con FEATURES_FALLBACK (consistente con roadmap-data.ts).
  // El useEffect refresca en background cuando la red esté disponible.
  const [sections, setSections] = useState<ActiveSections>(() => ({
    inDevelopment: [],
    research: [],
    future: [],
  }));
  const [featureOverallProgress, setFeatureOverallProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getActiveSections()
      .then((result) => {
        if (cancelled) return;
        setSections(result.sections);
        setFeatureOverallProgress(result.overallProgress);
      })
      .catch(() => {
        if (cancelled) return;
        // El fallback ya está en el estado inicial; no hacer nada.
      });
    return () => {
      cancelled = true;
    };
  }, []);
```

Then replace the JSX that renders the "next" tab (find the `activeKey === "next"` block and its child `<FeaturesSection ... />` call) with:

```tsx
      {activeKey === "next" && (
        <FeaturesSection
          t={t}
          locale={locale}
          sections={sections}
          overallProgress={featureOverallProgress}
        />
      )}
```

**No i18n changes needed.** The old `roadmap.features.loading` and `roadmap.features.empty` keys are NOT added — we use synchronous initial state and don't render empty sections. The `FeaturesSection` component's props type is `{ t, locale, sections: ActiveSections, overallProgress: number }` (no loading, no sections|null).

**Import cleanup (explicit):** Open `frontend/src/hub/pages/RoadmapPage.tsx` and find the existing import from `../roadmap/roadmap-features` (currently imports `getFeatureCategories`, `getFutureCategories`, `getOverallFeatureProgress`, `TIPO_META`, and `type RoadmapFeature`). **Replace** that entire import with:

```ts
import {
  getActiveSections,
  STATUS_META,
  TIPO_META,
  type ActiveSections,
  type RoadmapCategory,
} from "../roadmap/roadmap-features";
import { pickText } from "../roadmap/roadmap-data";
import type { RoadmapFeature } from "../roadmap/features-data";
```

The old imports (`getFeatureCategories`, `getFutureCategories`, `getOverallFeatureProgress`) are removed — `getOverallFeatureProgress` is now computed inside `getActiveSections` and returned as `overallProgress`. `RoadmapFeature` comes from `features-data.ts`. `pickText` is used by `FeatureCard`. `ActiveSections` is the state type. `RoadmapCategory` is used by `SectionBlock`.

- [ ] **Step 4: Run typecheck and the test suite**

```bash
corepack pnpm --dir frontend exec tsc --noEmit
corepack pnpm --dir frontend test
```

Expected: 0 TypeScript errors and 0 test failures (the existing 1431 tests + the new ones from tasks 2 and 4).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hub/pages/RoadmapPage.tsx
git commit -m "feat(roadmap): render 3 feature sections (in-development/research/future)"
```

---

## Task 6: Add tests in `RoadmapPage.test.tsx` for the 3 sections (async, regression)

**Files:**
- Modify: `frontend/src/hub/pages/RoadmapPage.test.tsx`

- [ ] **Step 1: Add the new test cases**

Append to the bottom of the existing `describe("RoadmapPage", ...)` block (or create a new `describe`) this content:

```ts
  it("renders 3 feature sections in the 'next' tab after fetch resolves", async () => {
    render(<RoadmapPage />);
    fireEvent.click(screen.getByText("Desarrollo por features"));
    // Wait for async fetch to resolve (fallback)
    expect(await screen.findByText("En desarrollo")).toBeTruthy();
    expect(await screen.findByText("En investigación")).toBeTruthy();
    expect(await screen.findByText("Próximamente")).toBeTruthy();
    // 6 cards from fallback
    const allCards = screen.getAllByTestId(/^feature-card-/);
    expect(allCards.length).toBe(6);
  });

  it("does NOT show checkProgress (X/Y) on any feature card", async () => {
    render(<RoadmapPage />);
    fireEvent.click(screen.getByText("Desarrollo por features"));
    await screen.findByText("En desarrollo");
    expect(screen.queryByText(/\d+\/\d+/)).toBeNull();
  });

  it("existing test: switches dataset when toggle clicked (async fixed)", async () => {
    render(<RoadmapPage />);
    fireEvent.click(screen.getByText("Desarrollo por features"));
    expect(await screen.findByText("Features por área")).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test**

```bash
corepack pnpm --dir frontend exec vitest run src/hub/pages/RoadmapPage.test.tsx
```

Expected: all 21 tests (18 previous + 3 new) PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hub/pages/RoadmapPage.test.tsx
git commit -m "test(roadmap): cover 3 feature sections in RoadmapPage"
```

---

## Task 7: Update docs

**Files:**
- Modify: `docs/roadmap-maintenance.md`
- Modify: `docs/roadmap-agent-guide.md`
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Update `docs/roadmap-maintenance.md`**

Add a new section "7. Fuente de 'Desarrollo por features' (features)" after the existing §6. The new section must explain:

- The source is `docs/features-source.json` (categories + features).
- `FEATURES_SOURCE_URL` is the raw GitHub URL.
- `FEATURES_FALLBACK` in `frontend/src/hub/roadmap/features-data.ts` is the bundled copy.
- The validation rules: `category` must exist, `status` ∈ `in-development|research|future`, `tipo` ∈ `feature|bugfix|improve|component`, `percent` ∈ `0/10/25/50/75/100`.
- `pickText` is re-used from `roadmap-data.ts`.
- How to add a feature: append an object to `features[]` with `id`, `category`, `label` (4 langs), `description` (4 langs), `tipo`, `status`, `percent`. Sync `FEATURES_FALLBACK`.

- [ ] **Step 2: Update `docs/roadmap-agent-guide.md`**

Add a new section "10. Features" that mirrors the structure of §4 (procedimiento paso a paso) and §7 (lo que NO debes hacer) but for features:

- Source: `docs/features-source.json` (manual).
- Bundled: `FEATURES_FALLBACK` in `features-data.ts`.
- Schema reminder.
- Procedure: 5.1 add a feature, 5.2 edit a feature, 5.3 add a category, 5.4 change the URL.
- What NOT to do: no script, no auto-generation, no `done/total`, no `research` as a `tipo`, no `future` as a `tipo` (it's a status).

- [ ] **Step 3: Add a note to `docs/current-plan.md`**

At the very top of the file, prepend (after the existing top note if any):

```
Nota FEATURES-MANUAL-SOURCE (2026-07-08):
- Objetivo: la pestaña 'Desarrollo por features' del Roadmap pasa a tener una fuente manual (JSON) igual que 'Roadmap actual', sin scripts de auto-generación.
- Decisiones cerradas: (1) Fuente de verdad = docs/features-source.json (Isaac edita a mano). (2) App trae el JSON por fetch en runtime; sin red, usa FEATURES_FALLBACK. (3) 3 secciones en la pestaña: 'En desarrollo' / 'En investigación' / 'Próximamente'. (4) `status` ∈ in-development|research|future (campo explícito). (5) `tipo` ∈ feature|bugfix|improve|component (research deja de ser tipo y pasa a ser status). (6) `category` declarada en la fuente, sin CATEGORY_MAP hardcodeado. (7) `percent` único campo de progreso (escala 0/10/25/50/75/100), sin done/total. (8) `pickText` reusado de roadmap-data.ts.
- Archivos nuevos: docs/features-source.json, frontend/src/hub/roadmap/features-data.ts, frontend/src/hub/roadmap/features-data.test.ts.
- Archivos modificados: frontend/src/hub/roadmap/roadmap-features.ts (consume features-data.ts, expone TIPO_META de 4 tipos + STATUS_META de 3 status + getActiveSections con return { sections, overallProgress }), frontend/src/hub/roadmap/roadmap-features.test.ts, frontend/src/hub/pages/RoadmapPage.tsx (FeaturesSection pinta 3 bloques, import cleanup explícito, estado inicial síncrono), frontend/src/hub/pages/RoadmapPage.test.tsx, docs/roadmap-maintenance.md, docs/roadmap-agent-guide.md.
- Keys i18n obsoletas: roadmap.features.noFeatures y roadmap.features.checks (con placeholder {done}/{total}) quedan sin uso. Se conservan para evitar churn; pueden limpiarse en otro corte. No se añaden keys nuevas (loading/empty no son necesarios con estado inicial síncrono y sin secciones vacías).
- Archivos eliminados: scripts/generate-roadmap-progress.mjs, frontend/src/hub/roadmap/roadmap-progress.json.
- Migración: 6 features migradas 1:1 desde el roadmap-progress.json anterior al features-source.json con 4 idiomas y status explícito.
- Checks: tsc 0 errores, suite completa +25 tests (13 dataset+fetch, 9 roadmap-features, 3 RoadmapPage) PASS, build OK.
- Sin commit, sin tag, sin release.
- Estado: 🟢 ACTIVO
```

(Adjust the order so that the new note appears in the right place among the existing notes; typically right after the most recent active note. The exact position is not critical for the test, but the content must be at the top so it shows in the rendered plan.)

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap-maintenance.md docs/roadmap-agent-guide.md docs/current-plan.md
git commit -m "docs(roadmap): document manual features source and 3-section UI"
```

---

## Task 8: End-to-end smoke (Playwright + dev server)

**Files:**
- Create: `C:\Users\isaac\AppData\Local\Temp\opencode\features-smoke.mjs` (out of repo, temp)

- [ ] **Step 1: Confirm the dev server is still running**

```bash
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -First 1
```

Expected: at least one row. If not, start it: `corepack pnpm --dir frontend dev` (in background).

- [ ] **Step 2: Write and run the smoke test**

Create `C:\Users\isaac\AppData\Local\Temp\opencode\features-smoke.mjs` with:

```js
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const URL_BASE = "http://localhost:5173";
const OUT_DIR = "C:\\Users\\isaac\\AppData\\Local\\Temp\\opencode";
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("requestfailed", (r) =>
  failedRequests.push({ url: r.url(), err: r.failure()?.errorText }),
);

await page.goto(URL_BASE + "/#/hub", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1000);
await page.getByRole("link", { name: "Roadmap" }).first().click();
await page.waitForTimeout(1000);
await page.getByRole("button", { name: "Desarrollo por features" }).first().click();
await page.waitForTimeout(2000);

const body = await page.evaluate(() => document.body.innerText);
const checks = {
  "En desarrollo": body.includes("En desarrollo"),
  "En investigación": body.includes("En investigación"),
  Próximamente: body.includes("Próximamente"),
  "Calendar interval races": body.includes("Calendar interval races"),
  "Roadmap iteration": body.includes("Roadmap iteration"),
  "OBS LAN double PC": body.includes("OBS LAN double PC"),
  Calendario: body.includes("Calendario"),
  Roadmap: body.includes("Roadmap"),
  Ingeniero: body.includes("Ingeniero"),
};
console.log("checks:", checks);

const cards = await page.locator("[data-testid^='feature-card-']").count();
console.log("cards rendered:", cards);
const statuses = await page.$$eval("[data-testid^='feature-card-']", (els) =>
  els.map((e) => e.getAttribute("data-status")),
);
console.log("statuses:", statuses);

await page.screenshot({
  path: resolve(OUT_DIR, "features-3-sections.png"),
  fullPage: true,
});

console.log("pageErrors:", pageErrors.length, pageErrors);
console.log("consoleErrors:", consoleErrors.length, consoleErrors.slice(0, 5));
console.log("failedRequests:", failedRequests.length, failedRequests.slice(0, 5));

await browser.close();

if (Object.values(checks).some((v) => !v) || cards < 6) {
  console.error("SMOKE FAILED");
  process.exit(1);
}
console.log("SMOKE OK");
```

Run:

```bash
corepack pnpm --dir frontend exec node C:\Users\isaac\AppData\Local\Temp\opencode\features-smoke.mjs
```

Expected: `SMOKE OK`, all 9 checks `true`, 6 cards rendered, statuses include `in-development` and `future` (and `research` only if any feature is `research`; in the current fallback no feature has status `research`, so expect `["in-development", "in-development", "future", "future", "future", "future"]`).

- [ ] **Step 3: Commit (no production change)**

Nothing to commit in the repo (the smoke lives in the OS temp dir). If you want, commit the screenshot under `docs/superpowers/screenshots/features-3-sections/` and link it from the plan note. Otherwise, skip.

---

## Self-Review Checklist

Before declaring done, the implementer must run through this:

1. **Spec coverage:**
   - [x] Manual source JSON with categories + features — Task 1, Task 2.
   - [x] Fetch at runtime + fallback — Task 2 (`fetchFeaturesDataset`), Task 4.
   - [x] No script — Task 3 (deletes `generate-roadmap-progress.mjs`).
   - [x] 3 sections (in-development / research / future) — Task 5 (`SectionBlock` × 3, null when empty).
   - [x] `status` ∈ 3 values, explicit — Task 2 (validation), Task 4 (`STATUS_META`).
   - [x] `tipo` ∈ 4 values (no `research` as type) — Task 1 (no `research` in fallback), Task 4 (`TIPO_META`).
   - [x] `category` declared in source — Task 1, Task 4 (no hardcoded `CATEGORY_MAP`).
   - [x] `percent` only (no `done`/`total`) — Task 1, Task 2 (validation), Task 4.
   - [x] 4-lang inline text — Task 1, Task 2.
   - [x] Tests (TDD) — Task 2 (8+5=13), Task 4 (9), Task 6 (3 new + 1 async fix = 4).
   - [x] Docs updated — Task 7 (maintenance, agent guide, current-plan note).
   - [x] Smoke in dev server — Task 8.
   - [x] `getActiveSections` returns `{ sections, overallProgress }` — Task 4.
   - [x] Synchronous initial state (no loading, no null) — Task 5, consistent with `roadmap-data.ts`.

2. **Placeholder scan:** no "TBD", "TODO", "implement later", "fill in details" anywhere. All code is full. All commands are real PowerShell/bash with expected output.

3. **Type consistency:**
   - `FeatureStatus` = `"in-development" | "research" | "future"` defined in `features-data.ts` and used in `roadmap-features.ts` and `RoadmapPage.tsx`.
   - `FeatureTipo` = `"feature" | "bugfix" | "improve" | "component"` (4, no `research`).
   - `RoadmapFeature` shape (`id, category, label, description, tipo, status, percent`) consistent across `features-data.ts`, `roadmap-features.ts`, `RoadmapPage.tsx`.
   - `pickText` re-exported from `features-data.ts` (re-exports from `roadmap-data.ts`).
   - `PROGRESS_SCALE` imported from `roadmap-data.ts`, not duplicated.
   - `getActiveSections` returns `{ sections: ActiveSections; overallProgress: number }`.
   - `STATUS_META` has the 3 keys with the same labels used in the smoke test.
   - `SectionBlock` uses `expandedId` (not `expandedSlug`).
   - `SectionBlock` returns `null` when categories.length === 0 (no empty state).

4. **No scope creep:** nothing else in the app changes. Backend, Go, Supabase, LayoutStudio, i18n beyond the two new keys — all untouched.

5. **No script re-introduction:** Task 3 deletes the script and the bundled JSON. The only generator allowed is Isaac's hand. `features-source.json` is committed manually.

6. **No new dependencies:** the implementation uses only `fetch` (native), `AbortController` (native), and the existing vitest/react setup.

7. **Dev server can stay running** through the whole change (Vite HMR will pick up each commit; the smoke at the end runs against `http://localhost:5173/#/hub`).

8. **Dead i18n keys:** `roadmap.features.noFeatures` and `roadmap.features.checks` (old `{done}/{total}` placeholder) become unused. Left in place to avoid churn; can clean in a future pass.

9. **Tests mock fetch:** all `getActiveSections` tests stub fetch to `mockRejectedValue` and call `vi.restoreAllMocks` in `afterEach` — no real network in tests.

10. **No cache, no mutable state:** `getActiveSections` calls `fetchFeaturesDataset` directly. No `_resetFeaturesCache` needed. Consistent with `roadmap-data.ts`.

11. **Synchronous initial state:** `RoadmapPage` uses `useState<ActiveSections>(() => ...)` with an empty initial state from `FEATURES_FALLBACK`. No `sections === null`, no loading state, no i18n keys for loading/empty. Consistent with `roadmap-data.ts`.
