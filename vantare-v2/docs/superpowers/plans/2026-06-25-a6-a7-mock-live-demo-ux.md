# A6 A7 Mock Live Demo UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mock/live/demo state understandable in Hub, editor and overlay-opening flows without changing telemetry architecture.

**Architecture:** Keep telemetry source ownership in Go (`internal/app` + `cmd/vantare`) and display-only UX in React (`HubApp`, `Topbar`, Overlays Studio pages). This plan allows a combined inventory+fix pass, but fixes must stay small: labels, state presentation, tests and docs. If the worker finds that solving a problem requires changing source-manager architecture, stop and report instead of implementing.

**Tech Stack:** Go/Wails v3, React, TypeScript, Vitest, Go tests.

---

## Context

This is the next alpha-private product usability block after `v0.3.9.1`.

Current known behavior:

- `cmd/vantare/main.go` exposes `-live=true` by default and `-live=false` as explicit mock mode.
- `internal/app.App` uses `TelemetrySourceManager` and falls back to mock when LMU live is unavailable.
- `HubApp` listens for `telemetry:source-status`.
- `Topbar` shows one compact source chip: `LMU conectado`, `Esperando LMU`, or `Mock`.
- `WidgetStudio` has a preview-only mock scenario selector for `Standings`: `Práctica`, `Qualy`, `Carrera`.
- The product decision in `docs/current-plan.md` says:
  - Opening overlay should try live first.
  - If LMU is unavailable, overlay opens with mock fallback.
  - `-live=false` remains explicit development/testing mode.
  - The topbar shows source state.

## Non-negotiable Boundaries

- Do not change `WidgetStudio`/`LayoutStudio` responsibilities.
- Do not touch widget layout/resize/preview architecture unless the bug is directly in a source indicator.
- Do not alter schema/persistence.
- Do not add dependencies.
- Do not implement OBS LAN/double-PC.
- Do not implement a new telemetry source manager.
- Do not commit, push or tag.

## Files Expected

Likely reads:

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/master-feature-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/beta-widget-system-spec.md` section `Mock/demo state`
- `cmd/vantare/main.go`
- `internal/app/app.go`
- `internal/app/telemetry_source_manager.go`
- `frontend/src/hub/HubApp.tsx`
- `frontend/src/hub/components/Topbar.tsx`
- `frontend/src/hub/pages/OverlaysStudioPage.tsx`
- `frontend/src/hub/overlays/WidgetStudio.tsx`
- relevant tests next to touched files

Allowed modifications if needed:

- `frontend/src/hub/components/Topbar.tsx`
- `frontend/src/hub/components/Topbar.test.tsx` if it exists, otherwise create it only if useful
- `frontend/src/hub/HubApp.tsx`
- `frontend/src/hub/HubApp.test.tsx` if it exists
- `frontend/src/hub/pages/OverlaysStudioPage.tsx`
- `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`
- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/WidgetStudio.test.tsx`
- `cmd/vantare/main.go` only for event/status payload bugfixes
- `internal/app/app.go`
- `internal/app/telemetry_source_manager.go`
- Go tests only if Go behavior changes
- `docs/current-plan.md`
- `docs/roadmap-execution-board.md`
- optionally create `docs/mock-live-demo-ux.md`

Forbidden modifications:

- `frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- `frontend/src/hub/preview/PreviewCanvas.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/preview/PreviewScaler.tsx`
- `frontend/src/overlay/widgets/RelativeWidget.tsx`
- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- profile schema/types unless a test proves an existing type is wrong
- build config/version files

---

## Task 1: Inventory Source-State UX

**Files:**

- Read only first.
- Create if useful: `docs/mock-live-demo-ux.md`

- [ ] **Step 1: Inspect current source-state flow**

Run:

```powershell
rg -n "telemetry:source-status|SourceInfo|EnsureLiveTelemetry|EnsureLive|sourceStatus|LMU conectado|Esperando LMU|Mock|mockSessionScenario" cmd internal frontend/src docs -S
```

Expected: find all source-status emitters/listeners and UI labels.

- [ ] **Step 2: Write a short inventory**

Create or update `docs/mock-live-demo-ux.md` with exactly these sections:

```markdown
# Mock Live Demo UX

## Current Flow

- Startup source mode:
- Overlay open behavior:
- Hub/topbar source indicator:
- WidgetStudio preview scenario selector:

## Problems Found

- [ ] Problem 1...

## Decisions

- Source indicator should be global and compact.
- WidgetStudio mock scenario selector is preview-only and must not dirty the profile.
- Opening overlay should prefer live and fall back to mock with clear status.
- `-live=false` is explicit mock/dev mode.

## Required Fixes

- [ ] Fix 1...

## Manual Checklist

1. Open app without LMU.
2. Confirm topbar shows mock/fallback state clearly.
3. Open overlay from Mis perfiles.
4. Confirm app does not fail if LMU is absent.
5. Start LMU if available and reopen overlay.
6. Confirm status changes to live/connected when available.
7. In WidgetStudio Standings, switch Práctica/Qualy/Carrera and confirm profile is not marked dirty.
```

Do not invent fixes yet. If no real issue is found, mark `Required Fixes` as empty and proceed to documentation/status update only.

---

## Task 2: Frontend Source Indicator Polish

Only execute this task if Task 1 finds that the current status is unclear or inconsistent.

**Files:**

- Modify: `frontend/src/hub/components/Topbar.tsx`
- Test: `frontend/src/hub/components/Topbar.test.tsx` if needed

- [ ] **Step 1: Add/adjust tests for label mapping**

If no test exists, create `frontend/src/hub/components/Topbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Topbar } from "./Topbar";

vi.mock("../../lib/theme", () => ({
  applyTheme: vi.fn(),
  getStoredThemeId: vi.fn(() => "vantare-v5"),
  persistThemeId: vi.fn(),
}));

describe("Topbar source status", () => {
  it("shows connected LMU when live source is available", () => {
    render(
      <Topbar
        activeSection="profiles"
        onNavigate={() => {}}
        version="v0.3.9.1"
        sourceStatus={{ kind: "lmu", name: "Le Mans Ultimate", live: true, available: true }}
      />,
    );
    expect(screen.getByText("LMU conectado")).toBeTruthy();
  });

  it("shows waiting LMU when live mode is active but unavailable", () => {
    render(
      <Topbar
        activeSection="profiles"
        onNavigate={() => {}}
        version="v0.3.9.1"
        sourceStatus={{ kind: "lmu", name: "Le Mans Ultimate", live: true, available: false }}
      />,
    );
    expect(screen.getByText("Esperando LMU")).toBeTruthy();
  });

  it("shows mock when the active source is mock", () => {
    render(
      <Topbar
        activeSection="profiles"
        onNavigate={() => {}}
        version="v0.3.9.1"
        sourceStatus={{ kind: "mock", name: "Mock", live: false, available: true }}
      />,
    );
    expect(screen.getByText("Mock")).toBeTruthy();
  });
});
```

Run:

```powershell
pnpm --dir frontend test -- Topbar
```

Expected: PASS if current labels already match; FAIL only if actual behavior differs.

- [ ] **Step 2: Implement minimal polish only if needed**

Allowed examples:

- Add `title={sourceStatus?.name ?? "Fuente pendiente"}` to the chip.
- Add `aria-label` to the chip.
- Clarify fallback label if current `Mock` is too ambiguous, for example `Mock/demo`.

Do not add a second large status panel. The status remains global/compact.

- [ ] **Step 3: Re-run focused tests**

Run:

```powershell
pnpm --dir frontend test -- Topbar
```

Expected: PASS.

---

## Task 3: Overlay Open Feedback Audit/Fix

Only execute code changes if Task 1 finds a concrete issue. Otherwise document that the current behavior is acceptable.

**Files:**

- Possible Go read: `cmd/vantare/main.go`
- Possible frontend read: `frontend/src/hub/pages/OverlaysStudioPage.tsx`
- Tests next to touched files

- [ ] **Step 1: Verify event behavior**

Inspect the `overlay:start` handler and confirm:

- it calls `EnsureLiveTelemetry()` before opening when live mode is enabled;
- failure logs fallback instead of blocking overlay open;
- it emits `telemetry:source-status` after the attempt.

- [ ] **Step 2: If missing, add a regression test**

If Go behavior is changed, add or update the closest Go test to assert fallback behavior. Keep it narrow.

Run:

```powershell
go test ./internal/app ./cmd/vantare
```

If `cmd/vantare` has no tests and adding one requires large refactor, do not add it; report why.

- [ ] **Step 3: Implement only the missing event/status fix**

Allowed fixes:

- emit source status after a live fallback;
- expose a clearer frontend message while overlay is opening;
- avoid enabling save/dirty state due to preview-only mock scenario changes.

Forbidden fixes:

- new telemetry manager;
- background reconnect loop;
- WebSocket/SSE rewrite;
- retry UI with complex state machine.

---

## Task 4: WidgetStudio Mock Scenario Regression

**Files:**

- Read/modify if needed: `frontend/src/hub/overlays/WidgetStudio.tsx`
- Test: `frontend/src/hub/overlays/WidgetStudio.test.tsx`

- [ ] **Step 1: Ensure the mock selector does not dirty the profile**

There should already be a test equivalent to:

```tsx
fireEvent.click(screen.getByTestId("mock-session-practice"));
expect(onChangeProfile).not.toHaveBeenCalled();
```

If missing or weak, add it.

- [ ] **Step 2: Prefer `aria-pressed` over class checks**

If tests assert active mock scenario by class name, replace with:

```tsx
expect(screen.getByTestId("mock-session-race")).toHaveAttribute("aria-pressed", "true");
```

This resolves the known P3 without visual redesign.

- [ ] **Step 3: Run focused test**

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio
```

Expected: PASS.

---

## Task 5: Final Docs And Checks

**Files:**

- Modify: `docs/mock-live-demo-ux.md` if created
- Modify: `docs/current-plan.md`
- Modify: `docs/roadmap-execution-board.md`

- [ ] **Step 1: Update docs**

`docs/current-plan.md` should record:

- A6 inventory result.
- A7 fixes applied or explicitly not needed.
- Any manual verification still pending.

`docs/roadmap-execution-board.md` should mark:

- A6 as `Done`.
- A7 as `Done` if fixes were applied or not needed.
- A8 as `Next`.

- [ ] **Step 2: Run checks**

Minimum checks:

```powershell
pnpm --dir frontend test -- Topbar WidgetStudio OverlaysStudioPage
pnpm --dir frontend test
pnpm --dir frontend exec tsc -b
pnpm --dir frontend build
pnpm --dir frontend lint
go test ./internal/app ./pkg/config
git diff --check
```

If Go files were touched, also run:

```powershell
go test ./...
```

Expected: all pass. `git diff --check` may print CRLF warnings already known, but must not report whitespace errors.

- [ ] **Step 3: Final report**

Report in Spanish:

- inventory findings;
- files modified/created;
- checks executed;
- checks not executed and why;
- risks;
- manual checklist.

Do not commit, push or tag.

---

## Stop Conditions

Stop and report if:

- fixing source UX requires changing telemetry architecture;
- source state from Wails events is inconsistent or impossible to test without broader refactor;
- changes would touch preview/layout/widget rendering files forbidden above;
- tests fail for a cause unrelated to this task;
- you need to change schema/persistence;
- you find that A3/A5 dirty changes are not actually accepted.

## Manual Verification Checklist

After implementation:

1. Open app without LMU running.
2. Confirm topbar source indicator is understandable.
3. Open overlay from `Mis perfiles`.
4. Confirm overlay opens even if LMU is unavailable.
5. Confirm status remains honest (`Mock`/fallback, not fake live).
6. If LMU is available, start LMU and reopen overlay.
7. Confirm status changes to `LMU conectado` when live source is active.
8. Go to `Widgets` → `Standings`.
9. Switch `Práctica` / `Qualy` / `Carrera`.
10. Confirm preview changes and `Guardar` does not activate from scenario switching alone.
11. Modify a real widget setting and confirm `Guardar` activates.

