# Crystal Microplan 06 Integration and Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, browser-testing-with-devtools and verification-before-completion.

**Goal:** Integrar 18 tipos/21 diseños, migrar Crystal v1, demostrar paridad y retirar la implementación antigua.

**Architecture:** Official/user designs usan el contrato del microplan 01. El harness compara HTML y React con mismos datos/crop. El cutover conserva `vantare-crystal`, incrementa manifest a v2 y elimina v1 solo tras todos los gates.

**Tech Stack:** React, Go, Vitest, Playwright, Wails.

---

### Task 1: Catálogo oficial completo

**Files:** Modify `official-designs.ts/test`, both manifests/tests, `studio-catalog.ts/test`, `AddWidgetDialog.tsx/test`, locale names/descriptions.

- [ ] RED: 18 registrations por manifest; 21 Crystal IDs exactos del master; ≥18 Original; un default por `widgetType+systemId`.
- [ ] RED: Delta Crystal=2, Input Crystal=3, cualquier otro tipo Crystal=1.
- [ ] RED: AddWidget muestra 18 tipos únicos; Input/Delta aparecen una vez; los tres Pedals, dos Damage y Delta Advanced aparecen separados; nueva instancia usa `defaultVisualSystemId ?? "vantare-original"`.
- [ ] Thumbnails se generan desde renderer aprobado; no usar placeholders ni imágenes remotas.
- [ ] Tests PASS; commit `feat(overlays): publish complete official design catalog`.

### Task 2: User designs y migración

**Files:** Modify `widget-design.ts/test`, `design-utils.ts/test`, `WidgetDesignService` Go/tests if serialization changes, Crystal migration tests/goldens.

- [ ] v1 core mapping: delta→delta-bar, pedals→pedals, relative→relative-vertical, standings→standings-vertical.
- [ ] User design queda ligado a `widgetType+systemId`; `includesContent=false` por default; unknown keys se preservan solo si parser v2 las acepta.
- [ ] Abrir/aplicar/guardar/reabrir es idempotente y no crea dirty en segunda carga.
- [ ] Backup/recovery actual permanece; commit `feat(crystal): migrate saved designs to v2`.

### Task 3: Harness HTML↔React

**Files:** Create `frontend/scripts/crystal-html-parity.mjs`; modify harness fixtures and `overlay-studio-visual.mjs`; add 21 renderer scenarios.

- [ ] Mismos datos, viewport, DPR=1, fonts ready, animation disabled y bounding boxes del manifest.
- [ ] Salidas por ID: reference, actual, diff heatmap, JSON con dimensions/pixel delta/font/network/console.
- [ ] Fallar por request remota, overflow, font fallback, console error, dimensión distinta o selector ausente.
- [ ] Gate estructural primero; ≤0.5% solo durante ajuste; gate final 0.000% o excepción de antialias individual aprobada/documentada.
- [ ] Commit `test(crystal): enforce 21 canonical visual comparisons`.

### Task 4: Matriz Studio/Desktop/OBS

- [ ] Ready: 21 diseños × 3 surfaces.
- [ ] Non-ready: 18 tipos × missing/stale/disconnected/error en Studio y OBS.
- [ ] Shell: wide/medium/compact; zoom 50/100/150; fit; Browser View; grid/solid; safe area; enabled false.
- [ ] Interacción smoke: move/resize de un widget ligero y pesado, sin cambiar código canvas; visual suite dos veces consecutivas con hashes iguales.
- [ ] Commit `test(crystal): cover complete runtime surface matrix`.

### Task 5: Rendimiento y accesibilidad

- [ ] Perfil mixto 20 widgets a buckets 15/30Hz; histories permanecen en límites; drag benchmark no regresa contra baseline documentado.
- [ ] Blur 24px se mantiene en modo canónico; si hardware requiere Lite, Lite es opción explícita distinta y no baseline de paridad.
- [ ] Inspector usable con teclado/foco; segmented control nombrado; thumbnails con texto; renderer sin controles interactivos y tablas con semántica/fallback accesible.
- [ ] Reduced motion y locales es/en/it/pt PASS; commit `test(crystal): verify performance and accessibility gates`.

### Task 6: Cutover destructivo controlado

**Files:** Delete only superseded Crystal v1 renderer/tokens/tests/baselines after replacement exists; update docs/checker.

- [ ] `rg` clasifica cada clase/import v1; eliminar únicamente entradas reemplazadas.
- [ ] Mantener ID `vantare-crystal`; manifest version=2; no `legacy-crystal`, fallback oculto ni doble opción UI.
- [ ] `design-system:check` exige 18 registrations por sistema y 21 official Crystal designs.
- [ ] Actualizar architecture/design-system/authoring/porting/testing/visual/performance/final-audit/current-plan.
- [ ] Commit `refactor(crystal): complete direct glassmorphism replacement`.

### Task 7: Gate final

Run exactamente:

```powershell
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
pnpm --dir frontend design-system:check
pnpm --dir frontend visual:overlay-studio
node frontend/scripts/crystal-html-parity.mjs
pnpm --dir frontend bench:overlay-studio-drag
go test ./pkg/config/... ./internal/app/... ./cmd/vantare/... -count=1
go test ./...
git diff --check
```

- [ ] Comparar fallos preexistentes contra base; no ocultarlos ni declararlos regresión nueva sin evidencia.
- [ ] Smoke Wails: save/reload, Original↔Crystal↔Original, diseños personales, Desktop y OBS.
- [ ] Documentar archivos, resultados, no ejecutados, riesgos y verificación manual.

## Definition of Done

18 tipos funcionales, 21 Crystal 1:1, 18+ Original, selector jerárquico, user designs, migración v1→v2, Studio/Desktop/OBS, histories bounded, live honesto, v1 eliminado y todos los gates relevantes verdes.
