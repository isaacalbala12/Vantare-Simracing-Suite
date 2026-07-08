# ROADMAP-CHANGELOG — Changelog real en la pantalla

Fecha: 2026-07-06
Parte de: iteración Roadmap (D/E/F + porcentajes)
Depende de: ROADMAP-I18N
Modelo sugerido: Kimi K2.7
Reviewer: GLM

## Objetivo

Hoy los botones "Ver changelog" / "Changelog completo →" están `disabled` y no hacen
nada. Esta tarea:

1. Añade un array `ROADMAP_CHANGELOG` en `roadmap-data.ts` con las últimas 5 entradas
   de `docs/changelog.md`, sincronizado a mano.
2. Renderiza una sección "Cambios recientes" en `RoadmapPage`.
3. Convierte el botón "Changelog completo →" en un enlace funcional a
   `ROADMAP_CHANGELOG_URL`.
4. Documenta el procedimiento de changelog (ya en `docs/roadmap-maintenance.md` §5).

## Lee obligatoriamente

- `AGENTS.md`, `docs/current-plan.md`, `docs/roadmap-maintenance.md` §5
- `frontend/src/hub/roadmap/roadmap-data.ts` (post ROADMAP-I18N)
- `frontend/src/hub/pages/RoadmapPage.tsx`
- `docs/changelog.md` (fuente de las últimas entradas)
- `frontend/src/i18n/locales/{es,en,pt,it}.ts`
- `frontend/src/hub/pages/RoadmapPage.test.tsx`

## Alcance

### Datos (`roadmap-data.ts`)

- Tipo `RoadmapChangelogEntry = { version: string; date: string; titleKey: string; bodyKey: string }`.
- `ROADMAP_CHANGELOG: ReadonlyArray<RoadmapChangelogEntry>` con las últimas 5 entradas
  de `docs/changelog.md` (version, date, y keys `roadmap.changelog.<id>.title` /
  `.body`).
- Constante `ROADMAP_CHANGELOG_URL: string` (placeholder claramente marcado, p.ej.
  - Constante `ROADMAP_CHANGELOG_URL: string` (URL pública del changelog,
    `"https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/main/docs/changelog.md"`).
### UI (`RoadmapPage.tsx`)

- Nueva sección "Cambios recientes" (eyebrow `roadmap.changelog.eyebrow`) que lista
  `ROADMAP_CHANGELOG` (versión + fecha + título + body vía `t()`).
- El botón "Changelog completo →" deja de estar `disabled`; al click abre
  `ROADMAP_CHANGELOG_URL` con `window.open(url, "_blank")` (o el helper de OpenURL de
  Wails si existe en el proyecto; el worker lo busca).
- Añadir keys `roadmap.changelog.*` a los 4 diccionarios con paridad.

### Docs

- El procedimiento ya vive en `docs/roadmap-maintenance.md` §5. No duplicar.

## No tocar

- Backend Go, Supabase/Auth, runtime OBS, LayoutStudio, position/x/y/w/h, dependencias.
- Lógica de feedback (ROADMAP-FEEDBACK).
- Toggle de roadmaps (ROADMAP-DUAL) — pero si ambos corren, la sección de changelog es
  compartida entre datasets; el worker lo coordina si es necesario.

## Requisitos

- TDD: el botón ya NO debe tener atributo `disabled`; test de que renderiza las
  entradas de `ROADMAP_CHANGELOG`; test de que click abre la URL (mock de `window.open`).
- Paridad de keys en los 4 diccionarios para `roadmap.changelog.*`.
- No leer `docs/changelog.md` en runtime (snapshot manual en el array).

## Checks esperados

- `pnpm --dir frontend test` → PASS
- `pnpm --dir frontend exec tsc --noEmit` → OK
- `pnpm --dir frontend lint` → 0 errores
- `pnpm --dir frontend build` → OK

## Reporte final en español

- archivos modificados/creados;
- checks ejecutados;
- checks no ejecutados y motivo;
- riesgos (desincronización array vs docs/changelog.md);
- verificación manual (click en "Changelog completo" abre la URL).
