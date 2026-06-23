# S6 Standings Verification And Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the first configurable `Standings` cut by verifying S1-S5 end-to-end, documenting the manual checklist, and reporting any blockers without applying code fixes.

**Architecture:** This is a verification and documentation task only. It must not change runtime behavior, widget rendering, schema, backend, configs, or preview architecture.

**Tech Stack:** Go/Wails, React/TypeScript, Vitest, Vite, existing markdown documentation.

---

## Scope

S6 confirms that the current `Standings` implementation is ready for the next roadmap step.

Allowed work:
- Run checks.
- Read implementation and plan documents.
- Update documentation/checklists if the implementation is already green.
- Report failures precisely if any check or manual expectation fails.

Forbidden work:
- Do not edit production code.
- Do not edit tests to make checks pass.
- Do not touch backend/schema/configs.
- Do not touch `docs/marketing/`.
- Do not touch `docs/INTEGRATION_ANALYSIS.md`.
- Do not commit or stage.

Stop immediately if:
- A required check fails.
- You find a P0/P1/P2 issue.
- You need code changes to complete S6.
- The current implementation contradicts `AGENTS.md`, `docs/current-plan.md`, or `docs/roadmap-execution-board.md`.

## Files

Expected documentation files:
- Modify: `docs/current-plan.md`
- Modify: `docs/roadmap-execution-board.md`
- Create or modify: `docs/standings-manual-verification.md`

Files to inspect but not edit:
- `frontend/src/overlay/widgets/standings-catalog.ts`
- `frontend/src/overlay/widgets/standings-format.ts`
- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- `frontend/src/overlay/widgets/mock-telemetry.ts`
- `frontend/src/lib/widget-variants.ts`
- `frontend/src/hub/overlays/StandingsSettingsSection.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/useOverlayStudioState.ts`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/preview/WidgetRenderer.tsx`

---

### Task 1: Orientation And Scope Check

**Files:**
- Read: `AGENTS.md`
- Read: `docs/current-plan.md`
- Read: `docs/master-feature-plan.md`
- Read: `docs/roadmap-execution-board.md`
- Read: `docs/feature-architecture-map.md`
- Read: `docs/widget-preview-bug-log.md`

- [ ] **Step 1: Check current git status**

Run:

```powershell
git status --short
```

Expected:
- Dirty tree is allowed because previous workers left S4.5/S4.6/S5 changes uncommitted.
- Do not stage, commit, revert, or clean anything.

- [ ] **Step 2: Read required docs**

Run:

```powershell
Get-Content -Raw AGENTS.md
Get-Content -Raw docs/current-plan.md
Get-Content -Raw docs/master-feature-plan.md
Get-Content -Raw docs/roadmap-execution-board.md
Get-Content -Raw docs/feature-architecture-map.md
Get-Content -Raw docs/widget-preview-bug-log.md
```

Expected:
- `WidgetStudio` edits appearance/data only.
- `LayoutStudio` edits position/size only.
- S5 is implemented and S6 is the current verification task.

- [ ] **Step 3: Inspect S1-S5 plan/report context**

Run:

```powershell
Get-ChildItem docs/superpowers/plans | Where-Object { $_.Name -match 'standings|s4-5|s4-6|s5' } | Sort-Object Name
```

Then read the relevant plan documents that exist locally:

```powershell
Get-Content -Raw docs/superpowers/plans/2026-06-23-s4-5-preview-mock-session-scenarios.md
Get-Content -Raw docs/superpowers/plans/2026-06-23-s4-6-widgetstudio-explicit-save.md
Get-Content -Raw docs/superpowers/plans/2026-06-23-s5-standings-ui-widgetstudio.md
```

Expected:
- If a referenced file does not exist, report it as a documentation gap, but continue if `docs/current-plan.md` and `docs/roadmap-execution-board.md` contain enough state.

---

### Task 2: Automated Verification

**Files:**
- Inspect only: frontend source and tests listed in the scope.

- [ ] **Step 1: Run focused Standings and WidgetStudio tests**

Run:

```powershell
pnpm --dir frontend test -- standings-catalog standings-format StandingsWidget StandingsSettingsSection WidgetSettingsPanel WidgetStudio WidgetPreviewPanel WidgetSandboxPreview WidgetRenderer mock-telemetry useOverlayStudioState
```

Expected:
- PASS.
- Report number of files and tests.
- If this fails, stop and report the first failing test and likely cause. Do not fix.

- [ ] **Step 2: Run full frontend test suite**

Run:

```powershell
pnpm --dir frontend test
```

Expected:
- PASS.
- Report number of files and tests.
- If this fails, stop and report. Do not fix.

- [ ] **Step 3: Run TypeScript build check**

Run:

```powershell
pnpm --dir frontend exec tsc -b
```

Expected:
- Exit 0.
- If this fails, stop and report. Do not fix.

- [ ] **Step 4: Run production build**

Run:

```powershell
pnpm --dir frontend build
```

Expected:
- PASS.
- Report bundle output summary.
- If this fails, stop and report. Do not fix.

- [ ] **Step 5: Run lint**

Run:

```powershell
pnpm --dir frontend lint
```

Expected:
- PASS or known non-blocking warning only.
- If there is an error, stop and report. Do not fix.

- [ ] **Step 6: Run backend smoke tests**

Run:

```powershell
go test ./pkg/config ./internal/app
```

Expected:
- PASS.
- This is a smoke check for profile/config persistence boundaries even though S5 is frontend-focused.
- If this fails, stop and report. Do not fix.

- [ ] **Step 7: Run whitespace diff check**

Run:

```powershell
git diff --check
```

Expected:
- Exit 0.
- If CRLF warnings appear without errors, report them as warnings.
- If whitespace errors appear, stop and report. Do not fix.

---

### Task 3: Manual Verification Checklist Document

**Files:**
- Create or modify: `docs/standings-manual-verification.md`

- [ ] **Step 1: Create or update the manual checklist**

Write `docs/standings-manual-verification.md` with this structure:

```markdown
# Standings Manual Verification

Manual checklist for the first configurable Standings cut.

## Preconditions

- App built or running in dev mode with latest frontend changes.
- Active profile contains a `standings` widget.
- `WidgetStudio` is opened through `Overlays Studio -> Widgets`.
- Do not use `LayoutStudio` for these checks except where explicitly stated.

## WidgetStudio Checks

- [ ] Select `standings` in the widget list.
- [ ] Confirm there are no X/Y/W/H controls, drag handles, resize handles, duplicate, delete, or overlay live controls in WidgetStudio.
- [ ] Confirm `Columnas Standings` is visible.
- [ ] Toggle optional columns: class, current lap, interval, best lap, last lap.
- [ ] Confirm enabled columns appear in the preview and disabled columns disappear.
- [ ] Confirm base columns remain available and are not removable by this UI: position, driver number, driver name, gap.
- [ ] Change driver name format to truncate and set max characters.
- [ ] Confirm out-of-range max characters are clamped to the supported range.
- [ ] Change best lap/last lap display, decimals, width, color, and alignment.
- [ ] Confirm out-of-range width is clamped to the supported range.

## Mock Session Scenario Checks

- [ ] Confirm mock session selector is visible in WidgetStudio preview controls.
- [ ] Confirm default scenario is Carrera/Race.
- [ ] Select Practica/Practice and confirm the preview communicates practice-style standings data.
- [ ] Select Qualy and confirm the preview communicates qualifying-style standings data.
- [ ] Select Carrera/Race and confirm the preview communicates race-style standings data.
- [ ] Confirm scenario selection does not mark the profile dirty and is not persisted as widget config.

## Explicit Save Checks

- [ ] Change one Standings setting.
- [ ] Wait at least 1 second.
- [ ] Confirm it does not autosave unexpectedly.
- [ ] Confirm the Save button is enabled.
- [ ] Click Save.
- [ ] Confirm the saved state remains after leaving and returning to WidgetStudio.
- [ ] Reopen the app if needed and confirm saved Standings settings persist.

## Renderer Checks

- [ ] Confirm Standings preview has no clipping.
- [ ] Confirm optional lap columns align by row.
- [ ] Confirm no unexpected right-side blank space appears from intrinsic width calculation.
- [ ] Confirm Standings still renders in desktop overlay after saving.
- [ ] Confirm Standings still renders in OBS overlay path if available.

## Regression Checks

- [ ] Select Relative and confirm Relative columns/filters still work.
- [ ] Go to LayoutStudio and confirm position/size controls are present there.
- [ ] Confirm LayoutStudio does not show Standings/Relative internal column controls.
- [ ] Confirm LayoutStudio drag/resize behavior is not affected by WidgetStudio changes.

## Result

- Status:
- Tester:
- Notes:
```

Expected:
- The checklist is explicit enough for a non-code reviewer to follow.
- It separates WidgetStudio and LayoutStudio responsibilities.

---

### Task 4: Documentation State Update

**Files:**
- Modify: `docs/current-plan.md`
- Modify: `docs/roadmap-execution-board.md`

- [ ] **Step 1: Update current plan**

Update `docs/current-plan.md` to state:
- S5 `Standings UI en WidgetStudio` is implemented and accepted after P3 fixes.
- S6 verification is the current/next step.
- Do not remove historical context unless clearly obsolete.

Expected wording can be concise. Include:

```markdown
UI de `Standings` en `WidgetStudio` preparada (S5):
- Controles de columnas opcionales y formatos conectados a variantes schema v2.
- Defaults de UI leidos desde el catalogo de Standings.
- Inputs numericos con clamp en UI.
- Sin controles de posicion/tamano/eliminar.
- Checks reportados por worker: suite frontend completa, tsc, build, lint y git diff --check en verde.
- P3 iniciales revisados y corregidos salvo refactors compartidos fuera de alcance.
```

- [ ] **Step 2: Update roadmap board**

Update `docs/roadmap-execution-board.md` only if the verification passed:
- Keep S5 as `Done`.
- Mark S6 as `Done`.
- Mark UI1 as `Next`.
- Update `Proxima accion` to `UI1 - Leer HTML referencia y extraer decisiones visuales`.

If any required check failed, do not mark S6 done.

---

### Task 5: Final Report

**Files:**
- No edits.

- [ ] **Step 1: Report final evidence in Spanish**

Include:
- Files created/modified.
- Checks executed and result.
- Checks not executed and why.
- Remaining risks.
- Manual verification checklist location.
- Whether S6 can be accepted.

Expected final line:

```text
Recomendacion: enviar este cierre a GLM como review adversarial de S6 antes de avanzar a UI1.
```

