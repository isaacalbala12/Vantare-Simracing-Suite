> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# PREVIEW2 WidgetStudio Intrinsic Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the isolated `WidgetStudio` preview wrap the real intrinsic widget width for configurable widgets, removing empty right-side space without changing `LayoutStudio` or overlay runtime sizing.

**Architecture:** `WidgetStudio` preview is a sandbox, not a layout surface. `Relative` and `Standings` should use intrinsic width in the sandbox because `WidgetStudio` does not edit `position.w`; `LayoutStudio`, profile previews, and runtime overlays keep using layout size. The change must preserve the existing `WidgetPreviewPanel -> WidgetSandboxPreview -> PreviewScaler -> WidgetRenderer` architecture and must not reintroduce `PreviewWidgetFrame`.

**Tech Stack:** React 19, TypeScript strict, Vitest, Wails/Go app shell. No new dependencies.

---

## Current Diagnosis

The visual bug is not zoom. The preview leaves empty space to the right because the sandbox still uses `Math.max(widget.position.w, intrinsicWidth)` and only applies `fit-content` to compact `Relative`.

Current problematic behavior:

- `frontend/src/hub/preview/widget-preview-size.ts` computes `width = Math.max(widget.position.w, intrinsicWidth)`.
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx` uses `fit-content` only when `compactRelative === true`.
- `RelativeWidget` and `StandingsWidget` rows use `width:max(100%, intrinsicWidth)` which stretches rows when the parent is wider than intrinsic width.
- `StandingsWidget` has no intrinsic/fill-host mode, so in the sandbox it always stretches to `position.w`.

New contract:

- In `WidgetStudio` sandbox, configurable widgets with intrinsic width (`relative`, `standings`) should use intrinsic width as the preview width, whether it is smaller or larger than `position.w`.
- In `WidgetStudio` sandbox, fill-height behavior may still use `position.h` where relevant.
- In `LayoutStudio`, profile previews, and overlay runtime, layout sizing remains controlled by `position.w/h`.

## Files And Responsibilities

Expected product files:

- `frontend/src/hub/preview/widget-preview-size.ts`
  - Resolve intrinsic preview width for configurable widgets.
  - Stop using `position.w` as minimum width for `relative`/`standings` in `WidgetStudio` preview sizing.

- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
  - Treat `baseSize.mode === "intrinsic"` as intrinsic-width sandbox mode.
  - Use `fit-content` and `fillHost={false}` for intrinsic width previews, not only compact `Relative`.
  - Preserve compact `Relative` height behavior.

- `frontend/src/overlay/widgets/RelativeWidget.tsx`
  - Add a sandbox-safe intrinsic width mode without breaking runtime overlay.
  - Keep runtime/fill behavior using full host when the renderer fills host.

- `frontend/src/overlay/widgets/StandingsWidget.tsx`
  - Add the same sandbox-safe intrinsic width mode.
  - Keep runtime overlay using layout width.

Expected test files:

- `frontend/src/hub/preview/widget-preview-size.test.ts`
- `frontend/src/hub/overlays/WidgetSandboxPreview.test.tsx`
- `frontend/src/overlay/widgets/RelativeWidget.test.tsx`
- `frontend/src/overlay/widgets/StandingsWidget.test.tsx`
- Optional: `frontend/src/hub/preview/WidgetRenderer.test.tsx` if a prop contract changes.

Expected docs:

- `docs/widget-preview-bug-log.md`
- `docs/current-plan.md`

Do not touch:

- `frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- `frontend/src/hub/preview/PreviewCanvas.tsx`
- `frontend/src/hub/overlays/LayoutStudio.tsx`
- Backend/Go files
- Schema/profile persistence files
- Build config/version files
- `package.json` or dependency files

## Task 1: Lock New Preview Size Contract

**Files:**
- Modify: `frontend/src/hub/preview/widget-preview-size.test.ts`
- Modify: `frontend/src/hub/preview/widget-preview-size.ts`

- [ ] **Step 1: Change tests that currently protect the bug**

Replace tests that expect a wide declared width for `relative`/`standings` with intrinsic expectations.

Required assertions:

```ts
import { getRelativeIntrinsicWidth } from "../../overlay/widgets/relative-format";
import { getStandingsIntrinsicWidth } from "../../overlay/widgets/standings-format";
```

Add/modify these cases:

```ts
it("uses relative intrinsic width even when declared width is wider", () => {
  const columns = createDefaultRelativeColumns();
  const intrinsicWidth = getRelativeIntrinsicWidth(columns);
  const widget: WidgetConfig = {
    id: "relative",
    type: "relative",
    enabled: true,
    updateHz: 15,
    position: { x: 80, y: 90, w: 900, h: 420 },
    variantId: "variant-relative",
    props: {},
  };
  const profile: ProfileConfig = {
    ...profileWith(widget),
    variants: [{ id: "variant-relative", widgetType: "relative", columns }],
  };

  expect(resolveWidgetPreviewBaseSize(profile, widget)).toEqual({
    width: intrinsicWidth,
    height: 420,
    mode: "intrinsic",
  });
  expect(widget.position).toEqual({ x: 80, y: 90, w: 900, h: 420 });
});
```

```ts
it("uses standings intrinsic width even when declared width is wider", () => {
  const columns = createDefaultStandingsColumns();
  const intrinsicWidth = getStandingsIntrinsicWidth(columns);
  const widget: WidgetConfig = {
    id: "standings",
    type: "standings",
    enabled: true,
    updateHz: 15,
    variantId: "variant-standings",
    position: { x: 0, y: 0, w: 600, h: 300 },
    props: {},
  };
  const profile: ProfileConfig = {
    ...profileWith(widget),
    variants: [{ id: "variant-standings", widgetType: "standings", columns }],
  };

  expect(resolveWidgetPreviewBaseSize(profile, widget)).toEqual({
    width: intrinsicWidth,
    height: 300,
    mode: "intrinsic",
  });
  expect(widget.position).toEqual({ x: 0, y: 0, w: 600, h: 300 });
});
```

Keep the non-configurable widget test:

```ts
it("returns declared size for non-relative widgets", () => {
  // delta/telemetry/pedals still use position.w/h in sandbox.
});
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
pnpm --dir frontend test -- widget-preview-size
```

Expected before implementation: tests expecting intrinsic width fail because current code returns declared width when `position.w > intrinsicWidth`.

- [ ] **Step 3: Implement intrinsic-only width for configurable widgets**

In `frontend/src/hub/preview/widget-preview-size.ts`, replace:

```ts
const width = Math.max(widget.position.w, intrinsicWidth);

return {
  width,
  height: widget.position.h,
  mode: width > widget.position.w ? "intrinsic" : "declared",
};
```

with:

```ts
return {
  width: intrinsicWidth,
  height: widget.position.h,
  mode: "intrinsic",
};
```

Keep the `declared` fallback only for widgets without intrinsic width.

- [ ] **Step 4: Verify size tests pass**

Run:

```powershell
pnpm --dir frontend test -- widget-preview-size
```

Expected: all `widget-preview-size` tests pass.

## Task 2: Make Sandbox Intrinsic Mode Generic

**Files:**
- Modify: `frontend/src/hub/overlays/WidgetSandboxPreview.test.tsx`
- Modify: `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`

- [ ] **Step 1: Add failing sandbox tests for intrinsic width in fill and standings**

Update or add tests so `baseSize.mode === "intrinsic"` uses a visible intrinsic-width box.

Required cases:

```ts
it("uses fit-content for relative fill intrinsic width when declared width is wider", async () => {
  const intrinsicWidth = getRelativeIntrinsicWidth(createDefaultRelativeColumns());
  const widget: WidgetConfig = {
    id: "relative",
    type: "relative",
    enabled: true,
    updateHz: 15,
    variantId: "variant-relative",
    position: { x: 400, y: 500, w: 900, h: 420 },
    props: {},
  };
  const profile: ProfileConfig = {
    ...profileWith(widget),
    variants: [
      {
        id: "variant-relative",
        widgetType: "relative",
        columns: createDefaultRelativeColumns(),
        filters: { rowHeightMode: "fill" },
      },
    ],
  };

  render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

  await waitFor(() => {
    expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe(`${intrinsicWidth}px`);
  });
  expect(screen.getByTestId("widget-sandbox-content").style.width).toBe("fit-content");
  expect(screen.getByTestId("widget-sandbox-renderer").className).not.toContain("w-full");
  expect(screen.getByTestId("widget-sandbox-renderer").className).not.toContain("h-full");
  expect(widget.position).toEqual({ x: 400, y: 500, w: 900, h: 420 });
});
```

```ts
it("uses fit-content for standings intrinsic width when declared width is wider", async () => {
  const columns = createDefaultStandingsColumns();
  const intrinsicWidth = getStandingsIntrinsicWidth(columns);
  const widget: WidgetConfig = {
    id: "standings",
    type: "standings",
    enabled: true,
    updateHz: 15,
    variantId: "variant-standings",
    position: { x: 0, y: 0, w: 600, h: 300 },
    props: {},
  };
  const profile: ProfileConfig = {
    ...profileWith(widget),
    variants: [{ id: "variant-standings", widgetType: "standings", columns }],
  };

  render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

  await waitFor(() => {
    expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe(`${intrinsicWidth}px`);
  });
  expect(screen.getByTestId("widget-sandbox-content").style.width).toBe("fit-content");
  expect(screen.getByTestId("widget-sandbox-renderer").className).not.toContain("w-full");
  expect(screen.getByTestId("widget-sandbox-renderer").className).not.toContain("h-full");
  expect(widget.position).toEqual({ x: 0, y: 0, w: 600, h: 300 });
});
```

Keep a non-configurable widget test to prove `delta` still fills host if already present or add one if missing.

- [ ] **Step 2: Run failing sandbox tests**

Run:

```powershell
pnpm --dir frontend test -- WidgetSandboxPreview
```

Expected before implementation: new tests fail because `fit-content` and `fillHost={false}` only apply to compact `Relative`.

- [ ] **Step 3: Implement generic intrinsic sandbox mode**

In `WidgetSandboxPreview.tsx`, derive:

```ts
const intrinsicWidthMode = baseSize.mode === "intrinsic";
const compactRelative = activeWidget?.type === "relative"
  && getRelativeFilters(rendererProps?.variant?.filters, rendererProps ?? undefined).rowHeightMode === "compact";
const intrinsicSizing = intrinsicWidthMode || compactRelative;
const minimumWidth = intrinsicSizing ? baseSize.width : baseSize.width;
const minimumHeight = compactRelative ? 1 : baseSize.height;
```

Use `intrinsicSizing` for width/fill-host decisions:

```tsx
style={{
  width: intrinsicSizing ? "fit-content" : `${logicalSize.width}px`,
  minHeight: compactRelative ? undefined : `${logicalSize.height}px`,
}}
```

```tsx
<WidgetRenderer
  ...
  fillHost={!intrinsicSizing}
/>
```

Keep compact height behavior:

```ts
const minimumHeight = compactRelative ? 1 : baseSize.height;
```

Do not introduce offsets, padding hacks, or changes to `PreviewScaler`.

- [ ] **Step 4: Verify sandbox tests pass**

Run:

```powershell
pnpm --dir frontend test -- WidgetSandboxPreview
```

Expected: all sandbox preview tests pass.

## Task 3: Add Intrinsic Render Mode To Widgets Without Breaking Runtime

**Files:**
- Modify: `frontend/src/hub/preview/WidgetRenderer.tsx`
- Modify: `frontend/src/hub/preview/WidgetRenderer.test.tsx`
- Modify: `frontend/src/overlay/widgets/RelativeWidget.tsx`
- Modify: `frontend/src/overlay/widgets/RelativeWidget.test.tsx`
- Modify: `frontend/src/overlay/widgets/StandingsWidget.tsx`
- Modify: `frontend/src/overlay/widgets/StandingsWidget.test.tsx`

- [ ] **Step 1: Add a renderer prop for widget-level host fill**

`WidgetRenderer` already has `fillHost`. It currently only affects the wrapper. Pass the same intent to inner widgets through props without changing public profile schema:

```tsx
const renderedProps = {
  ...props,
  __previewFillHost: fillHost,
};
```

Then pass:

```tsx
props={renderedProps}
```

Use a double-underscore key to make clear it is internal renderer context, not persisted profile config. Do not add it to schema.

- [ ] **Step 2: Add WidgetRenderer test for the internal prop**

If testing direct inner props is hard, keep this as an integration through `RelativeWidget`/`StandingsWidget` tests. Do not over-mock widgets.

Run:

```powershell
pnpm --dir frontend test -- WidgetRenderer
```

- [ ] **Step 3: Make Relative rows width-aware by preview fill mode**

In `RelativeWidget.tsx`, read:

```ts
const previewFillHost = props?.__previewFillHost !== false;
```

Rename for clarity if desired:

```ts
const fillHost = props?.__previewFillHost !== false;
const intrinsicOnly = !fillHost;
```

Use it in row HTML:

```ts
const rowWidthStyle = intrinsicOnly
  ? `width:${intrinsicWidth}px`
  : `min-width:${intrinsicWidth}px;width:max(100%, ${intrinsicWidth}px)`;
```

Then:

```ts
return `<div class="flex items-center text-[11px] font-bold border-b border-black/20 transition-all" style="${rowWidthStyle};height:${rowHeight}px;background:${isP ? BAKED_PLAYER_BG : bgRow};${leftInset}">
  ${cells}
</div>`;
```

Update root sizing:

```tsx
className={`${intrinsicOnly || compactRows ? "inline-flex" : "flex w-full h-full"} flex-col overflow-hidden rounded-lg font-display`}
style={{
  width: intrinsicOnly || compactRows ? `${intrinsicWidth}px` : undefined,
  ...
}}
```

Keep runtime default as fill-host because `__previewFillHost` is absent and therefore `fillHost === true`.

- [ ] **Step 4: Add/adjust Relative tests**

Required assertions:

```tsx
render(<RelativeWidget editMode telemetryMode="mock" props={{ variant: { columns: createDefaultRelativeColumns(), filters: { rowHeightMode: "fill" } }, __previewFillHost: false }} />);
expect(screen.getByTestId("relative-panel").style.width).toBe(`${getRelativeIntrinsicWidth(createDefaultRelativeColumns())}px`);
```

Also keep a default/runtime-like test:

```tsx
render(<RelativeWidget editMode telemetryMode="mock" props={{ variant: { columns: createDefaultRelativeColumns(), filters: { rowHeightMode: "fill" } } }} />);
expect(screen.getByTestId("relative-panel").className).toContain("w-full");
```

Run:

```powershell
pnpm --dir frontend test -- RelativeWidget
```

- [ ] **Step 5: Make Standings rows/root width-aware by preview fill mode**

In `StandingsWidget.tsx`, read:

```ts
const fillHost = props?.__previewFillHost !== false;
const intrinsicOnly = !fillHost;
```

Use it for row width:

```ts
const rowWidthStyle = intrinsicOnly
  ? `width:${intrinsicWidth}px`
  : `min-width:${intrinsicWidth}px;width:max(100%, ${intrinsicWidth}px)`;
```

Then replace the row style prefix:

```ts
return `<div class="flex items-center text-[11px] font-bold border-b border-black/20 transition-all" data-standings-row style="${rowWidthStyle};height:${rowHeight}px;background:${bgRow};${leftInset}">
  ${brandCell}${cells}
</div>`;
```

Update root:

```tsx
className={`${intrinsicOnly ? "inline-flex" : "w-full"} h-fit flex-col overflow-hidden rounded-lg`}
style={{
  width: intrinsicOnly ? `${intrinsicWidth}px` : undefined,
  ...
}}
```

The root still needs `flex`; include it:

```tsx
className={`${intrinsicOnly ? "inline-flex" : "flex w-full"} h-fit flex-col overflow-hidden rounded-lg`}
```

Keep runtime default unchanged because `__previewFillHost` is absent.

- [ ] **Step 6: Add/adjust Standings tests**

Required assertions:

```tsx
const columns = createDefaultStandingsColumns();
const intrinsicWidth = getStandingsIntrinsicWidth(columns);
render(<StandingsWidget editMode telemetryMode="mock" props={{ variant: { columns }, __previewFillHost: false }} />);
expect(screen.getByTestId("standings-panel").style.width).toBe(`${intrinsicWidth}px`);
```

Also keep a runtime-like default:

```tsx
render(<StandingsWidget editMode telemetryMode="mock" props={{ variant: { columns } }} />);
expect(screen.getByTestId("standings-panel").className).toContain("w-full");
```

Run:

```powershell
pnpm --dir frontend test -- StandingsWidget
```

## Task 4: Update Sandbox Tests That Encoded Old Width Contract

**Files:**
- Modify: `frontend/src/hub/overlays/WidgetSandboxPreview.test.tsx`
- Modify: `frontend/src/hub/preview/widget-preview-size.test.ts`

- [ ] **Step 1: Replace old expectations**

Update tests currently named like:

- `keeps fill relative preview at least as tall as saved position height`
- `keeps declared standings width when default columns fit without over-expansion`
- `legacy standings without variant keeps declared width when position is wider than default columns`
- `keeps declared width when standings default columns fit`

New expectation:

- Width is intrinsic for configurable widgets.
- Height remains declared for fill mode.
- Non-configurable widgets remain declared width/height.

Example:

```ts
expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe(`${intrinsicWidth}px`);
expect(screen.getByTestId("widget-sandbox-scaler-inner").style.height).toBe("420px");
```

- [ ] **Step 2: Run focused preview tests**

Run:

```powershell
pnpm --dir frontend test -- widget-preview-size WidgetSandboxPreview WidgetRenderer RelativeWidget StandingsWidget
```

Expected: all focused preview/widget tests pass.

## Task 5: Documentation Update

**Files:**
- Modify: `docs/widget-preview-bug-log.md`
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Update bug log contract**

In `docs/widget-preview-bug-log.md`, add a new bug entry:

```md
### 8. Fill/Standings previews preserved `position.w` and left empty right-side space

Sintoma:

- `Relative` fill and `Standings` showed a wide empty area to the right in `WidgetStudio`.
- The preview box reflected `LayoutStudio` width instead of the widget content width.

Causa:

- `resolveWidgetPreviewBaseSize` used `Math.max(position.w, intrinsicWidth)`.
- `WidgetSandboxPreview` only used `fit-content` for compact `Relative`.
- Widget rows used `width:max(100%, intrinsicWidth)`, stretching to the parent.

Solucion:

- In `WidgetStudio` sandbox, configurable widgets use intrinsic width.
- `position.h` may still be used for fill height.
- Runtime overlays and `LayoutStudio` keep using layout width.
```

Also update rules:

```md
- In `WidgetStudio`, configurable widgets use intrinsic width. Do not use `position.w` as minimum visual width there.
- In `LayoutStudio` and runtime overlays, `position.w/h` remain the layout contract.
```

- [ ] **Step 2: Update current plan**

Add a short state entry:

```md
PREVIEW2 - WidgetStudio intrinsic width contract:
- Planned/fixed empty right-side space by making configurable widget previews use intrinsic width in WidgetStudio.
- LayoutStudio and runtime overlay sizing remain unchanged.
```

## Task 6: Verification

**Files:**
- No edits unless checks reveal a bug.

- [ ] **Step 1: Run focused tests**

```powershell
pnpm --dir frontend test -- widget-preview-size WidgetSandboxPreview WidgetRenderer RelativeWidget StandingsWidget
```

Expected: PASS.

- [ ] **Step 2: Run full frontend suite**

```powershell
pnpm --dir frontend test
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript build**

```powershell
pnpm --dir frontend exec tsc -b
```

Expected: exit 0.

- [ ] **Step 4: Run production build**

```powershell
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 5: Run lint**

```powershell
pnpm --dir frontend lint
```

Expected: PASS. Existing `.eslintignore` warning is non-blocking if present.

- [ ] **Step 6: Run whitespace check**

```powershell
git diff --check
```

Expected: no whitespace errors. Known CRLF warnings may appear; report them.

## Manual Verification Checklist

After implementation and rebuild:

1. Open app.
2. Go to `Overlays Studio -> Widgets -> relative`.
3. With fill height/default columns, verify the right border wraps the columns and does not preserve a wide empty `position.w` box.
4. Enable `Mostrar mejor vuelta` and `Mostrar última vuelta`; preview should widen to the active columns with no clipping and no empty right-side area.
5. Switch `Altura de filas` to `Reducir altura visual`; compact mode remains centered and without right-side empty space.
6. Go to `standings`.
7. With default columns, verify the right border wraps visible columns instead of preserving a wide layout box.
8. Enable `bestLap`, `lastLap`, and `interval`; preview widens to show all columns.
9. Change mock scenario `Práctica / Qualy / Carrera`; preview updates and `Guardar` is not enabled by that change alone.
10. Open `LayoutStudio`; position/size controls still exist and runtime/layout behavior remains controlled by `position.w/h`.
11. Check `delta`, `telemetry`, `telemetry-vertical`, and `pedals`; they still use declared layout size in sandbox.

## Review Checklist

Reviewer must verify:

- No `PreviewWidgetFrame` usage in `WidgetPreviewPanel` or `WidgetSandboxPreview`.
- No edits to `LayoutStudio`.
- No schema/backend/build/version changes.
- `WidgetStudio` preview uses intrinsic width for `relative` and `standings`.
- Runtime overlay behavior remains default fill-host because `__previewFillHost` is absent outside `WidgetRenderer`.
- Tests do not continue to assert that `position.w` wins for configurable widgets.
- `position.w/h` are not mutated.
- No magic offsets, translate hacks, arbitrary padding, or `transformOrigin` fixes.

## Stop Conditions

Stop and report if:

- Fix requires changing `PreviewScaler`.
- Fix requires reintroducing `PreviewWidgetFrame`.
- Fix requires changing profile schema or persisted variants.
- Fix requires touching `LayoutStudio`.
- Runtime overlay visually changes in a way that cannot be scoped to `WidgetStudio`.
- Tests need to be weakened to pass.
