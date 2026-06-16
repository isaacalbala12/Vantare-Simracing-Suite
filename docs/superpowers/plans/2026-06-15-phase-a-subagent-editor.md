> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Implement the tasks in this plan and stop. Do NOT proceed to other subagent plans. Do NOT run the release task.

# Subagent Plan — EditorAgent

**Goal:** Complete the visual editor for the Preview Workbench: snap drag, resize, inspector, save flow, undo/redo, and auto-save.

**Context:** This is part of Fase A in `docs/superpowers/plans/2026-06-15-phase-a-lmu-alpha-master.md`. Implement only Tasks 1–4 from the master plan.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, Wails v3 runtime events.

**Definition of done for this subagent:**
1. All steps below are checked off.
2. Frontend tests pass.
3. Frontend build passes (no TS errors).
4. Code is left in a state ready for the Main agent to review with the code-review-and-quality skill before any release.

---

## Task 1: Snap Drag and Canvas Boundaries

**Files:**
- Create: `vantare-v2/frontend/src/lib/canvas-math.ts`
- Modify: `vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- Modify: `vantare-v2/frontend/src/hub/preview/PreviewCanvas.tsx`
- Test: `vantare-v2/frontend/src/hub/preview/PreviewCanvas.test.tsx`

- [ ] **Step 1: Create canvas-math.ts**

```typescript
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const SNAP_PX = 8;

export function snap(value: number, grid = SNAP_PX): number {
  return Math.round(value / grid) * grid;
}

export function clampPosition(
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, CANVAS_WIDTH - w)),
    y: Math.max(0, Math.min(y, CANVAS_HEIGHT - h)),
  };
}
```

- [ ] **Step 2: Wire snap and clamp into PreviewWidgetFrame**

Locate the drag handler that computes `newX`/`newY`. After computing, apply:

```typescript
const { x, y } = clampPosition(snap(newX), snap(newY), position.w, position.h);
onChangePosition(widgetId, { ...position, x, y });
```

- [ ] **Step 3: Add tests**

In `PreviewCanvas.test.tsx`:

```typescript
it("snaps dragged position to 8px grid", () => {
  // start at 0,0; drag to 15,23; expect 16,24
});

it("clamps widget inside canvas bounds", () => {
  // drag beyond bottom-right; expect max x = 1820, y = 980 for 100x100 widget
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --dir vantare-v2/frontend test
```

- [ ] **Step 5: Commit**

```bash
git add vantare-v2/frontend/src/lib/canvas-math.ts \
        vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.tsx \
        vantare-v2/frontend/src/hub/preview/PreviewCanvas.test.tsx
git commit -m "feat(preview): snap drag to 8px grid and clamp to canvas"
```

---

## Task 2: Fixed-Ratio Resize

**Files:**
- Modify: `vantare-v2/frontend/src/lib/canvas-math.ts`
- Modify: `vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- Create: `vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.test.tsx`

- [ ] **Step 1: Add ratio helpers**

```typescript
export const WIDGET_MIN_SIZE = { w: 80, h: 40 };

export const WIDGET_RATIOS: Record<string, number | null> = {
  standings: null,
  relative: 0.5,
  delta: 4,
  telemetry: 2,
  "telemetry-vertical": 0.5,
  pedals: 2,
};

export function resizeWithRatio(
  type: string,
  startW: number,
  startH: number,
  deltaX: number,
  deltaY: number,
): { w: number; h: number } {
  const ratio = WIDGET_RATIOS[type] ?? null;
  if (ratio == null) {
    return {
      w: Math.max(WIDGET_MIN_SIZE.w, startW + deltaX),
      h: Math.max(WIDGET_MIN_SIZE.h, startH + deltaY),
    };
  }
  const h = Math.max(WIDGET_MIN_SIZE.h, startH + deltaY);
  const w = Math.max(WIDGET_MIN_SIZE.w, Math.round(h * ratio));
  return { w, h };
}

export function clampSize(
  w: number,
  h: number,
  x: number,
  y: number,
): { w: number; h: number; x: number; y: number } {
  const maxW = CANVAS_WIDTH - x;
  const maxH = CANVAS_HEIGHT - y;
  return {
    w: Math.min(w, maxW),
    h: Math.min(h, maxH),
    x,
    y,
  };
}
```

- [ ] **Step 2: Add bottom-right resize handle to PreviewWidgetFrame**

Render a 10x10 handle at bottom-right. On `mousedown`, set resize state. On `mousemove`, call `resizeWithRatio` and `clampSize`. On `mouseup`, call `onChangePosition`.

- [ ] **Step 3: Write tests**

```typescript
it("maintains 4:1 ratio for delta widget", () => { ... });
it("enforces minimum size 80x40", () => { ... });
it("allows free resize for standings", () => { ... });
it("clamps size to canvas edges", () => { ... });
```

- [ ] **Step 4: Run tests and commit**

```bash
pnpm --dir vantare-v2/frontend test
git add vantare-v2/frontend/src/lib/canvas-math.ts \
        vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.tsx \
        vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.test.tsx
git commit -m "feat(preview): add bottom-right resize with fixed ratios"
```

---

## Task 3: Inspector Improvements

**Files:**
- Modify: `vantare-v2/frontend/src/hub/preview/PreviewInspector.tsx`
- Modify: `vantare-v2/frontend/src/hub/preview/WidgetList.tsx`
- Modify: `vantare-v2/frontend/src/hub/pages/PreviewPage.tsx`
- Create: `vantare-v2/frontend/src/hub/preview/PreviewInspector.test.tsx`

- [ ] **Step 1: Add name and updateHz inputs**

In `PreviewInspector.tsx`, add:

```typescript
<input
  value={widget.name}
  onChange={(e) => updateWidget({ ...widget, name: e.target.value })}
/>
<input
  type="number"
  min={1}
  max={120}
  value={widget.updateHz ?? 60}
  onChange={(e) => updateWidget({ ...widget, updateHz: Number(e.target.value) })}
/>
```

- [ ] **Step 2: Show type, add duplicate, reset, delete**

```typescript
<div className="text-xs text-vantare-textMuted">Type: {widget.type}</div>
<button onClick={() => onDuplicate(widget)}>Duplicar</button>
<button onClick={() => onReset(widget)}>Reset posición</button>
<button onClick={() => { if (window.confirm("¿Eliminar widget?")) onDelete(widget.id); }}>
  Eliminar
</button>
```

- [ ] **Step 3: Implement handlers in PreviewPage**

```typescript
function duplicateWidget(widget: WidgetConfig) {
  const copy = { ...widget, id: crypto.randomUUID(), name: `${widget.name} copy` };
  updateDraft({ ...profile, widgets: [...profile.widgets, copy] });
}

function resetWidget(widget: WidgetConfig) {
  const reset = { ...widget, position: { ...widget.position, x: 0, y: 0 } };
  updateDraft({ ...profile, widgets: profile.widgets.map((w) => (w.id === reset.id ? reset : w)) });
}

function deleteWidget(id: string) {
  updateDraft({ ...profile, widgets: profile.widgets.filter((w) => w.id !== id) });
  if (selectedWidgetId === id) setSelectedWidgetId(null);
}
```

- [ ] **Step 4: Add "add widget" button to WidgetList**

```typescript
function addWidget(type: string) {
  const newWidget: WidgetConfig = {
    id: crypto.randomUUID(),
    type,
    name: `Nuevo ${type}`,
    enabled: true,
    position: { x: 0, y: 0, w: 200, h: 100 },
    updateHz: 60,
  };
  updateDraft({ ...profile, widgets: [...profile.widgets, newWidget] });
  setSelectedWidgetId(newWidget.id);
}
```

- [ ] **Step 5: Improve numeric input UX**

Add `step={8}` and keydown handler for arrow nudge. Shift+arrow moves 10px.

- [ ] **Step 6: Write tests**

```typescript
it("renames widget from inspector", () => { ... });
it("duplicates selected widget", () => { ... });
it("deletes widget after confirm", () => { ... });
it("resets widget position", () => { ... });
it("adds widget from WidgetList", () => { ... });
```

- [ ] **Step 7: Run tests and commit**

```bash
pnpm --dir vantare-v2/frontend test
git add vantare-v2/frontend/src/hub/preview/PreviewInspector.tsx \
        vantare-v2/frontend/src/hub/preview/WidgetList.tsx \
        vantare-v2/frontend/src/hub/pages/PreviewPage.tsx \
        vantare-v2/frontend/src/hub/preview/PreviewInspector.test.tsx
git commit -m "feat(preview): inspector with name, updateHz, duplicate, reset, delete"
```

---

## Task 4: Save Layout + Undo/Redo + Auto-save

**Files:**
- Modify: `vantare-v2/frontend/src/hub/pages/PreviewPage.tsx`
- Create: `vantare-v2/frontend/src/hub/pages/PreviewPage.test.tsx`

- [ ] **Step 1: Add history state**

```typescript
const [history, setHistory] = useState<ProfileConfig[]>([]);
const [historyIndex, setHistoryIndex] = useState(-1);
```

Modify `updateDraft` to push new profile to history and discard redo branch:

```typescript
function pushHistory(next: ProfileConfig) {
  const nextHistory = history.slice(0, historyIndex + 1);
  nextHistory.push(next);
  setHistory(nextHistory);
  setHistoryIndex(nextHistory.length - 1);
  setProfile(next);
  setDirty(true);
}
```

- [ ] **Step 2: Implement undo/redo**

```typescript
function undo() {
  if (historyIndex > 0) {
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setProfile(history[nextIndex]);
    setDirty(true);
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setProfile(history[nextIndex]);
    setDirty(true);
  }
}
```

Add global keydown listener for Ctrl+Z / Ctrl+Y and Ctrl+S to save.

- [ ] **Step 3: Add auto-save debounced**

```typescript
useEffect(() => {
  if (!dirty || overlayRunning) return;
  const id = setTimeout(() => saveProfile(), 1200);
  return () => clearTimeout(id);
}, [profile, dirty, overlayRunning]);
```

- [ ] **Step 4: Write tests**

```typescript
it("saves on Ctrl+S", () => { ... });
it("undoes position change with Ctrl+Z", () => { ... });
it("redoes with Ctrl+Y", () => { ... });
it("auto-saves after debounce", async () => { ... });
```

- [ ] **Step 5: Run tests and commit**

```bash
pnpm --dir vantare-v2/frontend test
git add vantare-v2/frontend/src/hub/pages/PreviewPage.tsx \
        vantare-v2/frontend/src/hub/pages/PreviewPage.test.tsx
git commit -m "feat(preview): auto-save, undo/redo, Ctrl+S"
```

---

## Final verification

```bash
cd vantare-v2
go test ./...
pnpm --dir frontend test
pnpm --dir frontend build
```

Report back which tests pass/fail.
