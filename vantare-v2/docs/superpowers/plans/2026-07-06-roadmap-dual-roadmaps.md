# ROADMAP-DUAL — Dos roadmaps con toggle y porcentajes reales

Fecha: 2026-07-06
Parte de: iteración Roadmap (D/E/F + porcentajes)
Depende de: ROADMAP-I18N (los datos ya deben usar keys `roadmap.*`)
Modelo sugerido: Kimi K2.7
Reviewer: GLM + Isaac

## Objetivo

Hoy la pantalla Roadmap tiene un solo conjunto de datos con porcentajes placeholder
inventados (100/35/12/5) que no reflejan trabajo real. Esta tarea:

1. Introduce DOS roadmaps con un toggle (tabs/select) en la parte superior:
   - `ROADMAP_CURRENT`: línea activa v0.1.x, datos manuales editados por el producto.
   - `ROADMAP_NEXT`: siguiente major, snapshot de las filas `R0x` de
     `docs/release-roadmap-execution-index.md`.
2. Aplica la escala de porcentajes obligatoria `0,10,25,50,75,100` (ver
   `docs/roadmap-maintenance.md` sección 3-4).
3. Crea/referencia el documento de procedimiento de porcentajes.

## Lee obligatoriamente

- `AGENTS.md`, `docs/current-plan.md`, `docs/roadmap-maintenance.md`
- `frontend/src/hub/roadmap/roadmap-data.ts` (estado post ROADMAP-I18N)
- `frontend/src/hub/pages/RoadmapPage.tsx`
- `docs/release-roadmap-execution-index.md` (filas R0x = features de la major)
- `frontend/src/i18n/locales/{es,en,pt,it}.ts` (añadir keys de toggle/labels)
- `frontend/src/hub/pages/RoadmapPage.test.tsx`

## Alcance

### Datos (`roadmap-data.ts`)

- Renombrar el dataset actual a `ROADMAP_CURRENT` (mantener estructura de tipos de
  ROADMAP-I18N). Aplicar base de porcentajes propuesta (el producto la refina luego):
  - Fases: Beta pública = 100, Pulido beta v0.1.x = 50, Ingeniero Vantare = 25,
    Ecosistema = 10.
  - Áreas: Overlays Studio = 75, Launcher LMU = 75, Calendario local = 25,
    Ingeniero = 25, Telemetría = 10, UI v5.2 = 75.
  - `%` global se calcula con `getOverallProgress` (media de áreas), redondeado a la
    escala más cercana.
- Crear `ROADMAP_NEXT`: snapshot de las filas `R0x` del release index como fases, con
  `status` mapeado a `%` según `docs/roadmap-maintenance.md` sección 4
  (done=100, in-progress=75, next=50, ready=25, planned=10, blocked/later=0).
  Usar los títulos/resúmenes reales de esas filas como `titleKey`/`summaryKey`
  (añadir las keys a los 4 diccionarios, o bien referenciar `roadmap.next.<id>.*`).
  Incluir también un set de áreas derivado de las mismas filas si aplica.
- Mantener `getOverallProgress` y `getCurrentPhase`; añadir helper
  `getRoadmapDataset(key: "current" | "next")` que devuelva `{ phases, areas, milestones }`.
- `ROADMAP_MILESTONES` se mantiene para `current` (para `next` puede omitirse hitos o
  reusarse; decisión del worker, documentada).

### UI (`RoadmapPage.tsx`)

- `useState<"current" | "next">` para el dataset activo (default `"current"`).
- Toggle visual (tabs o select) con labels i18n `roadmap.tab.current` / `roadmap.tab.next`,
  cerca del hero. El track de fases, la grilla de fases, las áreas y el progreso global
  usan el dataset activo (`getRoadmapDataset(active)`).
- El `%` global y las barras usan los datos del dataset activo.
- No romper el render de "Fase actual" ni el feedback (lo implementa ROADMAP-FEEDBACK).

### Docs

- `docs/roadmap-maintenance.md` ya existe (lo creó ROADMAP-I18N). Añadir una línea en
  `docs/current-plan.md` referenciando que el procedimiento de % vive ahí.
- No editar `release-roadmap-execution-index.md` (es fuente de verdad, solo se consume).

## No tocar

- Backend Go, Supabase/Auth, runtime OBS, LayoutStudio, position/x/y/w/h, dependencias.
- Lógica de feedback (ROADMAP-FEEDBACK).
- Changelog (ROADMAP-CHANGELOG).

## Requisitos

- TDD: tests para ambos datasets (render de fases/áreas de `current` y de `next`;
  toggle cambia el dataset renderizado).
- Escala de % respetada: añadir un test de `getRoadmapDataset` que verifique que todos
  los `%` pertenecen a `{0,10,25,50,75,100}`.
- Sin envío a backend; el snapshot de `next` es estático en build-time.

## Checks esperados

- `pnpm --dir frontend test` → PASS
- `pnpm --dir frontend exec tsc --noEmit` → OK
- `pnpm --dir frontend lint` → 0 errores
- `pnpm --dir frontend build` → OK

## Reporte final en español

- archivos modificados/creados;
- checks ejecutados;
- checks no ejecutados y motivo;
- riesgos (p.ej. desincronización de ROADMAP_NEXT vs release index);
- verificación manual (toggle entre roadmaps, recarga).
