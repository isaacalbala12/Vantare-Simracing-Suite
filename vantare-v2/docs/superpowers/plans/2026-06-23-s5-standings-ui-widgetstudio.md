# S5 Standings UI In WidgetStudio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Standings column controls in `WidgetStudio` so users can enable/disable and format Standings columns through schema v2 variants.

**Architecture:** Mirror the proven `RelativeSettingsSection` pattern with a dedicated `StandingsSettingsSection`. The section edits only `variant.columns` for `widget.type === "standings"` and is rendered from `WidgetSettingsPanel`; rendering, persistence, schema, backend and layout remain unchanged.

**Tech Stack:** React, TypeScript, Vitest, existing profile schema v2, existing `widget-variants` helpers.

---

## Context

Prerequisites already complete:

- S2: `standings-catalog.ts` defines default Standings columns.
- S3: `toggleStandingsColumn`, `withDefaultWidgetVariants`, and `enrichWidgetPropsWithVariant` support Standings.
- S4: `StandingsWidget` renders `props.variant.columns`.
- S4.5: WidgetStudio preview has practice/qual/race mock selector for Standings.
- S4.6: WidgetStudio uses explicit save, no autosave.

This task is UI only.

## Scope

Create:

- `frontend/src/hub/overlays/StandingsSettingsSection.tsx`
- `frontend/src/hub/overlays/StandingsSettingsSection.test.tsx`

Modify:

- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`
- `frontend/src/hub/overlays/WidgetStudio.test.tsx`

Use:

- `frontend/src/lib/widget-variants.ts`
- `frontend/src/overlay/widgets/standings-catalog.ts`
- `frontend/src/lib/profile.ts`

## Do Not Edit

Do not modify:

- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- `frontend/src/overlay/widgets/standings-format.ts`
- `frontend/src/overlay/widgets/standings-catalog.ts`
- `frontend/src/lib/widget-variants.ts`
- `frontend/src/hub/preview/WidgetRenderer.tsx`
- `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/overlays/LayoutStudio.tsx`
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
- `docs/superpowers/plans/2026-06-22-s2-standings-catalog-columns.md`
- `docs/superpowers/plans/2026-06-22-s3-standings-variants-frontend.md`
- `docs/superpowers/plans/2026-06-22-s4-standings-render-configurable.md`
- `docs/superpowers/plans/2026-06-23-s4-5-preview-mock-session-scenarios.md`
- `docs/superpowers/plans/2026-06-23-s4-6-widgetstudio-explicit-save.md`

## Functional Requirements

1. Render Standings-specific controls only when selected widget type is `standings`.
2. Do not render Standings controls for Relative or other widgets.
3. Show a `COLUMNAS STANDINGS` section.
4. Provide switches for optional columns:
   - `vehicleClass`
   - `currentLap`
   - `interval`
   - `bestLap`
   - `lastLap`
5. Base columns must remain visible but not toggleable in this cut:
   - `position`
   - `driverNumber`
   - `driverName`
   - `gap`
6. Toggles must call `toggleStandingsColumn` and write only to `variant.columns`.
7. No control may write `widget.position`, `widget.props`, layout data, configs, backend or schema.
8. Add format controls for `driverName`:
   - name display mode: full/truncate;
   - max chars.
9. Add basic format controls for `bestLap` and `lastLap`:
   - display full/compact;
   - decimals 0..3;
   - width;
   - color;
   - alignment left/center/right.
10. Add basic width/alignment controls for `gap`, `interval`, `currentLap`, and `vehicleClass` only if doing so stays small. If scope grows, restrict S5 to toggles + driverName + lap columns.
11. Changing a setting should mark dirty through `onChangeProfile`; autosave should not run because S4.6 disabled it in WidgetStudio.
12. Existing S4.5 mock selector remains preview-only and unaffected.

## UI Copy

Use Spanish labels:

- `COLUMNAS STANDINGS`
- `Mostrar clase`
- `Mostrar vuelta actual`
- `Mostrar intervalo`
- `Mostrar mejor vuelta`
- `Mostrar última vuelta`
- `Formato de nombre`
- `Máximo caracteres nombre`
- `Mejor vuelta`
- `Última vuelta`

Short helper text can mention the technical id in backticks, matching the Relative section:

- `Añade \`bestLap\` como columna opcional.`

## Task 1: Create StandingsSettingsSection Tests First

**Files:**

- Create: `frontend/src/hub/overlays/StandingsSettingsSection.test.tsx`

- [ ] **Step 1: Create test fixture**

Create a profile fixture with one Standings widget:

```ts
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileConfig } from "../../lib/profile";
import { createDefaultStandingsColumns } from "../../overlay/widgets/standings-catalog";
import { StandingsSettingsSection } from "./StandingsSettingsSection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function profile(): ProfileConfig {
  return {
    schemaVersion: 2,
    id: "v2",
    displayMode: "edit",
    monitorIndex: 0,
    widgets: [
      {
        id: "standings",
        type: "standings",
        variantId: "variant-standings-default",
        enabled: true,
        updateHz: 15,
        position: { x: 40, y: 80, w: 360, h: 300 },
        props: { style: "vantare-racing" },
      },
    ],
    variants: [
      {
        id: "variant-standings-default",
        widgetType: "standings",
        templateId: "standings-vantare-default",
        columns: createDefaultStandingsColumns(),
      },
    ],
  };
}
```

- [ ] **Step 2: Test optional column toggles**

Add:

```ts
it("toggles Standings optional columns in the variant only", () => {
  const onChangeProfile = vi.fn();
  const p = profile();

  render(
    <StandingsSettingsSection
      profile={p}
      widget={p.widgets[0]}
      onChangeProfile={onChangeProfile}
    />,
  );

  fireEvent.click(screen.getByRole("switch", { name: "Mostrar mejor vuelta" }));

  const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
  expect(next.widgets[0].position).toEqual(p.widgets[0].position);
  expect(next.widgets[0].props).toEqual(p.widgets[0].props);
  expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.enabled).toBe(true);
});
```

Add one more test for `lastLap` or `interval`:

```ts
it("toggles Standings interval column", () => {
  const onChangeProfile = vi.fn();
  const p = profile();

  render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);
  fireEvent.click(screen.getByRole("switch", { name: "Mostrar intervalo" }));

  const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
  expect(next.variants?.[0].columns?.find((column) => column.id === "interval")?.enabled).toBe(true);
  expect(next.widgets[0].position).toEqual(p.widgets[0].position);
});
```

- [ ] **Step 3: Test driver name controls**

Add:

```ts
it("updates Standings driver name formatting in the variant", () => {
  const onChangeProfile = vi.fn();
  const p = profile();

  render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

  fireEvent.change(screen.getByLabelText("Formato de nombre standings"), { target: { value: "truncate" } });
  const truncateProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(truncateProfile.variants?.[0].columns?.find((column) => column.id === "driverName")?.format?.mode).toBe("truncate");
  expect(truncateProfile.widgets[0].position).toEqual(p.widgets[0].position);

  cleanup();
  render(<StandingsSettingsSection profile={truncateProfile} widget={truncateProfile.widgets[0]} onChangeProfile={onChangeProfile} />);

  fireEvent.change(screen.getByLabelText("Máximo caracteres nombre standings"), { target: { value: "12" } });
  const maxProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(maxProfile.variants?.[0].columns?.find((column) => column.id === "driverName")?.format?.maxChars).toBe(12);
});
```

Use `standings` suffix in aria labels if needed to avoid collisions with Relative tests.

- [ ] **Step 4: Test lap format controls**

Add:

```ts
it("updates Standings lap format settings in the variant", () => {
  const onChangeProfile = vi.fn();
  const p = profile();

  render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

  fireEvent.change(screen.getByLabelText("Formato mejor vuelta standings"), { target: { value: "compact" } });
  const displayProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(displayProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format?.display).toBe("compact");

  cleanup();
  render(<StandingsSettingsSection profile={displayProfile} widget={displayProfile.widgets[0]} onChangeProfile={onChangeProfile} />);

  fireEvent.change(screen.getByLabelText("Decimales mejor vuelta standings"), { target: { value: "1" } });
  const decimalsProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(decimalsProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format?.decimals).toBe(1);
});
```

- [ ] **Step 5: Test width/color/alignment**

Add:

```ts
it("updates Standings lap width, color and alignment in the variant", () => {
  const onChangeProfile = vi.fn();
  const p = profile();

  render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

  fireEvent.change(screen.getByLabelText("Ancho mejor vuelta standings"), { target: { value: "92" } });
  const widthProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(widthProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.width).toBe(92);

  cleanup();
  render(<StandingsSettingsSection profile={widthProfile} widget={widthProfile.widgets[0]} onChangeProfile={onChangeProfile} />);

  fireEvent.change(screen.getByLabelText("Color mejor vuelta standings"), { target: { value: "#ffcc00" } });
  const colorProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(colorProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.style?.color).toBe("#ffcc00");

  cleanup();
  render(<StandingsSettingsSection profile={colorProfile} widget={colorProfile.widgets[0]} onChangeProfile={onChangeProfile} />);

  fireEvent.change(screen.getByLabelText("Alineación mejor vuelta standings"), { target: { value: "center" } });
  const alignProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(alignProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.style?.align).toBe("center");
});
```

- [ ] **Step 6: Test non-standings returns null**

Add:

```ts
it("does not render for non-standings widgets", () => {
  const p = profile();
  const widget = { ...p.widgets[0], id: "relative", type: "relative" };

  const { container } = render(
    <StandingsSettingsSection profile={p} widget={widget} onChangeProfile={vi.fn()} />,
  );

  expect(container.textContent).toBe("");
});
```

- [ ] **Step 7: Run tests and verify failure**

Run:

```powershell
pnpm --dir frontend test -- StandingsSettingsSection
```

Expected: FAIL because `StandingsSettingsSection.tsx` does not exist.

## Task 2: Implement StandingsSettingsSection

**Files:**

- Create: `frontend/src/hub/overlays/StandingsSettingsSection.tsx`

- [ ] **Step 1: Create imports and prop types**

Create:

```ts
import type { ColumnConfig, ProfileConfig, WidgetConfig } from "../../lib/profile";
import { findWidgetVariant, toggleStandingsColumn, withDefaultWidgetVariants } from "../../lib/widget-variants";

type StandingsSettingsSectionProps = {
  profile: ProfileConfig;
  widget: WidgetConfig;
  onChangeProfile: (profile: ProfileConfig) => void;
};

type StandingsColumnId =
  | "driverName"
  | "gap"
  | "vehicleClass"
  | "currentLap"
  | "interval"
  | "bestLap"
  | "lastLap";
```

- [ ] **Step 2: Add update helper**

Add:

```ts
function updateStandingsColumn(
  profile: ProfileConfig,
  widgetId: string,
  columnId: StandingsColumnId,
  update: (column: ColumnConfig) => ColumnConfig,
): ProfileConfig {
  const normalized = withDefaultWidgetVariants(profile);
  const widget = normalized.widgets.find((item) => item.id === widgetId && item.type === "standings");
  if (!widget?.variantId) return profile;

  return {
    ...normalized,
    variants: (normalized.variants ?? []).map((variant) => {
      if (variant.id !== widget.variantId || variant.widgetType !== "standings") return variant;
      return {
        ...variant,
        columns: (variant.columns ?? []).map((column) =>
          column.id === columnId ? update(column) : column,
        ),
      };
    }),
  };
}
```

- [ ] **Step 3: Add switch component helper**

Add a small local component or inline function for switches. It must use:

- `type="button"`
- `role="switch"`
- `aria-checked`
- visible label text
- `aria-label`

Match the Relative visual pattern as closely as possible.

- [ ] **Step 4: Add driver name controls**

Implement `DriverNameControls` equivalent for Standings.

Important labels:

- Visible text: `Formato de nombre`
- `aria-label="Formato de nombre standings"`
- Visible text: `Máximo caracteres nombre`
- `aria-label="Máximo caracteres nombre standings"`

Use:

```ts
format: { ...(column.format ?? {}), mode: event.target.value }
format: { ...(column.format ?? {}), maxChars: Number(event.target.value) }
```

- [ ] **Step 5: Add lap column controls**

Implement `LapColumnControls` for `bestLap` and `lastLap`.

Labels must include unique aria labels:

- `Formato mejor vuelta standings`
- `Decimales mejor vuelta standings`
- `Ancho mejor vuelta standings`
- `Color mejor vuelta standings`
- `Alineación mejor vuelta standings`

and equivalent labels for `última vuelta`.

Defaults:

- `display`: `"full"`
- `decimals`: `"3"`
- `width`: `76`
- `color`: `"#ffffff"`
- `align`: `"right"`

- [ ] **Step 6: Implement main section**

Main component:

```ts
export function StandingsSettingsSection({ profile, widget, onChangeProfile }: StandingsSettingsSectionProps) {
  if (widget.type !== "standings") return null;

  const normalized = withDefaultWidgetVariants(profile);
  const normalizedWidget = normalized.widgets.find((item) => item.id === widget.id) ?? widget;
  const variant = findWidgetVariant(normalized, normalizedWidget);
  const columns = variant?.columns ?? [];

  const isEnabled = (columnId: string) => columns.find((column) => column.id === columnId)?.enabled ?? false;
  const updateColumn = (columnId: "vehicleClass" | "currentLap" | "interval" | "bestLap" | "lastLap", enabled: boolean) => {
    onChangeProfile(toggleStandingsColumn(normalized, widget.id, columnId, enabled));
  };

  return (
    <section className="border-t border-white/5 bg-vantare-panel px-5 py-4">
      ...
    </section>
  );
}
```

Use switches for:

- `vehicleClass`: `Mostrar clase`
- `currentLap`: `Mostrar vuelta actual`
- `interval`: `Mostrar intervalo`
- `bestLap`: `Mostrar mejor vuelta`
- `lastLap`: `Mostrar última vuelta`

Base columns should be mentioned as fixed or simply omitted from toggles. Do not provide toggles for `position`, `driverNumber`, `driverName`, or `gap` in this cut.

- [ ] **Step 7: Run section tests**

Run:

```powershell
pnpm --dir frontend test -- StandingsSettingsSection
```

Expected: PASS.

## Task 3: Mount Section In WidgetSettingsPanel

**Files:**

- Modify: `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- Modify: `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`

- [ ] **Step 1: Import and render section**

In `WidgetSettingsPanel.tsx`, import:

```ts
import { StandingsSettingsSection } from "./StandingsSettingsSection";
```

Render it next to `RelativeSettingsSection`:

```tsx
<StandingsSettingsSection
  profile={profile}
  widget={widget}
  onChangeProfile={onChangeProfile}
/>
```

Keep both sections inside the same `shrink-0` block. Each section returns `null` for non-matching widget types.

- [ ] **Step 2: Add WidgetSettingsPanel test for Standings**

In `WidgetSettingsPanel.test.tsx`, add a `standingsProfile` fixture and test:

```ts
it("keeps standings controls accessible inside a scrolling settings panel", () => {
  const standingsProfile: ProfileConfig = {
    ...profile,
    widgets: [
      {
        id: "standings",
        type: "standings",
        variantId: "variant-standings-default",
        enabled: true,
        updateHz: 15,
        position: { x: 40, y: 80, w: 360, h: 300 },
      },
    ],
    variants: [
      {
        id: "variant-standings-default",
        widgetType: "standings",
        templateId: "standings-vantare-default",
      },
    ],
  };

  render(
    <WidgetSettingsPanel
      profile={standingsProfile}
      widget={standingsProfile.widgets[0]}
      onChangeProfile={vi.fn()}
    />,
  );

  const panel = screen.getByTestId("widget-settings-panel");
  expect(panel.className).toContain("overflow-y-auto");
  expect(screen.getByText("COLUMNAS STANDINGS")).toBeTruthy();
  expect(screen.getByLabelText("Mostrar mejor vuelta")).toBeTruthy();
});
```

- [ ] **Step 3: Run panel tests**

Run:

```powershell
pnpm --dir frontend test -- WidgetSettingsPanel StandingsSettingsSection
```

Expected: PASS.

## Task 4: WidgetStudio Integration Tests

**Files:**

- Modify: `frontend/src/hub/overlays/WidgetStudio.test.tsx`

- [ ] **Step 1: Add test showing Standings controls in WidgetStudio**

Add:

```ts
it("shows Standings column controls for the Standings widget", () => {
  const standingsProfile: ProfileConfig = {
    ...profile,
    schemaVersion: 2,
    widgets: [
      {
        id: "standings",
        type: "standings",
        variantId: "variant-standings-default",
        enabled: true,
        updateHz: 15,
        position: { x: 40, y: 80, w: 360, h: 300 },
      },
    ],
    variants: [
      {
        id: "variant-standings-default",
        widgetType: "standings",
        templateId: "standings-vantare-default",
      },
    ],
  };

  render(
    <WidgetStudio
      profile={standingsProfile}
      selectedWidgetId="standings"
      dirty={false}
      saveState="idle"
      onSelectWidget={vi.fn()}
      onChangeProfile={vi.fn()}
      onSave={vi.fn()}
      onBack={vi.fn()}
    />,
  );

  expect(screen.getByText("COLUMNAS STANDINGS")).toBeTruthy();
  expect(screen.getByLabelText("Mostrar mejor vuelta")).toBeTruthy();
  expect(screen.queryByText("POSICIÓN Y TAMAÑO")).toBeNull();
});
```

- [ ] **Step 2: Add test that changing Standings column calls onChangeProfile**

Add:

```ts
it("updates Standings variant columns from WidgetStudio without touching position", () => {
  const onChangeProfile = vi.fn();
  const standingsProfile: ProfileConfig = {
    ...profile,
    schemaVersion: 2,
    widgets: [
      {
        id: "standings",
        type: "standings",
        variantId: "variant-standings-default",
        enabled: true,
        updateHz: 15,
        position: { x: 40, y: 80, w: 360, h: 300 },
      },
    ],
    variants: [
      {
        id: "variant-standings-default",
        widgetType: "standings",
        templateId: "standings-vantare-default",
      },
    ],
  };

  render(
    <WidgetStudio
      profile={standingsProfile}
      selectedWidgetId="standings"
      dirty={false}
      saveState="idle"
      onSelectWidget={vi.fn()}
      onChangeProfile={onChangeProfile}
      onSave={vi.fn()}
      onBack={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("switch", { name: "Mostrar mejor vuelta" }));

  const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
  expect(next.widgets[0].position).toEqual(standingsProfile.widgets[0].position);
  expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.enabled).toBe(true);
});
```

- [ ] **Step 3: Run WidgetStudio tests**

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio WidgetSettingsPanel StandingsSettingsSection
```

Expected: PASS.

## Task 5: Final Checks

- [ ] **Step 1: Run focused tests**

```powershell
pnpm --dir frontend test -- StandingsSettingsSection WidgetSettingsPanel WidgetStudio standings-catalog widget-variants StandingsWidget
```

Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

```powershell
pnpm --dir frontend test
```

Expected: PASS.

- [ ] **Step 3: Run type-check**

```powershell
pnpm --dir frontend exec tsc -b
```

Expected: PASS.

- [ ] **Step 4: Run build**

```powershell
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 5: Run lint**

```powershell
pnpm --dir frontend lint
```

Expected: PASS or only known preexisting warnings. Any new lint error must be fixed.

- [ ] **Step 6: Run whitespace check**

```powershell
git diff --check
```

Expected: exit code 0. CRLF warnings may be reported, but whitespace errors must be fixed.

## Manual Verification

After implementation and rebuild:

1. Open `Overlays Studio` -> `Widgets`.
2. Select `standings`.
3. Confirm `COLUMNAS STANDINGS` is visible.
4. Confirm mock selector from S4.5 is still visible and default `Carrera`.
5. Toggle `Mostrar mejor vuelta`.
6. Confirm the preview shows the new best lap column.
7. Toggle `Mostrar última vuelta`.
8. Confirm the preview shows the last lap column.
9. Toggle `Mostrar intervalo`.
10. Confirm the preview shows interval values.
11. Change name format to `Recortar` and max chars.
12. Confirm names truncate in preview.
13. Change best lap format/decimals/width/color/alignment.
14. Confirm preview updates.
15. Wait more than one second and confirm it does not autosave.
16. Confirm `Guardar` is enabled.
17. Click `Guardar` and confirm saved state.
18. Select `relative` and confirm Relative controls still work.
19. Confirm no X/Y/W/H or delete controls appear in WidgetStudio.

## Required Final Report

Report in Spanish:

- files created/modified;
- checks executed and results;
- checks not executed and why;
- confirmation that no renderer/backend/schema/config changes were made;
- confirmation that only `variant.columns` is written;
- confirmation that `widget.position` and `widget.props` are not modified;
- confirmation that WidgetStudio remains explicit-save only;
- risks or doubts;
- manual verification steps.

## Review Handoff

After implementation, do not self-approve. The orchestrator will send the diff/report to GLM for review.

