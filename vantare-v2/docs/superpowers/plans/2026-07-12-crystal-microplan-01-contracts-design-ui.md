# Crystal Microplan 01 Contracts and Design UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and test-driven-development. Implement task-by-task; stop at every gate.

**Goal:** Establecer 18 tipos, memoria visual por sistema y la UI sistema→diseño sin cambiar aún renderizadores Crystal.

**Architecture:** Go y TypeScript comparten el mismo documento V3. `WidgetType` identifica función; `systemId` identifica Original/Crystal; `WidgetDesignV1.id` identifica catálogo y `visual.templateId` la composición del renderer.

**Tech Stack:** Go, TypeScript, React, Vitest.

---

## Contrato cerrado

Tipos exactos: `delta`, `standings`, `relative`, `pedals`, `broadcast-tower`, `fuel-strategy`, `pedals-telemetry`, `pedals-telemetry-compact`, `racing-flags`, `delta-trace`, `race-schedule`, `head-to-head`, `delta-advanced`, `input-telemetry`, `multiclass-relative`, `track-weather`, `car-damage-visual`, `car-damage-numbers`.

`WidgetVisualV3.systemMemories` guarda únicamente visuales anteriores. `ProfileDocumentV3.defaultVisualSystemId` usa `vantare-original` al faltar. Un diseño es compatible solo si coinciden `widgetType` y `systemId` y el manifest resuelve ese tipo.

### Task 1: Vocabulario compartido Go/TypeScript

**Files:** Modify `pkg/config/profile_v3.go`, `pkg/config/profile_v3_validate.go`, `pkg/config/profile_v3_validate_test.go`, `frontend/src/overlay/core/profile-document.ts`, `frontend/src/overlay/core/profile-document.test.ts`, `frontend/src/overlay/core/widget-design.ts`, `frontend/src/overlay/core/widget-design.test.ts`; mechanically update imports using `CoreWidgetType`.

- [ ] RED: table-driven Go test y `it.each` TS aceptan los 18 strings y rechazan `pedals-v1`, `car-damage` y `delta-simple`.
- [ ] Run focused tests; Expected: FAIL para los 14 tipos nuevos.
- [ ] Añadir constantes Go; renombrar TS `CoreWidgetType`→`WidgetType` y `CORE_WIDGET_TYPES`→`WIDGET_TYPES`.
- [ ] Run `rg "CoreWidgetType|CORE_WIDGET_TYPES" frontend/src`; Expected: cero resultados.
- [ ] Run `go test ./pkg/config/... -run "WidgetType|ProfileDocumentV3" -count=1` y `pnpm --dir frontend test -- profile-document widget-design`; Expected: PASS.
- [ ] Commit `refactor(overlays): establish complete widget type vocabulary`.

### Task 2: Memoria por sistema y default del perfil

**Files:** Modify `pkg/config/profile_v3.go`, `pkg/config/profile_v3_validate.go`, `pkg/config/profile_v3_migrate.go`, tests/goldens; modify `frontend/src/overlay/core/profile-document.ts`, parser tests and profile fixtures.

- [ ] RED: round-trip conserva `systemMemories.vantare-crystal.provenance.designId`; sistema desconocido y versiones `<1` fallan con path preciso.
- [ ] Implementar `WidgetVisualSelectionV3`, `systemMemories?: Partial<Record<DesignSystemId, WidgetVisualSelectionV3>>` y `defaultVisualSystemId?: DesignSystemId`; espejo Go con puntero/map.
- [ ] Normalización clona mapas; payload total sigue bajo 256 KiB; memoria no admite `content`, `behavior` ni `layout`.
- [ ] Golden antiguo sin campos permanece válido y resuelve default Original en frontend.
- [ ] Run Go config + contract fixtures frontend; Expected: PASS.
- [ ] Commit `feat(overlays): persist visual selection per design system`.

### Task 3: Comando atómico de sistema/diseño

**Files:** Modify `frontend/src/hub/overlay-studio/state/studio-command.ts`, reducer/history files reales encontrados con `rg "widget/apply-design"`, `frontend/src/hub/overlay-studio/designs/design-utils.ts` and focused tests.

- [ ] RED: Crystal→Original guarda Crystal, aplica Original default, conserva type/content/behavior/layout; volver restaura Crystal; undo/redo opera en un paso.
- [ ] Extender el comando existente `widget/apply-design`; no crear un segundo reducer visual.
- [ ] Aplicar diseño copia `design.visual` a `baseSettings`, conserva overrides compatibles, actualiza provenance y memoriza el sistema saliente.
- [ ] Si no hay memoria, usar diseño oficial marcado default para `widgetType+systemId`; si falta, lanzar error explícito y no mutar draft.
- [ ] Focused state tests PASS; commit `feat(studio): switch visual systems atomically`.

### Task 4: Inspector jerárquico

**Files:** Modify `frontend/src/hub/overlay-studio/inspector/DesignSection.tsx`, its test, `design-utils.ts`, `frontend/src/hub/overlay-studio/overlay-studio-v3.css`, four locale files.

- [ ] RED: control segmentado muestra Original/Crystal; oficiales y usuario se filtran por tipo+sistema; single-design sigue visible; teclado activa con Space/Enter.
- [ ] RED fixtures: Delta Crystal muestra dos; Input Crystal tres; Pedals exactamente uno; diseños de otro sistema/tipo no aparecen.
- [ ] Implementar orden: `Sistema visual`, `Diseños de Vantare`, `Mis diseños`; mantener locks y `Guardar actual` existentes.
- [ ] No mostrar IDs técnicos; labels i18n exactos en es/en/it/pt; `aria-pressed` o radios con grupo nombrado.
- [ ] Test `DesignSection` + a11y PASS; commit `feat(studio): add system then design selection`.

### Task 5: Contrato del catálogo sin stubs

**Files:** Modify `frontend/src/overlay/core/widget-registry.ts/test` and `frontend/src/hub/overlay-studio/catalog/studio-catalog.ts/test`.

- [ ] RED: el catálogo deriva únicamente de definitions realmente registradas y nunca de la lista de 18 strings; por tanto este microplan sigue mostrando solo los cuatro tipos implementados.
- [ ] Añadir cardinality fixture final que describe 18 tipos y las excepciones Input/Delta, pero no registrarla en producción hasta sus microplanes.
- [ ] Prohibir definitions vacías y flags ficticios de disponibilidad; cada microplan de widget registra el tipo solo al tener ViewModel y dos renderers.
- [ ] Tests PASS; commit `test(studio): prevent placeholder widget catalog entries`.

## Gate

Go/TS round-trip, reducer, DesignSection y contrato de catálogo enfocados PASS; build PASS; ningún renderer Crystal cambió; `docs/current-plan.md` actualizado.
