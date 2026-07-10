# Merge WidgetStudio into LayoutStudio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify widget editing by showing the WidgetSettingsPanel in Layout Studio's right panel when a widget is selected, eliminating the need for a separate Widget Studio mode.

**Architecture:** Layout Studio's right column currently renders `PreviewInspector` (position/size controls only). We replace it with `WidgetSettingsPanel` when a widget is selected, giving users full appearance editing directly in the layout context. When no widget is selected, show a placeholder message. Position/Size controls are removed from the UI entirely. Canvas supports deselect by clicking empty space.

**Tech Stack:** React, TypeScript, Tailwind CSS

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `frontend/src/hub/overlays/LayoutStudio.tsx` | Modify | Replace PreviewInspector with WidgetSettingsPanel + empty state |
| `frontend/src/hub/preview/PreviewCanvas.tsx` | Modify | Add click handler on canvas background for deselect |
| `frontend/src/hub/overlays/LayoutStudio.test.tsx` | Modify | Update tests for new behavior |

---

## Task 1: Add deselect support to PreviewCanvas

**Files:**
- Modify: `frontend/src/hub/preview/PreviewCanvas.tsx:10` — change `onSelectWidget` type
- Modify: `frontend/src/hub/preview/PreviewCanvas.tsx:195-201` — add click handler on canvas background

### Step 1: Update onSelectWidget type

```typescript
// Line 10: Change from
onSelectWidget: (id: string) => void;
// To
onSelectWidget: (id: string | null) => void;
```

### Step 2: Add click handler on canvas background

```tsx
// After line 201 (onKeyDown={onKeyDown}), add:
onClick={(e) => {
  // Only deselect if clicking the canvas background, not a widget
  if (e.target === e.currentTarget) {
    onSelectWidget(null);
  }
}}
```

### Step 3: Verify TypeScript compiles

Run: `corepack pnpm --dir frontend exec tsc --noEmit`
Expected: No errors

### Step 4: Commit

```bash
git add frontend/src/hub/preview/PreviewCanvas.tsx
git commit -m "feat(preview-canvas): support deselect via click on empty canvas

- Change onSelectWidget type to (id: string | null) => void
- Add click handler on canvas background to deselect widget"
```

---

## Task 2: Replace PreviewInspector with WidgetSettingsPanel in LayoutStudio

**Files:**
- Modify: `frontend/src/hub/overlays/LayoutStudio.tsx:5` — change import
- Modify: `frontend/src/hub/overlays/LayoutStudio.tsx:9-10` — update props type
- Modify: `frontend/src/hub/overlays/LayoutStudio.tsx:111-118` — replace PreviewInspector

### Step 1: Update import

```typescript
// Replace line 5:
import { PreviewInspector } from "../preview/PreviewInspector";
// With:
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";
```

### Step 2: Update LayoutStudioProps type

```typescript
// Line 10: Change from
onSelectWidget: (id: string) => void;
// To
onSelectWidget: (id: string | null) => void;
```

### Step 3: Replace right column content

Replace the `<PreviewInspector>` block (lines 111-118) with:

```tsx
{selectedWidget ? (
  <WidgetSettingsPanel
    profile={profile}
    widget={selectedWidget}
    onChangeProfile={onChangeProfile}
  />
) : (
  <div className="glass-panel flex h-full items-center justify-center rounded-xl text-sm text-vantare-textMuted">
    Selecciona un widget para editar
  </div>
)}
```

### Step 4: Verify TypeScript compiles

Run: `corepack pnpm --dir frontend exec tsc --noEmit`
Expected: No errors

### Step 5: Commit

```bash
git add frontend/src/hub/overlays/LayoutStudio.tsx
git commit -m "feat(layout-studio): merge WidgetSettingsPanel into right panel

- Replace PreviewInspector with WidgetSettingsPanel when widget selected
- Show 'Selecciona un widget para editar' when no widget selected
- Position/Size controls removed from UI"
```

---

## Task 3: Update LayoutStudio tests

**Files:**
- Modify: `frontend/src/hub/overlays/LayoutStudio.test.tsx`

### Step 1: Read existing tests

Read `frontend/src/hub/overlays/LayoutStudio.test.tsx` to understand current assertions.

### Step 2: Update failing assertions

The existing tests assert:
- `expect(screen.queryByText("APARIENCIA")).toBeNull()` — will FAIL because WidgetSettingsPanel shows appearance
- `expect(screen.getByText("POSICIÓN Y TAMAÑO")).toBeTruthy()` — will FAIL because position controls are removed

Update these assertions to match new behavior:
- Remove assertion that APARIENCIA is absent
- Remove assertion that POSICIÓN Y TAMAÑO exists
- Add assertion that WidgetSettingsPanel renders when widget selected
- Add assertion that placeholder text appears when no widget selected

### Step 3: Run tests

Run: `corepack pnpm --dir frontend test -- --run`
Expected: All tests pass

### Step 4: Run WidgetStudio tests to verify no regression

Run: `corepack pnpm --dir frontend test -- --run -- WidgetStudio`
Expected: All tests pass

### Step 5: Commit

```bash
git add frontend/src/hub/overlays/LayoutStudio.test.tsx
git commit -m "test(layout-studio): update tests for WidgetSettingsPanel merge

- Remove assertions for removed position controls
- Add tests for WidgetSettingsPanel rendering
- Add tests for empty state placeholder"
```

---

## Verification Checklist

After implementation, verify:

1. **Layout Studio flow:** Mis Perfiles → Elegir perfil → Layout Studio → click widget → right panel shows appearance editor
2. **Deselect:** Click empty canvas → right panel shows placeholder message
3. **All widget types:** Test with Standings, Relative, Pedals, Delta widgets
4. **Save works:** Changes in right panel persist when clicking "Guardar"
5. **Widget list:** Left panel still shows all widgets, clicking selects them
6. **Canvas:** Center panel still has drag/resize functionality
7. **Widget Studio:** Still accessible from Overlays Studio home (unchanged)
8. **No regressions:** WidgetStudio.test.tsx still passes
