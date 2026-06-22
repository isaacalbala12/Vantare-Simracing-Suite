# Widget Preview Layout And Relative Compact Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the isolated widget preview in `Overlays Studio > Widgets` so Relative is vertically positioned correctly and compact mode does not clip rows.

**Architecture:** Treat `WidgetStudio` preview layout and Relative compact intrinsic height as two separate but related bugs. First constrain the Studio grid row and make the settings column scroll inside its allotted height. Then make the isolated preview use Relative's compact intrinsic height when the configured compact rows require more vertical space than the saved layout height, without mutating `widget.position`.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Wails bundled frontend assets.

---

## Context And Constraints

- `WidgetStudio` edits appearance/data only. It must not edit position or size.
- `LayoutStudio` owns position and size. Do not move controls between studios.
- Do not touch backend, schema, profile JSON, `PreviewWidgetFrame.tsx`, `ProfilePreview.tsx`, `PreviewCanvas.tsx`, or dependencies unless a review finding proves it necessary.
- Current working tree has many uncommitted changes from prior workers. Do not stage or commit unless the user explicitly asks.
- User-created docs under `docs/marketing/` and `docs/INTEGRATION_ANALYSIS.md` are out of scope.

## Root Causes To Address

1. **Grid row inflation:** `WidgetStudio` uses one implicit CSS grid row with `auto` height. When `RelativeSettingsSection` grows tall, the grid row can become much taller than the visible area. The preview then centers inside that invisible tall row and is clipped by `lg:overflow-hidden`.
2. **Compact height clipping:** In `rowHeightMode: "compact"`, `RelativeWidget` renders a content-sized panel with fixed row heights. `WidgetPreviewPanel` currently gives the frame `widget.position.h`, so compact content can exceed the frame height and be clipped by `PreviewWidgetFrame`'s `overflow-hidden`.

## File Map

- Modify `frontend/src/hub/overlays/WidgetStudio.tsx`
  - Add an explicit one-row grid track at desktop widths so the row uses the available height instead of max-content.
- Modify `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
  - Let the settings panel scroll vertically when Relative controls exceed available height.
- Modify `frontend/src/hub/overlays/WidgetStudio.test.tsx`
  - Add class-regression coverage for the grid row constraint.
- Create `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx` if it does not exist
  - Verify the settings panel is a scroll container and Relative controls remain rendered.
- Modify `frontend/src/overlay/widgets/relative-format.ts`
  - Add pure compact-height constants and helper.
- Modify `frontend/src/overlay/widgets/relative-format.test.ts`
  - Cover compact height helper.
- Modify `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
  - Use compact intrinsic height for Relative isolated previews when needed.
- Modify `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`
  - Replace the current compact-height expectation and add regression coverage.
- Update `docs/current-plan.md`
  - Only after tests and manual verification pass.

---

### Task 1: Constrain WidgetStudio Grid Row

**Recommended model:** Deepseek V4 Flash is enough.  
**Chat strategy:** Use the same worker chat if it already has this plan loaded; otherwise new chat is fine because this task is tiny.

**Files:**
- Modify: `frontend/src/hub/overlays/WidgetStudio.tsx`
- Modify: `frontend/src/hub/overlays/WidgetStudio.test.tsx`

- [ ] **Step 1: Add a regression test for the grid row class**

In `frontend/src/hub/overlays/WidgetStudio.test.tsx`, add a test that renders `WidgetStudio` and asserts the main grid has `lg:grid-rows-[1fr]`.

Use a selector that does not depend on translated text where possible. The current component does not expose a test id, so assert via the existing grid shape:

```tsx
it("constrains the desktop grid row so tall settings do not inflate the preview area", () => {
  render(
    <WidgetStudio
      profile={profile}
      selectedWidgetId="relative"
      dirty={false}
      saveState="idle"
      onSelectWidget={vi.fn()}
      onChangeProfile={vi.fn()}
      onSave={vi.fn()}
      onBack={vi.fn()}
    />,
  );

  const grid = screen.getByTestId("widget-studio-grid");
  expect(grid.className).toContain("lg:grid-rows-[1fr]");
});
```

If `profile` in the test file does not include `relative`, use the existing fixture name and selected id from that file, but keep the assertion identical.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio
```

Expected: FAIL because `widget-studio-grid` does not exist or the class is missing.

- [ ] **Step 3: Add the test id and grid row class**

In `frontend/src/hub/overlays/WidgetStudio.tsx`, change the main grid wrapper from:

```tsx
<div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[280px_1fr_340px] lg:overflow-hidden">
```

to:

```tsx
<div
  data-testid="widget-studio-grid"
  className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[280px_1fr_340px] lg:grid-rows-[1fr] lg:overflow-hidden"
>
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio
```

Expected: PASS.

---

### Task 2: Make Widget Settings Scroll Inside The Fixed Row

**Recommended model:** Deepseek V4 Flash is enough.  
**Chat strategy:** Same chat as Task 1; this is a direct companion change.

**Files:**
- Modify: `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- Create or modify: `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`

- [ ] **Step 1: Add a regression test for scroll containment**

If `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx` does not exist, create it with this structure:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProfileConfig } from "../../lib/profile";
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";

const profile: ProfileConfig = {
  schemaVersion: 2,
  id: "test-profile",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    {
      id: "relative",
      type: "relative",
      variantId: "variant-relative-default",
      enabled: true,
      updateHz: 15,
      position: { x: 40, y: 40, w: 300, h: 250 },
      props: { rangeAhead: 3, rangeBehind: 3 },
    },
  ],
  variants: [
    {
      id: "variant-relative-default",
      widgetType: "relative",
      templateId: "relative-vantare-default",
      filters: { rangeAhead: 3, rangeBehind: 4, includePlayer: true, rowHeightMode: "compact" },
    },
  ],
};

describe("WidgetSettingsPanel", () => {
  it("keeps relative controls accessible inside a scrolling settings panel", () => {
    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={profile.widgets[0]}
        onChangeProfile={vi.fn()}
      />,
    );

    const panel = screen.getByTestId("widget-settings-panel");
    expect(panel.className).toContain("overflow-y-auto");
    expect(screen.getByText("COLUMNAS RELATIVE")).toBeTruthy();
    expect(screen.getByText("FILTROS")).toBeTruthy();
  });
});
```

If a test file already exists, add the same test and fixture pattern to it.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- WidgetSettingsPanel
```

Expected: FAIL because `widget-settings-panel` does not exist or `overflow-y-auto` is missing.

- [ ] **Step 3: Make the settings panel scroll**

In `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`, change:

```tsx
<div className="flex h-full min-h-0 flex-col overflow-hidden">
```

to:

```tsx
<div data-testid="widget-settings-panel" className="flex h-full min-h-0 flex-col overflow-y-auto">
```

Keep this structure unchanged:

```tsx
<div className="min-h-0 flex-1">
  <PreviewInspector ... />
</div>
{widget && (
  <div className="shrink-0">
    <RelativeSettingsSection ... />
  </div>
)}
```

Do not expose position, size, delete, or duplicate controls in `WidgetStudio`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
pnpm --dir frontend test -- WidgetSettingsPanel WidgetStudio
```

Expected: PASS.

---

### Task 3: Add Pure Relative Compact Height Helper

**Recommended model:** Deepseek V4 Flash is enough.  
**Chat strategy:** New chat is optional; same chat is better for cache because this is still the same preview bug.

**Files:**
- Modify: `frontend/src/overlay/widgets/relative-format.ts`
- Modify: `frontend/src/overlay/widgets/relative-format.test.ts`

- [ ] **Step 1: Add failing tests for compact height**

In `frontend/src/overlay/widgets/relative-format.test.ts`, add:

```ts
import {
  RELATIVE_COMPACT_NON_ROW_HEIGHT,
  RELATIVE_COMPACT_ROW_HEIGHT,
  getRelativeCompactHeight,
} from "./relative-format";

describe("relative compact height", () => {
  it("computes compact height from fixed chrome and visible rows", () => {
    expect(RELATIVE_COMPACT_ROW_HEIGHT).toBe(31);
    expect(RELATIVE_COMPACT_NON_ROW_HEIGHT).toBe(68);
    expect(getRelativeCompactHeight(0)).toBe(68);
    expect(getRelativeCompactHeight(8)).toBe(316);
  });

  it("clamps invalid compact row counts to zero", () => {
    expect(getRelativeCompactHeight(-3)).toBe(68);
    expect(getRelativeCompactHeight(Number.NaN)).toBe(68);
  });
});
```

If the file already has a top-level `describe`, place these tests inside a separate `describe` block at the bottom. Do not duplicate existing imports; merge the import list.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- relative-format
```

Expected: FAIL because the constants/helper do not exist.

- [ ] **Step 3: Implement the pure helper**

In `frontend/src/overlay/widgets/relative-format.ts`, add near the top, after the existing constants:

```ts
export const RELATIVE_COMPACT_ROW_HEIGHT = 31;
export const RELATIVE_COMPACT_NON_ROW_HEIGHT = 68;

export function getRelativeCompactHeight(rowCount: number): number {
  const safeRows = Number.isFinite(rowCount) ? Math.max(0, Math.round(rowCount)) : 0;
  return RELATIVE_COMPACT_NON_ROW_HEIGHT + safeRows * RELATIVE_COMPACT_ROW_HEIGHT;
}
```

Do not export these from `RelativeWidget.tsx`; that file already has React Fast Refresh lint sensitivity around non-component exports.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
pnpm --dir frontend test -- relative-format
```

Expected: PASS.

---

### Task 4: Use Compact Intrinsic Height In Isolated Preview

**Recommended model:** Kimi K2.7.  
**Chat strategy:** Same chat if it completed Task 3; otherwise new chat with this plan section and current `WidgetPreviewPanel.tsx`.

**Files:**
- Modify: `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- Modify: `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`

- [ ] **Step 1: Add failing preview-height tests**

In `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`, update the existing compact test so it expects intrinsic compact height when rows exceed layout height.

Use this test body:

```tsx
it("expands preview height for compact Relative when configured rows exceed layout height", () => {
  const profile: ProfileConfig = {
    ...mockProfile,
    schemaVersion: 2,
    widgets: [
      {
        id: "relative",
        type: "relative",
        variantId: "variant-relative-default",
        enabled: true,
        position: { x: 120, y: 600, w: 560, h: 250 },
      },
    ],
    variants: [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        filters: { rangeAhead: 3, rangeBehind: 4, includePlayer: true, rowHeightMode: "compact" },
        columns: [
          { id: "position", metricId: "position", enabled: true, width: 24 },
          { id: "driverName", metricId: "driverName", enabled: true, width: 180 },
          { id: "gap", metricId: "gap", enabled: true, width: 48 },
          { id: "bestLap", metricId: "bestLap", enabled: true, width: 62 },
          { id: "lastLap", metricId: "lastLap", enabled: true, width: 62 },
        ],
      },
    ],
  };
  const widget = profile.widgets[0];

  render(<WidgetPreviewPanel profile={profile} activeWidget={widget} />);

  const preview = screen.getByTestId("widget-preview-inner");
  const frame = screen.getByTestId("preview-widget-frame-relative");
  expect(Number.parseInt(preview.style.height, 10)).toBe(316);
  expect(Number.parseInt(frame.style.height, 10)).toBe(316);
  expect(frame.style.left).toBe("0px");
  expect(frame.style.top).toBe("0px");
  expect(profile.widgets[0].position.h).toBe(250);
  expect(profile.widgets[0].position.y).toBe(600);
});
```

Add a second test to ensure `fill` mode stays unchanged:

```tsx
it("keeps layout height for fill Relative preview", () => {
  const profile: ProfileConfig = {
    ...mockProfile,
    schemaVersion: 2,
    widgets: [
      {
        id: "relative",
        type: "relative",
        variantId: "variant-relative-default",
        enabled: true,
        position: { x: 0, y: 0, w: 560, h: 420 },
      },
    ],
    variants: [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        filters: { rangeAhead: 3, rangeBehind: 4, includePlayer: true, rowHeightMode: "fill" },
        columns: [{ id: "driverName", metricId: "driverName", enabled: true, width: 180 }],
      },
    ],
  };

  render(<WidgetPreviewPanel profile={profile} activeWidget={profile.widgets[0]} />);

  const preview = screen.getByTestId("widget-preview-inner");
  expect(Number.parseInt(preview.style.height, 10)).toBe(420);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
pnpm --dir frontend test -- WidgetPreviewPanel relative-format
```

Expected: FAIL on the compact height expectation because preview height is still `250`.

- [ ] **Step 3: Implement compact height calculation in preview size**

In `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`, add imports:

```tsx
import { getRelativeFilters } from "../../overlay/widgets/relative-filters";
import { getRelativeCompactHeight, getRelativeIntrinsicWidth } from "../../overlay/widgets/relative-format";
```

Replace the current separate `getRelativeIntrinsicWidth` import with the combined import above.

Change `getPreviewRenderSize` to:

```tsx
function getPreviewRenderSize(profile: ProfileConfig, widget: WidgetConfig) {
  const base = { width: widget.position.w, height: widget.position.h };
  if (widget.type !== "relative") return base;

  const props = enrichWidgetPropsWithVariant(profile, widget);
  const columns = props.variant?.columns ?? [];
  const filters = getRelativeFilters(props.variant?.filters, widget.props);

  const width = columns.length === 0
    ? base.width
    : Math.max(widget.position.w, getRelativeIntrinsicWidth(columns));

  if (filters.rowHeightMode !== "compact") {
    return { width, height: widget.position.h };
  }

  const rowCount = filters.rangeAhead + filters.rangeBehind + (filters.includePlayer ? 1 : 0);
  const compactHeight = getRelativeCompactHeight(rowCount);
  return { width, height: Math.max(widget.position.h, compactHeight) };
}
```

Keep `renderWidget.position.x = 0` and `renderWidget.position.y = 0`.

- [ ] **Step 4: Run focused tests and verify pass**

Run:

```powershell
pnpm --dir frontend test -- WidgetPreviewPanel relative-format
```

Expected: PASS.

---

### Task 5: Focused Integration Checks

**Recommended model:** Kimi K2.7 or Gemini 3.5 Flash for speed.  
**Chat strategy:** Same chat preferred to reuse cache; this task is command-heavy.

**Files:**
- No source changes unless a check fails and the user approves a fix.

- [ ] **Step 1: Run all focused frontend tests for the affected surface**

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio WidgetSettingsPanel WidgetPreviewPanel RelativeWidget relative-format relative-filters widget-variants RelativeSettingsSection
```

Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

Run:

```powershell
pnpm --dir frontend test
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript/build**

Run:

```powershell
pnpm --dir frontend exec tsc -b
pnpm --dir frontend build
```

Expected: both PASS.

- [ ] **Step 4: Run whitespace check**

Run:

```powershell
git diff --check
```

Expected: no errors. CRLF warnings are acceptable only if `git diff --check` exits `0`.

- [ ] **Step 5: Stop on failure**

If any check fails, stop and report:

```text
Check failed:
- command:
- failing file/test:
- likely cause:
- no fix applied yet:
```

Do not silently patch unrelated files.

---

### Task 6: Manual Verification Checkpoint

**Recommended model:** Main Codex session with user present.  
**Chat strategy:** Same chat, because screenshots and user feedback matter.

**Files:**
- No source changes unless manual verification fails and the user approves a targeted fix.

- [ ] **Step 1: Close the running app**

Close any `go.exe`, `vantare.exe`, and `msedgewebview2.exe` children belonging to the current Vantare run if needed.

- [ ] **Step 2: Build frontend and restart**

Run:

```powershell
pnpm --dir frontend build
go run ./cmd/vantare -live=false -profile configs/example-racing.json
```

- [ ] **Step 3: Verify WidgetStudio preview positioning**

In the app:

1. Open `Overlays Studio`.
2. Open `Widgets`.
3. Select `relative`.
4. Confirm the Relative preview is vertically visible in the checkerboard and not starting at the bottom edge.
5. Toggle `Altura de filas` between `Rellenar altura del widget` and `Reducir altura visual`.
6. Confirm both modes remain visible.

- [ ] **Step 4: Verify compact rows**

In `Relative` settings:

1. Set `Coches delante = 3`.
2. Set `Coches detrás = 4`.
3. Set `Altura de filas = Reducir altura visual`.
4. Confirm the full Relative panel is visible in the isolated preview, possibly smaller, but not clipped at the bottom.

- [ ] **Step 5: Verify settings scroll**

In the right settings panel:

1. Scroll from `Vista general` down to `Columnas Relative`, `Filtros`, `Formato de nombre`, `Mejor vuelta`, and `Última vuelta`.
2. Confirm all controls remain reachable.
3. Confirm there are no position/size/delete controls in `Widgets`.

- [ ] **Step 6: Verify LayoutStudio remains separate**

Open `Mis perfiles` / layout-specific editor if available:

1. Confirm layout preview still shows widgets at their real saved positions.
2. Confirm layout movement/resize still belongs there.
3. Do not change layout unless deliberately testing save.

---

### Task 7: Code Review

**Recommended model:** GLM 5.2 for strict review; Kimi K2.7 is acceptable if GLM is busy.  
**Chat strategy:** New chat recommended for review to avoid implementation bias and reduce stale assumptions.

**Files:**
- No edits. Review only.

- [ ] **Step 1: Give reviewer this prompt**

```text
Actúa como reviewer senior en modo code review estricto para el repo vantare-v2.

Contexto:
- Se está corrigiendo la preview aislada de Overlays Studio > Widgets.
- Hay dos bugs objetivo:
  1. El grid de WidgetStudio podía inflar su fila por el panel derecho largo de RelativeSettingsSection, haciendo que la preview se centrase dentro de una altura invisible y quedase cortada.
  2. Relative en rowHeightMode="compact" podía tener altura intrínseca mayor que widget.position.h, provocando clipping vertical en WidgetPreviewPanel.
- Regla del repo: WidgetStudio edita apariencia/datos; LayoutStudio edita posición/tamaño. No debe tocarse widget.position desde WidgetStudio.

Revisa SOLO estos archivos/cambios:
- frontend/src/hub/overlays/WidgetStudio.tsx
- frontend/src/hub/overlays/WidgetStudio.test.tsx
- frontend/src/hub/overlays/WidgetSettingsPanel.tsx
- frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx
- frontend/src/hub/overlays/WidgetPreviewPanel.tsx
- frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx
- frontend/src/overlay/widgets/relative-format.ts
- frontend/src/overlay/widgets/relative-format.test.ts

No apliques fixes. Reporta findings con severidad P0/P1/P2/P3.

Checklist obligatorio:
1. WidgetStudio grid tiene altura de fila fija al espacio disponible en desktop y no rompe mobile.
2. WidgetSettingsPanel permite scroll y no oculta controles críticos.
3. WidgetStudio no expone ni modifica position/size/delete.
4. WidgetPreviewPanel sigue zeroeando x/y solo para render aislado y no muta profile/widgets.
5. Relative compact height se calcula con helper puro y no se exportan helpers desde RelativeWidget.tsx.
6. Fill mode mantiene widget.position.h.
7. Compact mode usa max(widget.position.h, compactIntrinsicHeight).
8. PreviewWidgetFrame, PreviewCanvas, ProfilePreview, backend, schema y configs no fueron tocados.
9. Tests cubren grid row, settings scroll, compact height, fill height y perfil intacto.
10. Busca regresiones de Tailwind class names, React Fast Refresh lint y tests complacientes.

Checks esperados:
- pnpm --dir frontend test -- WidgetStudio WidgetSettingsPanel WidgetPreviewPanel RelativeWidget relative-format relative-filters widget-variants RelativeSettingsSection
- pnpm --dir frontend test
- pnpm --dir frontend exec tsc -b
- pnpm --dir frontend build
- git diff --check

Devuelve:
- Findings primero, con archivo/línea.
- Si no hay findings P0/P1/P2, dilo explícitamente.
- Riesgos restantes.
- Checks ejecutados o no ejecutados.
```

- [ ] **Step 2: Address only P0/P1/P2 findings**

If review returns P0/P1/P2, do not batch random fixes. Create a tiny follow-up patch and rerun focused checks.

- [ ] **Step 3: Defer P3 unless user approves**

P3 items go into `docs/current-plan.md` as follow-ups only after the main verification is green.

---

### Task 8: Documentation Closeout

**Recommended model:** Deepseek V4 Flash.  
**Chat strategy:** Same chat or cheap new chat; this is documentation only.

**Files:**
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Update current plan only after implementation, checks, manual verification, and review are clean**

Add a short bullet under the current Relative/Widget Preview status:

```markdown
- La preview aislada de `WidgetStudio` ya limita la altura visible del grid para que los controles largos de `Relative` no desplacen el widget.
- El modo compacto de `Relative` en la preview usa altura intrínseca cuando las filas configuradas no caben en la altura guardada.
```

Remove or update any risk that says this exact bug is still pending. Keep unrelated P3 risks intact.

- [ ] **Step 2: Run doc-safe check**

Run:

```powershell
git diff --check
```

Expected: PASS.

---

## Final Verification Matrix

Run after all implementation tasks:

```powershell
pnpm --dir frontend test -- WidgetStudio WidgetSettingsPanel WidgetPreviewPanel RelativeWidget relative-format relative-filters widget-variants RelativeSettingsSection
pnpm --dir frontend test
pnpm --dir frontend exec tsc -b
pnpm --dir frontend build
git diff --check
```

Manual:

- `Overlays Studio > Widgets > relative` preview is not vertically pushed to the bottom.
- `Rellenar altura del widget` remains visible.
- `Reducir altura visual` remains visible.
- `Coches delante = 3`, `Coches detrás = 4`, `includePlayer = true` does not clip compact rows.
- Right settings panel scrolls to all Relative controls.
- `Widgets` still does not expose position, size, duplicate, or delete controls.
- `LayoutStudio` still owns layout positioning.

## Self-Review Notes

- Spec coverage: covers both confirmed likely faults from the external analyses and includes review.
- Placeholder scan: no `TBD`, no undefined task, no vague "add tests" step.
- Type consistency: uses existing `ProfileConfig`, `WidgetConfig`, `variant.filters`, `rowHeightMode`, and current helper locations.
- Scope: no backend/schema/config/profile JSON changes required.
