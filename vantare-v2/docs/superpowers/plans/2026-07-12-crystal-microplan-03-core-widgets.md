# Crystal Microplan 03 Core Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, test-driven-development and browser-testing-with-devtools.

**Goal:** Sustituir Crystal de Delta, Standings, Relative y Pedals por cinco composiciones canónicas sin romper Original ni datos actuales.

**Architecture:** Se amplían ViewModels solo con datos realmente disponibles; cada renderer permanece puro. Delta tiene dos `templateId`; los otros tres tipos tienen uno.

**Tech Stack:** React, TypeScript, Vitest, Playwright.

---

## Matriz cerrada

| Tipo | templateId | diseño | tamaño canónico |
|---|---|---|---|
| relative | `relative-vertical` | `relative-crystal-vertical` | medir del crop 01 y fijar en manifest |
| standings | `standings-vertical` | `standings-crystal-vertical` | 360px ancho, alto por filas |
| pedals | `pedals` | `pedals-crystal` | crop V3 vertical |
| delta | `delta-bar` | `delta-crystal-bar` | crop 06 |
| delta | `delta-simple` | `delta-crystal-simple` | 420px ancho, crop 15 |

### Task 1: Delta ViewModel y parser v2

**Files:** Modify `delta-view-model.ts/test`, `DeltaCrystal.tsx/test`, Crystal manifest/tests, official designs/tests.

- [ ] RED: `templateId` solo acepta `delta-bar|delta-simple`; v1 sin template migra a `delta-bar`; desconocido vuelve a default con diagnóstico.
- [ ] ViewModel conserva delta/last/best y añade lap/predicted/split solo como opcionales leídos de snapshot/scoring; no inventar valores live.
- [ ] Implementar ambos DOM según 06/15, un componente por template dentro de la carpeta delta.
- [ ] Unit + two HTML crops Studio PASS; commit `feat(crystal): replace delta bar and simple designs`.

### Task 2: Relative

**Files:** Modify `relative-view-model.ts/test`, `RelativeCrystal.tsx/test`, settings, official design.

- [ ] RED para grid `26/4/28/1fr/58/62`, orden/filas, player highlight, tyres, pit y footer.
- [ ] Reusar `scoring-readers`; no cambiar selección/columnas funcionales existentes.
- [ ] Estados non-ready mantienen superficie/header/footer sin datos falsos.
- [ ] Studio/Desktop/OBS crop PASS; commit `feat(crystal): replace relative renderer`.

### Task 3: Standings

**Files:** Modify `standings-view-model.ts/test`, `StandingsCrystal.tsx/test`, settings, official design.

- [ ] RED para grid `20/20/26/1fr/76/58`, header de tabla, class bars, tyre badge, pit tag, player row y footer.
- [ ] Conservar filtros/columnas; default produce HTML exacto, personalización avanzada no altera tipo.
- [ ] Ready + 5 estados + three surfaces PASS; commit `feat(crystal): replace standings renderer`.

### Task 4: Pedals V3 únicamente

**Files:** Modify `pedals-view-model.ts/test`, `PedalsCrystal.tsx/test`, settings and design.

- [ ] RED: ViewModel contiene solo throttle/brake/clutch normalizados 0..1 y status; no gear/RPM/speed.
- [ ] Reproducir barras verticales altas de columna V3; no incluir cápsula V1 ni rectángulo V2.
- [ ] Mantener aspect lock/default size del crop; resize escala mediante host existente.
- [ ] Ready/non-ready/surfaces PASS; commit `feat(crystal): replace pedals vertical renderer`.

### Task 5: Migración de los cuatro actuales

**Files:** Modify Crystal manifest migrations/tests, `visual-config-migration.ts/test`, Go/TS profile goldens if visual settings are embedded.

- [ ] RED v1→v2: Delta→bar, Pedals→pedals, Relative→vertical, Standings→vertical; conservar overrides reconocidos y descartar solo claves obsoletas documentadas.
- [ ] Migración idempotente y sin cambiar `systemId`, widget ID/layout/content/behavior.
- [ ] Fixtures legacy abren, guardan y vuelven a abrir sin segundo dirty.
- [ ] Commit `feat(crystal): migrate core widgets to manifest v2`.

## Gate

5/5 crops canónicos aprobados; Original intacto; visual suite global sin actualizar baselines ajenos; build/checker PASS.
