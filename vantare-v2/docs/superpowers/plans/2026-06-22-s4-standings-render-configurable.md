> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# S4 Standings Render Configurable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `StandingsWidget` render columns from `props.variant.columns` (enabled/width/format/style) instead of a hardcoded layout, while preserving the existing Vantare visual identity and pit/leader/tire behaviors. Works in preview, desktop and OBS.

**Architecture:** Mirror the pattern already proven in `RelativeWidget`: extract a `standings-format.ts` helper module with pure functions (width/color/align/lap-time/name truncation), an `intrinsicWidth` helper, and a variant-driven cell builder. `StandingsWidget` reads `props.variant.columns` via the same `RenderVariant` shape already produced by `enrichWidgetPropsWithVariant` (S3). No UI controls are added in this task; only the renderer learns to honor variant columns.

**Tech Stack:** TypeScript, React, Vitest + @testing-library/react, existing Tailwind utility classes inline-as-strings (the widget uses string-templated HTML injected via `setHTMLIfChanged`).

---

## Scope

Modify only:

- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- `frontend/src/overlay/widgets/StandingsWidget.test.tsx`

Create:

- `frontend/src/overlay/widgets/standings-format.ts`
- `frontend/src/overlay/widgets/standings-format.test.ts`

Use (read-only, do not modify):

- `frontend/src/overlay/widgets/standings-catalog.ts` (column definitions, `createDefaultStandingsColumns`, `getStandingsColumn`)
- `frontend/src/overlay/widgets/relative-format.ts` (reference pattern for format helpers; do NOT import from it to avoid coupling widgets)
- `frontend/src/lib/profile.ts` (types `ColumnConfig`, `WidgetPropsMap`)
- `frontend/src/lib/widget-variants.ts` (`enrichWidgetPropsWithVariant` already injects `props.variant`)
- `frontend/src/overlay/widgets/mock-telemetry.ts` (test fixtures)
- `frontend/src/overlay/widgets/widget-appearance.ts` (`resolveWidgetAppearance`)

## Do Not Edit

Do not modify:

- `frontend/src/overlay/widgets/standings-catalog.ts`
- `frontend/src/overlay/widgets/standings-catalog.test.ts`
- `frontend/src/overlay/widgets/relative-format.ts`
- `frontend/src/overlay/widgets/relative-catalog.ts`
- `frontend/src/overlay/widgets/relative-filters.ts`
- `frontend/src/overlay/widgets/RelativeWidget.tsx`
- `frontend/src/overlay/widgets/relative-widget-helpers.ts`
- `frontend/src/overlay/widgets/mock-telemetry.ts`
- `frontend/src/lib/widget-variants.ts`
- `frontend/src/lib/widget-variants.test.ts`
- `frontend/src/hub/**` (any UI: WidgetStudio, WidgetSettingsPanel, RelativeSettingsSection, WidgetPreviewPanel, WidgetSandboxPreview)
- `frontend/src/hub/preview/**` (WidgetRenderer, PreviewScaler, WidgetSandboxPreview)
- `frontend/src/overlay/CompositeApp.tsx`
- `frontend/src/overlay/ObsOverlayApp.tsx`
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
- `docs/widget-preview-bug-log.md`
- `docs/superpowers/plans/2026-06-22-s3-standings-variants-frontend.md`
- `frontend/src/overlay/widgets/RelativeWidget.tsx` (reference pattern)
- `frontend/src/overlay/widgets/relative-format.ts` (reference pattern)
- `frontend/src/overlay/widgets/StandingsWidget.tsx` (current hardcoded renderer)
- `frontend/src/overlay/widgets/standings-catalog.ts` (column/metric definitions)

## Architecture Decisions (Lock-In)

1. **Variant-driven columns.** `StandingsWidget` reads `props.variant` (already injected by `enrichWidgetPropsWithVariant`). The `variant.columns` array is normalized by S3 (`normalizeStandingsVariant`) so the renderer can assume: columns are in catalog order, each has `id`, `metricId`, `enabled`, optional `width`, `format`, `style`. The renderer must filter by `enabled` and render in the given order.

2. **Fallback to defaults when no variant.** If `props.variant` is missing or has no `columns`, use `createDefaultStandingsColumns()` from `standings-catalog`. This keeps legacy widgets rendering identically to today.

3. **No new UI controls.** S4 only makes the renderer configurable. The UI to toggle columns is S5. S4 must not add settings sections, toggles, or panels.

4. **Pure format helpers in `standings-format.ts`.** Mirror `relative-format.ts` but standalone (no imports from `relative-format`). Reuse the same `ColumnConfig` type from `../../lib/profile`. Helpers must be pure and unit-testable in isolation.

5. **String-templated HTML stays.** The widget uses `setHTMLIfChanged` to inject HTML strings into a ref'd container for performance. Keep that pattern. Do not convert to JSX children for rows.

6. **`playerHighlight` is not a column.** The catalog marks it as a metric without a column definition. The renderer must never render a `playerHighlight` cell. It is handled implicitly by the existing player accent/leader shadow logic, which stays.

7. **Tire badges, pit labels and FASTEST marker stay.** These are cross-column row decorations, not columns themselves. Keep them attached to the gap/number cell area as today. Do not make them configurable in S4.

8. **Intrinsic width helper.** Add `getStandingsIntrinsicWidth(columns)` analogous to `getRelativeIntrinsicWidth`. The widget container uses it for compact rows so the panel does not stretch with empty space when optional columns are disabled. In fill mode, keep `w-full` as today.

9. **No `position`/`size` mutations.** The renderer must not touch `widget.position.x/y/w/h`. Preview scaling is handled by `PreviewScaler`/`WidgetSandboxPreview`. S4 only changes what is rendered inside the panel.

10. **Fingerprint must include column config.** Update the existing `fingerprint` string to include the active column ids/widths/formats/styles so the frame loop re-renders when variant changes.

## Functional Requirements

1. `StandingsWidget` renders only columns where `enabled === true` from `props.variant.columns` (or defaults).
2. Column order follows the order of `variant.columns`.
3. Each column respects `width` (px), `style.align`, `style.color`, and `format` where applicable.
4. `position` column shows class place (`i + 1`), colored by leader color when leader.
5. `driverNumber` column shows the driver number with brand background, and keeps the PIT overlay behavior.
6. `driverName` column supports `format.mode === "truncate"` with `format.maxChars`, defaulting to no truncation (full).
7. `gap` column shows the existing gap text (leader/laps/time/FASTEST) with the existing color logic.
8. `vehicleClass`, `currentLap`, `interval`, `bestLap`, `lastLap` columns render their respective fields with sensible default formatting.
9. `bestLap` and `lastLap` support `format.display` ("full" | "compact") and `format.decimals` (0-3), defaulting to full with 3 decimals (same as catalog defaults).
10. Unknown column ids in `variant.columns` are skipped (defensive; S3 normalizes to catalog so this should not happen, but the renderer must not crash).
11. When `variant` is absent, rendering is identical to today (defaults).
12. `intrinsicWidth` is the sum of enabled column widths plus horizontal padding; used in compact row min-width.
13. Pit label, tire badge and FASTEST marker continue to render in the gap area when `gap` is enabled.
14. `widget.position`, layout data and Relative behavior remain unchanged.

## Naming

Use these helpers in `standings-format.ts`:

```ts
export type StandingsTextAlign = "left" | "center" | "right";

export function formatStandingsDriverName(name: string | undefined, column: ColumnConfig): string
export function formatStandingsLapTime(seconds: number | undefined, column: ColumnConfig): string
export function getStandingsColumnWidth(column: ColumnConfig, fallback: number): number
export function getStandingsColumnColor(column: ColumnConfig, fallback: string): string
export function getStandingsColumnAlign(column: ColumnConfig, fallback: StandingsTextAlign): StandingsTextAlign
export function getStandingsJustifyClass(align: StandingsTextAlign): string
export function getStandingsIntrinsicWidth(columns: ColumnConfig[]): number
```

Use `createDefaultStandingsColumns()` and `getStandingsColumn()` from `./standings-catalog`.

## File Responsibilities

### `standings-format.ts` (new)
Pure helpers for column rendering: width/color/align reads, name truncation, lap-time formatting (full/compact, decimals), justify class, intrinsic width. No React, no telemetry, no DOM.

### `standings-format.test.ts` (new)
Unit tests for every helper above, table-driven where it makes sense. No React rendering.

### `StandingsWidget.tsx` (modify)
Replace the hardcoded row cell layout with a variant-driven cell builder. Keep header/time/class/footer structure. Keep `setHTMLIfChanged` pattern. Update fingerprint to include column config. Add `intrinsicWidth` usage for compact row min-width. Keep pit/tire/FASTEST decorations in the gap cell.

### `StandingsWidget.test.tsx` (modify)
Add tests that assert column-driven rendering: enabled/disabled columns, width, truncation, lap time format, fallback to defaults when no variant. Keep existing tests green.

---

## Task 1: Create `standings-format.ts` helpers with TDD

**Files:**

- Create: `frontend/src/overlay/widgets/standings-format.ts`
- Test: `frontend/src/overlay/widgets/standings-format.test.ts`

- [ ] **Step 1: Write the failing tests for `standings-format.ts`**

Create `frontend/src/overlay/widgets/standings-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ColumnConfig } from "../../lib/profile";
import {
  formatStandingsDriverName,
  formatStandingsLapTime,
  getStandingsColumnAlign,
  getStandingsColumnColor,
  getStandingsColumnWidth,
  getStandingsIntrinsicWidth,
  getStandingsJustifyClass,
} from "./standings-format";

function column(overrides: Partial<ColumnConfig> = {}): ColumnConfig {
  return { id: "driverName", metricId: "driverName", enabled: true, ...overrides };
}

describe("standings-format", () => {
  describe("formatStandingsDriverName", () => {
    it("returns the full name when format mode is not truncate", () => {
      expect(formatStandingsDriverName("ALPINE", column())).toBe("ALPINE");
      expect(formatStandingsDriverName(undefined, column())).toBe("?");
    });

    it("truncates the name to maxChars when mode is truncate", () => {
      const c = column({ format: { mode: "truncate", maxChars: 6 } });
      expect(formatStandingsDriverName("ALPINE", c)).toBe("ALPINE");
      expect(formatStandingsDriverName("CADILLAC RACING", c)).toBe("CADIL…");
    });

    it("clamps maxChars to a minimum of 2 and maximum of 64", () => {
      expect(formatStandingsDriverName("AB", column({ format: { mode: "truncate", maxChars: 1 } }))).toBe("…");
      const long = "A".repeat(80);
      const c = column({ format: { mode: "truncate", maxChars: 100 } });
      expect(formatStandingsDriverName(long, c).length).toBe(64);
    });
  });

  describe("formatStandingsLapTime", () => {
    it("renders full lap time with default 3 decimals", () => {
      const c = column({ id: "bestLap", metricId: "bestLap" });
      expect(formatStandingsLapTime(89.455, c)).toBe("1:29.455");
    });

    it("renders compact lap time when display is compact", () => {
      const c = column({ id: "bestLap", metricId: "bestLap", format: { display: "compact", decimals: 2 } });
      expect(formatStandingsLapTime(89.455, c)).toBe("29.46");
    });

    it("respects decimals 0", () => {
      const c = column({ id: "bestLap", metricId: "bestLap", format: { display: "full", decimals: 0 } });
      expect(formatStandingsLapTime(89.455, c)).toBe("1:29");
    });

    it("returns dash for missing or non-positive seconds", () => {
      const c = column({ id: "bestLap", metricId: "bestLap" });
      expect(formatStandingsLapTime(undefined, c)).toBe("-");
      expect(formatStandingsLapTime(0, c)).toBe("-");
    });

    it("carries over seconds >= 60 to the next minute", () => {
      const c = column({ id: "bestLap", metricId: "bestLap", format: { display: "full", decimals: 3 } });
      expect(formatStandingsLapTime(89.999, c)).toBe("1:30.000");
    });
  });

  describe("getStandingsColumnWidth", () => {
    it("returns the column width when present", () => {
      expect(getStandingsColumnWidth(column({ width: 220 }), 100)).toBe(220);
    });

    it("falls back to the provided fallback when width is missing", () => {
      expect(getStandingsColumnWidth(column(), 132)).toBe(132);
    });

    it("clamps to a minimum of 6 px", () => {
      expect(getStandingsColumnWidth(column({ width: 0 }), 100)).toBe(6);
      expect(getStandingsColumnWidth(column({ width: -5 }), 100)).toBe(6);
    });
  });

  describe("getStandingsColumnColor", () => {
    it("returns the style color when present", () => {
      expect(getStandingsColumnColor(column({ style: { color: "#ffcc00" } }), "#FFFFFF")).toBe("#ffcc00");
    });

    it("falls back when color is missing", () => {
      expect(getStandingsColumnColor(column(), "#FFFFFF")).toBe("#FFFFFF");
    });
  });

  describe("getStandingsColumnAlign", () => {
    it("returns the style align when valid", () => {
      expect(getStandingsColumnAlign(column({ style: { align: "right" } }), "left")).toBe("right");
    });

    it("falls back when align is invalid or missing", () => {
      expect(getStandingsColumnAlign(column(), "left")).toBe("left");
      expect(getStandingsColumnAlign(column({ style: { align: "diagonal" } }), "center")).toBe("center");
    });
  });

  describe("getStandingsJustifyClass", () => {
    it("maps align to tailwind justify classes", () => {
      expect(getStandingsJustifyClass("left")).toBe("justify-start text-left");
      expect(getStandingsJustifyClass("center")).toBe("justify-center text-center");
      expect(getStandingsJustifyClass("right")).toBe("justify-end text-right");
    });
  });

  describe("getStandingsIntrinsicWidth", () => {
    it("sums enabled column widths plus horizontal padding", () => {
      const columns: ColumnConfig[] = [
        { id: "position", metricId: "position", enabled: true, width: 28 },
        { id: "driverName", metricId: "driverName", enabled: true, width: 132 },
        { id: "bestLap", metricId: "bestLap", enabled: false, width: 76 },
      ];
      const width = getStandingsIntrinsicWidth(columns);
      expect(width).toBe(28 + 132 + 32);
    });

    it("uses fallback widths from the standings catalog when width is missing", () => {
      const columns: ColumnConfig[] = [
        { id: "position", metricId: "position", enabled: true },
        { id: "driverName", metricId: "driverName", enabled: true },
      ];
      const width = getStandingsIntrinsicWidth(columns);
      expect(width).toBe(28 + 132 + 32);
    });
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
pnpm --dir frontend test -- standings-format
```

Expected: FAIL with module not found / exports undefined.

- [ ] **Step 3: Implement `standings-format.ts`**

Create `frontend/src/overlay/widgets/standings-format.ts`:

```ts
import type { ColumnConfig } from "../../lib/profile";
import { getStandingsColumn } from "./standings-catalog";

export type StandingsTextAlign = "left" | "center" | "right";

const DEFAULT_NAME_MAX_CHARS = 16;
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

export function formatStandingsDriverName(name: string | undefined, column: ColumnConfig): string {
  const value = name ?? "?";
  const mode = readString(column.format?.mode);
  if (mode !== "truncate") return value;

  const configuredMax = readNumber(column.format?.maxChars);
  const maxChars = Math.max(2, Math.min(64, Math.round(configuredMax ?? DEFAULT_NAME_MAX_CHARS)));
  return truncateText(value, maxChars);
}

export function formatStandingsLapTime(seconds: number | undefined, column: ColumnConfig): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "-";

  const display = readString(column.format?.display) === "compact" ? "compact" : "full";
  const decimals = clampDecimals(column.format?.decimals);
  let minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  let roundedRemaining = Number(remaining.toFixed(decimals));
  if (roundedRemaining >= 60) {
    minutes += 1;
    roundedRemaining -= 60;
  }

  if (display === "compact") {
    return roundedRemaining.toFixed(decimals);
  }

  return `${minutes}:${roundedRemaining.toFixed(decimals).padStart(decimals === 0 ? 2 : 3 + decimals, "0")}`;
}

export function getStandingsColumnWidth(column: ColumnConfig, fallback: number): number {
  const width = readNumber(column.width);
  return Math.max(MIN_COLUMN_WIDTH, Math.round(width ?? fallback));
}

export function getStandingsColumnColor(column: ColumnConfig, fallback: string): string {
  return readString(column.style?.color) ?? fallback;
}

export function getStandingsColumnAlign(column: ColumnConfig, fallback: StandingsTextAlign): StandingsTextAlign {
  const align = readString(column.style?.align);
  if (align === "left" || align === "center" || align === "right") return align;
  return fallback;
}

export function getStandingsJustifyClass(align: StandingsTextAlign): string {
  if (align === "left") return "justify-start text-left";
  if (align === "center") return "justify-center text-center";
  return "justify-end text-right";
}

export function getStandingsIntrinsicWidth(columns: ColumnConfig[]): number {
  const columnWidth = columns
    .filter((column) => column.enabled)
    .reduce((total, column) => {
      const def = getStandingsColumn(column.id);
      const fallback = def?.defaultWidth ?? 0;
      return total + getStandingsColumnWidth(column, fallback);
    }, 0);
  return columnWidth + DEFAULT_HORIZONTAL_PADDING;
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```powershell
pnpm --dir frontend test -- standings-format
```

Expected: PASS.

- [ ] **Step 5: Commit format helpers**

```bash
git add frontend/src/overlay/widgets/standings-format.ts frontend/src/overlay/widgets/standings-format.test.ts
git commit -m "feat(standings): add variant-driven column format helpers (S4)"
```

---

## Task 2: TDD tests for variant-driven `StandingsWidget` rendering

**Files:**

- Modify: `frontend/src/overlay/widgets/StandingsWidget.test.tsx`

- [ ] **Step 1: Add a `renderStandings` test helper and variant fixtures**

At the top of the existing `describe("StandingsWidget", ...)` block, add helpers and fixtures:

```ts
import type { ColumnConfig } from "../../lib/profile";
import { createDefaultStandingsColumns } from "./standings-catalog";

function variantColumns(overrides: Partial<ColumnConfig>[]): ColumnConfig[] {
  const defaults = createDefaultStandingsColumns();
  return defaults.map((column, index) => ({ ...column, ...overrides[index] }));
}

function standingsVariant(columns: ColumnConfig[]) {
  return { id: "variant-standings-default", templateId: "standings-vantare-default", columns };
}
```

- [ ] **Step 2: Add test - renders only enabled columns from the variant**

```ts
it("renders only enabled columns from props.variant", () => {
  const columns = variantColumns([
    { enabled: true },
    { enabled: true },
    { enabled: false },
    { enabled: true },
  ]);
  render(
    <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
  );
  tick(100);
  const panel = screen.getByTestId("standings-panel");
  expect(panel.textContent).toContain("ALPINE");
  expect(panel.textContent).toContain("36");
  expect(panel.textContent).not.toContain("vehicleClass");
});
```

- [ ] **Step 3: Add test - falls back to default columns when variant is missing**

```ts
it("falls back to default columns when variant is missing", () => {
  render(<StandingsWidget editMode={true} updateHz={15} />);
  tick(100);
  const panel = screen.getByTestId("standings-panel");
  expect(panel.textContent).toContain("ALPINE");
  expect(panel.textContent).toContain("36");
});
```

- [ ] **Step 4: Add test - respects column width via inline style**

```ts
it("respects column width from the variant", () => {
  const columns = variantColumns([
    { enabled: true, width: 40 },
    { enabled: true, width: 60 },
    { enabled: false },
    { enabled: true, width: 200 },
  ]);
  const { container } = render(
    <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
  );
  tick(100);
  const row = container.querySelector("[data-testid='standings-panel'] [data-standings-row]") as HTMLElement | null;
  expect(row).toBeTruthy();
  const nameCell = row?.querySelector("[data-standings-col='driverName']") as HTMLElement | null;
  expect(nameCell).toBeTruthy();
  expect(nameCell?.style.width).toBe("200px");
});
```

- [ ] **Step 5: Add test - truncates driver name when format mode is truncate**

```ts
it("truncates driver name when format mode is truncate", () => {
  const columns = variantColumns([
    { enabled: true },
    { enabled: true },
    { enabled: false },
    { enabled: true, format: { mode: "truncate", maxChars: 4 } },
  ]);
  render(
    <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
  );
  tick(100);
  const panel = screen.getByTestId("standings-panel");
  expect(panel.textContent).toContain("ALP…");
  expect(panel.textContent).not.toContain("ALPINE");
});
```

- [ ] **Step 6: Add test - renders bestLap column with lap time format**

```ts
it("renders bestLap column with full lap time when enabled", () => {
  const defaults = createDefaultStandingsColumns();
  const columns = defaults.map((c) =>
    c.id === "bestLap" ? { ...c, enabled: true } : { ...c, enabled: c.id === "position" || c.id === "driverNumber" },
  );
  render(
    <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
  );
  tick(100);
  const panel = screen.getByTestId("standings-panel");
  expect(panel.textContent).toContain("1:29.823");
});
```

- [ ] **Step 7: Add test - skips unknown column ids without crashing**

```ts
it("skips unknown column ids without crashing", () => {
  const columns: ColumnConfig[] = [
    { id: "position", metricId: "position", enabled: true, width: 28 },
    { id: "ghost", metricId: "ghost", enabled: true, width: 50 },
    { id: "driverName", metricId: "driverName", enabled: true, width: 132 },
  ];
  render(
    <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
  );
  tick(100);
  const panel = screen.getByTestId("standings-panel");
  expect(panel.textContent).toContain("ALPINE");
  expect(panel.textContent).not.toContain("ghost");
});
```

- [ ] **Step 8: Add test - does not mutate widget position or layout**

```ts
it("does not depend on or mutate widget position", () => {
  const columns = variantColumns([{ enabled: true }, { enabled: true }, { enabled: false }, { enabled: true }]);
  const { container } = render(
    <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
  );
  tick(100);
  const panel = container.querySelector("[data-testid='standings-panel']") as HTMLElement;
  expect(panel.style.left).toBe("");
  expect(panel.style.top).toBe("");
  expect(panel.style.width).toBe("");
});
```

- [ ] **Step 9: Update imports**

Ensure the test file imports `createDefaultStandingsColumns` from `./standings-catalog` and `ColumnConfig` from `../../lib/profile`.

- [ ] **Step 10: Run tests and verify the new ones fail**

Run:

```powershell
pnpm --dir frontend test -- StandingsWidget
```

Expected: the new tests FAIL (the widget does not yet read `props.variant`).

---

## Task 3: Implement variant-driven rendering in `StandingsWidget.tsx`

**Files:**

- Modify: `frontend/src/overlay/widgets/StandingsWidget.tsx`

- [ ] **Step 1: Add imports for catalog and format helpers**

At the top of the file, add:

```ts
import type { ColumnConfig } from "../../lib/profile";
import { createDefaultStandingsColumns, getStandingsColumn } from "./standings-catalog";
import {
  formatStandingsDriverName,
  formatStandingsLapTime,
  getStandingsColumnAlign,
  getStandingsColumnColor,
  getStandingsColumnWidth,
  getStandingsIntrinsicWidth,
  getStandingsJustifyClass,
  type StandingsTextAlign,
} from "./standings-format";
```

- [ ] **Step 2: Add a `StandingsRenderVariant` type and active-column resolver**

Near the top, after the existing types:

```ts
type StandingsRenderVariant = {
  columns?: ColumnConfig[];
};

function getActiveStandingsColumns(props?: Record<string, unknown>): ColumnConfig[] {
  const variant = props?.variant as StandingsRenderVariant | undefined;
  const sourceColumns = variant?.columns?.length ? variant.columns : createDefaultStandingsColumns();
  return sourceColumns.filter((column) => column.enabled && getStandingsColumn(column.id));
}
```

- [ ] **Step 3: Read active columns and intrinsic width in the component**

Inside `StandingsWidget`, after `const { appearance: a } = resolveWidgetAppearance("standings", props);`, add:

```ts
  const activeColumns = getActiveStandingsColumns(props);
  const intrinsicWidth = getStandingsIntrinsicWidth(activeColumns);
```

- [ ] **Step 4: Update the fingerprint to include column config**

Replace the existing `fingerprint` definition with:

```ts
      const columnFingerprint = activeColumns
        .map((column) => `${column.id}:${column.metricId}:${column.enabled}:${column.width ?? ""}:${JSON.stringify(column.format ?? {})}:${JSON.stringify(column.style ?? {})}`)
        .join(",");
      const fingerprint = mode + "|" + activeClass + "|" + (t.timeRemaining ?? 0).toFixed(0) + "|" + columnFingerprint + "|" + sorted.map(v =>
        `${v.id}:${v.place}:${v.inPits}:${v.pitState}:${v.pitting}:${v.inGarageStall}:${v.fastestLap}:${v.bestLapTime?.toFixed(1)}:${v.lastLapTime?.toFixed(1)}:${v.timeBehindLeader?.toFixed(3)}:${v.lapsBehindLeader}:${v.totalLaps}:${v.timeBehindNext?.toFixed(3)}:${v.tireCompound}`
      ).join("|");
```

- [ ] **Step 5: Replace the hardcoded row cell layout with a variant-driven cell builder**

Replace the entire `const rows = sorted.map((v, i) => { ... });` block with a variant-driven implementation that iterates `activeColumns` and renders each cell by `column.id`. Keep the existing pit label, tire badge and FASTEST logic attached to the `gap` column area. Keep the existing brand/number visual treatment for `driverNumber` and `position`.

Use this structure (adapt the existing helpers; do not invent new visual styles):

```ts
      const rows = sorted.map((v, i) => {
        const bgRow = i % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.3)";
        const isLeader = i === 0;
        const pitLabel = formatStandingsPit(v);
        const pitting = pitLabel !== "";
        const gapText = mode === "race" && v.fastestLap ? "FASTEST" : formatStandingsGapForMode(mode, v, classLeader);
        const gapColor = isLeader ? a.posLeaderColor : "";
        const posColor = isLeader ? a.posLeaderColor : ON_TRACK_COLOR;
        const rowTextColor = pitting ? PIT_COLOR : ON_TRACK_COLOR;
        const classPlace = i + 1;

        const hasBrand = !!v.teamBrandColor;
        const bi = hasBrand ? brandInitial(v.driverName) : "";
        const teamBg = v.teamBrandColor || "transparent";
        const tc = hasBrand ? brandTextColor(teamBg) : rowTextColor;
        const numColor = pitLabel ? "#000000" : rowTextColor;
        const numBg = pitLabel ? a.pitColor : (v.teamBrandColor || "transparent");
        const teamColor = isLeader ? a.posLeaderColor : rowTextColor;

        const leaderShadow = isLeader ? `box-shadow: inset 2px 0 0 0 ${a.posLeaderColor}` : "";
        const fastestShadow = v.fastestLap ? `box-shadow: inset 2px 0 0 0 ${a.textColor}` : "";
        const leftInset = fastestShadow || leaderShadow;

        const cells = activeColumns.map((column) => {
          const def = getStandingsColumn(column.id);
          const fallbackWidth = def?.defaultWidth ?? 0;
          const width = getStandingsColumnWidth(column, fallbackWidth);
          const baseStyle = `width:${width}px`;

          switch (column.id) {
          case "position":
            return `<div class="text-center shrink-0" style="${baseStyle};color:${posColor}">${classPlace}</div>`;

          case "driverNumber": {
            return `<div class="flex items-center justify-center py-[2px] px-[2px] shrink-0" style="${baseStyle};height:${rowHeight}px">
              <div class="w-5 h-[18px] flex items-center justify-center relative" style="background:${numBg};${pitLabel ? `border:1px solid ${a.pitColor}` : ""}">
                <span class="font-black text-[11px]" style="color:${numColor}">${escapeHTML(v.driverNumber ?? "")}</span>
                ${pitLabel ? `<div class="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[6px] px-0.5 rounded-sm leading-none whitespace-nowrap font-black" style="background:${a.pitColor};color:#000">PIT</div>` : ""}
              </div>
            </div>`;
          }

          case "driverName": {
            const color = getStandingsColumnColor(column, teamColor);
            const align = getStandingsColumnAlign(column, "left");
            return `<div class="px-1 tracking-wide shrink-0 whitespace-nowrap overflow-hidden ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}" data-standings-col="driverName">
              ${escapeHTML(formatStandingsDriverName(v.driverName, column))}
            </div>`;
          }

          case "vehicleClass": {
            const color = getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            return `<div class="px-2 flex items-center font-mono text-[9px] shrink-0 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}">
              ${escapeHTML(v.vehicleClass ?? "")}
            </div>`;
          }

          case "currentLap": {
            const color = getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            return `<div class="px-2 flex items-center font-mono text-[9px] shrink-0 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}">
              ${v.totalLaps ?? ""}
            </div>`;
          }

          case "gap": {
            const color = gapColor || getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            return `<div class="px-2 flex items-center justify-end font-mono text-[9px] shrink-0 gap-1 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${rowTextColor}">
              ${tireBadgeHtml(v.tireCompound, a.tireSoftColor, a.tireMediumColor, a.tireHardColor)}
              <span style="${color ? `color:${color}` : ""}">${escapeHTML(gapText)}</span>
            </div>`;
          }

          case "interval": {
            const color = getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            const interval = v.timeBehindNext != null ? `+${v.timeBehindNext.toFixed(3)}s` : "—";
            return `<div class="px-2 flex items-center font-mono text-[9px] shrink-0 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}">
              ${interval}
            </div>`;
          }

          case "bestLap": {
            const color = getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            return `<div class="px-2 flex items-center font-mono text-[9px] shrink-0 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}">
              ${escapeHTML(formatStandingsLapTime(v.bestLapTime, column))}
            </div>`;
          }

          case "lastLap": {
            const color = getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            return `<div class="px-2 flex items-center font-mono text-[9px] shrink-0 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}">
              ${escapeHTML(formatStandingsLapTime(v.lastLapTime, column))}
            </div>`;
          }

          default:
            return "";
          }
        }).join("");

        return `<div class="flex items-center text-[11px] font-bold border-b border-black/20 transition-all" data-standings-row style="min-width:${intrinsicWidth}px;width:max(100%, ${intrinsicWidth}px);height:${rowHeight}px;background:${bgRow};${leftInset}">
          ${cells}
        </div>`;
      });
```

Notes for the implementer:
- The previous code rendered a brand cell before the number cell. The catalog does not define a "brand" column, so brand treatment is folded into `driverNumber` (the team background already sits behind the number). If you want to preserve the standalone brand block, add it as a prefix only when `driverNumber` is enabled and `teamBrandColor` is present, but do NOT add a new column id. Keep it inside the `driverNumber` case or as a leading cell that is not driven by a column. Prefer folding brand into the number cell to avoid drifting from the column-driven contract.
- The `data-standings-row` and `data-standings-col` attributes exist only for tests; do not rely on them for styling.

- [ ] **Step 6: Update the `useEffect` dependency array**

Add `activeColumns` and `intrinsicWidth` to the dependency array:

```ts
  }, [maxRows, updateHz, editMode, telemetryMode, props, a, activeColumns, intrinsicWidth]);
```

- [ ] **Step 7: Run focused tests and verify they pass**

Run:

```powershell
pnpm --dir frontend test -- StandingsWidget standings-format
```

Expected: PASS.

- [ ] **Step 8: Commit the renderer change**

```bash
git add frontend/src/overlay/widgets/StandingsWidget.tsx frontend/src/overlay/widgets/StandingsWidget.test.tsx
git commit -m "feat(standings): render configurable columns from variant (S4)"
```

---

## Task 4: Regression Checks

- [ ] **Step 1: Run the full Standings + Relative + variant test set**

Run:

```powershell
pnpm --dir frontend test -- StandingsWidget standings-format standings-catalog RelativeWidget relative-format widget-variants
```

Expected: all pass.

- [ ] **Step 2: Type-check frontend**

Run:

```powershell
pnpm --dir frontend exec tsc -b
```

Expected: PASS.

- [ ] **Step 3: Build frontend**

Run:

```powershell
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run:

```powershell
pnpm --dir frontend test
```

Expected: all tests pass (existing 267 plus new standings-format/StandingsWidget tests).

- [ ] **Step 5: Whitespace check**

Run:

```powershell
git diff --check
```

Expected: exit code 0. CRLF warnings may appear and should be reported if they do, but whitespace errors must be fixed before reporting completion.

- [ ] **Step 6: Lint check (informational)**

Run:

```powershell
pnpm --dir frontend lint
```

Report the result. If lint fails only on pre-existing issues unrelated to this task, note them. Do not fix unrelated lint issues.

## Required Final Report

Report in Spanish:

- Archivos creados/modificados.
- Tests/checks ejecutados y resultado exacto (copia la salida clave de cada check).
- Checks no ejecutados y motivo.
- Confirmacion explicita de que no tocaste UI (`hub/**`), `WidgetRenderer`, `PreviewScaler`, `WidgetSandboxPreview`, `PreviewWidgetFrame`, backend, schema, configs ni docs.
- Confirmacion explicita de que `Relative` sigue pasando tests.
- Confirmacion explicita de que `widget-variants.ts` no fue modificado.
- Confirmacion explicita de que `standings-catalog.ts` no fue modificado.
- Confirmacion de que no se anadieron dependencias.
- Riesgos o dudas.
- Como verificar manualmente (abrir `Overlays Studio -> Widgets -> standings`, aunque la UI de toggle es S5; el renderer debe seguir mostrando las columnas default).

## Review Handoff

After implementation, do not self-approve the task. The orchestrator will send the diff/report to GLM for code review.

## Verification Manual (post-review)

1. Reconstruir y abrir la app.
2. Entrar en `Overlays Studio -> Widgets -> standings`.
3. El widget debe seguir mostrando position, number, name y gap como antes (defaults).
4. Si se inyecta manualmente un perfil con `variant.columns` (por ejemplo `bestLap` habilitado), el widget debe mostrar la columna de mejor vuelta con formato `1:29.823`.
5. No debe aparecer `playerHighlight` como columna.
6. La preview aislada no debe mezclar posicion/tamano del widget.
