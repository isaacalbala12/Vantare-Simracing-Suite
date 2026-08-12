# ISA-326 — Superficie arbitraria y paridad Studio/Desktop/OBS

> **For Codex:** execute task by task with `subagent-driven-development`. Each
> implementation task requires TDD, a spec-compliance review and a code-quality
> review before the next task starts.

**Goal:** permitir que cada perfil declare cualquier superficie `width × height`
y que Studio, Desktop y OBS apliquen la misma geometría sin fijar 1080p.

**Architecture:** `ProfileDocumentV3` owns the optional persisted
`layoutViewport`, resolved through one backward-compatible default. A pure
layout-to-output transform is the only authority for scale and centered origin.
Studio edits logical coordinates on the document surface; runtime frames remain
consumers of pure geometry and `WidgetVisualHost` stays untouched.

**Tech stack:** Go config/runtime contracts; TypeScript strict + React; Vitest;
Go tests; existing CSS/Tailwind only.

**Canonical worktree:** `C:\tmp\vantare-isa326\vantare-v2`

**Branch:** `vantareapp/isa-326-os-11-superficie-arbitraria-y-paridad-de-resolucion`

**Base:** `origin/nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00`

---

## Task 0 — Contract and execution record

**Files:**

- Create: `docs/adr/0092-overlay-arbitrary-layout-viewport.md`
- Create: `docs/superpowers/plans/2026-08-11-overlay-arbitrary-viewport-parity.md`
- Modify: `docs/current-plan.md`
- Modify: `docs/vantare-program/handoffs/overlays-launcher-hub.md`

1. Record the backward-compatible V3 field, CSS-pixel units, shared contain
   transform, mismatch policy and native-monitor boundary.
2. Record the exact task ledger and branch/base evidence.
3. Verify documentation links and clean scoped diff.

Run:

```powershell
git diff --check
git diff -- docs/adr/0092-overlay-arbitrary-layout-viewport.md docs/superpowers/plans/2026-08-11-overlay-arbitrary-viewport-parity.md docs/current-plan.md docs/vantare-program/handoffs/overlays-launcher-hub.md
```

Commit: `docs(overlay): define arbitrary viewport parity contract`

## Task 1 — Shared document viewport and pure transform

**Files:**

- Modify: `frontend/src/overlay/core/profile-document.ts`
- Create: `frontend/src/overlay/core/layout-viewport.ts`
- Create: `frontend/src/overlay/core/layout-viewport.test.ts`
- Modify: `frontend/src/overlay/core/profile-document.test.ts`
- Modify: `pkg/config/profile_v3.go`
- Modify: `pkg/config/profile_v3_validate.go`
- Modify: `pkg/config/profile_v3_migrate.go`
- Modify: `pkg/config/profile_v3_test.go`
- Modify: `pkg/config/profile_v3_validate_test.go`
- Modify: `pkg/config/profile_v3_migrate_test.go`

### TDD steps

1. Add failing TS tests for:
   - missing `layoutViewport` resolving to 1920×1080;
   - arbitrary valid viewport round-trip;
   - invalid/non-integer/out-of-range dimensions;
   - contain transform identity, 16:9 scaling, ultrawide mismatch and custom
     sizes;
   - forward/inverse point mapping.
2. Add failing Go tests for the same storage default and validation contract.
3. Implement `LayoutViewport`, `resolveLayoutViewport`, validation bounds and a
   pure `resolveLayoutViewportTransform` in TypeScript.
4. Add the optional Go JSON field and resolve it to the legacy default during
   validation/migration without rewriting old widget coordinates.
5. Replace profile-level recoverability checks with resolved document bounds.
6. Keep schemaVersion 3 and prove old fixtures still load unchanged.

Run:

```powershell
corepack pnpm --dir frontend test -- src/overlay/core/layout-viewport.test.ts src/overlay/core/profile-document.test.ts
go test ./pkg/config
```

Commit: `feat(overlay): add arbitrary layout viewport contract`

## Task 2 — Studio edits the document surface

**Files:**

- Modify: `frontend/src/hub/overlay-studio/state/studio-command.ts`
- Modify: `frontend/src/hub/overlay-studio/state/studio-command.test.ts`
- Modify: `frontend/src/hub/overlay-studio/state/studio-store.tsx`
- Modify: `frontend/src/hub/overlay-studio/state/studio-store.test.tsx`
- Modify: `frontend/src/hub/overlay-studio/canvas/canvas-geometry.ts`
- Modify: `frontend/src/hub/overlay-studio/canvas/canvas-geometry.test.ts`
- Modify: `frontend/src/hub/overlay-studio/canvas/canvas-snap.ts`
- Modify: `frontend/src/hub/overlay-studio/canvas/canvas-snap.test.ts`
- Modify: `frontend/src/hub/overlay-studio/canvas/preview-resolution.ts`
- Modify: `frontend/src/hub/overlay-studio/canvas/preview-resolution.test.ts`
- Modify: `frontend/src/hub/overlay-studio/canvas/CanvasToolbar.tsx`
- Modify: `frontend/src/hub/overlay-studio/canvas/CanvasToolbar.test.tsx`
- Modify: `frontend/src/hub/overlay-studio/canvas/StudioCanvas.tsx`
- Modify: `frontend/src/hub/overlay-studio/canvas/StudioCanvas.test.tsx`
- Modify: `frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.ts`
- Modify: `frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.test.tsx`
- Modify: `frontend/src/hub/overlay-studio/overlay-studio-v3.css`
- Modify: applicable i18n locale files already used by Studio

### TDD steps

1. Characterize dirty/undo/redo/save for a new `set-layout-viewport` command.
2. Add failing geometry tests proving fit, clamp, snap, safe area and
   pointer-to-logical conversion use a supplied arbitrary viewport.
3. Replace the preview-resolution union with numeric document dimensions plus
   preset helpers. Preserve `zoom` as visual-only state.
4. Add width and height inputs with existing presets as shortcuts. Validate
   before dispatch; do not add dependencies.
5. Render the bordered scene at `resolveLayoutViewport(document)` and pass those
   dimensions into every spatial helper. Keep transient drag/resize previews
   imperative as required by the canvas contract.
6. Make the scene boundary visible independently from the exterior workspace.

Run:

```powershell
corepack pnpm --dir frontend test -- src/hub/overlay-studio/state/studio-command.test.ts src/hub/overlay-studio/state/studio-store.test.tsx src/hub/overlay-studio/canvas/canvas-geometry.test.ts src/hub/overlay-studio/canvas/canvas-snap.test.ts src/hub/overlay-studio/canvas/preview-resolution.test.ts src/hub/overlay-studio/canvas/CanvasToolbar.test.tsx src/hub/overlay-studio/canvas/StudioCanvas.test.tsx src/hub/overlay-studio/canvas/useCanvasInteraction.test.tsx
```

Commit: `feat(studio): edit arbitrary profile surfaces`

### Microcortes de ejecución aprobados

Para mantener propiedad exclusiva y review entre cambios, Task 2 se ejecuta en
tres microcortes secuenciales:

- **2A — estado documental:** comando `document/layout-viewport`, permisos,
  dirty/undo/redo/save y errores atómicos.
- **2B — geometría:** fit, clamp, snap, safe area e interacción parametrizados
  por un viewport recibido, sin UI nueva.
- **2C — canvas y controles:** inputs/presets, escena delimitada y responsive,
  usando exclusivamente las autoridades de 2A/2B.

Cada microcorte exige spec review y quality review antes del siguiente.

## Task 3 — Desktop and OBS consume the same transform

**Files:**

- Modify: `frontend/src/overlay/runtime/RuntimeOverlaySurface.tsx`
- Modify: `frontend/src/overlay/runtime/RuntimeWidgetFrame.tsx`
- Modify: `frontend/src/overlay/runtime/DesktopOverlayRuntime.test.tsx`
- Modify: `frontend/src/overlay/runtime/ObsOverlayRuntime.test.tsx`
- Modify: `frontend/src/overlay/ObsOverlayStudioPreview.tsx`
- Modify: `frontend/src/overlay/ObsOverlayStudioPreview.test.tsx`
- Modify: `frontend/src/overlay/ObsOverlayApp.tsx`
- Modify: `frontend/src/overlay/ObsOverlayApp.test.tsx`
- Modify: `frontend/src/overlay/CompositeApp.test.tsx`
- Modify: `frontend/src/overlay/obs-overlay-studio-preview.css`

### TDD steps

1. Add failing runtime tests for identity, up/down scaling, ultrawide/custom
   surfaces, centered mismatch offsets and legacy default.
2. Make `RuntimeOverlaySurface` measure its CSS viewport and apply the shared
   transform once to a logical scene. Frames use document coordinates inside
   that scene and do not scale themselves.
3. Normalize `layoutOrigin` in logical space exactly once; prove Desktop and OBS
   yield the same frame boxes for equal inputs.
4. Make OBS Studio preview receive the document viewport and reuse the same
   transform instead of importing Studio constants.
5. Do not modify `WidgetVisualHost` or any renderer.

Run:

```powershell
corepack pnpm --dir frontend test -- src/overlay/core/layout-viewport.test.ts src/overlay/runtime/DesktopOverlayRuntime.test.tsx src/overlay/runtime/ObsOverlayRuntime.test.tsx src/overlay/ObsOverlayStudioPreview.test.tsx src/overlay/ObsOverlayApp.test.tsx src/overlay/CompositeApp.test.tsx
```

Commit: `feat(overlay): unify runtime resolution transform`

## Task 4 — Fluid Hub workspace and native-monitor boundary

**Files:**

- Modify: `frontend/src/hub/components/V52Shell.tsx`
- Modify: `frontend/src/hub/components/V52Shell.test.tsx`
- Modify: `frontend/src/hub/overlay-studio/OverlayStudioV3.test.tsx`
- Modify: `frontend/src/hub/overlay-studio/overlay-studio-v3.css`
- Create or modify native monitor files only if an existing testable Wails API
  is already present; otherwise create a dependent Linear issue and document it.

### TDD steps

1. Add a failing shell test proving Profiles uses available width while other
   Hub sections retain the existing 1920px maximum.
2. Apply a section-scoped fluid container; keep existing compact breakpoints and
   horizontal overflow protections.
3. Verify whether the current Wails window abstraction can enumerate, identify
   and size `monitorIndex`. Do not infer it from the Hub viewport.
4. If the capability exists, add the smallest tested bridge and initialize a
   newly chosen surface from its CSS/DIP work-area size. If it does not, create
   a dependent Linear issue and leave manual arbitrary dimensions functional.

Run:

```powershell
corepack pnpm --dir frontend test -- src/hub/components/V52Shell.test.tsx src/hub/overlay-studio/OverlayStudioV3.test.tsx
```

Commit: `feat(studio): use fluid profiles workspace`

## Task 5 — Accumulated verification and handoff

**Files:**

- Modify: `docs/current-plan.md`
- Modify: `docs/vantare-program/handoffs/overlays-launcher-hub.md`
- Modify: `docs/superpowers/plans/2026-08-11-overlay-arbitrary-viewport-parity.md`

1. Run all accumulated frontend and Go checks.
2. Run focused lint on changed TS/TSX and the production frontend build.
3. Manually inspect Studio at wide, medium and compact widths and runtime
   harnesses at the required resolution matrix. Record evidence or an explicit
   omission with reason.
4. Review the complete diff against ADR 0092 and the issue acceptance criteria.
5. Update the live handoff, current plan and Linear with exact commits, checks,
   remaining risks and next action.

Run:

```powershell
go test ./...
corepack pnpm --dir frontend test
corepack pnpm --dir frontend lint
corepack pnpm --dir frontend build
git diff --check origin/nightly...HEAD
git status --short
```

Commit: `docs(overlay): close ISA-326 implementation evidence`

### Resultado ejecutado (2026-08-12)

- Tasks 0–4 completadas con TDD, spec review y quality review secuenciales. Las
  revisiones finales no dejan hallazgos Critical/Important.
- Wails sí incluía una capacidad comprobable de pantallas. El alcance se cerró
  sin dependencia nueva: Studio enumera `Screens.GetAll`; documento y superficie
  cambian atómicamente; Desktop resuelve el mismo índice con `GetByIndex`, usa
  `Screen.Bounds` CSS/DIP para la colocación inicial y activa fullscreen.
- Gates acumulados: `go test ./...` PASS; frontend 360 archivos, 2567 tests PASS;
  build y diff-check PASS. ESLint directo sobre los 53 TS/TSX cambiados falla por
  6 errores y 1 warning heredados; el global falla por 36 errores y 2 warnings.
  Las comparaciones de baseline por microcorte no detectaron violaciones nuevas.
- Inspección T3: Studio a 1440×900, 1024×768 y 800×700, superficies 3440×1440
  y custom 1000×1000, sin overflow horizontal y con escala uniforme. El harness
  de paridad histórico tiene stage fijo y el navegador no dispone del runtime
  Wails/backend; por ello la matriz runtime queda demostrada por tests y la
  prueba física Desktop/OBS multimonitor se conserva como gate manual.
- Riesgos restantes: índice posicional y enumeración solo al abrir Studio;
  hot-plug requiere reabrir. Falta aceptación de Isaac en Windows con dos
  monitores, DPI mixto y OBS antes de cualquier promoción.
- HEAD productivo revisado: `4703a4886cf43f45af1a37199a4d77b406cd20a5`.
  No hubo push, PR, CI remoto, merge, release ni promoción.
