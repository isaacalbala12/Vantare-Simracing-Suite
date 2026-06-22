# A1 WidgetStudio LayoutStudio Separation Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify that `WidgetStudio` and `LayoutStudio` still keep strict responsibility boundaries after the Relative, preview and schema v2 work.

**Architecture:** This is a verification/inventory task, not a feature implementation. The worker must inspect UI code, tests and relevant docs, then produce a factual report. Code edits are forbidden unless the orchestrator explicitly approves a follow-up bugfix plan.

**Tech Stack:** React/TypeScript frontend, Go/Wails app, Markdown docs, Vitest tests.

---

## Scope

This task verifies separation of responsibilities:

- `WidgetStudio` may edit widget internals: appearance, data, columns, filters, formats, variants.
- `WidgetStudio` must not edit layout/global instance controls: X/Y/W/H, delete widget, drag/resize, open/stop overlay.
- `LayoutStudio` may edit layout/global instance controls: position, size, placement, open/stop overlay for active profile.
- `LayoutStudio` must not edit widget internals: columns, metrics, formats, filters.

## Do Not Edit

Do not modify code.

Do not modify:

- `frontend/src/**`
- `internal/**`
- `pkg/**`
- `configs/**`
- `docs/marketing/**`
- `docs/INTEGRATION_ANALYSIS.md`

Allowed output:

- a written report in the worker response;
- optionally create `docs/audits/a1-widgetstudio-layoutstudio-separation.md` only if the orchestrator/user explicitly asks for an artifact. Otherwise do not create files.

## Files To Inspect

Read these first:

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/master-feature-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/feature-architecture-map.md`
- `docs/widget-preview-bug-log.md`

Inspect likely frontend files:

- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
- `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- `frontend/src/hub/preview/PreviewCanvas.tsx` if present
- `frontend/src/hub/preview/ProfilePreview.tsx` if present
- any `LayoutStudio` files found by `rg -n "LayoutStudio|layout studio|showPositionControls|position|resize|drag|delete" frontend/src`

Inspect relevant tests:

- `frontend/src/hub/overlays/WidgetStudio.test.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`
- `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`
- any `LayoutStudio` tests found by `rg --files frontend/src | rg "LayoutStudio|PreviewCanvas|layout"`

## Task 1: Establish Current UI Ownership

- [ ] **Step 1: Search for relevant files**

Run:

```powershell
rg --files frontend/src | rg "WidgetStudio|WidgetSettings|RelativeSettings|LayoutStudio|PreviewCanvas|PreviewWidgetFrame|WidgetPreviewPanel|WidgetSandboxPreview|ProfilePreview"
```

Expected:

- list of files to inspect;
- if no `LayoutStudio` file exists, report that layout editing may still be represented by `PreviewCanvas` or another component.

- [ ] **Step 2: Search for forbidden WidgetStudio controls**

Run:

```powershell
rg -n "position|x\\b|y\\b|\\bw\\b|\\bh\\b|width|height|resize|drag|delete|remove|duplicate|showPositionControls|open overlay|Abrir overlay|Detener overlay|overlay:start|overlay:stop" frontend/src/hub/overlays frontend/src/hub/preview
```

Expected:

- identify whether forbidden controls appear in `WidgetStudio` or only in allowed layout/profile preview areas.
- false positives are expected; classify them manually.

- [ ] **Step 3: Search for forbidden LayoutStudio/widget-internal controls**

Run:

```powershell
rg -n "columns|column|metric|filters|format|bestLap|lastLap|relative|standings|variant|variantId" frontend/src/hub frontend/src/overlay
```

Expected:

- identify whether widget-internal controls appear in `LayoutStudio` or only in `WidgetStudio`/renderers.
- false positives are expected; classify them manually.

## Task 2: Inspect Components

- [ ] **Step 1: Inspect WidgetStudio**

Read `WidgetStudio.tsx` and answer:

- Does it render layout controls directly?
- Does it pass `position` only as read/render data or does it mutate X/Y/W/H?
- Does it expose delete/remove/duplicate widget?
- Does it expose live overlay start/stop?
- Does it keep `WidgetSettingsPanel` focused on widget internals?

- [ ] **Step 2: Inspect WidgetSettingsPanel**

Read `WidgetSettingsPanel.tsx` and answer:

- Which sections are rendered?
- Are there controls for X/Y/W/H?
- Are there controls for deleting widgets?
- Are Relative controls scoped to variant/internal config?
- Are generic appearance controls scoped to widget props/appearance and not layout position?

- [ ] **Step 3: Inspect RelativeSettingsSection**

Read `RelativeSettingsSection.tsx` and answer:

- Does it write only to variant columns/filters/formats?
- Does it avoid `widget.position` mutation?
- Does it avoid layout size changes?

- [ ] **Step 4: Inspect LayoutStudio or equivalent**

Find layout editor files and answer:

- Where are drag/resize/position controls implemented?
- Does that area expose columns, metrics, filters or formats?
- Does it open/stop overlay only in allowed layout/profile flows?

## Task 3: Inspect Tests

- [ ] **Step 1: Check existing safeguards**

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio WidgetSettingsPanel WidgetPreviewPanel
```

Expected:

- PASS.
- If tests fail, stop and report the failure. Do not fix.

- [ ] **Step 2: Inspect test coverage**

Answer:

- Is there a test proving `WidgetStudio` does not expose position controls?
- Is there a test proving `WidgetSettingsPanel` still mounts internal widget controls?
- Is there a test proving preview no longer uses `PreviewWidgetFrame` inside `WidgetStudio`?
- Is there a test proving layout/profile previews still use layout frame/chrome?

## Task 4: Produce Report

- [ ] **Step 1: Write final report in Spanish**

The report must include:

- verdict: `PASS`, `PASS with P3 follow-ups`, or `FAIL`;
- findings by severity `P0/P1/P2/P3`;
- exact files and line references for each finding;
- list of files inspected;
- commands executed and results;
- commands not executed and why;
- manual verification checklist for the user;
- recommendation: proceed to `S1 - Standings inventario tecnico` or create a bugfix miniplan first.

## Acceptance Criteria

This task is complete when:

- worker inspected the required docs and files;
- worker ran the focused frontend test command or reported why it could not;
- worker produced a clear Spanish report;
- no code was modified;
- any needed fixes are described as follow-up miniplans, not applied directly.

## Manual Verification Checklist

If the report is `PASS`, the user/orchestrator should verify:

1. Open app.
2. Go to `Overlays Studio`.
3. Enter `Widgets`.
4. Select `relative`.
5. Confirm no X/Y/W/H, drag, resize, delete or open/stop overlay controls exist in `WidgetStudio`.
6. Go to `LayoutStudio`.
7. Confirm moving/resizing is available there.
8. Confirm no Relative columns/filters/formats controls appear in `LayoutStudio`.

## Next Step

If this plan passes:

- mark `A1` as `Done` in `docs/roadmap-execution-board.md`;
- update `docs/current-plan.md`;
- proceed to `S1 - Standings inventario tecnico`.

If this plan fails:

- create a small bugfix miniplan for the specific boundary violation.
