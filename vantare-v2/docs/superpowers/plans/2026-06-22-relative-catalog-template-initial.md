> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# Relative Catalog And Template Initial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first persistent configurable `Relative` cut: a typed metric/template catalog, default variant columns, optional `bestLap` and `lastLap` columns, and minimal WidgetStudio controls to toggle them.

**Architecture:** Keep layout and widget configuration separated. `WidgetStudio` edits the selected widget variant (`profile.variants`) and never edits `position`; render paths combine a widget instance with its referenced variant before passing props to the overlay widget. The initial template is the current Vantare Relative, extended only through catalog-driven columns.

**Tech Stack:** React/TypeScript, Vitest, current Wails profile save flow, existing schema v2 profile types, no new dependencies.

---

## Context

Read before implementation:

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/beta-widget-system-spec.md`
- `docs/product-widget-customization.md`
- `docs/relative-current-inventory.md`
- `docs/superpowers/plans/2026-06-21-widget-profile-schema-v2.md`
- `frontend/src/lib/profile.ts`
- `frontend/src/overlay/widgets/RelativeWidget.tsx`
- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- `frontend/src/overlay/CompositeApp.tsx`
- `frontend/src/overlay/ObsOverlayApp.tsx`

Mockup reference:

- `C:\Users\isaac\Desktop\Vantare-Overlays\overlays_mockup.html`

Mockup assessment:

- Keep the current app's three-pane direction: left widget list, center preview, right settings.
- Useful ideas from the mockup: clearer right-panel section grouping, persistent source/status indicator, compact list/search on the left.
- Do not implement a global visual redesign in this plan.
- Do not add the mockup's layout/resize affordances to `WidgetStudio`; position and size remain `LayoutStudio` responsibility.

Existing dirty tree warning:

- Run `git status --short` before starting.
- `docs/INTEGRATION_ANALYSIS.md` may exist as an unrelated untracked file. Do not stage it unless the user explicitly changes scope.
- If working in a dedicated worker worktree, commit after each task.
- If working in the shared dirty tree, skip commits and report scoped diffs.

---

## Scope

Included:

- Relative metric catalog for the current base columns plus `bestLap` and `lastLap`.
- Relative default template/variant helpers for schema v2.
- Render support for enabled columns from variant config.
- Time formatter for `bestLapTime` and `lastLapTime`.
- Minimal Relative-specific settings inside `WidgetStudio` to toggle `bestLap` and `lastLap`.
- Manual verification checkpoints after frontend-visible phases.

Excluded:

- Column reordering.
- Filters (`rangeAhead`, `rangeBehind`, same class, include player) except preserving existing behavior.
- Advanced formats UI (decimals, hide minutes, widths, colors, alignment).
- New themes.
- Backend telemetry changes.
- LayoutStudio changes.
- Recommended profile copy rules.
- Session auto-switch.
- New dependencies.

---

## File Structure

Expected created files:

- `frontend/src/overlay/widgets/relative-catalog.ts`
  - Owns the Relative metric and template catalog, default columns, availability metadata, and helper lookup functions.
- `frontend/src/overlay/widgets/relative-catalog.test.ts`
  - Tests catalog ids, default columns, optional columns, and metric compatibility.
- `frontend/src/lib/widget-variants.ts`
  - Owns profile variant lookup, default Relative variant normalization, and widget props enrichment.
- `frontend/src/lib/widget-variants.test.ts`
  - Tests variant lookup, default creation, column toggles, and preservation of widget position.
- `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
  - Relative-specific controls rendered by `WidgetSettingsPanel`.
- `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`
  - Tests toggling optional columns updates variants and does not expose layout controls.

Expected modified files:

- `frontend/src/overlay/widgets/RelativeWidget.tsx`
  - Render active catalog columns instead of hardcoded row tail only.
- `frontend/src/overlay/widgets/RelativeWidget.test.tsx`
  - Add tests for default columns, optional `bestLap`/`lastLap`, fallback, and time formatting.
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
  - Adds the Relative-specific settings section below generic appearance settings.
- `frontend/src/hub/overlays/WidgetStudio.tsx`
  - Passes selected profile context through preview so variant config is visible.
- `frontend/src/hub/overlays/WidgetStudio.test.tsx`
  - Tests Relative controls appear only for `relative`.
- `frontend/src/hub/preview/PreviewWidgetFrame.tsx`
  - Accepts optional `profile` and enriches props with variant config.
- `frontend/src/overlay/CompositeApp.tsx`
  - Enriches live desktop overlay widget props with variant config.
- `frontend/src/overlay/ObsOverlayApp.tsx`
  - Enriches OBS overlay widget props with variant config.
- `docs/current-plan.md`
  - Update after successful implementation only.

Do not modify:

- `pkg/config/profile.go` unless a real schema bug is found.
- `internal/app/profile_service.go` unless save flow cannot persist variants; stop and report first.
- `LayoutStudio` files.

---

## Data Contract

Use existing schema v2 fields:

```ts
type WidgetVariantConfig = {
  id: string;
  widgetType: string;
  templateId?: string;
  themeId?: string;
  name?: string;
  columns?: ColumnConfig[];
  columnGroups?: ColumnGroupConfig[];
  props?: WidgetPropsMap;
};

type ColumnConfig = {
  id: string;
  metricId: string;
  enabled: boolean;
  width?: number;
  format?: Record<string, unknown>;
  style?: Record<string, unknown>;
};
```

For this cut, active Relative columns live in `variant.columns`.

Column ids:

- `position`
- `class`
- `carNumber`
- `driverName`
- `gap`
- `bestLap`
- `lastLap`

Metric ids:

- `position`
- `class`
- `carNumber`
- `driverName`
- `gap`
- `bestLap`
- `lastLap`

Default enabled columns:

- `position`
- `class`
- `carNumber`
- `driverName`
- `gap`

Default disabled optional columns:

- `bestLap`
- `lastLap`

Fallback:

- Missing lap time renders `-`.
- Missing player still renders existing `No player` state.
- Missing variant uses default Relative columns.

---

## Task 1: Relative Catalog

**Files:**

- Create: `frontend/src/overlay/widgets/relative-catalog.ts`
- Create: `frontend/src/overlay/widgets/relative-catalog.test.ts`

- [ ] **Step 1: Write failing catalog tests**

Create `frontend/src/overlay/widgets/relative-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  RELATIVE_DEFAULT_TEMPLATE_ID,
  RELATIVE_METRICS,
  createDefaultRelativeColumns,
  getRelativeColumn,
  getRelativeMetric,
  getRelativeTemplate,
} from "./relative-catalog";

describe("relative catalog", () => {
  it("declares the Vantare default template", () => {
    const template = getRelativeTemplate(RELATIVE_DEFAULT_TEMPLATE_ID);

    expect(template.id).toBe("relative-vantare-default");
    expect(template.columns.map((column) => column.id)).toEqual([
      "position",
      "class",
      "carNumber",
      "driverName",
      "gap",
      "bestLap",
      "lastLap",
    ]);
  });

  it("creates current Relative columns as enabled defaults", () => {
    const columns = createDefaultRelativeColumns();

    expect(columns.filter((column) => column.enabled).map((column) => column.id)).toEqual([
      "position",
      "class",
      "carNumber",
      "driverName",
      "gap",
    ]);
    expect(columns.find((column) => column.id === "bestLap")?.enabled).toBe(false);
    expect(columns.find((column) => column.id === "lastLap")?.enabled).toBe(false);
  });

  it("marks bestLap and lastLap as stable REST-backed metrics", () => {
    expect(getRelativeMetric("bestLap")).toMatchObject({
      id: "bestLap",
      sourceField: "bestLapTime",
      releaseChannel: "stable",
      reliability: "available",
      requiresLive: false,
    });
    expect(getRelativeMetric("lastLap")).toMatchObject({
      id: "lastLap",
      sourceField: "lastLapTime",
      releaseChannel: "stable",
      reliability: "available",
      requiresLive: false,
    });
  });

  it("keeps every template column backed by a compatible metric", () => {
    const template = getRelativeTemplate(RELATIVE_DEFAULT_TEMPLATE_ID);

    for (const column of template.columns) {
      const metric = getRelativeMetric(column.metricId);
      expect(metric.widgets).toContain("relative");
      expect(metric.columns).toContain(column.id);
    }
  });

  it("returns undefined for unknown catalog entries", () => {
    expect(getRelativeMetric("unknown")).toBeUndefined();
    expect(getRelativeColumn("unknown")).toBeUndefined();
  });

  it("does not reuse translated labels as ids", () => {
    expect(RELATIVE_METRICS.map((metric) => metric.id)).toEqual([
      "position",
      "class",
      "carNumber",
      "driverName",
      "gap",
      "bestLap",
      "lastLap",
    ]);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
pnpm --dir frontend test -- relative-catalog
```

Expected: FAIL because `relative-catalog.ts` does not exist.

- [ ] **Step 3: Implement catalog**

Create `frontend/src/overlay/widgets/relative-catalog.ts`:

```ts
import type { ColumnConfig } from "../../lib/profile";

export const RELATIVE_DEFAULT_TEMPLATE_ID = "relative-vantare-default";

export type RelativeMetricId =
  | "position"
  | "class"
  | "carNumber"
  | "driverName"
  | "gap"
  | "bestLap"
  | "lastLap";

export type RelativeColumnId = RelativeMetricId;

export type RelativeReleaseChannel = "stable" | "tester" | "dev";
export type RelativeReliability = "available" | "experimental" | "unavailable";
export type RelativeMockSupport = "realistic" | "placeholder" | "mockOnly";

export type RelativeMetricDefinition = {
  id: RelativeMetricId;
  label: string;
  sourceField: string;
  widgets: ["relative"];
  columns: RelativeColumnId[];
  defaultFallback: string;
  releaseChannel: RelativeReleaseChannel;
  reliability: RelativeReliability;
  mockSupport: RelativeMockSupport;
  requiresLive: boolean;
};

export type RelativeColumnDefinition = {
  id: RelativeColumnId;
  label: string;
  metricId: RelativeMetricId;
  defaultEnabled: boolean;
  defaultWidth: number;
  semanticRole: RelativeMetricId;
  align: "left" | "center" | "right";
};

export type RelativeTemplateDefinition = {
  id: string;
  label: string;
  columns: RelativeColumnDefinition[];
};

export const RELATIVE_METRICS: RelativeMetricDefinition[] = [
  {
    id: "position",
    label: "Posición",
    sourceField: "place",
    widgets: ["relative"],
    columns: ["position"],
    defaultFallback: "",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "class",
    label: "Clase",
    sourceField: "vehicleClass",
    widgets: ["relative"],
    columns: ["class"],
    defaultFallback: "",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "carNumber",
    label: "Número",
    sourceField: "driverNumber",
    widgets: ["relative"],
    columns: ["carNumber"],
    defaultFallback: "",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "driverName",
    label: "Piloto",
    sourceField: "driverName",
    widgets: ["relative"],
    columns: ["driverName"],
    defaultFallback: "?",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "gap",
    label: "Gap",
    sourceField: "timeGapToPlayer",
    widgets: ["relative"],
    columns: ["gap"],
    defaultFallback: "—",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "bestLap",
    label: "Mejor vuelta",
    sourceField: "bestLapTime",
    widgets: ["relative"],
    columns: ["bestLap"],
    defaultFallback: "-",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "lastLap",
    label: "Última vuelta",
    sourceField: "lastLapTime",
    widgets: ["relative"],
    columns: ["lastLap"],
    defaultFallback: "-",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
];

export const RELATIVE_COLUMNS: RelativeColumnDefinition[] = [
  { id: "position", label: "Posición", metricId: "position", defaultEnabled: true, defaultWidth: 24, semanticRole: "position", align: "center" },
  { id: "class", label: "Clase", metricId: "class", defaultEnabled: true, defaultWidth: 6, semanticRole: "class", align: "center" },
  { id: "carNumber", label: "Número", metricId: "carNumber", defaultEnabled: true, defaultWidth: 28, semanticRole: "carNumber", align: "center" },
  { id: "driverName", label: "Piloto", metricId: "driverName", defaultEnabled: true, defaultWidth: 120, semanticRole: "driverName", align: "left" },
  { id: "gap", label: "Gap", metricId: "gap", defaultEnabled: true, defaultWidth: 48, semanticRole: "gap", align: "right" },
  { id: "bestLap", label: "Mejor vuelta", metricId: "bestLap", defaultEnabled: false, defaultWidth: 62, semanticRole: "bestLap", align: "right" },
  { id: "lastLap", label: "Última vuelta", metricId: "lastLap", defaultEnabled: false, defaultWidth: 62, semanticRole: "lastLap", align: "right" },
];

export const RELATIVE_TEMPLATES: RelativeTemplateDefinition[] = [
  {
    id: RELATIVE_DEFAULT_TEMPLATE_ID,
    label: "Vantare Relative",
    columns: RELATIVE_COLUMNS,
  },
];

export function getRelativeMetric(id: string): RelativeMetricDefinition | undefined {
  return RELATIVE_METRICS.find((metric) => metric.id === id);
}

export function getRelativeColumn(id: string): RelativeColumnDefinition | undefined {
  return RELATIVE_COLUMNS.find((column) => column.id === id);
}

export function getRelativeTemplate(id: string): RelativeTemplateDefinition {
  return RELATIVE_TEMPLATES.find((template) => template.id === id) ?? RELATIVE_TEMPLATES[0];
}

export function createDefaultRelativeColumns(): ColumnConfig[] {
  return RELATIVE_COLUMNS.map((column) => ({
    id: column.id,
    metricId: column.metricId,
    enabled: column.defaultEnabled,
    width: column.defaultWidth,
  }));
}
```

- [ ] **Step 4: Run focused test**

Run:

```powershell
pnpm --dir frontend test -- relative-catalog
```

Expected: PASS.

- [ ] **Step 5: Commit or report scoped diff**

Dedicated clean worker worktree:

```powershell
git add frontend/src/overlay/widgets/relative-catalog.ts frontend/src/overlay/widgets/relative-catalog.test.ts
git commit -m "feat: add relative metric catalog"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/overlay/widgets/relative-catalog.ts frontend/src/overlay/widgets/relative-catalog.test.ts
```

---

## Task 2: Variant Helpers

**Files:**

- Create: `frontend/src/lib/widget-variants.ts`
- Create: `frontend/src/lib/widget-variants.test.ts`

- [ ] **Step 1: Write failing variant helper tests**

Create `frontend/src/lib/widget-variants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "./profile";
import {
  enrichWidgetPropsWithVariant,
  findWidgetVariant,
  toggleRelativeColumn,
  withDefaultWidgetVariants,
} from "./widget-variants";

function relativeWidget(): WidgetConfig {
  return {
    id: "relative",
    type: "relative",
    variantId: "variant-relative-default",
    enabled: true,
    updateHz: 15,
    position: { x: 40, y: 600, w: 320, h: 280 },
    props: { rangeAhead: 3, rangeBehind: 3, style: "vantare-racing" },
  };
}

function profile(): ProfileConfig {
  return {
    schemaVersion: 2,
    id: "v2",
    displayMode: "edit",
    monitorIndex: 0,
    widgets: [relativeWidget()],
    variants: [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        themeId: "vantare-racing",
        name: "Relative Default",
      },
    ],
  };
}

describe("widget variants", () => {
  it("finds the selected widget variant", () => {
    const p = profile();

    expect(findWidgetVariant(p, p.widgets[0])?.id).toBe("variant-relative-default");
  });

  it("adds default Relative columns without changing widget position", () => {
    const p = withDefaultWidgetVariants(profile());
    const variant = p.variants?.[0];

    expect(p.widgets[0].position).toEqual({ x: 40, y: 600, w: 320, h: 280 });
    expect(variant?.columns?.map((column) => [column.id, column.enabled])).toEqual([
      ["position", true],
      ["class", true],
      ["carNumber", true],
      ["driverName", true],
      ["gap", true],
      ["bestLap", false],
      ["lastLap", false],
    ]);
  });

  it("toggles a Relative optional column in the variant only", () => {
    const p = withDefaultWidgetVariants(profile());
    const next = toggleRelativeColumn(p, "relative", "bestLap", true);

    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
    expect(next.widgets[0].props).toEqual(p.widgets[0].props);
    expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.enabled).toBe(true);
  });

  it("enriches widget props with variant columns for renderers", () => {
    const p = toggleRelativeColumn(withDefaultWidgetVariants(profile()), "relative", "lastLap", true);
    const props = enrichWidgetPropsWithVariant(p, p.widgets[0]);

    expect(props.rangeAhead).toBe(3);
    expect(props.style).toBe("vantare-racing");
    expect(props.variant?.templateId).toBe("relative-vantare-default");
    expect(props.variant?.columns.find((column) => column.id === "lastLap")?.enabled).toBe(true);
  });

  it("ignores unknown column toggles", () => {
    const p = withDefaultWidgetVariants(profile());
    const next = toggleRelativeColumn(p, "relative", "unknown", true);

    expect(next).toBe(p);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
pnpm --dir frontend test -- widget-variants
```

Expected: FAIL because helper module does not exist.

- [ ] **Step 3: Implement variant helpers**

Create `frontend/src/lib/widget-variants.ts`:

```ts
import type { ColumnConfig, ProfileConfig, WidgetConfig, WidgetPropsMap, WidgetVariantConfig } from "./profile";
import { RELATIVE_DEFAULT_TEMPLATE_ID, createDefaultRelativeColumns, getRelativeColumn } from "../overlay/widgets/relative-catalog";

type RenderVariant = {
  id: string;
  templateId: string;
  themeId?: string;
  columns: ColumnConfig[];
};

export type WidgetPropsWithVariant = WidgetPropsMap & {
  variant?: RenderVariant;
};

export function findWidgetVariant(profile: ProfileConfig, widget: WidgetConfig): WidgetVariantConfig | undefined {
  if (!widget.variantId) return undefined;
  return profile.variants?.find((variant) => variant.id === widget.variantId && variant.widgetType === widget.type);
}

export function withDefaultWidgetVariants(profile: ProfileConfig): ProfileConfig {
  const variants = [...(profile.variants ?? [])];
  let changed = false;

  for (const widget of profile.widgets) {
    if (widget.type !== "relative" || !widget.variantId) continue;
    const index = variants.findIndex((variant) => variant.id === widget.variantId);
    if (index === -1) {
      variants.push(createDefaultRelativeVariant(widget.variantId));
      changed = true;
      continue;
    }
    const current = variants[index];
    if (!current.columns || current.columns.length === 0 || !current.templateId) {
      variants[index] = normalizeRelativeVariant(current);
      changed = true;
    }
  }

  return changed ? { ...profile, variants } : profile;
}

export function toggleRelativeColumn(
  profile: ProfileConfig,
  widgetId: string,
  columnId: string,
  enabled: boolean,
): ProfileConfig {
  if (!getRelativeColumn(columnId)) return profile;

  const base = withDefaultWidgetVariants(profile);
  const widget = base.widgets.find((item) => item.id === widgetId && item.type === "relative");
  if (!widget?.variantId) return profile;

  const variants = (base.variants ?? []).map((variant) => {
    if (variant.id !== widget.variantId || variant.widgetType !== "relative") return variant;
    const normalized = normalizeRelativeVariant(variant);
    return {
      ...normalized,
      columns: normalized.columns?.map((column) =>
        column.id === columnId ? { ...column, enabled } : column,
      ),
    };
  });

  return { ...base, variants };
}

export function enrichWidgetPropsWithVariant(profile: ProfileConfig | null | undefined, widget: WidgetConfig): WidgetPropsWithVariant {
  const props: WidgetPropsWithVariant = {
    ...(widget.props ?? {}),
    style: widget.style ?? widget.props?.style,
  };
  if (!profile) return props;

  const normalized = withDefaultWidgetVariants(profile);
  const variant = findWidgetVariant(normalized, widget);
  if (!variant) return props;

  const relativeVariant = widget.type === "relative" ? normalizeRelativeVariant(variant) : variant;
  return {
    ...props,
    variant: {
      id: relativeVariant.id,
      templateId: relativeVariant.templateId ?? RELATIVE_DEFAULT_TEMPLATE_ID,
      themeId: relativeVariant.themeId,
      columns: relativeVariant.columns ?? [],
    },
  };
}

function createDefaultRelativeVariant(id: string): WidgetVariantConfig {
  return {
    id,
    widgetType: "relative",
    templateId: RELATIVE_DEFAULT_TEMPLATE_ID,
    themeId: "vantare-racing",
    name: "Relative Default",
    columns: createDefaultRelativeColumns(),
  };
}

function normalizeRelativeVariant(variant: WidgetVariantConfig): WidgetVariantConfig {
  const defaults = createDefaultRelativeColumns();
  const current = variant.columns ?? [];
  const columns = defaults.map((defaultColumn) => {
    const existing = current.find((column) => column.id === defaultColumn.id);
    return existing ? { ...defaultColumn, ...existing } : defaultColumn;
  });

  return {
    ...variant,
    widgetType: "relative",
    templateId: variant.templateId ?? RELATIVE_DEFAULT_TEMPLATE_ID,
    columns,
  };
}
```

- [ ] **Step 4: Run focused test**

Run:

```powershell
pnpm --dir frontend test -- widget-variants
```

Expected: PASS.

- [ ] **Step 5: Commit or report scoped diff**

Dedicated clean worker worktree:

```powershell
git add frontend/src/lib/widget-variants.ts frontend/src/lib/widget-variants.test.ts
git commit -m "feat: resolve widget variants in frontend"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/lib/widget-variants.ts frontend/src/lib/widget-variants.test.ts
```

---

## Task 3: Render Relative Columns From Variant

**Files:**

- Modify: `frontend/src/overlay/widgets/RelativeWidget.tsx`
- Modify: `frontend/src/overlay/widgets/RelativeWidget.test.tsx`

- [ ] **Step 1: Add failing renderer tests**

Append to `frontend/src/overlay/widgets/RelativeWidget.test.tsx`:

```ts
it("renders best lap and last lap columns when enabled by variant", () => {
  render(
    <RelativeWidget
      editMode={true}
      updateHz={15}
      props={{
        variant: {
          id: "variant-relative-default",
          templateId: "relative-vantare-default",
          columns: [
            { id: "position", metricId: "position", enabled: true },
            { id: "class", metricId: "class", enabled: true },
            { id: "carNumber", metricId: "carNumber", enabled: true },
            { id: "driverName", metricId: "driverName", enabled: true },
            { id: "gap", metricId: "gap", enabled: true },
            { id: "bestLap", metricId: "bestLap", enabled: true },
            { id: "lastLap", metricId: "lastLap", enabled: true },
          ],
        },
      }}
    />,
  );

  tick(100);

  expect(screen.getByText("1:30.876")).toBeTruthy();
  expect(screen.getByText("1:29.455")).toBeTruthy();
});

it("keeps optional lap columns hidden by default", () => {
  render(<RelativeWidget editMode={true} updateHz={15} />);

  tick(100);

  expect(screen.queryByText("1:30.876")).toBeNull();
  expect(screen.queryByText("1:29.455")).toBeNull();
});

it("formats missing lap times with dash fallback", () => {
  render(
    <RelativeWidget
      editMode={true}
      updateHz={15}
      props={{
        variant: {
          id: "variant-relative-default",
          templateId: "relative-vantare-default",
          columns: [
            { id: "driverName", metricId: "driverName", enabled: true },
            { id: "bestLap", metricId: "bestLap", enabled: true },
          ],
        },
      }}
    />,
  );

  tick(100);

  expect(screen.getAllByText("-").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
pnpm --dir frontend test -- RelativeWidget
```

Expected: FAIL because optional columns are not rendered yet.

- [ ] **Step 3: Add formatter and active column resolver**

In `frontend/src/overlay/widgets/RelativeWidget.tsx`, import:

```ts
import type { ColumnConfig } from "../../lib/profile";
import { createDefaultRelativeColumns } from "./relative-catalog";
```

Add these helpers near `formatSignedGap`:

```ts
type RelativeRenderVariant = {
  columns?: ColumnConfig[];
};

function getActiveRelativeColumns(props?: Record<string, unknown>): ColumnConfig[] {
  const variant = props?.variant as RelativeRenderVariant | undefined;
  const sourceColumns = variant?.columns?.length ? variant.columns : createDefaultRelativeColumns();
  return sourceColumns.filter((column) => column.enabled);
}

export function formatLapTime(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "-";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${minutes}:${remaining.toFixed(3).padStart(6, "0")}`;
}
```

- [ ] **Step 4: Render known column ids**

Inside the frame loop, before building the fingerprint, add:

```ts
      const activeColumns = getActiveRelativeColumns(props);
```

Update the fingerprint to include optional lap fields and active columns:

```ts
      const columnFingerprint = activeColumns.map((column) => `${column.id}:${column.metricId}:${column.enabled}`).join(",");
      const fingerprint = `${columnFingerprint}|${visible.map(v =>
        `${v.id}:${v.place}:${v.timeGapToPlayer?.toFixed(2)}:${v.inPits}:${v.vehicleClass}:${v.driverNumber}:${v.driverName}:${v.teamBrandColor}:${v.bestLapTime}:${v.lastLapTime}:${v.isPlayer}`
      ).join("|")}`;
```

Replace the hardcoded row cell body with a `cells` array. Keep existing styles for current default columns:

```ts
        const cells = activeColumns.map((column) => {
          switch (column.id) {
          case "position":
            return `<div class="w-6 text-center shrink-0" style="color:#9CA3AF">${v.place ?? ""}</div>`;
          case "class":
            return `<div class="w-1.5 h-full shrink-0" style="background:${resolveClassColor(v.vehicleClass, a)}"></div>`;
          case "carNumber":
            return numberCell;
          case "driverName":
            return `<div class="flex-1 px-2 tracking-wide truncate" style="color:${isP ? "#FFFFFF" : "#E5E7EB"}">${escapeHTML(truncate(v.driverName ?? "?", 18))}</div>`;
          case "gap":
            return `<div class="px-2 flex items-center justify-end font-mono text-[10px] shrink-0">
              <span style="color:${gapColor}">${gapDisplay}</span>
            </div>`;
          case "bestLap":
            return `<div class="px-2 w-[62px] flex items-center justify-end font-mono text-[10px] shrink-0" style="color:${a.textColor}">
              ${escapeHTML(formatLapTime(v.bestLapTime))}
            </div>`;
          case "lastLap":
            return `<div class="px-2 w-[62px] flex items-center justify-end font-mono text-[10px] shrink-0" style="color:${a.textColor}">
              ${escapeHTML(formatLapTime(v.lastLapTime))}
            </div>`;
          default:
            return "";
          }
        }).join("");
```

Then use `${cells}` in the row:

```ts
        return `<div class="flex items-center text-[11px] font-bold border-b border-black/20 transition-all" style="height:${rowHeight}px;background:${isP ? BAKED_PLAYER_BG : bgRow};${leftInset}">
          ${cells}
        </div>`;
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- RelativeWidget
```

Expected: PASS.

- [ ] **Step 6: Manual verification checkpoint A**

Run the app or frontend dev flow used in this repo.

Manual check:

1. Open `Overlays Studio`.
2. Enter `Widgets`.
3. Select `relative`.
4. Confirm default Relative preview still visually matches the previous base layout.
5. Confirm no `bestLap` or `lastLap` column appears yet without controls.
6. Confirm `WidgetStudio` still does not show position/size controls.

Report whether this was completed. If not completed, explain why.

- [ ] **Step 7: Commit or report scoped diff**

Dedicated clean worker worktree:

```powershell
git add frontend/src/overlay/widgets/RelativeWidget.tsx frontend/src/overlay/widgets/RelativeWidget.test.tsx
git commit -m "feat: render relative variant columns"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/overlay/widgets/RelativeWidget.tsx frontend/src/overlay/widgets/RelativeWidget.test.tsx
```

---

## Task 4: Pass Variant Props To Preview And Live Renderers

**Files:**

- Modify: `frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- Modify: `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- Modify: `frontend/src/hub/overlays/WidgetStudio.tsx`
- Modify: `frontend/src/overlay/CompositeApp.tsx`
- Modify: `frontend/src/overlay/ObsOverlayApp.tsx`
- Modify: existing focused tests as needed.

- [ ] **Step 1: Add failing preview integration test**

Append to `frontend/src/hub/overlays/WidgetStudio.test.tsx`:

```ts
it("passes selected widget variants to the widget preview", async () => {
  const relativeProfile: ProfileConfig = {
    ...profile,
    schemaVersion: 2,
    widgets: [
      {
        id: "relative",
        type: "relative",
        variantId: "variant-relative-default",
        enabled: true,
        updateHz: 15,
        position: { x: 40, y: 600, w: 420, h: 280 },
      },
    ],
    variants: [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        columns: [
          { id: "driverName", metricId: "driverName", enabled: true },
          { id: "bestLap", metricId: "bestLap", enabled: true },
        ],
      },
    ],
  };

  render(
    <WidgetStudio
      profile={relativeProfile}
      selectedWidgetId="relative"
      dirty={false}
      saveState="idle"
      onSelectWidget={vi.fn()}
      onChangeProfile={vi.fn()}
      onSave={vi.fn()}
      onBack={vi.fn()}
    />,
  );

  expect(await screen.findByText("1:30.876")).toBeTruthy();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio
```

Expected: FAIL because preview renderers do not receive variant config yet.

- [ ] **Step 3: Thread profile into preview frame**

In `frontend/src/hub/preview/PreviewWidgetFrame.tsx`:

1. Import:

```ts
import type { ProfileConfig, Rect, WidgetConfig } from "../../lib/profile";
import { enrichWidgetPropsWithVariant } from "../../lib/widget-variants";
```

2. Add prop:

```ts
  profile?: ProfileConfig | null;
```

3. Include `profile` in function args.

4. Replace component props:

```tsx
<Component
  editMode={true}
  telemetryMode="mock"
  updateHz={widget.updateHz}
  props={enrichWidgetPropsWithVariant(profile, widget)}
/>
```

- [ ] **Step 4: Pass profile through WidgetPreviewPanel and WidgetStudio**

In `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`, add `profile` prop:

```ts
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";

type WidgetPreviewPanelProps = {
  profile: ProfileConfig;
  activeWidget: WidgetConfig | null;
};
```

Pass it to `PreviewWidgetFrame`:

```tsx
<PreviewWidgetFrame
  profile={profile}
  widget={activeWidget}
  selected={false}
  scale={1}
  disabled={true}
  onSelect={() => {}}
/>
```

In `frontend/src/hub/overlays/WidgetStudio.tsx`, update:

```tsx
<WidgetPreviewPanel profile={profile} activeWidget={selectedWidget} />
```

- [ ] **Step 5: Enrich desktop and OBS overlay renderers**

In both `frontend/src/overlay/CompositeApp.tsx` and `frontend/src/overlay/ObsOverlayApp.tsx`, import:

```ts
import { enrichWidgetPropsWithVariant } from "../lib/widget-variants";
```

Replace:

```tsx
props={{ ...w.props, style: w.style ?? w.props?.style }}
```

with:

```tsx
props={enrichWidgetPropsWithVariant(profile, w)}
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio WidgetPreviewPanel
```

Expected: PASS.

- [ ] **Step 7: Manual verification checkpoint B**

Manual check:

1. Open `Overlays Studio`.
2. Enter `Widgets`.
3. Select `relative`.
4. Temporarily use a profile whose `variants[0].columns` enables `bestLap`.
5. Confirm the center preview shows the best lap column.
6. Open overlay from a profile that has the variant enabled.
7. Confirm the overlay window also shows the same column.
8. Confirm the widget position and size did not change.

Report whether this was completed. If not completed, explain why.

- [ ] **Step 8: Commit or report scoped diff**

Dedicated clean worker worktree:

```powershell
git add frontend/src/hub/preview/PreviewWidgetFrame.tsx frontend/src/hub/overlays/WidgetPreviewPanel.tsx frontend/src/hub/overlays/WidgetStudio.tsx frontend/src/overlay/CompositeApp.tsx frontend/src/overlay/ObsOverlayApp.tsx frontend/src/hub/overlays/WidgetStudio.test.tsx
git commit -m "feat: pass widget variants to renderers"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/hub/preview/PreviewWidgetFrame.tsx frontend/src/hub/overlays/WidgetPreviewPanel.tsx frontend/src/hub/overlays/WidgetStudio.tsx frontend/src/overlay/CompositeApp.tsx frontend/src/overlay/ObsOverlayApp.tsx frontend/src/hub/overlays/WidgetStudio.test.tsx
```

---

## Task 5: Minimal Relative WidgetStudio Controls

**Files:**

- Create: `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
- Create: `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`
- Modify: `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- Modify: `frontend/src/hub/overlays/WidgetStudio.test.tsx`

- [ ] **Step 1: Write failing settings tests**

Create `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`:

```ts
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProfileConfig } from "../../lib/profile";
import { RelativeSettingsSection } from "./RelativeSettingsSection";

function profile(): ProfileConfig {
  return {
    schemaVersion: 2,
    id: "v2",
    displayMode: "edit",
    monitorIndex: 0,
    widgets: [
      {
        id: "relative",
        type: "relative",
        variantId: "variant-relative-default",
        enabled: true,
        position: { x: 40, y: 600, w: 320, h: 280 },
      },
    ],
    variants: [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        columns: [
          { id: "position", metricId: "position", enabled: true },
          { id: "class", metricId: "class", enabled: true },
          { id: "carNumber", metricId: "carNumber", enabled: true },
          { id: "driverName", metricId: "driverName", enabled: true },
          { id: "gap", metricId: "gap", enabled: true },
          { id: "bestLap", metricId: "bestLap", enabled: false },
          { id: "lastLap", metricId: "lastLap", enabled: false },
        ],
      },
    ],
  };
}

describe("RelativeSettingsSection", () => {
  it("toggles best lap column in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.click(screen.getByLabelText("Mostrar mejor vuelta"));

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
    expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.enabled).toBe(true);
  });

  it("toggles last lap column in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.click(screen.getByLabelText("Mostrar última vuelta"));

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].columns?.find((column) => column.id === "lastLap")?.enabled).toBe(true);
  });

  it("does not render for non-relative widgets", () => {
    const p = profile();
    const widget = { ...p.widgets[0], id: "delta", type: "delta" };

    const { container } = render(
      <RelativeSettingsSection profile={p} widget={widget} onChangeProfile={vi.fn()} />,
    );

    expect(container.textContent).toBe("");
  });
});
```

Append to `frontend/src/hub/overlays/WidgetStudio.test.tsx`:

```ts
it("shows Relative column controls for the Relative widget", () => {
  const relativeProfile: ProfileConfig = {
    ...profile,
    schemaVersion: 2,
    widgets: [
      {
        id: "relative",
        type: "relative",
        variantId: "variant-relative-default",
        enabled: true,
        position: { x: 40, y: 600, w: 320, h: 280 },
      },
    ],
    variants: [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
      },
    ],
  };

  render(
    <WidgetStudio
      profile={relativeProfile}
      selectedWidgetId="relative"
      dirty={false}
      saveState="idle"
      onSelectWidget={vi.fn()}
      onChangeProfile={vi.fn()}
      onSave={vi.fn()}
      onBack={vi.fn()}
    />,
  );

  expect(screen.getByText("COLUMNAS RELATIVE")).toBeTruthy();
  expect(screen.getByLabelText("Mostrar mejor vuelta")).toBeTruthy();
  expect(screen.getByLabelText("Mostrar última vuelta")).toBeTruthy();
  expect(screen.queryByText("POSICIÓN Y TAMAÑO")).toBeNull();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --dir frontend test -- RelativeSettingsSection WidgetStudio
```

Expected: FAIL because the settings section does not exist.

- [ ] **Step 3: Implement RelativeSettingsSection**

Create `frontend/src/hub/overlays/RelativeSettingsSection.tsx`:

```tsx
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { findWidgetVariant, toggleRelativeColumn, withDefaultWidgetVariants } from "../../lib/widget-variants";

type RelativeSettingsSectionProps = {
  profile: ProfileConfig;
  widget: WidgetConfig;
  onChangeProfile: (profile: ProfileConfig) => void;
};

export function RelativeSettingsSection({ profile, widget, onChangeProfile }: RelativeSettingsSectionProps) {
  if (widget.type !== "relative") return null;

  const normalized = withDefaultWidgetVariants(profile);
  const variant = findWidgetVariant(normalized, widget);
  const columns = variant?.columns ?? [];
  const bestLapEnabled = columns.find((column) => column.id === "bestLap")?.enabled ?? false;
  const lastLapEnabled = columns.find((column) => column.id === "lastLap")?.enabled ?? false;

  return (
    <section className="border-t border-white/5 bg-vantare-panel px-5 py-4">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-vantare-text">COLUMNAS RELATIVE</h3>
      <div className="space-y-3">
        <label className="flex cursor-pointer select-none items-center justify-between gap-3 text-sm text-white">
          <span>
            <span className="block text-xs font-medium">Mostrar mejor vuelta</span>
            <span className="block text-[10px] text-vantare-textMuted">Añade `bestLap` como columna opcional.</span>
          </span>
          <input
            type="checkbox"
            checked={bestLapEnabled}
            onChange={(event) => onChangeProfile(toggleRelativeColumn(normalized, widget.id, "bestLap", event.target.checked))}
          />
        </label>
        <label className="flex cursor-pointer select-none items-center justify-between gap-3 text-sm text-white">
          <span>
            <span className="block text-xs font-medium">Mostrar última vuelta</span>
            <span className="block text-[10px] text-vantare-textMuted">Añade `lastLap` como columna opcional.</span>
          </span>
          <input
            type="checkbox"
            checked={lastLapEnabled}
            onChange={(event) => onChangeProfile(toggleRelativeColumn(normalized, widget.id, "lastLap", event.target.checked))}
          />
        </label>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Render section in WidgetSettingsPanel**

In `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`, import:

```ts
import { RelativeSettingsSection } from "./RelativeSettingsSection";
```

Replace the direct return with:

```tsx
  return (
    <div className="min-h-0">
      <PreviewInspector
        profile={profile}
        widget={widget}
        onChangeProfile={onChangeProfile}
        disabled={false}
        showPositionControls={false}
        showDangerActions={false}
      />
      {widget && (
        <RelativeSettingsSection
          profile={profile}
          widget={widget}
          onChangeProfile={onChangeProfile}
        />
      )}
    </div>
  );
```

If this creates nested scroll or clipping, adjust only this wrapper and the existing right panel. Do not redesign the whole page.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- RelativeSettingsSection WidgetStudio
```

Expected: PASS.

- [ ] **Step 6: Manual verification checkpoint C**

Manual check:

1. Open `Overlays Studio`.
2. Enter `Widgets`.
3. Select `relative`.
4. Confirm the right panel shows `COLUMNAS RELATIVE`.
5. Enable `Mostrar mejor vuelta`.
6. Confirm the preview adds a best-lap column and the widget naturally becomes denser/wider internally if needed.
7. Enable `Mostrar última vuelta`.
8. Confirm the preview adds a last-lap column.
9. Click `Guardar`.
10. Reload or re-open the profile.
11. Confirm both toggles remain persisted.
12. Confirm `WidgetStudio` still has no `POSICIÓN Y TAMAÑO`, X/Y/W/H, delete, drag, or resize controls.

Report whether this was completed. If not completed, explain why.

- [ ] **Step 7: Commit or report scoped diff**

Dedicated clean worker worktree:

```powershell
git add frontend/src/hub/overlays/RelativeSettingsSection.tsx frontend/src/hub/overlays/RelativeSettingsSection.test.tsx frontend/src/hub/overlays/WidgetSettingsPanel.tsx frontend/src/hub/overlays/WidgetStudio.test.tsx
git commit -m "feat: add relative column controls"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/hub/overlays/RelativeSettingsSection.tsx frontend/src/hub/overlays/RelativeSettingsSection.test.tsx frontend/src/hub/overlays/WidgetSettingsPanel.tsx frontend/src/hub/overlays/WidgetStudio.test.tsx
```

---

## Task 6: Final Checks And Documentation

**Files:**

- Modify: `docs/current-plan.md`

- [ ] **Step 1: Run full frontend checks**

Run:

```powershell
pnpm --dir frontend test -- relative-catalog widget-variants RelativeWidget RelativeSettingsSection WidgetStudio WidgetPreviewPanel profile-editor
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 2: Run relevant Go checks**

Run:

```powershell
go test ./pkg/config ./internal/app
```

Expected: PASS. No Go code should have changed, but this confirms schema v2 save paths still pass.

- [ ] **Step 3: Run diff hygiene**

Run:

```powershell
git diff --check
```

Expected: no errors. CRLF warnings may appear if already present; report them exactly.

- [ ] **Step 4: Update current plan**

In `docs/current-plan.md`, add under `## Estado actual` after the schema v2 section:

```md
Primer corte configurable de `Relative` preparado:
- Existe catalogo frontend para metricas/columnas del `Relative` inicial.
- `bestLap` y `lastLap` se modelan como columnas opcionales persistentes en variantes schema v2.
- `WidgetStudio` puede activar/desactivar esas columnas sin tocar posicion ni tamano.
- Preview, overlay desktop y OBS leen la variante referenciada por cada widget.
```

Remove or update the old next task:

```md
6. Crear el miniplan de catalogo/template inicial de `Relative` usando `bestLap` y `lastLap` como primeras columnas opcionales persistentes.
```

Replace it with:

```md
6. Revisar el primer corte configurable de `Relative` con code review adversarial antes de avanzar a formatos, filtros o themes.
7. Crear miniplan separado para formatos de columnas de `Relative` (`1:35.765`, `35.765`, decimales, ancho, color y alineacion).
```

- [ ] **Step 5: Manual verification checkpoint D**

Final manual check:

1. Start the app.
2. Open `Overlays Studio`.
3. Enter `Widgets`.
4. Select `relative`.
5. Confirm the editor uses the current three-pane structure.
6. Confirm mock/demo state is still visible somewhere in Hub/editor if already implemented; if not visible, report as existing product gap, not a blocker for this plan.
7. Enable `bestLap` and `lastLap`.
8. Save.
9. Reopen the app/profile.
10. Confirm toggles persist.
11. Open the overlay desktop from the profile.
12. Confirm the overlay shows the same columns.
13. Confirm `LayoutStudio` still owns position/size and `WidgetStudio` does not.
14. Confirm no visible `MOCK` badge appears in the final overlay window by default.

- [ ] **Step 6: Commit or report scoped diff**

Dedicated clean worker worktree:

```powershell
git add docs/current-plan.md
git commit -m "docs: record relative configurable column cut"
```

Shared dirty tree:

```powershell
git diff -- docs/current-plan.md
```

---

## Review Checklist

Before handing off:

- [ ] `Relative` default render still shows the current five base columns.
- [ ] `bestLap` and `lastLap` are hidden by default.
- [ ] `bestLap` and `lastLap` can be enabled independently.
- [ ] Enabled optional columns render in WidgetStudio preview.
- [ ] Enabled optional columns render in desktop overlay.
- [ ] Enabled optional columns render in OBS overlay.
- [ ] Missing lap values render `-`.
- [ ] No telemetry/backend change was made.
- [ ] No dependency was added.
- [ ] `WidgetStudio` does not expose position/size/delete controls.
- [ ] `LayoutStudio` does not expose column/metric controls.
- [ ] Widget `position` is unchanged when toggling columns.
- [ ] Variant config is persisted in `profile.variants`, not as opaque `props.showBestLap`.
- [ ] The mockup HTML was used only as layout guidance, not copied wholesale.
- [ ] Manual verification checkpoints A-D were either completed or explicitly reported as not run.

---

## Risks And Follow-Ups

Known risks:

- The current profile save event sends only `{ widgets }`; if variants are not persisted by the existing backend path, the worker must stop and report before changing backend contracts.
- `WidgetSettingsPanel` may need minor layout adjustments to avoid nested scroll after adding `RelativeSettingsSection`.
- Column width/format customization is intentionally deferred, so enabling both lap columns may look dense in small widget sizes.
- `teamBrandColor` remains mock-only and is not fixed by this plan.
- Advanced time format choices remain product decisions for the next miniplan.

Next miniplans after review:

1. Relative column formats: `1:35.765` vs `35.765`, decimals, width, color, alignment.
2. Relative filters: cars ahead/behind, same class/all, include player.
3. Shared catalog extraction for Standings after Relative proves the pattern.

---

## Final Report Requirements

The worker must report in Spanish:

- Archivos creados/modificados/movidos.
- Tests/checks ejecutados and result.
- Checks not run and reason.
- Whether the worker committed or only produced scoped diffs.
- Manual verification checkpoints completed or not completed.
- Remaining risks, especially persistence of variants and visual density with optional columns.
