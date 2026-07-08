# ROADMAP-FEATURES — Features del roadmap desde planes de superpowers

Fecha: 2026-07-07
Parte de: iteración Roadmap
Depende de: ROADMAP-I18N (ya implementado)
Modelo: worker
Reviewer: Isaac

## Objetivo

Convertir los planes de `docs/superpowers/plans/` en features visibles del roadmap, cada una con su porcentaje real de completado. El porcentaje se calcula híbrido (C):

1. **Automático**: script que cuenta `- [x]`/`- [ ]` en cada plan → genera `roadmap-progress.json`
2. **Manual override**: `roadmap-status.json` como fuente de verdad para plans sin checks o donde el check count no refleja la realidad
3. **Regla de negocio**: si un plan tiene >50% checks hechos, usa el % automático; si no, usa el status manual

## Archivos a crear

| Archivo | Propósito |
|---------|-----------|
| `scripts/generate-roadmap-progress.mjs` | Script Node que escanea plans y genera JSON |
| `frontend/src/hub/roadmap/roadmap-progress.json` | Output del script: `{ [slug]: { done, total, percent } }` |
| `frontend/src/hub/roadmap/roadmap-status.json` | Override manual: `{ [slug]: { status, category, label } }` |
| `frontend/src/hub/roadmap/roadmap-features.ts` | Módulo que resuelve el % final por feature (híbrido) |

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `frontend/src/hub/roadmap/roadmap-data.ts` | ROADMAP_NEXT se reemplaza por features derivadas de `roadmap-features.ts` |
| `frontend/src/hub/pages/RoadmapPage.tsx` | Sección "Desarrollo por features" muestra features agrupadas por categoría |
| `frontend/src/hub/pages/RoadmapPage.test.tsx` | Tests del nuevo render |
| `frontend/src/i18n/locales/{es,en,pt,it}.ts` | Keys de categorías y labels |
| `AGENTS.md` | Regla: workers DEBEN marcar `- [x]` al completar cada step |
| `docs/superpowers/skills/vantare-core/SKILL.md` | Misma regla en la skill |

## Modelo de datos

### `roadmap-status.json` (override manual)

```json
{
  "overlays-studio-phase-a2-navigation-previews": {
    "status": "done",
    "category": "overlays-studio",
    "label": "A2: Navigation & Previews"
  },
  "launcher-extensive": {
    "status": "in-progress",
    "category": "launcher",
    "label": "Launcher Extendido"
  },
  "sql-01-migration": {
    "status": "blocked",
    "category": "auth-licensing",
    "label": "SQL-01: Migración Supabase"
  }
}
```

### `roadmap-progress.json` (generado por script)

```json
{
  "overlays-studio-phase-a2-navigation-previews": { "done": 44, "total": 44, "percent": 100 },
  "launcher-extensive": { "done": 0, "total": 56, "percent": 0 }
}
```

### `roadmap-features.ts` (resolución híbrida)

```typescript
// Por cada feature:
// 1. Si progress.percent > 50 → usar progress.percent (checks son la verdad)
// 2. Si no → mapear status manual a %:
//    done → 100, in-progress → 50, blocked → 0, planned → 0
// 3. Output: { slug, label, category, status, percent }
```

## Categorías de features

| Categoría | Label ES | Features |
|-----------|----------|----------|
| `overlays-studio` | Overlays Studio | A2, B, Live Controls, Reconnect, Schema v2, Separation, etc. |
| `widget-studio` | Widget Studio | Crystal, Editable Slots, Visual Rework, Explicit Save, Preview Parity, etc. |
| `widgets` | Widgets (Relative/Standings/Pedals/Delta) | Relative catalog, Standings S1-S6, Pedals, Delta, Resize, etc. |
| `hub` | Hub UI | HUB-05-B, Mock Live Demo UX |
| `launcher` | Launcher | Launcher Extensive |
| `auth-licensing` | Auth & Licencias | Release 02 planes, AUTH-04, SQL-01, CHECKOUT-01, etc. |
| `calendar` | Calendario | (pendiente: CALENDAR-01/05/06/07/08/10/REFACTOR no tienen plan propio) |
| `engineer` | Ingeniero | Ingeniero Integration |
| `releases` | Releases | Autoupdater, Discord notification |
| `roadmap` | Roadmap | Changelog, Dual, Feedback, I18N |

## Regla para workers (AGENTS.md + vantare-core)

Añadir al final de "Flujo esperado" en AGENTS.md:

```
8. Al completar cada Step de un plan en `docs/superpowers/plans/`, marca `- [x]` en
   vez de `- [ ]`. Esto alimenta automáticamente el porcentaje de features del roadmap.
   Si un step no aplica (p.ej. "Read docs"), márcalo también como `[x]` con un comentario
   corto `<!-- skipped: already read -->`.
```

## Implementación paso a paso

### Step 1: Crear `roadmap-status.json`
- [x] Crear archivo con inventario de features
- [x] Clasificar status de cada feature
- [x] Añadir categorías y labels

### Step 2: Crear `scripts/generate-roadmap-progress.mjs`
- [x] Script que lee plans/*.md
- [x] Cuenta checks `- [x]` y `- [ ]`
- [x] Extrae slug del nombre
- [x] Escribe roadmap-progress.json

### Step 3: Crear `roadmap-features.ts`
- [x] Módulo puro con tipos
- [x] Resolución de progreso
- [x] Agrupación por categoría
- [x] Exporta getFeatureCategories y getOverallFeatureProgress

### Step 4: Actualizar `roadmap-data.ts`
- [x] Eliminar ROADMAP_NEXT (fases R01-R15)
- [x] Mantener ROADMAP_CURRENT intacto
- [x] Exportar tipos necesarios

### Step 5: Actualizar `RoadmapPage.tsx`
- [x] Sección "Desarrollo por features" con grid de cards
- [x] Categorías como headers con progress bar
- [x] Click-to-expand en cards
- [x] % global derivado del promedio

### Step 6: Tests + i18n
- [x] Tests de roadmap-features.ts
- [x] Tests de RoadmapPage
- [x] Keys i18n para categorías en 4 idiomas

### Step 7: Actualizar AGENTS.md + skill
- [x] Regla de checkoff obligatorio en AGENTS.md
- [x] Skill roadmap-management creada
- [x] Script ejecutado por primera vez

## Checks esperados

- `pnpm --dir frontend test` → PASS
- `pnpm --dir frontend exec tsc --noEmit` → OK
- `pnpm --dir frontend lint` → 0 errores
- `pnpm --dir frontend build` → OK
- `node scripts/generate-roadmap-progress.mjs` → genera JSON sin errores

## Verificación manual

1. Abrir Roadmap → pestaña "Desarrollo por features"
2. Ver categorías agrupadas con % real
3. Verificar que features "done" muestran 100%
4. Verificar que features "blocked" muestran 0%
5. Cambiar idioma → labels traducidos
