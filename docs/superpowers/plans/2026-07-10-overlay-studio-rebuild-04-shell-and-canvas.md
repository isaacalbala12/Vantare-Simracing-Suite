# Overlay Studio V3 Phase 4 Shell and Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V10-inspired editor workspace and a production-grade 1920x1080 canvas around the V3 store and shared visual host.

**Architecture:** The shell composes focused left catalog/list, central canvas and right inspector slot. Canvas math is pure, pointer interactions keep transient geometry outside history and dispatch one command on completion, while preview controls live in the editor-only context.

**Tech Stack:** React 19, TypeScript, Pointer Events, Tailwind/CSS, Vitest, Testing Library, Playwright library harness.

---

## Context capsule

- Phase 3 global draft/store is green.
- Only Delta renders through V3; unsupported widgets display diagnostics until Phase 6.
- Build V3 components under `hub/overlay-studio`; do not rewrite legacy `LayoutStudio`.
- `layout-studio-v10.html` is visual reference, never a source of production JavaScript or remote assets.

### Task 4.1: Build the modular V3 workbench shell

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/OverlayStudioV3.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/OverlayStudioV3.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/StudioHeader.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/StudioHeader.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/WidgetListPanel.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/WidgetListPanel.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/InspectorSlot.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/overlay-studio-v3.css`
- Modify: `vantare-v2/frontend/src/index.css`

- [ ] **Step 1: Write failing shell tests**

With an injected Delta profile, assert:

- real Vantare shell remains outside this component;
- compact profile selector is in the editor header;
- Save state/button, Undo and Redo are visible and wired;
- left widget panel, canvas slot and inspector slot exist;
- selected widget row is reflected in the canvas/inspector IDs;
- no WidgetStudio label or local “Save to widget” button exists;
- header menu exposes Manage profiles, Recommended, Community and OBS;
- changing profile calls dirty guard rather than loading directly.

- [ ] **Step 2: Verify RED**

```powershell
pnpm --dir vantare-v2/frontend test -- OverlayStudioV3.test.tsx StudioHeader.test.tsx WidgetListPanel.test.tsx
```

- [ ] **Step 3: Implement composition contracts**

`OverlayStudioV3` consumes the contexts from Phase 3 and composes:

```tsx
<div data-testid="overlay-studio-v3" className="osv3-workbench">
  <StudioHeader />
  <main className="osv3-grid">
    <WidgetListPanel />
    <section data-testid="studio-canvas-slot" className="osv3-canvas-column" />
    <InspectorSlot />
  </main>
</div>
```

CSS target at >=1440px is `240px minmax(640px, 1fr) 360px`; preserve real topbar height and use minimum viewport height rather than a second full-screen shell.

- [ ] **Step 4: Implement header behavior**

Save is enabled only when dirty and not saving. Undo/redo reflect store capabilities. Profile selector receives entries through props and calls a guarded `onRequestProfileChange(file)`. Session selector contains all five session layouts and never dirties by switching alone.

- [ ] **Step 5: Implement list behavior**

Render active-layout widgets ordered by z-index. Row click selects one widget. Each row shows enabled/hidden and system badge. Search is editor-only. No future/fake widgets appear. Preserved legacy widgets appear in a separate read-only warning group with type/ID, cannot be selected as V3 widgets and are never offered by Add Widget.

- [ ] **Step 6: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- OverlayStudioV3.test.tsx StudioHeader.test.tsx WidgetListPanel.test.tsx
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/hub/overlay-studio/OverlayStudioV3.tsx vantare-v2/frontend/src/hub/overlay-studio/OverlayStudioV3.test.tsx vantare-v2/frontend/src/hub/overlay-studio/components vantare-v2/frontend/src/hub/overlay-studio/overlay-studio-v3.css vantare-v2/frontend/src/index.css
git commit -m "feat(studio): add modular V3 workbench shell"
```

### Task 4.2: Implement pure canvas geometry, snapping and resize

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-geometry.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-geometry.test.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-snap.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-snap.test.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-resize.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-resize.test.ts`

- [ ] **Step 1: Write failing geometry tests**

Cover:

- Fit scale for container width/height with no upscaling above 100%;
- explicit 50/75/100/125 zoom;
- client point to logical coordinates at every zoom;
- 8px grid snapping;
- edge and center guides against canvas and sibling widgets within 6px;
- `Alt` disables all snapping;
- at least 32x32 remains recoverable after move;
- min size comes from widget capability;
- aspect-locked corner resize preserves ratio;
- unlocked resize changes width/height independently only when capability allows;
- negative positions may remain partially outside;
- calculations never return NaN/Infinity.

- [ ] **Step 2: Verify RED**

```powershell
pnpm --dir vantare-v2/frontend test -- canvas-geometry.test.ts canvas-snap.test.ts canvas-resize.test.ts
```

- [ ] **Step 3: Implement constants and APIs**

```ts
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const GRID_SIZE = 8;
export const SNAP_TOLERANCE = 6;
export const MINIMUM_VISIBLE = 32;

export function resolveCanvasScale(input: { containerWidth: number; containerHeight: number; zoom: StudioPreviewState["zoom"] }): number;
export function clientToLogical(point: Point, canvasRect: DOMRectLike, scale: number): Point;
export function clampRecoverableLayout(layout: WidgetLayoutV3): WidgetLayoutV3;
export function snapWidgetLayout(input: SnapInput): SnapResult;
export function resizeWidgetLayout(input: ResizeInput): WidgetLayoutV3;
```

`SnapResult` returns the layout plus horizontal/vertical guide descriptors for visual rendering.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- canvas-geometry.test.ts canvas-snap.test.ts canvas-resize.test.ts
git add vantare-v2/frontend/src/hub/overlay-studio/canvas
git commit -m "feat(studio): add deterministic canvas geometry"
```

### Task 4.3: Render the canvas and shared widgets

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioCanvas.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioCanvas.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/CanvasGuides.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioTelemetryProvider.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioTelemetryProvider.test.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/OverlayStudioV3.tsx`

- [ ] **Step 1: Write failing render tests**

Assert:

- 1920x1080 logical scene scales into viewport;
- widget frame uses layout x/y/w/h/zIndex;
- frame contains the Phase 2 `WidgetVisualHost` with `renderMode=studio`;
- frame selection chrome is outside the host;
- disabled widgets remain selectable in Studio but render a hidden-state badge;
- clicking empty canvas clears selection;
- sorted z-order matches document;
- source snapshot comes from an injected Studio telemetry provider, not widget-local hooks.

- [ ] **Step 2: Implement canvas and frame**

The logical scene has fixed dimensions and one scale transform. Frame owns absolute placement. Inside the frame, size the host surface to 100% and apply any widget intrinsic scale in one focused helper, not in system renderers.

Add `StudioTelemetryProvider` with injected mock/live `TelemetryStore` values and a `liveAvailable` flag. It selects a store from Phase 3 preview source state and exposes `useStudioTelemetrySnapshot`; this provider does not own document state. Use stable IDs:

```text
studio-canvas-viewport
studio-canvas-scene
studio-widget-frame-<id>
studio-widget-visual-<id>
```

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- StudioTelemetryProvider.test.tsx StudioCanvas.test.tsx StudioWidgetFrame.test.tsx OverlayStudioV3.test.tsx
git add vantare-v2/frontend/src/hub/overlay-studio/canvas vantare-v2/frontend/src/hub/overlay-studio/OverlayStudioV3.tsx
git commit -m "feat(studio): render V3 widgets on shared canvas"
```

### Task 4.4: Add pointer drag/resize as one history transaction

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.test.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioCanvas.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.tsx`

- [ ] **Step 1: Write failing interaction tests**

Simulate Pointer Events and assert:

- pointer-down selects and captures pointer;
- pointer-move updates transient frame geometry without dispatching commands;
- pointer-up dispatches exactly one `widget/layout` command;
- no movement dispatches nothing;
- Escape restores starting geometry and dispatches nothing;
- lost pointer capture cancels safely;
- resize uses aspect lock/capability/min size;
- Alt bypasses snap;
- guides appear only during interaction;
- unmount removes listeners/capture state.

- [ ] **Step 2: Verify RED**

```powershell
pnpm --dir vantare-v2/frontend test -- useCanvasInteraction.test.tsx StudioWidgetFrame.test.tsx
```

- [ ] **Step 3: Implement an explicit interaction state machine**

```ts
export type CanvasInteraction =
  | { kind: "idle" }
  | { kind: "move"; widgetId: string; pointerId: number; start: WidgetLayoutV3; preview: WidgetLayoutV3 }
  | { kind: "resize"; widgetId: string; pointerId: number; handle: ResizeHandle; start: WidgetLayoutV3; preview: WidgetLayoutV3 };
```

Do not mutate DOM through `document.querySelector`. Render preview geometry from local interaction state. Commit through the global store only on successful pointer-up.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- useCanvasInteraction.test.tsx StudioCanvas.test.tsx StudioWidgetFrame.test.tsx studio-history.test.ts
git add vantare-v2/frontend/src/hub/overlay-studio/canvas
git commit -m "feat(studio): add transactional canvas interactions"
```

### Task 4.5: Add canvas actions, z-order and keyboard integration

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/widget-actions.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/widget-actions.test.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/WidgetContextMenu.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/WidgetContextMenu.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/CanvasActionBar.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioCanvas.tsx`

- [ ] **Step 1: Write failing shared-action tests**

One function map must power context menu, action bar and keyboard:

```ts
export type WidgetActionId =
  | "duplicate" | "delete" | "reset-layout" | "center"
  | "front" | "forward" | "backward" | "back";
```

Test identical command payloads from each UI entry point. Delete requires confirmation through injected confirmer. Center keeps size and sets logical center. Reset layout uses saved snapshot. Duplicate selects the new ID. Right-click computes all frames under the logical pointer in descending z-order and offers a “Select layer” submenu so fully overlapping widgets remain selectable.

- [ ] **Step 2: Implement action factory and UIs**

Context menu opens on right-click and closes on Escape/outside click. Action bar shows only for selection. Neither contains numeric coordinates. Use the Phase 3 hotkey policy for Delete, Ctrl+D and arrow moves.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- widget-actions.test.ts WidgetContextMenu.test.tsx StudioCanvas.test.tsx
git add vantare-v2/frontend/src/hub/overlay-studio/canvas
git commit -m "feat(studio): unify widget canvas actions"
```

### Task 4.6: Add editor-only zoom, backgrounds, safe area and Mock/Live controls

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-backgrounds.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-backgrounds.test.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/CanvasToolbar.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/CanvasToolbar.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/PreviewSourceControls.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/canvas/PreviewSourceControls.test.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioCanvas.tsx`

- [ ] **Step 1: Write failing preview-control tests**

Assert:

- Fit, minus, percentage, plus update preview context only;
- safe area and background never dirty document;
- safe area uses a 5% inset on every side and is editor-only;
- backgrounds registry contains local `grid` and `solid-black` with no HTTP URL;
- Mock exposes Practice/Qualifying/Race and Track/Pits;
- Live is disabled with explanation when LMU unavailable;
- losing LMU while Live keeps source Live and renders disconnected snapshot;
- changing mock dimensions updates Delta content but never save state.

- [ ] **Step 2: Implement local backgrounds**

```ts
export const CANVAS_BACKGROUNDS = [
  { id: "grid", labelKey: "studio.background.grid", kind: "css", className: "osv3-bg-grid" },
  { id: "solid-black", labelKey: "studio.background.black", kind: "css", className: "osv3-bg-black" },
] as const;
```

Future user-provided images can add `{kind:"image", src: localImport}` without changing profile schema.

- [ ] **Step 3: Implement toolbars**

Canvas top toolbar owns zoom/background/safe-area. Bottom toolbar owns system indicator shortcut, Mock/Live and Browser View placeholder callback. The design indicator never duplicates the design selector.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- canvas-backgrounds.test.ts CanvasToolbar.test.tsx PreviewSourceControls.test.tsx StudioCanvas.test.tsx
git add vantare-v2/frontend/src/hub/overlay-studio/canvas
git commit -m "feat(studio): add non-persistent preview controls"
```

### Task 4.7: Add dirty/recovery modals and responsive panel modes

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/DirtyChangesDialog.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/DirtyChangesDialog.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/RecoveryDialog.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/RecoveryDialog.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/ResponsivePanelControls.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/components/ResponsivePanelControls.test.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/OverlayStudioV3.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/overlay-studio-v3.css`

- [ ] **Step 1: Write failing modal tests**

Dirty dialog has Save/Discard/Cancel with correct Phase 3 orchestration. Recovery dialog shows profile name/time and Recover/Discard; stale revision adds warning. Failed save keeps dialog open and draft intact.

- [ ] **Step 2: Write failing responsive tests**

Contract:

- >=1440: three persistent columns;
- 960..1439: left persistent, inspector collapsible overlay;
- <960: canvas primary, widget list and inspector in mutually exclusive drawers;
- selection may open inspector drawer on small screens;
- drawers trap/restore focus and close with Escape.

Use class/state assertions in Vitest; browser geometry is Task 4.8.

- [ ] **Step 3: Implement modals and responsive state**

Install `beforeunload` only while dirty. Internal navigation always uses custom Save/Discard/Cancel; browser native prompt is fallback only for actual window close.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- DirtyChangesDialog.test.tsx RecoveryDialog.test.tsx ResponsivePanelControls.test.tsx OverlayStudioV3.test.tsx
git add vantare-v2/frontend/src/hub/overlay-studio/components vantare-v2/frontend/src/hub/overlay-studio/OverlayStudioV3.tsx vantare-v2/frontend/src/hub/overlay-studio/overlay-studio-v3.css
git commit -m "feat(studio): add safe navigation and responsive panels"
```

### Task 4.8: Extend browser harness for canvas geometry

**Files:**
- Modify: `vantare-v2/frontend/src/overlay-harness/OverlayParityHarness.tsx`
- Modify: `vantare-v2/frontend/scripts/overlay-studio-visual.mjs`
- Create: `vantare-v2/frontend/testdata/overlay-studio-visual/studio-wide.png`
- Create: `vantare-v2/frontend/testdata/overlay-studio-visual/studio-medium.png`
- Create: `vantare-v2/frontend/testdata/overlay-studio-visual/studio-small.png`

- [ ] **Step 1: Add a Studio route to harness**

Render the real V3 shell with an in-memory profile client. Add deterministic `data-testid` markers for viewport/scene/frame/resize handle.

- [ ] **Step 2: Add browser assertions**

At 1920x1080, 1200x800 and 800x700 assert:

- intended panel mode;
- canvas aspect ratio;
- Delta frame bounding box aligns with its visual host;
- a simulated drag commits once and moves expected logical distance;
- aspect-locked resize preserves ratio;
- no horizontal page overflow;
- screenshots match reviewed baselines.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend visual:overlay-studio:update
pnpm --dir vantare-v2/frontend visual:overlay-studio
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/overlay-harness/OverlayParityHarness.tsx vantare-v2/frontend/scripts/overlay-studio-visual.mjs vantare-v2/frontend/testdata/overlay-studio-visual
git commit -m "test(studio): cover responsive canvas geometry"
```

## Phase 4 review gate

- [ ] Run full frontend tests/build/lint and visual harness twice.
- [ ] Confirm drag/resize commits exactly one history command.
- [ ] Confirm no `document.querySelector` or DOM mutation drives interaction state.
- [ ] Confirm no numeric X/Y/W/H input exists.
- [ ] Confirm backgrounds/mock/zoom/safe-area do not change dirty state.
- [ ] Confirm responsive modes and focus behavior.
- [ ] Compare wide screenshot composition with `layout-studio-v10.html`.
- [ ] Perform the master phase code-review brief.
- [ ] Fix P0/P1 and resolve or record P2 findings.
- [ ] Update `vantare-v2/docs/current-plan.md` and mark Phase 4 green.
