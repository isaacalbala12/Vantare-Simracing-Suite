# S3 Standings Variants Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the new `Standings` catalog into the existing frontend widget variant helpers so Standings widgets can receive persisted column variants.

**Architecture:** Reuse the existing schema v2 variant system already used by `Relative`. This task only normalizes/enriches variants in frontend helpers; it does not render configurable Standings columns and does not add UI controls.

**Tech Stack:** TypeScript, Vitest, existing profile schema v2 types.

---

## Scope

Modify only:

- `frontend/src/lib/widget-variants.ts`
- `frontend/src/lib/widget-variants.test.ts`

Use:

- `frontend/src/overlay/widgets/standings-catalog.ts`
- `frontend/src/overlay/widgets/standings-catalog.test.ts`
- `frontend/src/overlay/widgets/relative-catalog.ts`
- `frontend/src/lib/profile.ts`

## Do Not Edit

Do not modify:

- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
- `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- backend Go files
- schema/config files
- `docs/current-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/marketing`
- `docs/INTEGRATION_ANALYSIS.md`

No commits. No staging. No dependency changes.

## Required Docs To Read

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/master-feature-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/feature-architecture-map.md`
- `docs/superpowers/plans/2026-06-22-s2-standings-catalog-columns.md`

## Functional Requirements

1. `withDefaultWidgetVariants(profile)` must support widgets with `type === "standings"`.
2. Legacy Standings widgets without `variantId` must receive `variant-${widget.id}-default`.
3. Missing Standings variants must be created with default Standings columns.
4. Existing Standings variants must be normalized by adding missing default columns without overwriting user overrides.
5. `enrichWidgetPropsWithVariant(profile, widget)` must pass `props.variant` for Standings widgets.
6. Add `toggleStandingsColumn(profile, widgetId, columnId, enabled)`.
7. Unknown Standings column IDs must be ignored by returning the same profile object.
8. `widget.position`, `widget.props`, layout data, and Relative behavior must remain unchanged.
9. `playerHighlight` is not a column and must not appear in `variant.columns`.
10. If a profile is already normalized, `withDefaultWidgetVariants(profile)` must return the same object by identity.

## Naming

Use these constants/functions in `widget-variants.ts`:

```ts
const STANDINGS_DEFAULT_TEMPLATE_ID = "standings-vantare-default";

function createDefaultStandingsVariant(id: string): WidgetVariantConfig
function normalizeStandingsVariant(variant: WidgetVariantConfig): WidgetVariantConfig
export function toggleStandingsColumn(...)
```

Use `createDefaultStandingsColumns()` and `getStandingsColumn()` from `../overlay/widgets/standings-catalog`.

## Task 1: Add Standings Variant Tests First

**Files:**

- Modify: `frontend/src/lib/widget-variants.test.ts`

- [ ] **Step 1: Add a Standings fixture**

Add local helper functions near the existing `relativeWidget()` and `profile()` helpers:

```ts
function standingsWidget(): WidgetConfig {
  return {
    id: "standings",
    type: "standings",
    variantId: "variant-standings-default",
    enabled: true,
    updateHz: 15,
    position: { x: 40, y: 80, w: 360, h: 360 },
    props: { style: "vantare-racing" },
  };
}

function standingsProfile(): ProfileConfig {
  return {
    schemaVersion: 2,
    id: "standings-v2",
    displayMode: "edit",
    monitorIndex: 0,
    widgets: [standingsWidget()],
    variants: [
      {
        id: "variant-standings-default",
        widgetType: "standings",
        templateId: "standings-vantare-default",
        themeId: "vantare-racing",
        name: "Standings Default",
      },
    ],
  };
}
```

- [ ] **Step 2: Add tests for normalization, toggling, enrichment and legacy support**

Add these tests in the existing `describe("widget variants", ...)` block:

```ts
it("adds default Standings columns without changing widget position or props", () => {
  const p = withDefaultWidgetVariants(standingsProfile());
  const variant = p.variants?.[0];

  expect(p.widgets[0].position).toEqual({ x: 40, y: 80, w: 360, h: 360 });
  expect(p.widgets[0].props).toEqual({ style: "vantare-racing" });
  expect(variant?.widgetType).toBe("standings");
  expect(variant?.templateId).toBe("standings-vantare-default");
  expect(variant?.columns?.map((column) => [column.id, column.enabled])).toEqual([
    ["position", true],
    ["driverNumber", true],
    ["driverName", true],
    ["gap", true],
    ["vehicleClass", false],
    ["currentLap", false],
    ["interval", false],
    ["bestLap", false],
    ["lastLap", false],
  ]);
  expect(variant?.columns?.some((column) => column.id === "playerHighlight")).toBe(false);
});

it("toggles a Standings optional column in the variant only", () => {
  const p = withDefaultWidgetVariants(standingsProfile());
  const next = toggleStandingsColumn(p, "standings", "bestLap", true);

  expect(next.widgets[0].position).toEqual(p.widgets[0].position);
  expect(next.widgets[0].props).toEqual(p.widgets[0].props);
  expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.enabled).toBe(true);
});

it("enriches Standings widget props with variant columns for renderers", () => {
  const p = toggleStandingsColumn(withDefaultWidgetVariants(standingsProfile()), "standings", "lastLap", true);
  const props = enrichWidgetPropsWithVariant(p, p.widgets[0]);

  expect(props.style).toBe("vantare-racing");
  expect(props.variant?.templateId).toBe("standings-vantare-default");
  expect(props.variant?.columns.find((column) => column.id === "lastLap")?.enabled).toBe(true);
});

it("handles legacy Standings profiles without schemaVersion, variantId or variants", () => {
  const legacyProfile: ProfileConfig = {
    displayMode: "racing",
    monitorIndex: 0,
    widgets: [
      {
        id: "standings",
        type: "standings",
        enabled: true,
        updateHz: 15,
        position: { x: 40, y: 80, w: 360, h: 360 },
        props: { style: "vantare-racing" },
      },
    ],
  };

  const toggled = toggleStandingsColumn(legacyProfile, "standings", "interval", true);

  expect(toggled.widgets[0].variantId).toBe("variant-standings-default");
  expect(toggled.widgets[0].position).toEqual({ x: 40, y: 80, w: 360, h: 360 });
  expect(toggled.variants?.[0].id).toBe("variant-standings-default");
  expect(toggled.variants?.[0].widgetType).toBe("standings");
  expect(toggled.variants?.[0].columns?.find((column) => column.id === "interval")?.enabled).toBe(true);
});

it("ignores unknown Standings column toggles", () => {
  const p = withDefaultWidgetVariants(standingsProfile());
  const next = toggleStandingsColumn(p, "standings", "unknown", true);

  expect(next).toBe(p);
});

it("preserves Standings user column format and style overrides when normalizing", () => {
  const p = standingsProfile();
  p.variants = [
    {
      id: "variant-standings-default",
      widgetType: "standings",
      templateId: "standings-vantare-default",
      columns: [
        {
          id: "driverName",
          metricId: "driverName",
          enabled: true,
          width: 220,
          format: { mode: "truncate", maxChars: 10 },
          style: { color: "#ffcc00", align: "center" },
        },
      ],
    },
  ];

  const next = withDefaultWidgetVariants(p);
  const driverName = next.variants?.[0].columns?.find((column) => column.id === "driverName");

  expect(driverName?.width).toBe(220);
  expect(driverName?.format).toEqual({ mode: "truncate", maxChars: 10 });
  expect(driverName?.style).toEqual({ color: "#ffcc00", align: "center" });
  expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format).toEqual({
    display: "full",
    decimals: 3,
  });
});

it("returns the same profile object when Standings variant is already normalized", () => {
  const p = withDefaultWidgetVariants(standingsProfile());

  expect(withDefaultWidgetVariants(p)).toBe(p);
});
```

- [ ] **Step 3: Update imports**

Add `toggleStandingsColumn` to the import from `./widget-variants`.

- [ ] **Step 4: Run tests and verify they fail**

Run:

```powershell
pnpm --dir frontend test -- widget-variants
```

Expected: FAIL because `toggleStandingsColumn` and Standings normalization are not implemented yet.

## Task 2: Implement Standings Variant Helpers

**Files:**

- Modify: `frontend/src/lib/widget-variants.ts`

- [ ] **Step 1: Import Standings catalog helpers**

Add:

```ts
import { createDefaultStandingsColumns, getStandingsColumn } from "../overlay/widgets/standings-catalog";
```

- [ ] **Step 2: Add Standings constant**

Near the imports or existing constants, add:

```ts
const STANDINGS_DEFAULT_TEMPLATE_ID = "standings-vantare-default";
```

- [ ] **Step 3: Extend `withDefaultWidgetVariants`**

Inside the loop, support both `relative` and `standings`.

Expected logic:

```ts
if (widget.type !== "relative" && widget.type !== "standings") continue;
```

When creating or normalizing:

```ts
const createdVariant =
  widget.type === "relative"
    ? createDefaultRelativeVariant(variantId)
    : createDefaultStandingsVariant(variantId);
```

and:

```ts
const normalized =
  widget.type === "relative"
    ? normalizeRelativeVariant(current)
    : normalizeStandingsVariant(current);
```

Keep the existing idempotence behavior: if nothing changes, return the original `profile` object.

- [ ] **Step 4: Add `toggleStandingsColumn`**

Add this exported function below `toggleRelativeColumn`:

```ts
export function toggleStandingsColumn(
  profile: ProfileConfig,
  widgetId: string,
  columnId: string,
  enabled: boolean,
): ProfileConfig {
  if (!getStandingsColumn(columnId)) return profile;

  const base = withDefaultWidgetVariants(profile);
  const widget = base.widgets.find((item) => item.id === widgetId && item.type === "standings");
  if (!widget?.variantId) return profile;

  const variants = (base.variants ?? []).map((variant) => {
    if (variant.id !== widget.variantId || variant.widgetType !== "standings") return variant;
    const normalized = normalizeStandingsVariant(variant);
    return {
      ...normalized,
      columns: normalized.columns?.map((column) =>
        column.id === columnId ? { ...column, enabled } : column,
      ),
    };
  });

  return { ...base, variants };
}
```

- [ ] **Step 5: Update `enrichWidgetPropsWithVariant`**

Replace the Relative-only normalization with widget-type-aware normalization:

```ts
const renderVariant =
  widget.type === "relative"
    ? normalizeRelativeVariant(variant)
    : widget.type === "standings"
      ? normalizeStandingsVariant(variant)
      : variant;

const templateId =
  widget.type === "relative"
    ? renderVariant.templateId ?? RELATIVE_DEFAULT_TEMPLATE_ID
    : widget.type === "standings"
      ? renderVariant.templateId ?? STANDINGS_DEFAULT_TEMPLATE_ID
      : renderVariant.templateId;
```

Then return:

```ts
variant: {
  id: renderVariant.id,
  templateId,
  themeId: renderVariant.themeId,
  columns: renderVariant.columns ?? [],
  filters: renderVariant.filters,
},
```

- [ ] **Step 6: Add default Standings variant helper**

Add near `createDefaultRelativeVariant`:

```ts
function createDefaultStandingsVariant(id: string): WidgetVariantConfig {
  return {
    id,
    widgetType: "standings",
    templateId: STANDINGS_DEFAULT_TEMPLATE_ID,
    themeId: "vantare-racing",
    name: "Standings Default",
    columns: createDefaultStandingsColumns(),
  };
}
```

- [ ] **Step 7: Add `normalizeStandingsVariant`**

Add near `normalizeRelativeVariant`:

```ts
function normalizeStandingsVariant(variant: WidgetVariantConfig): WidgetVariantConfig {
  const defaults = createDefaultStandingsColumns();
  const current = variant.columns ?? [];
  const columns = defaults.map((defaultColumn) => {
    const existing = current.find((column) => column.id === defaultColumn.id);
    if (!existing) return defaultColumn;

    const mergedFormat = { ...(defaultColumn.format ?? {}), ...(existing.format ?? {}) };
    const mergedStyle = { ...(defaultColumn.style ?? {}), ...(existing.style ?? {}) };
    const result: ColumnConfig = {
      ...defaultColumn,
      ...existing,
    };
    if (Object.keys(mergedFormat).length > 0) {
      result.format = mergedFormat;
    }
    if (Object.keys(mergedStyle).length > 0) {
      result.style = mergedStyle;
    }
    return result;
  });

  return {
    ...variant,
    widgetType: "standings",
    templateId: variant.templateId ?? STANDINGS_DEFAULT_TEMPLATE_ID,
    columns,
  };
}
```

- [ ] **Step 8: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- widget-variants standings-catalog relative-catalog
```

Expected: PASS.

## Task 3: Regression Checks

- [ ] **Step 1: Type-check frontend**

Run:

```powershell
pnpm --dir frontend exec tsc -b
```

Expected: PASS.

- [ ] **Step 2: Build frontend**

Run:

```powershell
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 3: Whitespace check**

Run:

```powershell
git diff --check
```

Expected: exit code 0. CRLF warnings may appear and should be reported if they do, but whitespace errors must be fixed before reporting completion.

## Required Final Report

Report in Spanish:

- Archivos modificados.
- Tests/checks ejecutados y resultado.
- Checks no ejecutados y motivo.
- Confirmacion explicita de que no tocaste renderer, UI, backend, schema, configs ni docs.
- Confirmacion explicita de que `Relative` sigue pasando tests.
- Riesgos o dudas.

## Review Handoff

After implementation, do not self-approve the task. The orchestrator will send the diff/report to GLM for code review.

