# ROADMAP-I18N — Internacionalizar datos del roadmap

Fecha: 2026-07-06
Parte de: iteración Roadmap (D/E/F + porcentajes)
Depende de: ninguna (base para ROADMAP-DUAL / CHANGELOG / FEEDBACK)
Modelo sugerido: Minimax M3 o Kimi K2.7
Reviewer: GLM

## Objetivo

Los textos editoriales del roadmap hoy están hardcodeados en español dentro de
`roadmap-data.ts` (títulos de fase, summaries, highlights, áreas, hitos, labels de
tipo de feedback, estados). Esta tarea los mueve a keys `roadmap.*` en los 4
diccionarios i18n (es/en/pt/it) y hace que `RoadmapPage.tsx` resuelva vía `useI18n().t()`.

Esto habilita la coherencia multiidioma exigida por `I18N-03d` para la pantalla de
Roadmap, incluyendo los datos (decisión de producto: el roadmap es contenido
editorial, no telemetría, así que se traduce).

## Lee obligatoriamente

- `AGENTS.md`
- `docs/current-plan.md` (sección I18N-03 / I18N-ROADMAP)
- `docs/roadmap-maintenance.md` (recién creado)
- `frontend/src/hub/pages/RoadmapPage.tsx`
- `frontend/src/hub/roadmap/roadmap-data.ts`
- `frontend/src/i18n/I18nProvider.tsx` (contrato `useI18n().t`)
- `frontend/src/i18n/locales/{es,en,pt,it}.ts`
- `frontend/src/i18n/i18n.test.ts` (test de paridad de keys — exigirá las 4 lenguas)
- `frontend/src/hub/pages/RoadmapPage.test.tsx` (actualizar tras el cambio)

## Alcance

1. `roadmap-data.ts` deja de contener strings visibles. Sus tipos pasan a guardar keys:
   - `RoadmapPhase`: `phaseLabel` (key), `title` → `titleKey`, `summary` → `summaryKey`,
     `highlights: string[]` → `highlightsKeys: string[]`, `targetLabel` sigue siendo
     dato corto (se puede traducir o dejar como versión; usar key `roadmap.phase.<id>.target`).
   - `RoadmapArea`: `title` → `titleKey`.
   - `RoadmapMilestone`: `label` → `labelKey`, `title` → `titleKey`, `body` → `bodyKey`,
     `type` se mantiene como enum (`release`/`feature`/`fix`/`plan`) y su label se resuelve vía `t(\`roadmap.milestone.type.${type}\`)`.
   - `STATUS_LABELS` se elimina del componente y se resuelve con
     `t(\`roadmap.status.${status}\`)` (done/in-progress/planned/future).
   - `MILESTONE_TYPE_COLORS` se queda (es color, no copy).
2. Añadir todas las keys nuevas a `es.ts`, `en.ts`, `pt.ts`, `it.ts` bajo namespace
   `roadmap.*` con PARIDAD (el test `locale key parity` falla si falta alguna).
3. `RoadmapPage.tsx`:
   - Usar `const { t } = useI18n()` (el provider global ya existe por I18N-02).
   - Resolver cada string con `t(key)`.
   - `STATUS_LABELS` y los labels inline ("Fase actual", "Roadmap beta", "Progreso global",
     "Últimos hitos", "Estado actual", "El roadmap vive con feedback", etc.) pasan a keys
     `roadmap.*` también (esto es la parte I18N-03d de la pantalla).
4. Mantener la estructura visual actual; solo cambia de dónde sale el texto.

## No tocar

- Backend Go, Supabase/Auth, runtime OBS, LayoutStudio, position/x/y/w/h.
- Dependencias.
- Lógica de `getOverallProgress` / `getCurrentPhase` (solo números).
- El gating de feedback (`roadmap.feedback`) — lo implementa ROADMAP-FEEDBACK.

## Requisitos

- TDD: los tests de `RoadmapPage.test.tsx` deben seguir pasando en ES; añadir al menos
  un test que monte con `locale="en"` (vía `I18nProvider` o mock) y verifique que un
  título de fase aparece en inglés.
- Paridad de keys obligatoria en los 4 diccionarios.
- No big-bang: solo la pantalla Roadmap.

## Checks esperados

- `pnpm --dir frontend test` (RoadmapPage + i18n parity) → PASS
- `pnpm --dir frontend exec tsc --noEmit` → OK
- `pnpm --dir frontend lint` → 0 errores
- `pnpm --dir frontend build` → OK

## Reporte final en español

- archivos modificados/creados;
- checks ejecutados;
- checks no ejecutados y motivo;
- riesgos;
- verificación manual (cambiar idioma en Ajustes y recargar Roadmap).
