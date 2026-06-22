# S2 Standings Catalog Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure frontend catalog for `Standings` metrics, columns and defaults, without changing the renderer, UI, backend or schema.

**Architecture:** Mirror the successful `Relative` catalog pattern, but keep `Standings` independent. This task creates data definitions and tests only. Later plans will integrate variants, rendering and UI.

**Tech Stack:** TypeScript, Vitest, existing profile schema v2 types.

---

## Scope

Create:

- `frontend/src/overlay/widgets/standings-catalog.ts`
- `frontend/src/overlay/widgets/standings-catalog.test.ts`

The catalog must define:

- stable metric ids;
- stable column ids;
- default standings columns;
- optional columns for the first alpha cut;
- release channel classification;
- helper to create default columns.

## Do Not Edit

Do not modify:

- `StandingsWidget.tsx`
- `WidgetStudio.tsx`
- `WidgetSettingsPanel.tsx`
- `RelativeSettingsSection.tsx`
- `widget-variants.ts`
- backend Go files;
- schema files;
- configs;
- docs/marketing;
- `docs/INTEGRATION_ANALYSIS.md`.

No UI. No renderer changes. No variant integration. No persistence changes.

## Required Docs To Read

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/master-feature-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/feature-architecture-map.md`
- `docs/beta-widget-system-spec.md`
- `docs/product-widget-customization.md`
- `docs/superpowers/plans/2026-06-22-s1-standings-current-inventory.md`
- S1 worker report supplied by orchestrator/user, if available in prompt

## Reference Files

Inspect:

- `frontend/src/overlay/widgets/relative-catalog.ts`
- `frontend/src/overlay/widgets/relative-catalog.test.ts`
- `frontend/src/overlay/widgets/relative-format.ts`
- `frontend/src/lib/profile.ts`
- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- `frontend/src/lib/telemetry-ref.ts`

## Catalog Rules

Stable in first cut:

- `position`
- `driverNumber`
- `driverName`
- `vehicleClass`
- `currentLap`
- `gap`
- `interval`
- `bestLap`
- `lastLap`
- `playerHighlight`

Tester or later, not enabled by default:

- `pitInfo` can exist as `tester` if data is available but UI semantics are not final.
- `distance` can exist as `tester`.
- `deltaLapTime` can exist as `tester` if derived, not direct.

Later/unavailable:

- `nationality`
- `positionsGained`
- `tireCompound`
- `offtracks`
- `maxSpeed`
- `virtualEnergy`
- `brandLogo`
- `lastFiveLaps`
- `lastTenLaps`
- `pitLapDuration`

Do not expose multiclass in this task.

## Required Types

Use existing `ColumnConfig` from `frontend/src/lib/profile.ts`.

If local catalog types are needed, define them in `standings-catalog.ts`:

```ts
export type StandingsReleaseChannel = "stable" | "tester" | "later";

export type StandingsMetricId =
  | "position"
  | "driverNumber"
  | "driverName"
  | "vehicleClass"
  | "currentLap"
  | "gap"
  | "interval"
  | "bestLap"
  | "lastLap"
  | "playerHighlight"
  | "pitInfo"
  | "distance"
  | "deltaLapTime";

export type StandingsColumnId =
  | "position"
  | "driverNumber"
  | "driverName"
  | "vehicleClass"
  | "currentLap"
  | "gap"
  | "interval"
  | "bestLap"
  | "lastLap";
```

If the existing `ColumnConfig` requires broader string ids, keep the stricter types local and return `ColumnConfig[]`.

## Default Columns

Default enabled columns must preserve current visual baseline as closely as possible:

1. `position`
2. `driverNumber`
3. `driverName`
4. `gap`

Optional disabled columns for alpha:

5. `vehicleClass`
6. `currentLap`
7. `interval`
8. `bestLap`
9. `lastLap`

Rationale:

- current widget already filters class and shows a class banner, but not per-row class by default;
- `bestLap` and `lastLap` are stable data but should be optional like `Relative`;
- `interval` is stable data but optional to avoid changing default layout.

## Task 1: Write Catalog Tests First

- [ ] **Step 1: Create failing test file**

Create `frontend/src/overlay/widgets/standings-catalog.test.ts`.

Tests must assert:

1. all default columns are returned in stable order;
2. base columns are enabled by default;
3. optional alpha columns are disabled by default;
4. every column references a defined metric;
5. stable metrics do not include later/unavailable metrics;
6. `createDefaultStandingsColumns()` returns a fresh copy, not shared objects;
7. default width/format/style are present where needed for name/time columns.

Expected imports:

```ts
import { describe, expect, it } from "vitest";
import {
  STANDINGS_COLUMNS,
  STANDINGS_METRICS,
  createDefaultStandingsColumns,
} from "./standings-catalog";
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- standings-catalog
```

Expected:

- FAIL because `standings-catalog.ts` does not exist yet.

## Task 2: Implement Pure Catalog

- [ ] **Step 1: Create standings-catalog.ts**

Create `frontend/src/overlay/widgets/standings-catalog.ts`.

Implementation requirements:

- export `STANDINGS_METRICS`;
- export `STANDINGS_COLUMNS`;
- export `createDefaultStandingsColumns`;
- no React imports;
- no DOM;
- no backend calls;
- no dependency on `StandingsWidget.tsx`;
- return deep-ish copies for nested `format` and `style` objects.

Recommended shape:

```ts
import type { ColumnConfig } from "../../lib/profile";

export type StandingsReleaseChannel = "stable" | "tester" | "later";

export interface StandingsMetricDefinition {
  id: string;
  label: string;
  sourceField: string;
  releaseChannel: StandingsReleaseChannel;
  requiresLive?: boolean;
}

export interface StandingsColumnDefinition {
  id: string;
  metricId: string;
  label: string;
  defaultEnabled: boolean;
  defaultWidth?: number;
  releaseChannel: StandingsReleaseChannel;
  format?: ColumnConfig["format"];
  style?: ColumnConfig["style"];
}
```

Use labels in Spanish or existing product language only for display. IDs must be technical/stable.

- [ ] **Step 2: Define stable metrics**

Include stable metrics:

- `position`
- `driverNumber`
- `driverName`
- `vehicleClass`
- `currentLap`
- `gap`
- `interval`
- `bestLap`
- `lastLap`
- `playerHighlight`

Include tester metrics:

- `pitInfo`
- `distance`
- `deltaLapTime`

Do not include later/unavailable metrics in `STANDINGS_METRICS` unless the tests explicitly mark them as not stable and not columns. Prefer leaving them out for this first catalog.

- [ ] **Step 3: Define columns**

Use these defaults:

- `position`: enabled, width 28, metric `position`
- `driverNumber`: enabled, width 42, metric `driverNumber`
- `driverName`: enabled, width 132, metric `driverName`, format `{ mode: "full", maxChars: 16 }`, style align left
- `gap`: enabled, width 70, metric `gap`, style align right
- `vehicleClass`: disabled, width 64, metric `vehicleClass`
- `currentLap`: disabled, width 52, metric `currentLap`, style align right
- `interval`: disabled, width 70, metric `interval`, style align right
- `bestLap`: disabled, width 76, metric `bestLap`, format `{ display: "full", decimals: 3 }`, style align right
- `lastLap`: disabled, width 76, metric `lastLap`, format `{ display: "full", decimals: 3 }`, style align right

If existing `ColumnConfig["format"]` does not type `mode`, `display`, or `decimals` exactly, inspect `profile.ts` and match existing format shape from `relative-catalog.ts`.

- [ ] **Step 4: Implement createDefaultStandingsColumns**

It must return `ColumnConfig[]`:

- `id`;
- `metricId`;
- `enabled`;
- `width`;
- `format` when present;
- `style` when present.

It must not return references to mutable nested catalog objects.

## Task 3: Run Focused Tests

- [ ] **Step 1: Run standings catalog tests**

Run:

```powershell
pnpm --dir frontend test -- standings-catalog
```

Expected:

- PASS.

- [ ] **Step 2: Run related catalog tests**

Run:

```powershell
pnpm --dir frontend test -- standings-catalog relative-catalog relative-format
```

Expected:

- PASS.

- [ ] **Step 3: Run TypeScript check if catalog touches shared types**

Run:

```powershell
pnpm --dir frontend exec tsc -b
```

Expected:

- PASS.

## Task 4: Final Report

- [ ] **Step 1: Report in Spanish**

Report:

- files created/modified;
- tests/checks executed;
- checks not executed and why;
- confirmation no UI/render/backend/schema/config changes;
- exact default columns;
- metrics intentionally excluded or left for tester/later;
- risks;
- recommendation for S3.

## Acceptance Criteria

- `standings-catalog.ts` exists and is pure TypeScript.
- Tests cover default order, enabled/disabled state, metric references, no later metrics in stable, fresh copies.
- No renderer/UI/backend/schema/config files changed.
- Focused tests pass.
- TypeScript passes or failure is clearly unrelated and reported.

## Stop Conditions

Stop and report if:

- `ColumnConfig` cannot represent required format/style without schema changes;
- existing relative catalog has incompatible patterns;
- tests fail for unrelated repo state and cause is unclear;
- implementing this requires touching renderer/UI/backend/schema.

## Next Step

If S2 passes, proceed to:

`S3 - Standings variantes y persistencia frontend`
