# S4.6 WidgetStudio Explicit Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable autosave only in `WidgetStudio` so widget settings use explicit save, while keeping LayoutStudio autosave behavior intact.

**Architecture:** Add an `autosave` option to the shared `useOverlayStudioState` hook. `OverlaysStudioPage` passes `autosave: mode !== "widgets"` so WidgetStudio edits mark the profile dirty and enable the existing Save button, but no timer persists automatically.

**Tech Stack:** React, TypeScript, Vitest, existing Wails event mock tests.

---

## Context

Observed bug:

- In WidgetStudio, clicking controls such as selects/switches changes state.
- The shared autosave timer fires after 800ms.
- The profile refresh/rerender causes native controls to lose focus/selection or appear deselected.

Analysis:

- Autosave is in `frontend/src/hub/overlays/useOverlayStudioState.ts`.
- The existing Save button and Ctrl+S already call `saveProfile()`.
- The smallest safe change is to make autosave optional and disable it only when `mode === "widgets"`.

## Scope

Allowed files:

- `frontend/src/hub/overlays/useOverlayStudioState.ts`
- `frontend/src/hub/overlays/useOverlayStudioState.test.tsx`
- `frontend/src/hub/pages/OverlaysStudioPage.tsx`
- `frontend/src/hub/overlays/WidgetStudio.test.tsx` only if needed to cover Save button behavior

Prefer the smallest possible change.

## Do Not Edit

Do not modify:

- `WidgetStudio.tsx` unless a test proves it is required
- `LayoutStudio.tsx`
- `RelativeSettingsSection.tsx`
- `WidgetSettingsPanel.tsx`
- `StandingsWidget.tsx`
- S4.5 mock scenario files
- backend Go files
- schema files
- configs
- `docs/current-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/marketing`
- `docs/INTEGRATION_ANALYSIS.md`

No dependencies. No commits. No staging.

## Required Docs To Read

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/feature-architecture-map.md`
- `docs/widget-preview-bug-log.md`
- `docs/superpowers/plans/2026-06-23-s4-5-preview-mock-session-scenarios.md`

## Functional Requirements

1. `useOverlayStudioState()` keeps current default behavior: autosave enabled.
2. `useOverlayStudioState({ autosave: false })` must never emit `layout:save` via timer.
3. `saveProfile()` must still emit `layout:save` when called explicitly.
4. `OverlaysStudioPage` must disable autosave only when `mode === "widgets"`.
5. LayoutStudio must keep autosave behavior.
6. WidgetStudio controls must mark dirty and enable existing Save button.
7. S4.5 mock session selector remains preview-only and must not mark dirty.
8. No backend/schema/config changes.

## Task 1: Add Autosave Option To Hook With Tests

**Files:**

- Modify: `frontend/src/hub/overlays/useOverlayStudioState.ts`
- Modify: `frontend/src/hub/overlays/useOverlayStudioState.test.tsx`

- [ ] **Step 1: Add failing tests for autosave true and false**

In `useOverlayStudioState.test.tsx`, add tests using fake timers.

Required test behavior:

```ts
it("auto-saves dirty profiles by default after debounce", async () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  mockEventsEmit(emit);

  const { result } = renderHook(() => useOverlayStudioState());

  act(() => {
    result.current.loadProfile(profileFixture());
  });

  act(() => {
    result.current.updateDraft({
      ...result.current.profile!,
      widgets: [
        {
          ...result.current.profile!.widgets[0],
          name: "changed",
        },
      ],
    });
  });

  expect(emit).not.toHaveBeenCalledWith("layout:save", expect.anything());

  await act(async () => {
    vi.advanceTimersByTime(900);
  });

  expect(emit).toHaveBeenCalledWith("layout:save", expect.anything());
  vi.useRealTimers();
});

it("does not auto-save when autosave is disabled", async () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  mockEventsEmit(emit);

  const { result } = renderHook(() => useOverlayStudioState({ autosave: false }));

  act(() => {
    result.current.loadProfile(profileFixture());
  });

  act(() => {
    result.current.updateDraft({
      ...result.current.profile!,
      widgets: [
        {
          ...result.current.profile!.widgets[0],
          name: "changed",
        },
      ],
    });
  });

  await act(async () => {
    vi.advanceTimersByTime(1200);
  });

  expect(emit).not.toHaveBeenCalledWith("layout:save", expect.anything());

  act(() => {
    result.current.saveProfile();
  });

  expect(emit).toHaveBeenCalledWith("layout:save", expect.anything());
  vi.useRealTimers();
});
```

Adapt helper names to the existing test file. Do not weaken existing tests.

- [ ] **Step 2: Run the hook test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- useOverlayStudioState
```

Expected: FAIL because `useOverlayStudioState` does not accept `autosave`.

- [ ] **Step 3: Implement hook option**

In `useOverlayStudioState.ts`, add:

```ts
type UseOverlayStudioStateOptions = {
  autosave?: boolean;
};
```

Change the hook signature:

```ts
export function useOverlayStudioState(options: UseOverlayStudioStateOptions = {}) {
  const { autosave = true } = options;
```

Update the autosave effect:

```ts
useEffect(() => {
  if (!autosave || !dirty) return;
  const id = window.setTimeout(() => saveProfile(), 800);
  return () => window.clearTimeout(id);
}, [autosave, dirty, profile, saveProfile]);
```

Do not change `saveProfile`, `updateDraft`, `loadProfile`, undo/redo or Wails event names.

- [ ] **Step 4: Run hook tests**

Run:

```powershell
pnpm --dir frontend test -- useOverlayStudioState
```

Expected: PASS.

## Task 2: Disable Autosave Only In WidgetStudio Mode

**Files:**

- Modify: `frontend/src/hub/pages/OverlaysStudioPage.tsx`
- Modify tests only if an existing page-level test covers mode behavior

- [ ] **Step 1: Update hook usage**

In `OverlaysStudioPage.tsx`, change:

```ts
const studio = useOverlayStudioState();
```

to:

```ts
const studio = useOverlayStudioState({ autosave: mode !== "widgets" });
```

The hook call remains unconditional, so React hook rules are respected.

- [ ] **Step 2: Run relevant tests**

Run:

```powershell
pnpm --dir frontend test -- useOverlayStudioState WidgetStudio LayoutStudio
```

Expected: PASS.

## Task 3: WidgetStudio Save Behavior Regression

**Files:**

- Modify: `frontend/src/hub/overlays/WidgetStudio.test.tsx` only if not already covered

- [ ] **Step 1: Verify existing tests**

Search for tests that prove:

- changing real widget settings calls `onChangeProfile`;
- Save button becomes enabled when `dirty={true}`;
- clicking Save calls `onSave`;
- changing mock session scenario does not call `onChangeProfile`.

If all are already present, do not add duplicate tests.

- [ ] **Step 2: Add missing minimal test only if needed**

If Save button behavior is missing, add a test that renders `WidgetStudio` with `dirty={true}` and verifies clicking `Guardar` calls `onSave`.

Do not test implementation details such as CSS classes.

## Task 4: Final Checks

- [ ] **Step 1: Run focused tests**

```powershell
pnpm --dir frontend test -- useOverlayStudioState WidgetStudio LayoutStudio
```

Expected: PASS.

- [ ] **Step 2: Run frontend type-check**

```powershell
pnpm --dir frontend exec tsc -b
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

```powershell
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 4: Run whitespace check**

```powershell
git diff --check
```

Expected: exit code 0. CRLF warnings may be reported, but whitespace errors must be fixed.

## Manual Verification

After implementation and rebuild:

1. Open `Overlays Studio` -> `Widgets`.
2. Select `relative` or `standings`.
3. Change a real setting such as a column switch or filter select.
4. Confirm the control stays selected/focused and does not bounce.
5. Confirm `Guardar` becomes enabled.
6. Wait more than 1 second.
7. Confirm it did not save automatically.
8. Click `Guardar`.
9. Confirm it saves and the saved state is reflected.
10. Change S4.5 mock session selector.
11. Confirm `Guardar` does not become enabled.
12. Open `LayoutStudio` and confirm layout autosave still works as before.

## Required Final Report

Report in Spanish:

- files modified;
- checks executed and results;
- checks not executed and why;
- confirmation that WidgetStudio autosave is disabled;
- confirmation that LayoutStudio autosave remains enabled;
- confirmation that explicit Save and Ctrl+S still work;
- risks or doubts;
- manual verification steps.

## Review Handoff

After implementation, do not self-approve. The orchestrator will send the diff/report to GLM for review.

