# Relative Column Formats And Widths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Relative` optional columns usable by adding column format controls, explicit name truncation policy, and intrinsic auto-width behavior without editing layout position or size from `WidgetStudio`.

**Architecture:** Keep configuration in schema v2 `variant.columns[].format/style/width`, not in ad hoc widget props. `RelativeWidget` computes its intrinsic content width from the active columns and format choices, then renders wider internally when needed; `WidgetStudio` exposes only internal column formatting controls. Layout coordinates (`x/y/w/h`) remain untouched.

**Tech Stack:** React/TypeScript, existing profile schema v2, Vitest, current Wails save flow, no new dependencies.

---

## Context

Read before implementation:

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/beta-widget-system-spec.md`
- `docs/product-widget-customization.md`
- `docs/relative-current-inventory.md`
- `docs/superpowers/plans/2026-06-22-relative-catalog-template-initial.md`
- `frontend/src/overlay/widgets/RelativeWidget.tsx`
- `frontend/src/overlay/widgets/relative-catalog.ts`
- `frontend/src/lib/widget-variants.ts`
- `frontend/src/lib/profile.ts`
- `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
- `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- `frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- `frontend/src/overlay/WidgetHost.tsx`

User-approved product rule for this plan:

- Driver names must not be truncated automatically when optional columns are enabled.
- Name truncation should happen only if the user chooses it or the template explicitly defines it.
- When `bestLap` and `lastLap` are enabled, `Relative` should prefer growing horizontally/intrinsically over compressing names.

Current known behavior to fix:

- `RelativeWidget` hard-truncates names via `truncate(name, 18)`.
- The driver-name cell uses `flex-1 ... truncate`, so optional columns compress names.
- Lap times always render as `m:ss.mmm`.
- Column widths are stored in catalog defaults but not meaningfully user-configurable.
- `WidgetPreviewPanel` still sizes the preview frame from `widget.position.w`, so intrinsic width can be visually clipped if not handled.

Existing dirty tree warning:

- `configs/example-racing.json` and `configs/custom-hfg.json` may be modified by manual verification autosave. Do not stage or commit them unless the user explicitly asks.
- `docs/INTEGRATION_ANALYSIS.md` and `docs/marketing/` are unrelated user/analysis files. Do not stage or commit them.

---

## Scope

Included:

- Relative column format helpers for:
  - lap time display: `full` (`1:35.765`) or `compact` (`35.765`);
  - lap decimals: `0`, `1`, `2`, or `3`;
  - driver name mode: `full` or `truncate`;
  - driver name max characters when truncation is enabled;
  - column width override;
  - column text color override;
  - column alignment override.
- Rendering changes:
  - no default name truncation;
  - intrinsic min-width from active columns;
  - lap format applied per column;
  - width/color/alignment applied per column where configured.
- WidgetStudio controls for first stable subset:
  - `bestLap`/`lastLap` display mode;
  - decimals;
  - width;
  - text color;
  - alignment;
  - driver name full/truncate and max characters.
- Preview support so the isolated preview shows widened `Relative` instead of clipping the name.
- Tests and manual verification.

Excluded:

- LayoutStudio resizing or moving widgets automatically.
- Reordering columns.
- Adding new metrics.
- Backend telemetry changes.
- Backend schema changes.
- New dependencies.
- Full visual theme system.
- Applying this to `Standings`.

---

## File Structure

Expected created files:

- `frontend/src/overlay/widgets/relative-format.ts`
  - Pure helpers for column format parsing, lap time formatting, name formatting, width/alignment/color normalization, and intrinsic width calculation.
- `frontend/src/overlay/widgets/relative-format.test.ts`
  - Unit tests for all formatting and sizing rules.

Expected modified files:

- `frontend/src/overlay/widgets/relative-catalog.ts`
  - Add default format/style metadata to default columns where needed.
- `frontend/src/overlay/widgets/relative-catalog.test.ts`
  - Cover default formats and widths.
- `frontend/src/lib/widget-variants.ts`
  - Preserve/merge default column `format`, `style`, and width without losing user choices.
- `frontend/src/lib/widget-variants.test.ts`
  - Cover default format creation and preserving user format overrides.
- `frontend/src/overlay/widgets/RelativeWidget.tsx`
  - Use `relative-format` helpers for render, name display, lap formats, widths, colors, alignment, and intrinsic min-width.
- `frontend/src/overlay/widgets/RelativeWidget.test.tsx`
  - Cover no default name truncation, user-enabled truncation, compact lap format, decimals, width/color/alignment.
- `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
  - Add controls for name and lap column formats.
- `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`
  - Cover UI updates to `variant.columns[].format/style/width`.
- `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
  - Use intrinsic preview width for relative when active columns require more width.
- `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`
  - Cover preview container uses expanded width for relative.
- `docs/current-plan.md`
  - Update only after implementation succeeds.

Do not modify:

- `LayoutStudio` files.
- `WidgetHost.tsx` unless a worker proves `min-width` inside `RelativeWidget` cannot display in overlay without changing host overflow. If that happens, stop and report before changing it.
- Go backend files.

---

## Format Contract

This plan uses existing schema v2:

```ts
export type ColumnConfig = {
  id: string;
  metricId: string;
  enabled: boolean;
  width?: number;
  format?: Record<string, unknown>;
  style?: Record<string, unknown>;
};
```

Column format keys:

```ts
type RelativeLapFormat = {
  display?: "full" | "compact";
  decimals?: 0 | 1 | 2 | 3;
};

type RelativeDriverNameFormat = {
  mode?: "full" | "truncate";
  maxChars?: number;
};

type RelativeColumnStyle = {
  color?: string;
  align?: "left" | "center" | "right";
};
```

Defaults:

- `driverName.format.mode = "full"`
- `driverName.format.maxChars = 18`
- `bestLap.format.display = "full"`
- `lastLap.format.display = "full"`
- `bestLap.format.decimals = 3`
- `lastLap.format.decimals = 3`
- Column alignment defaults come from `relative-catalog.ts`.
- Column widths default to catalog `defaultWidth`.

Important behavior:

- `mode: "full"` renders the complete driver name and does not call `truncate()`.
- `mode: "truncate"` renders a truncated name using `maxChars`.
- `display: "compact"` renders `95.765` instead of `1:35.765` for lap times over one minute.
- `RelativeWidget` must still escape all driver text and formatted values.
- Unknown format/style values fall back to defaults.

---

## Task 1: Pure Format Helpers

**Recommended model:** Kimi K2.7  
**Recommended chat:** new chat  
**Why:** Small but contract-sensitive TypeScript logic; clean prompt is cheaper than carrying previous context.

**Files:**

- Create: `frontend/src/overlay/widgets/relative-format.ts`
- Create: `frontend/src/overlay/widgets/relative-format.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/overlay/widgets/relative-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ColumnConfig } from "../../lib/profile";
import {
  formatRelativeDriverName,
  formatRelativeLapTime,
  getRelativeColumnAlign,
  getRelativeColumnColor,
  getRelativeColumnWidth,
  getRelativeIntrinsicWidth,
} from "./relative-format";

describe("relative-format", () => {
  it("renders full driver names by default", () => {
    const column: ColumnConfig = { id: "driverName", metricId: "driverName", enabled: true };

    expect(formatRelativeDriverName("PORSCHE PENSKE MOTORSPORT", column)).toBe("PORSCHE PENSKE MOTORSPORT");
  });

  it("truncates driver names only when configured", () => {
    const column: ColumnConfig = {
      id: "driverName",
      metricId: "driverName",
      enabled: true,
      format: { mode: "truncate", maxChars: 10 },
    };

    expect(formatRelativeDriverName("PORSCHE PENSKE MOTORSPORT", column)).toBe("PORSCHE P…");
  });

  it("formats lap times with full and compact display", () => {
    expect(formatRelativeLapTime(95.765, { id: "bestLap", metricId: "bestLap", enabled: true })).toBe("1:35.765");
    expect(formatRelativeLapTime(95.765, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { display: "compact" },
    })).toBe("35.765");
  });

  it("formats lap decimals from 0 to 3", () => {
    expect(formatRelativeLapTime(95.765, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { decimals: 0 },
    })).toBe("1:36");
    expect(formatRelativeLapTime(95.765, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { display: "compact", decimals: 1 },
    })).toBe("35.8");
    expect(formatRelativeLapTime(95.765, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { decimals: 2 },
    })).toBe("1:35.77");
  });

  it("returns dash fallback for missing lap values", () => {
    const column: ColumnConfig = { id: "lastLap", metricId: "lastLap", enabled: true };

    expect(formatRelativeLapTime(undefined, column)).toBe("-");
    expect(formatRelativeLapTime(0, column)).toBe("-");
    expect(formatRelativeLapTime(NaN, column)).toBe("-");
  });

  it("normalizes width, color and alignment", () => {
    const column: ColumnConfig = {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      width: 88,
      style: { color: "#ffcc00", align: "center" },
    };

    expect(getRelativeColumnWidth(column, 62)).toBe(88);
    expect(getRelativeColumnColor(column, "#ffffff")).toBe("#ffcc00");
    expect(getRelativeColumnAlign(column, "right")).toBe("center");
  });

  it("calculates intrinsic width from enabled columns", () => {
    const columns: ColumnConfig[] = [
      { id: "position", metricId: "position", enabled: true, width: 24 },
      { id: "class", metricId: "class", enabled: true, width: 6 },
      { id: "carNumber", metricId: "carNumber", enabled: true, width: 28 },
      { id: "driverName", metricId: "driverName", enabled: true, width: 180 },
      { id: "gap", metricId: "gap", enabled: true, width: 48 },
      { id: "bestLap", metricId: "bestLap", enabled: true, width: 72 },
      { id: "lastLap", metricId: "lastLap", enabled: true, width: 72 },
    ];

    expect(getRelativeIntrinsicWidth(columns)).toBe(462);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
pnpm --dir frontend test -- relative-format
```

Expected: FAIL because `relative-format.ts` does not exist.

- [ ] **Step 3: Implement helpers**

Create `frontend/src/overlay/widgets/relative-format.ts`:

```ts
import type { ColumnConfig } from "../../lib/profile";

export type RelativeTextAlign = "left" | "center" | "right";

const DEFAULT_NAME_MAX_CHARS = 18;
const MIN_COLUMN_WIDTH = 6;
const DEFAULT_HORIZONTAL_PADDING = 32;

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampDecimals(value: unknown): 0 | 1 | 2 | 3 {
  const n = readNumber(value);
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  return 3;
}

function truncateText(value: string, maxChars: number): string {
  if (maxChars <= 1) return "…";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}

export function formatRelativeDriverName(name: string | undefined, column: ColumnConfig): string {
  const value = name ?? "?";
  const mode = readString(column.format?.mode);
  if (mode !== "truncate") return value;

  const configuredMax = readNumber(column.format?.maxChars);
  const maxChars = Math.max(2, Math.min(64, Math.round(configuredMax ?? DEFAULT_NAME_MAX_CHARS)));
  return truncateText(value, maxChars);
}

export function formatRelativeLapTime(seconds: number | undefined, column: ColumnConfig): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "-";

  const display = readString(column.format?.display) === "compact" ? "compact" : "full";
  const decimals = clampDecimals(column.format?.decimals);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  const roundedRemaining = Number(remaining.toFixed(decimals));

  if (display === "compact" && minutes > 0) {
    return roundedRemaining.toFixed(decimals);
  }

  if (decimals === 0) {
    return `${minutes}:${Math.round(remaining).toString().padStart(2, "0")}`;
  }
  return `${minutes}:${remaining.toFixed(decimals).padStart(3 + decimals, "0")}`;
}

export function getRelativeColumnWidth(column: ColumnConfig, fallback: number): number {
  const width = readNumber(column.width);
  return Math.max(MIN_COLUMN_WIDTH, Math.round(width ?? fallback));
}

export function getRelativeColumnColor(column: ColumnConfig, fallback: string): string {
  return readString(column.style?.color) ?? fallback;
}

export function getRelativeColumnAlign(column: ColumnConfig, fallback: RelativeTextAlign): RelativeTextAlign {
  const align = readString(column.style?.align);
  if (align === "left" || align === "center" || align === "right") return align;
  return fallback;
}

export function getRelativeJustifyClass(align: RelativeTextAlign): string {
  if (align === "left") return "justify-start text-left";
  if (align === "center") return "justify-center text-center";
  return "justify-end text-right";
}

export function getRelativeIntrinsicWidth(columns: ColumnConfig[]): number {
  const columnWidth = columns
    .filter((column) => column.enabled)
    .reduce((total, column) => total + getRelativeColumnWidth(column, column.width ?? 0), 0);
  return columnWidth + DEFAULT_HORIZONTAL_PADDING;
}
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- relative-format
```

Expected: PASS.

- [ ] **Step 5: Commit or report scoped diff**

Dedicated clean worktree:

```powershell
git add frontend/src/overlay/widgets/relative-format.ts frontend/src/overlay/widgets/relative-format.test.ts
git commit -m "feat(relative): add column format helpers"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/overlay/widgets/relative-format.ts frontend/src/overlay/widgets/relative-format.test.ts
```

---

## Task 2: Default Column Format Contract

**Recommended model:** Kimi K2.7  
**Recommended chat:** same chat as Task 1 if it just completed; otherwise new chat  
**Why:** Same contract area, cache helps if continuous.

**Files:**

- Modify: `frontend/src/overlay/widgets/relative-catalog.ts`
- Modify: `frontend/src/overlay/widgets/relative-catalog.test.ts`
- Modify: `frontend/src/lib/widget-variants.ts`
- Modify: `frontend/src/lib/widget-variants.test.ts`

- [ ] **Step 1: Add failing tests for defaults and preservation**

Append to `frontend/src/overlay/widgets/relative-catalog.test.ts`:

```ts
it("creates default formats for driver name and lap columns", () => {
  const columns = createDefaultRelativeColumns();

  expect(columns.find((column) => column.id === "driverName")?.format).toEqual({
    mode: "full",
    maxChars: 18,
  });
  expect(columns.find((column) => column.id === "bestLap")?.format).toEqual({
    display: "full",
    decimals: 3,
  });
  expect(columns.find((column) => column.id === "lastLap")?.format).toEqual({
    display: "full",
    decimals: 3,
  });
});
```

Append to `frontend/src/lib/widget-variants.test.ts`:

```ts
it("preserves user column format and style overrides when normalizing", () => {
  const p = profile();
  p.variants = [
    {
      id: "variant-relative-default",
      widgetType: "relative",
      templateId: "relative-vantare-default",
      columns: [
        {
          id: "driverName",
          metricId: "driverName",
          enabled: true,
          width: 210,
          format: { mode: "truncate", maxChars: 12 },
          style: { color: "#ffcc00", align: "center" },
        },
      ],
    },
  ];

  const next = withDefaultWidgetVariants(p);
  const driverName = next.variants?.[0].columns?.find((column) => column.id === "driverName");

  expect(driverName?.width).toBe(210);
  expect(driverName?.format).toEqual({ mode: "truncate", maxChars: 12 });
  expect(driverName?.style).toEqual({ color: "#ffcc00", align: "center" });
  expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format).toEqual({
    display: "full",
    decimals: 3,
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --dir frontend test -- relative-catalog widget-variants
```

Expected: FAIL because defaults do not include `format` yet.

- [ ] **Step 3: Add default formats in catalog**

In `frontend/src/overlay/widgets/relative-catalog.ts`, update `createDefaultRelativeColumns()`:

```ts
export function createDefaultRelativeColumns(): ColumnConfig[] {
  return RELATIVE_COLUMNS.map((column) => {
    const config: ColumnConfig = {
      id: column.id,
      metricId: column.metricId,
      enabled: column.defaultEnabled,
      width: column.defaultWidth,
      style: { align: column.align },
    };
    if (column.id === "driverName") {
      config.format = { mode: "full", maxChars: 18 };
    }
    if (column.id === "bestLap" || column.id === "lastLap") {
      config.format = { display: "full", decimals: 3 };
    }
    return config;
  });
}
```

- [ ] **Step 4: Preserve format/style in normalization**

In `frontend/src/lib/widget-variants.ts`, replace this line in `normalizeRelativeVariant`:

```ts
return existing ? { ...defaultColumn, ...existing } : defaultColumn;
```

with:

```ts
return existing
  ? {
      ...defaultColumn,
      ...existing,
      format: { ...(defaultColumn.format ?? {}), ...(existing.format ?? {}) },
      style: { ...(defaultColumn.style ?? {}), ...(existing.style ?? {}) },
    }
  : defaultColumn;
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- relative-catalog widget-variants relative-format
```

Expected: PASS.

- [ ] **Step 6: Commit or report scoped diff**

Dedicated clean worktree:

```powershell
git add frontend/src/overlay/widgets/relative-catalog.ts frontend/src/overlay/widgets/relative-catalog.test.ts frontend/src/lib/widget-variants.ts frontend/src/lib/widget-variants.test.ts
git commit -m "feat(relative): store default column formats"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/overlay/widgets/relative-catalog.ts frontend/src/overlay/widgets/relative-catalog.test.ts frontend/src/lib/widget-variants.ts frontend/src/lib/widget-variants.test.ts
```

---

## Task 3: Render Intrinsic Widths And Formats

**Recommended model:** Minimax M3  
**Recommended chat:** new chat  
**Why:** Frontend visual behavior and HTML string rendering; needs high frontend reliability.

**Files:**

- Modify: `frontend/src/overlay/widgets/RelativeWidget.tsx`
- Modify: `frontend/src/overlay/widgets/RelativeWidget.test.tsx`

- [ ] **Step 1: Add failing render tests**

Append to `frontend/src/overlay/widgets/RelativeWidget.test.tsx`:

```ts
it("does not truncate driver names by default when optional columns are enabled", () => {
  render(
    <RelativeWidget
      editMode={true}
      updateHz={15}
      props={{
        variant: {
          id: "variant-relative-default",
          templateId: "relative-vantare-default",
          columns: [
            { id: "position", metricId: "position", enabled: true, width: 24 },
            { id: "class", metricId: "class", enabled: true, width: 6 },
            { id: "carNumber", metricId: "carNumber", enabled: true, width: 28 },
            { id: "driverName", metricId: "driverName", enabled: true, width: 210, format: { mode: "full", maxChars: 18 } },
            { id: "gap", metricId: "gap", enabled: true, width: 48 },
            { id: "bestLap", metricId: "bestLap", enabled: true, width: 62, format: { display: "full", decimals: 3 } },
            { id: "lastLap", metricId: "lastLap", enabled: true, width: 62, format: { display: "compact", decimals: 2 } },
          ],
        },
      }}
    />,
  );

  tick(100);

  expect(screen.getByText("PORSCHE PENSKE")).toBeTruthy();
  expect(screen.queryByText("PORSCHE…")).toBeNull();
  expect(screen.getByText("1:30.101")).toBeTruthy();
});

it("truncates driver names only when configured", () => {
  render(
    <RelativeWidget
      editMode={true}
      updateHz={15}
      props={{
        variant: {
          id: "variant-relative-default",
          templateId: "relative-vantare-default",
          columns: [
            { id: "driverName", metricId: "driverName", enabled: true, width: 110, format: { mode: "truncate", maxChars: 8 } },
          ],
        },
      }}
    />,
  );

  tick(100);

  expect(screen.getByText("PORSC…")).toBeTruthy();
});

it("applies compact lap format, column width, color and alignment", () => {
  render(
    <RelativeWidget
      editMode={true}
      updateHz={15}
      props={{
        variant: {
          id: "variant-relative-default",
          templateId: "relative-vantare-default",
          columns: [
            { id: "driverName", metricId: "driverName", enabled: true, width: 180 },
            { id: "bestLap", metricId: "bestLap", enabled: true, width: 90, format: { display: "compact", decimals: 1 }, style: { color: "#ffcc00", align: "center" } },
          ],
        },
      }}
    />,
  );

  tick(100);

  const compact = screen.getByText("30.9");
  expect(compact.style.color).toBe("#ffcc00");
  expect(compact.parentElement?.getAttribute("style")).toContain("width:90px");
  expect(compact.parentElement?.className).toContain("justify-center");
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
pnpm --dir frontend test -- RelativeWidget
```

Expected: FAIL because names are still truncated automatically and compact formatting is not applied.

- [ ] **Step 3: Import format helpers**

In `frontend/src/overlay/widgets/RelativeWidget.tsx`, replace the existing local `formatLapTime` import/export strategy.

Add import:

```ts
import {
  formatRelativeDriverName,
  formatRelativeLapTime,
  getRelativeColumnAlign,
  getRelativeColumnColor,
  getRelativeColumnWidth,
  getRelativeIntrinsicWidth,
  getRelativeJustifyClass,
} from "./relative-format";
```

Keep `formatLapTime` exported for existing tests by changing it to delegate:

```ts
export function formatLapTime(seconds: number | undefined): string {
  return formatRelativeLapTime(seconds, { id: "lap", metricId: "lap", enabled: true });
}
```

- [ ] **Step 4: Apply intrinsic min-width**

After `const activeColumns = getActiveRelativeColumns(props);`, add:

```ts
      const intrinsicWidth = getRelativeIntrinsicWidth(activeColumns);
```

In the root `<div data-testid="relative-panel">`, add a CSS custom property:

```tsx
        minWidth: `var(--relative-intrinsic-width, 100%)`,
```

In the row container string, set the variable:

```ts
        return `<div class="flex items-center text-[11px] font-bold border-b border-black/20 transition-all" style="--relative-intrinsic-width:${intrinsicWidth}px;height:${rowHeight}px;background:${isP ? BAKED_PLAYER_BG : bgRow};${leftInset}">
          ${cells}
        </div>`;
```

If this does not affect the panel root because the variable is only set on rows, instead set the row and body width directly:

```ts
const rowWidthStyle = `min-width:${intrinsicWidth}px;width:max(100%, ${intrinsicWidth}px);`;
```

Use `rowWidthStyle` on each row.

- [ ] **Step 5: Replace driver name rendering**

Replace the `driverName` case:

```ts
return `<div class="flex-1 px-2 tracking-wide truncate" style="color:${isP ? "#FFFFFF" : "#E5E7EB"}">${escapeHTML(truncate(v.driverName ?? "?", 18))}</div>`;
```

with:

```ts
const width = getRelativeColumnWidth(column, column.width ?? 120);
const color = getRelativeColumnColor(column, isP ? "#FFFFFF" : "#E5E7EB");
const align = getRelativeColumnAlign(column, "left");
return `<div class="px-2 tracking-wide shrink-0 overflow-visible whitespace-nowrap ${getRelativeJustifyClass(align)}" style="width:${width}px;color:${color}">
  ${escapeHTML(formatRelativeDriverName(v.driverName, column))}
</div>`;
```

- [ ] **Step 6: Replace lap column rendering**

Replace `bestLap` and `lastLap` cases with:

```ts
case "bestLap": {
  const width = getRelativeColumnWidth(column, column.width ?? 62);
  const color = getRelativeColumnColor(column, a.textColor);
  const align = getRelativeColumnAlign(column, "right");
  return `<div class="px-2 flex items-center font-mono text-[10px] shrink-0 ${getRelativeJustifyClass(align)}" style="width:${width}px;color:${color}">
    <span style="color:${color}">${escapeHTML(formatRelativeLapTime(v.bestLapTime, column))}</span>
  </div>`;
}
case "lastLap": {
  const width = getRelativeColumnWidth(column, column.width ?? 62);
  const color = getRelativeColumnColor(column, a.textColor);
  const align = getRelativeColumnAlign(column, "right");
  return `<div class="px-2 flex items-center font-mono text-[10px] shrink-0 ${getRelativeJustifyClass(align)}" style="width:${width}px;color:${color}">
    <span style="color:${color}">${escapeHTML(formatRelativeLapTime(v.lastLapTime, column))}</span>
  </div>`;
}
```

Keep existing visual behavior for `position`, `class`, `carNumber`, and `gap` unless tests require width consistency.

- [ ] **Step 7: Include formats in fingerprint**

Update `columnFingerprint`:

```ts
const columnFingerprint = activeColumns
  .map((column) => `${column.id}:${column.metricId}:${column.enabled}:${column.width}:${JSON.stringify(column.format ?? {})}:${JSON.stringify(column.style ?? {})}`)
  .join(",");
```

- [ ] **Step 8: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- RelativeWidget relative-format widget-variants
```

Expected: PASS.

- [ ] **Step 9: Manual verification checkpoint A**

Manual check:

1. Start app in mock mode.
2. Open `Overlays Studio` -> `Widgets` -> `relative`.
3. Enable `bestLap` and `lastLap`.
4. Confirm full names are not automatically shortened.
5. Confirm widget content grows horizontally or remains readable instead of compressing names.

Report whether this was completed.

- [ ] **Step 10: Commit or report scoped diff**

Dedicated clean worktree:

```powershell
git add frontend/src/overlay/widgets/RelativeWidget.tsx frontend/src/overlay/widgets/RelativeWidget.test.tsx
git commit -m "feat(relative): render column formats and intrinsic width"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/overlay/widgets/RelativeWidget.tsx frontend/src/overlay/widgets/RelativeWidget.test.tsx
```

---

## Task 4: WidgetStudio Format Controls

**Recommended model:** Minimax M3  
**Recommended chat:** same chat as Task 3 if continuous; otherwise new chat  
**Why:** UI controls and accessible interaction.

**Files:**

- Modify: `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
- Modify: `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`

- [ ] **Step 1: Add failing UI tests**

Append to `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`:

```ts
it("updates driver name truncation settings in the variant", () => {
  const onChangeProfile = vi.fn();
  const p = profile();

  render(<RelativeSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

  fireEvent.change(screen.getByLabelText("Formato de nombre"), { target: { value: "truncate" } });
  const truncateProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(truncateProfile.variants?.[0].columns?.find((column) => column.id === "driverName")?.format?.mode).toBe("truncate");

  render(<RelativeSettingsSection profile={truncateProfile} widget={truncateProfile.widgets[0]} onChangeProfile={onChangeProfile} />);
  fireEvent.change(screen.getByLabelText("Máximo caracteres nombre"), { target: { value: "14" } });
  const maxProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(maxProfile.variants?.[0].columns?.find((column) => column.id === "driverName")?.format?.maxChars).toBe(14);
});

it("updates lap format settings in the variant", () => {
  const onChangeProfile = vi.fn();
  const p = profile();

  render(<RelativeSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

  fireEvent.change(screen.getByLabelText("Formato mejor vuelta"), { target: { value: "compact" } });
  const displayProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(displayProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format?.display).toBe("compact");

  render(<RelativeSettingsSection profile={displayProfile} widget={displayProfile.widgets[0]} onChangeProfile={onChangeProfile} />);
  fireEvent.change(screen.getByLabelText("Decimales mejor vuelta"), { target: { value: "1" } });
  const decimalsProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(decimalsProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format?.decimals).toBe(1);
});

it("updates width, color and alignment settings in the variant", () => {
  const onChangeProfile = vi.fn();
  const p = profile();

  render(<RelativeSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

  fireEvent.change(screen.getByLabelText("Ancho mejor vuelta"), { target: { value: "88" } });
  const widthProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(widthProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.width).toBe(88);

  render(<RelativeSettingsSection profile={widthProfile} widget={widthProfile.widgets[0]} onChangeProfile={onChangeProfile} />);
  fireEvent.change(screen.getByLabelText("Color mejor vuelta"), { target: { value: "#ffcc00" } });
  const colorProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(colorProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.style?.color).toBe("#ffcc00");

  render(<RelativeSettingsSection profile={colorProfile} widget={colorProfile.widgets[0]} onChangeProfile={onChangeProfile} />);
  fireEvent.change(screen.getByLabelText("Alineación mejor vuelta"), { target: { value: "center" } });
  const alignProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
  expect(alignProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.style?.align).toBe("center");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --dir frontend test -- RelativeSettingsSection
```

Expected: FAIL because controls do not exist.

- [ ] **Step 3: Add column update helper**

In `frontend/src/hub/overlays/RelativeSettingsSection.tsx`, add:

```ts
type RelativeColumnId = "driverName" | "bestLap" | "lastLap";

function updateRelativeColumn(
  profile: ProfileConfig,
  widgetId: string,
  columnId: RelativeColumnId,
  update: (column: NonNullable<ProfileConfig["variants"]>[number]["columns"][number]) => NonNullable<ProfileConfig["variants"]>[number]["columns"][number],
): ProfileConfig {
  const normalized = withDefaultWidgetVariants(profile);
  const widget = normalized.widgets.find((item) => item.id === widgetId && item.type === "relative");
  if (!widget?.variantId) return profile;
  return {
    ...normalized,
    variants: (normalized.variants ?? []).map((variant) => {
      if (variant.id !== widget.variantId || variant.widgetType !== "relative") return variant;
      return {
        ...variant,
        columns: (variant.columns ?? []).map((column) => column.id === columnId ? update(column) : column),
      };
    }),
  };
}
```

If TypeScript rejects the indexed helper type, define:

```ts
import type { ColumnConfig } from "../../lib/profile";
```

and use:

```ts
update: (column: ColumnConfig) => ColumnConfig
```

- [ ] **Step 4: Add controls**

Below the `bestLap`/`lastLap` switches, add a compact section:

```tsx
<div className="mt-4 space-y-3 border-t border-white/5 pt-4">
  <label className="block text-[11px] text-vantare-textMuted">
    Formato de nombre
    <select
      aria-label="Formato de nombre"
      className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
      value={(columns.find((column) => column.id === "driverName")?.format?.mode as string | undefined) ?? "full"}
      onChange={(event) => onChangeProfile(updateRelativeColumn(normalized, widget.id, "driverName", (column) => ({
        ...column,
        format: { ...(column.format ?? {}), mode: event.target.value },
      })))}
    >
      <option value="full">Nombre completo</option>
      <option value="truncate">Recortar</option>
    </select>
  </label>
  <label className="block text-[11px] text-vantare-textMuted">
    Máximo caracteres nombre
    <input
      aria-label="Máximo caracteres nombre"
      type="number"
      min={2}
      max={64}
      className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
      value={(columns.find((column) => column.id === "driverName")?.format?.maxChars as number | undefined) ?? 18}
      onChange={(event) => onChangeProfile(updateRelativeColumn(normalized, widget.id, "driverName", (column) => ({
        ...column,
        format: { ...(column.format ?? {}), maxChars: Number(event.target.value) },
      })))}
    />
  </label>
</div>
```

Add repeated controls for `bestLap` and `lastLap`. Use these labels exactly for tests:

- `Formato mejor vuelta`
- `Decimales mejor vuelta`
- `Ancho mejor vuelta`
- `Color mejor vuelta`
- `Alineación mejor vuelta`
- `Formato última vuelta`
- `Decimales última vuelta`
- `Ancho última vuelta`
- `Color última vuelta`
- `Alineación última vuelta`

For each lap column:

- `display` select options: `full`, `compact`
- `decimals` select options: `0`, `1`, `2`, `3`
- `width` number input min `36`, max `160`
- `color` input type `color`
- `align` select options: `left`, `center`, `right`

- [ ] **Step 5: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- RelativeSettingsSection WidgetStudio
```

Expected: PASS.

- [ ] **Step 6: Manual verification checkpoint B**

Manual check:

1. Open app in mock mode.
2. Go to `Overlays Studio` -> `Widgets` -> `relative`.
3. Enable `bestLap` and `lastLap`.
4. Set best lap format to compact and decimals to 1.
5. Set driver name format to full.
6. Confirm preview updates without moving/resizing layout.
7. Set driver name format to truncate and max chars 8.
8. Confirm truncation happens only after this explicit setting.

- [ ] **Step 7: Commit or report scoped diff**

Dedicated clean worktree:

```powershell
git add frontend/src/hub/overlays/RelativeSettingsSection.tsx frontend/src/hub/overlays/RelativeSettingsSection.test.tsx
git commit -m "feat(relative): add column format controls"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/hub/overlays/RelativeSettingsSection.tsx frontend/src/hub/overlays/RelativeSettingsSection.test.tsx
```

---

## Task 5: Preview Intrinsic Width Support

**Recommended model:** Minimax M3  
**Recommended chat:** same chat as Task 4 if continuous; otherwise new chat  
**Why:** Frontend layout and visual preview.

**Files:**

- Modify: `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- Modify: `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`
- Optional modify: `frontend/src/lib/widget-variants.ts`
- Optional modify: `frontend/src/lib/widget-variants.test.ts`

- [ ] **Step 1: Add failing preview width test**

Append to `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`:

```ts
it("uses intrinsic relative width when formatted columns exceed layout width", () => {
  const profile = {
    ...mockProfile,
    variants: [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        columns: [
          { id: "driverName", metricId: "driverName", enabled: true, width: 240, format: { mode: "full" } },
          { id: "bestLap", metricId: "bestLap", enabled: true, width: 90, format: { display: "full", decimals: 3 } },
          { id: "lastLap", metricId: "lastLap", enabled: true, width: 90, format: { display: "compact", decimals: 2 } },
        ],
      },
    ],
  };
  const widget = {
    ...mockWidget,
    type: "relative",
    variantId: "variant-relative-default",
    position: { x: 0, y: 0, w: 220, h: 280 },
  };

  render(<WidgetPreviewPanel profile={profile} activeWidget={widget} />);

  const preview = screen.getByTestId("widget-preview-inner");
  expect(Number.parseInt(preview.style.width, 10)).toBeGreaterThan(220);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
pnpm --dir frontend test -- WidgetPreviewPanel
```

Expected: FAIL because no `widget-preview-inner` test id or intrinsic width is used.

- [ ] **Step 3: Add helper for render width**

Prefer adding a small local function in `WidgetPreviewPanel.tsx` to avoid broad abstraction:

```ts
import { getRelativeIntrinsicWidth } from "../../overlay/widgets/relative-format";
import { enrichWidgetPropsWithVariant } from "../../lib/widget-variants";
```

Add:

```ts
function getPreviewRenderSize(profile: ProfileConfig, widget: WidgetConfig) {
  const base = { width: widget.position.w, height: widget.position.h };
  if (widget.type !== "relative") return base;

  const props = enrichWidgetPropsWithVariant(profile, widget);
  const columns = props.variant?.columns ?? [];
  if (columns.length === 0) return base;

  return {
    width: Math.max(widget.position.w, getRelativeIntrinsicWidth(columns)),
    height: widget.position.h,
  };
}
```

- [ ] **Step 4: Use render size in preview**

In `WidgetPreviewPanel`, compute:

```ts
const renderSize = activeWidget ? getPreviewRenderSize(profile, activeWidget) : null;
```

Use `renderSize.width` and `renderSize.height` for the inner wrapper:

```tsx
<div
  data-testid="widget-preview-inner"
  className="relative transition-transform duration-100 ease-out"
  style={{
    width: renderSize.width,
    height: renderSize.height,
    transform: `scale(${scale})`,
    transformOrigin: "center center",
  }}
>
```

Update the scale calculation dependency to include `profile`, and use `renderSize.width/height` in `updateScale` instead of `activeWidget.position.w/h`.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- WidgetPreviewPanel RelativeWidget relative-format
```

Expected: PASS.

- [ ] **Step 6: Manual verification checkpoint C**

Manual check:

1. Open `Overlays Studio` -> `Widgets` -> `relative`.
2. Enable both lap columns.
3. Confirm the isolated preview shows the wider relative rather than clipping the name.
4. Confirm profile thumbnails elsewhere are not obviously broken.

- [ ] **Step 7: Commit or report scoped diff**

Dedicated clean worktree:

```powershell
git add frontend/src/hub/overlays/WidgetPreviewPanel.tsx frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx
git commit -m "feat(relative): expand widget preview to intrinsic width"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/hub/overlays/WidgetPreviewPanel.tsx frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx
```

---

## Task 6: Final Checks And Documentation

**Recommended model:** Gemini 3.5 Flash  
**Recommended chat:** new chat  
**Why:** Fast, checklist-driven docs/checks.

**Files:**

- Modify: `docs/current-plan.md`

- [ ] **Step 1: Run focused frontend tests**

Run:

```powershell
pnpm --dir frontend test -- relative-format relative-catalog widget-variants RelativeWidget RelativeSettingsSection WidgetPreviewPanel WidgetStudio useOverlayStudioState
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```powershell
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 3: Run backend smoke checks**

Run:

```powershell
go test ./pkg/config ./internal/app
```

Expected: PASS. No Go files should have changed, but profile persistence should remain healthy.

- [ ] **Step 4: Run diff hygiene**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors. CRLF warnings on Windows may appear and should be reported.

- [ ] **Step 5: Update current plan**

In `docs/current-plan.md`, add under `Primer corte configurable de Relative preparado`:

```md
Formatos iniciales de columnas de `Relative` preparados:
- El nombre de piloto ya no se recorta automaticamente al activar columnas opcionales.
- El recorte de nombre es una opcion explicita de la variante.
- `bestLap` y `lastLap` soportan formato completo/compacto, decimales, ancho, color y alineacion.
- La preview aislada de `WidgetStudio` usa el ancho intrinseco del `Relative` cuando las columnas requieren mas espacio.
```

Update `## Proximas tareas pequenas` by replacing the formats miniplan item with:

```md
5. Revisar con code review adversarial el corte de formatos/ancho de columnas de `Relative`.
6. Crear miniplan separado para filtros de `Relative` (coches delante/detras, misma clase/todas, incluir jugador).
7. Tras esa validacion, definir roadmap corto de alpha/beta con prioridades reales.
```

Update `## Riesgos actuales`:

- Remove the resolved risk: `Densidad visual si se activan bestLap y lastLap en widgets muy pequeños`.
- Keep future risks:
  - `columns: []` ambiguity.
  - normalization per render/tick.
  - manual verification.

- [ ] **Step 6: Manual verification checkpoint D**

Manual check:

1. Start app:

```powershell
go run ./cmd/vantare -live=false -profile configs/example-racing.json
```

2. Open `Overlays Studio` -> `Widgets` -> `relative`.
3. Enable `bestLap` and `lastLap`.
4. Confirm driver names are not truncated by default.
5. Set best lap to compact and decimals 1; confirm preview changes.
6. Set driver name mode to truncate and max chars 8; confirm only then names truncate.
7. Save/autosave, close, reopen; confirm settings persist.
8. Open overlay desktop; confirm overlay final uses same formats and does not show `MOCK`.
9. Confirm `WidgetStudio` still does not expose position/size/delete.

- [ ] **Step 7: Commit or report scoped diff**

Dedicated clean worktree:

```powershell
git add docs/current-plan.md
git commit -m "docs: record relative column format cut"
```

Shared dirty tree:

```powershell
git diff -- docs/current-plan.md
```

---

## Review Checklist

Before handoff:

- [ ] Driver names are full by default.
- [ ] Driver names truncate only when `driverName.format.mode` is `truncate`.
- [ ] `bestLap` and `lastLap` support `full` and `compact` display.
- [ ] Lap decimals `0..3` are applied.
- [ ] Width overrides are applied in render.
- [ ] Color overrides are applied in render.
- [ ] Alignment overrides are applied in render.
- [ ] Intrinsic content width increases when optional/large columns require more space.
- [ ] `WidgetStudio` does not write or change `position`.
- [ ] `LayoutStudio` is not touched.
- [ ] No backend/schema change is introduced.
- [ ] Legacy profiles without variants still normalize in frontend.
- [ ] Autosave persists `variant.columns[].format/style/width`.
- [ ] Overlay final does not show `MOCK` badge by default.

---

## Risks And Follow-Ups

Remaining known risks:

- `columns: []` still normalizes to default columns. This should be handled before allowing users to disable base columns.
- `enrichWidgetPropsWithVariant` still normalizes variants during render. Current profile size makes this acceptable, but it should be revisited if profiles grow.
- This plan does not add filters (`rangeAhead`, `rangeBehind`, same class, include player).
- This plan does not add column reordering.
- This plan does not apply the same system to `Standings`.

Next recommended miniplan after review:

1. `Relative` filters: cars ahead/behind, same class/all, include player.
2. Shared table/column helpers for `Standings` after Relative format behavior is stable.

---

## Final Report Requirements

The worker must report in Spanish:

- Archivos creados/modificados/movidos.
- Tests/checks ejecutados and result.
- Checks not run and reason.
- Whether the worker committed or only produced scoped diffs.
- Manual verification checkpoints completed or not completed.
- Remaining risks.
- Whether `Relative` formats/widths are ready for adversarial review.
