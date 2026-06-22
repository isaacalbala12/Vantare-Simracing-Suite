# Relative Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable `Relative` filters for cars ahead/behind, class scope, and player row visibility without touching layout position/size or backend schema.

**Architecture:** Store new filter settings in `WidgetVariantConfig.filters`, because schema v2 already supports variant-level filters in Go and TypeScript. Keep backward compatibility with legacy `widget.props.rangeAhead` and `widget.props.rangeBehind`. Move row-selection logic into a pure helper so workers can TDD the behavior before wiring React UI.

**Tech Stack:** React/TypeScript, Vitest, existing profile schema v2, existing `RelativeWidget`, existing `WidgetStudio` save flow.

---

## Scope

Implement only:
- Relative filter defaults and normalization in frontend variant helpers.
- Pure row selection for `Relative`.
- Widget renderer support for filters.
- WidgetStudio controls for filters.
- Focused tests, build, and manual verification checklist.

Do not implement:
- Layout editing.
- Backend schema changes.
- New dependencies.
- Design-system redesign.
- Standings/Pedals changes.
- OBS/live connection changes.

## Files

- Create: `frontend/src/overlay/widgets/relative-filters.ts`
  - Owns filter settings parsing, defaults, and row selection.
- Create: `frontend/src/overlay/widgets/relative-filters.test.ts`
  - Tests the pure filter behavior.
- Modify: `frontend/src/lib/widget-variants.ts`
  - Adds default `filters` to Relative variants and preserves existing user filters.
- Modify: `frontend/src/lib/widget-variants.test.ts`
  - Tests default filters and preservation.
- Modify: `frontend/src/overlay/widgets/RelativeWidget.tsx`
  - Uses `relative-filters.ts` instead of local row-selection logic.
- Modify: `frontend/src/overlay/widgets/RelativeWidget.test.tsx`
  - Verifies renderer respects class/player/range filters.
- Modify: `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
  - Adds filter controls under the existing Relative section.
- Modify: `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`
  - Tests that controls write `variant.filters`.
- Modify: `docs/current-plan.md`
  - Records completion and remaining manual checks after implementation.

---

### Task 1: Pure Filter Helpers

**Model:** Kimi K2.7.

**Chat:** New chat recommended. This task is isolated and the cache benefit from the current long chat is low.

**Files:**
- Create: `frontend/src/overlay/widgets/relative-filters.ts`
- Create: `frontend/src/overlay/widgets/relative-filters.test.ts`

- [ ] **Step 1: Create failing tests for default behavior**

Create `frontend/src/overlay/widgets/relative-filters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { VehicleScoring } from "../../lib/telemetry-ref";
import {
  DEFAULT_RELATIVE_FILTERS,
  getRelativeFilters,
  selectRelativeRows,
} from "./relative-filters";

function car(partial: Partial<VehicleScoring>): Partial<VehicleScoring> {
  return partial;
}

const vehicles: Partial<VehicleScoring>[] = [
  car({ id: 1, driverName: "Ahead far", place: 1, vehicleClass: "HYPERCAR", timeGapToPlayer: 6 }),
  car({ id: 2, driverName: "Ahead near", place: 2, vehicleClass: "HYPERCAR", timeGapToPlayer: 2 }),
  car({ id: 3, driverName: "Ahead gt", place: 3, vehicleClass: "LMGT3", timeGapToPlayer: 1 }),
  car({ id: 4, driverName: "Player", place: 4, vehicleClass: "HYPERCAR", isPlayer: true, timeGapToPlayer: 0 }),
  car({ id: 5, driverName: "Behind near", place: 5, vehicleClass: "HYPERCAR", timeGapToPlayer: -1 }),
  car({ id: 6, driverName: "Behind gt", place: 6, vehicleClass: "LMGT3", timeGapToPlayer: -2 }),
  car({ id: 7, driverName: "Behind far", place: 7, vehicleClass: "HYPERCAR", timeGapToPlayer: -5 }),
];

describe("relative filters", () => {
  it("uses stable defaults", () => {
    expect(DEFAULT_RELATIVE_FILTERS).toEqual({
      rangeAhead: 3,
      rangeBehind: 3,
      classScope: "all",
      includePlayer: true,
    });
  });

  it("selects cars ahead, player and cars behind by default", () => {
    const rows = selectRelativeRows(vehicles, DEFAULT_RELATIVE_FILTERS);
    expect(rows.map((row) => row.driverName)).toEqual([
      "Ahead far",
      "Ahead near",
      "Ahead gt",
      "Player",
      "Behind near",
      "Behind gt",
      "Behind far",
    ]);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --dir frontend test -- relative-filters
```

Expected: FAIL because `relative-filters.ts` does not exist.

- [ ] **Step 3: Implement minimal helper**

Create `frontend/src/overlay/widgets/relative-filters.ts`:

```ts
import type { VehicleScoring } from "../../lib/telemetry-ref";

export type RelativeClassScope = "all" | "sameClass";

export type RelativeFilterSettings = {
  rangeAhead: number;
  rangeBehind: number;
  classScope: RelativeClassScope;
  includePlayer: boolean;
};

export const DEFAULT_RELATIVE_FILTERS: RelativeFilterSettings = {
  rangeAhead: 3,
  rangeBehind: 3,
  classScope: "all",
  includePlayer: true,
};

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readClassScope(value: unknown): RelativeClassScope | undefined {
  return value === "sameClass" || value === "all" ? value : undefined;
}

function clampRange(value: unknown, fallback: number): number {
  const n = readNumber(value);
  if (n == null) return fallback;
  return Math.max(0, Math.min(20, Math.round(n)));
}

export function getRelativeFilters(
  variantFilters?: Record<string, unknown>,
  legacyProps?: Record<string, unknown>,
): RelativeFilterSettings {
  return {
    rangeAhead: clampRange(
      variantFilters?.rangeAhead ?? legacyProps?.rangeAhead,
      DEFAULT_RELATIVE_FILTERS.rangeAhead,
    ),
    rangeBehind: clampRange(
      variantFilters?.rangeBehind ?? legacyProps?.rangeBehind,
      DEFAULT_RELATIVE_FILTERS.rangeBehind,
    ),
    classScope: readClassScope(variantFilters?.classScope) ?? DEFAULT_RELATIVE_FILTERS.classScope,
    includePlayer: readBoolean(variantFilters?.includePlayer) ?? DEFAULT_RELATIVE_FILTERS.includePlayer,
  };
}

export function selectRelativeRows(
  vehicles: Partial<VehicleScoring>[],
  filters: RelativeFilterSettings,
): Partial<VehicleScoring>[] {
  const player = vehicles.find((vehicle) => vehicle.isPlayer);
  if (!player) return [];

  const playerClass = (player.vehicleClass ?? "").toUpperCase();
  const candidates = vehicles.filter((vehicle) => {
    if (vehicle.isPlayer) return false;
    if (vehicle.timeGapToPlayer == null || !Number.isFinite(vehicle.timeGapToPlayer)) return false;
    if (filters.classScope === "sameClass") {
      return (vehicle.vehicleClass ?? "").toUpperCase() === playerClass;
    }
    return true;
  });

  const withGap = candidates.map((vehicle) => ({ vehicle, gap: vehicle.timeGapToPlayer! }));
  const ahead = withGap
    .filter((item) => item.gap > 0)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, filters.rangeAhead)
    .map((item) => item.vehicle)
    .reverse();
  const behind = withGap
    .filter((item) => item.gap < 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, filters.rangeBehind)
    .map((item) => item.vehicle);

  return filters.includePlayer ? [...ahead, player, ...behind] : [...ahead, ...behind];
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```powershell
pnpm --dir frontend test -- relative-filters
```

Expected: PASS.

- [ ] **Step 5: Add edge-case tests**

Append to `relative-filters.test.ts`:

```ts
  it("can filter to same class only", () => {
    const rows = selectRelativeRows(vehicles, {
      ...DEFAULT_RELATIVE_FILTERS,
      classScope: "sameClass",
    });
    expect(rows.map((row) => row.driverName)).toEqual([
      "Ahead far",
      "Ahead near",
      "Player",
      "Behind near",
      "Behind far",
    ]);
  });

  it("can hide the player row", () => {
    const rows = selectRelativeRows(vehicles, {
      ...DEFAULT_RELATIVE_FILTERS,
      includePlayer: false,
    });
    expect(rows.map((row) => row.driverName)).not.toContain("Player");
  });

  it("clamps range filters and preserves legacy range props", () => {
    expect(getRelativeFilters(undefined, { rangeAhead: 99, rangeBehind: -5 })).toEqual({
      rangeAhead: 20,
      rangeBehind: 0,
      classScope: "all",
      includePlayer: true,
    });
  });

  it("variant filters override legacy range props", () => {
    expect(getRelativeFilters(
      { rangeAhead: 1, rangeBehind: 2, classScope: "sameClass", includePlayer: false },
      { rangeAhead: 8, rangeBehind: 8 },
    )).toEqual({
      rangeAhead: 1,
      rangeBehind: 2,
      classScope: "sameClass",
      includePlayer: false,
    });
  });
```

- [ ] **Step 6: Run task checks**

Run:

```powershell
pnpm --dir frontend test -- relative-filters
pnpm --dir frontend exec tsc -b
```

Expected: PASS.

Do not commit unless the user explicitly asks for commits.

---

### Task 2: Variant Filter Defaults

**Model:** Kimi K2.7.

**Chat:** New chat recommended. It touches shared variant normalization and should start with focused context, not the full current discussion.

**Files:**
- Modify: `frontend/src/lib/widget-variants.ts`
- Modify: `frontend/src/lib/widget-variants.test.ts`

- [ ] **Step 1: Add failing test for default filters**

In `frontend/src/lib/widget-variants.test.ts`, add:

```ts
  it("adds default Relative filters without overwriting user filters", () => {
    const p = profile();
    p.variants = [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        filters: { rangeAhead: 2, classScope: "sameClass" },
        columns: [],
      },
    ];

    const next = withDefaultWidgetVariants(p);
    expect(next.variants?.[0].filters).toEqual({
      rangeAhead: 2,
      rangeBehind: 3,
      classScope: "sameClass",
      includePlayer: true,
    });
  });
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
pnpm --dir frontend test -- widget-variants
```

Expected: FAIL because filters are not normalized yet.

- [ ] **Step 3: Implement filter normalization**

In `frontend/src/lib/widget-variants.ts`:

1. Import defaults:

```ts
import { DEFAULT_RELATIVE_FILTERS } from "../overlay/widgets/relative-filters";
```

2. Add helper:

```ts
function normalizeRelativeFilters(filters?: Record<string, unknown>): Record<string, unknown> {
  return {
    ...DEFAULT_RELATIVE_FILTERS,
    ...(filters ?? {}),
  };
}
```

3. In `createDefaultRelativeVariant`, include:

```ts
filters: { ...DEFAULT_RELATIVE_FILTERS },
```

4. In `normalizeRelativeVariant`, include:

```ts
filters: normalizeRelativeFilters(variant.filters),
```

The normalized variant object must still preserve `props`, `formats`, `slots`, `columnGroups`, and existing columns.

- [ ] **Step 4: Run task checks**

Run:

```powershell
pnpm --dir frontend test -- widget-variants relative-filters relative-catalog
pnpm --dir frontend exec tsc -b
```

Expected: PASS.

Do not commit unless the user explicitly asks for commits.

---

### Task 3: Relative Renderer Uses Filters

**Model:** Kimi K2.7.

**Chat:** Same chat as Task 2 is acceptable if Task 2 was just completed there; otherwise start a new chat. This task depends directly on Task 2 types/defaults.

**Files:**
- Modify: `frontend/src/overlay/widgets/RelativeWidget.tsx`
- Modify: `frontend/src/overlay/widgets/RelativeWidget.test.tsx`

- [ ] **Step 1: Add failing renderer tests**

In `frontend/src/overlay/widgets/RelativeWidget.test.tsx`, add:

```tsx
  it("filters relative rows to the player class when configured", () => {
    render(
      <RelativeWidget
        editMode={true}
        updateHz={15}
        props={{
          variant: {
            id: "variant-relative-default",
            templateId: "relative-vantare-default",
            filters: { classScope: "sameClass", rangeAhead: 3, rangeBehind: 3, includePlayer: true },
            columns: [
              { id: "position", metricId: "position", enabled: true },
              { id: "driverName", metricId: "driverName", enabled: true },
              { id: "gap", metricId: "gap", enabled: true },
            ],
          },
        }}
      />,
    );

    tick(100);

    expect(screen.getByText("TOYOTA GAZOO")).toBeTruthy();
    expect(screen.queryByText("UNITED AUTOSPORTS")).toBeNull();
  });

  it("can hide the player row when includePlayer is false", () => {
    render(
      <RelativeWidget
        editMode={true}
        updateHz={15}
        props={{
          variant: {
            id: "variant-relative-default",
            templateId: "relative-vantare-default",
            filters: { rangeAhead: 1, rangeBehind: 1, includePlayer: false },
            columns: [
              { id: "position", metricId: "position", enabled: true },
              { id: "driverName", metricId: "driverName", enabled: true },
              { id: "gap", metricId: "gap", enabled: true },
            ],
          },
        }}
      />,
    );

    tick(100);

    expect(screen.queryByText("TOYOTA GAZOO")).toBeNull();
    expect(screen.getByText("CADILLAC RACING")).toBeTruthy();
    expect(screen.getByText("PEUGEOT")).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --dir frontend test -- RelativeWidget relative-filters
```

Expected: at least one new test fails because the widget still uses the old local selector and ignores `variant.filters`.

- [ ] **Step 3: Replace local selection with helper**

In `frontend/src/overlay/widgets/RelativeWidget.tsx`:

1. Import:

```ts
import { getRelativeFilters, selectRelativeRows } from "./relative-filters";
```

2. Extend `RelativeRenderVariant`:

```ts
type RelativeRenderVariant = {
  columns?: ColumnConfig[];
  filters?: Record<string, unknown>;
};
```

3. Remove the local `selectRelativeRowsByGap` implementation from production code, or keep a wrapper export only if existing tests require it:

```ts
export function selectRelativeRowsByGap(
  vehicles: Partial<VehicleScoring>[],
  rangeAhead: number,
  rangeBehind: number,
): Partial<VehicleScoring>[] {
  return selectRelativeRows(vehicles, {
    rangeAhead,
    rangeBehind,
    classScope: "all",
    includePlayer: true,
  });
}
```

4. In `RelativeWidget`, replace:

```ts
const rangeAhead = (props?.rangeAhead as number) ?? 3;
const rangeBehind = (props?.rangeBehind as number) ?? 3;
```

with:

```ts
const variant = props?.variant as RelativeRenderVariant | undefined;
const filters = getRelativeFilters(variant?.filters, props);
```

5. Replace row selection:

```ts
const visible = selectRelativeRows(t.vehicles, filters);
```

6. Update effect dependencies:

```ts
}, [filters, updateHz, editMode, telemetryMode, props, a]);
```

If React warns about object dependency churn, use `filters.rangeAhead`, `filters.rangeBehind`, `filters.classScope`, and `filters.includePlayer` in the dependency list instead.

- [ ] **Step 4: Run task checks**

Run:

```powershell
pnpm --dir frontend test -- RelativeWidget relative-filters widget-variants
pnpm --dir frontend exec tsc -b
```

Expected: PASS.

Do not commit unless the user explicitly asks for commits.

---

### Task 4: Filter Controls In WidgetStudio

**Model:** Minimax M3 if visual quality matters; Kimi K2.7 is enough if the scope is strictly functional.

**Chat:** New chat recommended. This task touches UI and should receive only the relevant component/tests to save tokens.

**Files:**
- Modify: `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
- Modify: `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`

- [ ] **Step 1: Add failing UI tests**

In `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`, add tests that assert filters are written to `variant.filters`, not `widget.props`:

```tsx
  it("updates Relative range filters in the variant only", () => {
    const onChangeProfile = vi.fn();
    const p = profile();
    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.change(screen.getByLabelText("Coches delante"), { target: { value: "2" } });

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].filters?.rangeAhead).toBe(2);
    expect(next.widgets[0].props?.rangeAhead).toBe(3);
    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
  });

  it("updates Relative class scope and player visibility in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();
    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.change(screen.getByLabelText("Filtro de clase"), { target: { value: "sameClass" } });
    let next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].filters?.classScope).toBe("sameClass");

    onChangeProfile.mockClear();
    fireEvent.click(screen.getByRole("switch", { name: "Mostrar coche del jugador" }));
    next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].filters?.includePlayer).toBe(false);
  });
```

If the current test helper names differ, adapt only the fixture factory names; keep the assertions.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --dir frontend test -- RelativeSettingsSection
```

Expected: FAIL because controls do not exist.

- [ ] **Step 3: Add filter update helper**

In `RelativeSettingsSection.tsx`, add:

```ts
function updateRelativeFilters(
  profile: ProfileConfig,
  widgetId: string,
  update: (filters: Record<string, unknown>) => Record<string, unknown>,
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
        filters: update(variant.filters ?? {}),
      };
    }),
  };
}
```

- [ ] **Step 4: Add UI controls**

Inside `RelativeSettingsSection`, after the existing column switches and before detailed column formatting controls, add:

```tsx
      <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-vantare-textMuted">Filtros</h4>
        <label className="block text-[11px] text-vantare-textMuted">
          Coches delante
          <input
            type="number"
            min={0}
            max={20}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
            value={Number((variant?.filters?.rangeAhead as number | undefined) ?? 3)}
            onChange={(event) =>
              onChangeProfile(updateRelativeFilters(normalized, widget.id, (filters) => ({
                ...filters,
                rangeAhead: Number(event.target.value),
              })))
            }
          />
        </label>
        <label className="block text-[11px] text-vantare-textMuted">
          Coches detrás
          <input
            type="number"
            min={0}
            max={20}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
            value={Number((variant?.filters?.rangeBehind as number | undefined) ?? 3)}
            onChange={(event) =>
              onChangeProfile(updateRelativeFilters(normalized, widget.id, (filters) => ({
                ...filters,
                rangeBehind: Number(event.target.value),
              })))
            }
          />
        </label>
        <label className="block text-[11px] text-vantare-textMuted">
          Filtro de clase
          <select
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
            value={(variant?.filters?.classScope as string | undefined) ?? "all"}
            onChange={(event) =>
              onChangeProfile(updateRelativeFilters(normalized, widget.id, (filters) => ({
                ...filters,
                classScope: event.target.value,
              })))
            }
          >
            <option value="all">Todas las clases</option>
            <option value="sameClass">Misma clase</option>
          </select>
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={((variant?.filters?.includePlayer as boolean | undefined) ?? true)}
          aria-label="Mostrar coche del jugador"
          onClick={() =>
            onChangeProfile(updateRelativeFilters(normalized, widget.id, (filters) => ({
              ...filters,
              includePlayer: !((filters.includePlayer as boolean | undefined) ?? true),
            })))
          }
          className="flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-left text-sm text-white transition-colors hover:border-white/15 hover:bg-black/30"
        >
          <span className="block text-xs font-medium">Mostrar coche del jugador</span>
          <span
            aria-hidden="true"
            className={`h-5 w-9 rounded-full border p-0.5 transition-colors ${
              ((variant?.filters?.includePlayer as boolean | undefined) ?? true)
                ? "border-vantare-red-500 bg-vantare-red-600"
                : "border-white/15 bg-black/40"
            }`}
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                ((variant?.filters?.includePlayer as boolean | undefined) ?? true) ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </span>
        </button>
      </div>
```

Keep controls in `WidgetStudio` only. Do not expose position/size/delete.

- [ ] **Step 5: Run task checks**

Run:

```powershell
pnpm --dir frontend test -- RelativeSettingsSection WidgetStudio WidgetPreviewPanel
pnpm --dir frontend exec tsc -b
pnpm --dir frontend build
```

Expected: PASS.

Do not commit unless the user explicitly asks for commits.

---

### Task 5: Persistence And Manual Verification

**Model:** Gemini 3.5 Flash for speed or DeepSeek V4 Flash if cost matters; this is mostly checks/docs.

**Chat:** New chat recommended. Give it only the plan, current diff summary, and required checks.

**Files:**
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Run focused regression suite**

Run:

```powershell
pnpm --dir frontend test -- relative-filters widget-variants RelativeWidget RelativeSettingsSection WidgetStudio WidgetPreviewPanel useOverlayStudioState
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 3: Run Go compatibility tests**

Run:

```powershell
go test ./pkg/config ./internal/app
```

Expected: PASS. This confirms existing variant `filters` persistence remains compatible.

- [ ] **Step 4: Run diff hygiene check**

Run:

```powershell
git diff --check
```

Expected: no errors. CRLF warnings are acceptable if they match existing repo behavior.

- [ ] **Step 5: Update current plan**

In `docs/current-plan.md`, add under the current Relative section:

```md
Filtros iniciales de `Relative` preparados:
- `rangeAhead` y `rangeBehind` son configurables desde `WidgetStudio`.
- El filtro de clase permite todas las clases o solo la misma clase del jugador.
- El coche del jugador puede mostrarse u ocultarse.
- Los filtros se guardan en `variant.filters`; los perfiles legacy con `props.rangeAhead/rangeBehind` siguen funcionando.
```

Remove the pending item that says to create this miniplan.

- [ ] **Step 6: Manual verification checklist**

With the app running:

1. Open `Overlays Studio`.
2. Open `Widgets`.
3. Select the `relative` widget.
4. Set `Coches delante` to `1`.
5. Confirm the preview shows only one car ahead of the player.
6. Set `Coches detrás` to `1`.
7. Confirm the preview shows only one car behind the player.
8. Change `Filtro de clase` to `Misma clase`.
9. Confirm rows from other classes disappear when the mock contains mixed classes.
10. Disable `Mostrar coche del jugador`.
11. Confirm `TOYOTA GAZOO` disappears from the preview.
12. Wait for autosave.
13. Leave and reopen `Widgets`.
14. Confirm all filter values persisted.

Do not commit unless the user explicitly asks for commits.

---

## Review Checklist

Before closing this plan, reviewer must verify:

- `WidgetStudio` writes filter changes to `variant.filters`, not `widget.props`.
- `widget.position` is never changed by filter controls.
- Legacy `props.rangeAhead/rangeBehind` still affects rendering when no variant filters exist.
- Variant filters override legacy props when both exist.
- `sameClass` compares normalized uppercase class names.
- `includePlayer=false` does not break row order or row height.
- Empty/no-player telemetry still renders the existing `No player` fallback.
- No backend schema changes were made.
- No LayoutStudio controls were added.
- No dependencies were added.

## Expected Final Checks

Run:

```powershell
pnpm --dir frontend test
pnpm --dir frontend build
go test ./pkg/config ./internal/app
git diff --check
```

Expected:
- Frontend tests PASS.
- Frontend build PASS.
- Go tests PASS.
- `git diff --check` has no whitespace errors. CRLF warnings are acceptable if no errors are reported.

## Self-Review

Spec coverage:
- Cars ahead/behind: Task 1 pure helper, Task 3 renderer, Task 4 UI.
- Same class/all classes: Task 1 pure helper, Task 3 renderer, Task 4 UI.
- Include player: Task 1 pure helper, Task 3 renderer, Task 4 UI.
- Persistence: Task 2 variant defaults, existing save flow, Task 5 checks.
- Manual verification: Task 5 checklist.

Placeholder scan:
- No TBD/TODO/implement-later placeholders remain.

Type consistency:
- `RelativeFilterSettings`, `RelativeClassScope`, `variant.filters`, `rangeAhead`, `rangeBehind`, `classScope`, and `includePlayer` are used consistently across tasks.
