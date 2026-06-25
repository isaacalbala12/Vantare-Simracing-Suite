# P1 Pedals Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a precise technical and product inventory for the current `Pedals` widget before designing or implementing the beta v1 version.

**Architecture:** This is an inventory-only task. The worker must inspect current frontend, telemetry, mock data, LMU parser, docs, and profile usage, then write a decision-ready document. No production code should be changed.

**Tech Stack:** Go/Wails, React/TypeScript, LMU Shared Memory parser, Vantare profile schema v2, Overlays Studio.

---

## Scope

P1 answers these questions:

1. Which live/mock fields currently exist for throttle, brake and clutch?
2. Are values consistently normalized to `0..100` across Go, frontend and mock telemetry?
3. How does `PedalsWidget` currently render, size and update?
4. Which appearance settings already exist and which are missing?
5. What must P2 design visually before P3 implements the beta render?
6. What risks could make Pedals unreliable for beta testers?

P1 must not implement the new Pedals design.

## Files To Inspect

Read these files at minimum:

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/master-feature-plan.md`
- `docs/product-decisions.md`
- `docs/product-widget-customization.md`
- `docs/beta-widget-system-spec.md`
- `frontend/src/overlay/widgets/PedalsWidget.tsx`
- `frontend/src/overlay/widgets/PedalsWidget.test.tsx`
- `frontend/src/overlay/widgets/TelemetryVerticalWidget.tsx`
- `frontend/src/overlay/widgets/TelemetryWidget.tsx`
- `frontend/src/overlay/widgets/mock-telemetry.ts`
- `frontend/src/lib/telemetry-ref.ts`
- `frontend/src/hub/state/style-catalog.ts`
- `frontend/src/hub/preview/WidgetList.tsx`
- `frontend/src/hub/preview/WidgetRenderer.tsx`
- `frontend/src/overlay/CompositeApp.tsx`
- `frontend/src/overlay/ObsOverlayApp.tsx`
- `pkg/models/telemetry.go`
- `internal/telemetry/lmu/parser.go`
- `internal/telemetry/lmu/parser_test.go`
- `internal/telemetry/lmu/fixture_integration_test.go`
- `internal/telemetry/diff/diff.go`
- `internal/telemetry/pipeline/filter.go`
- `configs/example-racing.json`

Optional if useful:

- `internal/engineer/telemetry/model.go`
- `frontend/src/lib/useDemoMode.test.ts`
- `docs/resolved-bugs.md`
- `docs/widget-preview-bug-log.md`

## Output Document

Create:

- `docs/pedals-inventory.md`

The document must contain these sections:

1. `Resumen ejecutivo`
2. `Estado actual del widget`
3. `Datos disponibles`
4. `Normalizacion y unidades`
5. `Render y comportamiento actual`
6. `Apariencia/configuracion existente`
7. `Problemas y riesgos`
8. `Decisiones recomendadas para P2`
9. `Contrato propuesto para P3`
10. `Checklist de verificacion manual futura`

## Task 1: Repository And Documentation Inventory

**Files:**
- Read: files listed above.
- Create: `docs/pedals-inventory.md`

- [ ] **Step 1: Confirm clean starting point**

Run:

```powershell
git status --short
```

Expected:

- Preferably clean after `v0.3.10.0`.
- If not clean, list every changed file in the final report and do not modify unrelated files.

- [ ] **Step 2: Read mandatory docs**

Run:

```powershell
Get-Content -Raw AGENTS.md
Get-Content -Raw docs/current-plan.md
Get-Content -Raw docs/roadmap-execution-board.md
Get-Content -Raw docs/master-feature-plan.md
Get-Content -Raw docs/product-decisions.md
Get-Content -Raw docs/product-widget-customization.md
Get-Content -Raw docs/beta-widget-system-spec.md
```

Expected:

- Identify that P1 is the current `Next` task.
- Confirm Pedals beta scope: throttle, brake, clutch; new smaller design; no broad UI rework.

- [ ] **Step 3: Inspect current Pedals files**

Run:

```powershell
rg -n "PedalsWidget|pedals|throttle|brake|clutch" frontend/src pkg internal configs docs -S
```

Expected:

- Locate `PedalsWidget.tsx`.
- Locate telemetry fields in Go and frontend.
- Locate style catalog entries and profile references.

## Task 2: Data Contract Inventory

**Files:**
- Read: `pkg/models/telemetry.go`
- Read: `internal/telemetry/lmu/parser.go`
- Read: `internal/telemetry/lmu/parser_test.go`
- Read: `internal/telemetry/lmu/fixture_integration_test.go`
- Read: `internal/telemetry/diff/diff.go`
- Read: `internal/telemetry/pipeline/filter.go`
- Read: `frontend/src/lib/telemetry-ref.ts`
- Update: `docs/pedals-inventory.md`

- [ ] **Step 1: Verify Go telemetry fields**

Inspect:

```powershell
Select-String -Path pkg/models/telemetry.go -Pattern "Throttle|Brake|Clutch" -Context 2
```

Record in `docs/pedals-inventory.md`:

- exact struct name;
- field names;
- JSON keys;
- type;
- whether `omitempty` exists.

- [ ] **Step 2: Verify LMU parser source**

Inspect:

```powershell
Select-String -Path internal/telemetry/lmu/parser.go -Pattern "Throttle|Brake|Clutch|Pedal" -Context 3
Select-String -Path internal/telemetry/lmu/parser_test.go -Pattern "Throttle|Brake|Clutch" -Context 3
Select-String -Path internal/telemetry/lmu/fixture_integration_test.go -Pattern "throttle|brake|clutch" -Context 3
```

Record:

- whether LMU gives values as `0..1` or `0..100`;
- where conversion happens;
- whether tests protect conversion;
- any missing fixture for clutch.

- [ ] **Step 3: Verify frontend normalization**

Inspect:

```powershell
Select-String -Path frontend/src/lib/telemetry-ref.ts -Pattern "normalizeInputToPercent|throttle|brake|clutch" -Context 4
```

Record:

- whether frontend accepts `0..1` and `0..100`;
- whether it clamps invalid values;
- how it treats `undefined`, `NaN`, negative and `>100`.

- [ ] **Step 4: Verify diff/filter behavior**

Inspect:

```powershell
Select-String -Path internal/telemetry/diff/diff.go -Pattern "Throttle|Brake|Clutch" -Context 3
Select-String -Path internal/telemetry/pipeline/filter.go -Pattern "Throttle|Brake|Clutch" -Context 3
```

Record:

- whether pedal changes publish telemetry updates;
- whether tiny changes are filtered;
- if there is any risk of noisy updates.

## Task 3: Current Widget Render Inventory

**Files:**
- Read: `frontend/src/overlay/widgets/PedalsWidget.tsx`
- Read: `frontend/src/overlay/widgets/PedalsWidget.test.tsx`
- Read: `frontend/src/overlay/widgets/TelemetryVerticalWidget.tsx`
- Read: `frontend/src/overlay/widgets/TelemetryWidget.tsx`
- Update: `docs/pedals-inventory.md`

- [ ] **Step 1: Inspect render structure**

Read `PedalsWidget.tsx` and record:

- root layout dimensions/classes;
- current bar orientation;
- whether clutch/brake/throttle all render;
- whether gear, history or extras render;
- whether update loop uses refs or React state;
- whether values are text-visible or only visual bars.

- [ ] **Step 2: Inspect tests**

Run:

```powershell
pnpm --dir frontend test -- PedalsWidget
```

Expected:

- Tests pass.
- Document what behaviors are currently covered and what is not covered.

- [ ] **Step 3: Compare with Telemetry widgets**

Read `TelemetryWidget.tsx` and `TelemetryVerticalWidget.tsx`.

Record:

- duplicated pedal bar code;
- shared appearance fields;
- whether a helper should be created later or avoided for now;
- whether P3 should reuse any existing code.

## Task 4: Appearance And Profile Inventory

**Files:**
- Read: `frontend/src/hub/state/style-catalog.ts`
- Read: `frontend/src/hub/preview/WidgetList.tsx`
- Read: `frontend/src/hub/preview/WidgetRenderer.tsx`
- Read: `frontend/src/overlay/CompositeApp.tsx`
- Read: `frontend/src/overlay/ObsOverlayApp.tsx`
- Read: `configs/example-racing.json`
- Update: `docs/pedals-inventory.md`

- [ ] **Step 1: Inspect existing appearance settings**

Inspect:

```powershell
Select-String -Path frontend/src/hub/state/style-catalog.ts -Pattern "pedals|pedalThrottleColor|pedalBrakeColor|pedalClutchColor" -Context 4
```

Record:

- existing configurable colors;
- default values;
- whether opacity/background/border are inherited from generic appearance;
- whether more settings are already available but unused.

- [ ] **Step 2: Inspect registration paths**

Inspect:

```powershell
Select-String -Path frontend/src/hub/preview/WidgetList.tsx -Pattern "pedals" -Context 3
Select-String -Path frontend/src/hub/preview/WidgetRenderer.tsx -Pattern "pedals|PedalsWidget" -Context 3
Select-String -Path frontend/src/overlay/CompositeApp.tsx -Pattern "pedals|PedalsWidget" -Context 3
Select-String -Path frontend/src/overlay/ObsOverlayApp.tsx -Pattern "pedals|PedalsWidget" -Context 3
```

Record:

- whether WidgetStudio, desktop overlay and OBS all support `pedals`;
- any difference between render paths.

- [ ] **Step 3: Inspect profile usage**

Inspect:

```powershell
Select-String -Path configs/example-racing.json -Pattern '"id": "pedals"|"type": "pedals"|pedals' -Context 6
```

Record:

- default position/size;
- enabled state;
- updateHz;
- any existing props.

## Task 5: Write Decision-Ready Inventory

**Files:**
- Create: `docs/pedals-inventory.md`

- [ ] **Step 1: Create the document**

Create `docs/pedals-inventory.md` with the sections listed above.

The recommended conclusion must be explicit:

```markdown
## Decisiones recomendadas para P2

1. Pedals beta v1 debe ser un widget pequeño y legible, no una extensión del diseño actual alto.
2. Debe mostrar `Throttle`, `Brake` y `Clutch`.
3. Debe usar datos normalizados `0..100`.
4. Debe mantener `WidgetStudio` como editor de apariencia/datos, no de posición/tamaño.
5. Debe evitar introducir schema nuevo salvo que P4 necesite persistir configuración visual avanzada.
6. Debe tener pruebas de render y de valores extremos antes de tocar visual.
```

If evidence contradicts any item, explain why and propose a safer alternative.

- [ ] **Step 2: Add proposed P3 contract**

Include a concrete `P3` contract:

```markdown
## Contrato propuesto para P3

- Input: telemetry fields `throttle`, `brake`, `clutch` normalized to `0..100`.
- Fallback: missing/invalid values render as `0%`, never `NaN%`.
- Render: three visual bars with stable labels `THR`, `BRK`, `CLT` or approved Spanish/brand labels.
- Runtime: update via refs/frame loop, matching current high-frequency widget pattern.
- WidgetStudio: no position/size/delete controls.
- LayoutStudio/runtime/OBS: use existing widget registration path.
- Tests: `PedalsWidget` renders three controls, clamps/fallbacks invalid values, accepts mock values, and preserves appearance colors.
```

- [ ] **Step 3: Run documentation checks**

Run:

```powershell
git diff --check
```

Expected:

- No whitespace errors.

## Task 6: Final Report

**Files:**
- Read: `docs/pedals-inventory.md`

- [ ] **Step 1: Confirm no production code changed**

Run:

```powershell
git diff --name-only
```

Expected:

- Only `docs/pedals-inventory.md` should be changed.
- If other files changed, stop and report.

- [ ] **Step 2: Final report in Spanish**

Report:

- files created/modified;
- files inspected;
- checks run;
- checks not run and why;
- current blockers;
- recommended next task (`P2 - Pedals nuevo diseño pequeño`);
- whether P1 is ready for review.

## Stop Conditions

Stop and report if:

- telemetry values are not reliable enough to use live;
- LMU parser lacks any of throttle/brake/clutch;
- frontend normalization contradicts Go units;
- implementing P2 would require schema changes immediately;
- any production file must be changed to complete P1;
- docs contradict each other about Pedals scope.

## Worker Prompt

```markdown
Actua como worker de inventario para Vantare Suite / Overlays Studio.

Tarea: P1 - Pedals inventario datos/diseño actual
Tipo: inventario/documentacion

Lee obligatoriamente:
- AGENTS.md
- docs/current-plan.md
- docs/roadmap-execution-board.md
- docs/master-feature-plan.md
- docs/product-decisions.md
- docs/product-widget-customization.md
- docs/beta-widget-system-spec.md
- docs/superpowers/plans/2026-06-25-p1-pedals-inventory.md

Aplica si revisas Go:
- golang-error-handling
- golang-testing
- golang-code-style

Alcance:
- Crear docs/pedals-inventory.md.
- Inventariar datos live/mock de throttle/brake/clutch.
- Inventariar render actual de PedalsWidget.
- Inventariar settings de apariencia y registro en WidgetStudio/desktop/OBS.
- Proponer decisiones concretas para P2 y contrato de implementación para P3.

No tocar:
- frontend/src/**
- internal/**
- pkg/**
- configs/**
- build/config.yml
- cmd/vantare/main.go
- schema/perfiles
- package.json / pnpm-lock.yaml
- go.mod / go.sum

Checks:
- pnpm --dir frontend test -- PedalsWidget
- git diff --check

Reporte final en español:
- archivos creados/modificados;
- archivos inspeccionados;
- checks ejecutados y resultado;
- checks no ejecutados y motivo;
- riesgos;
- recomendacion exacta para P2.

Stop conditions:
- Si necesitas modificar codigo para completar el inventario.
- Si no encuentras datos fiables para throttle/brake/clutch.
- Si hay contradicciones entre docs.
- Si git status muestra cambios previos que no entiendes.
```
