# Overlay Studio V3 Phase 6 Core Widget Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the V3 product layer by migrating Standings, Relative and Pedals into pure functional definitions and complete Original/Crystal renderers.

**Architecture:** Each widget owns typed functional content and a pure ViewModel builder. Each visual system owns a separate renderer and settings parser; shared table primitives may remove repetition without forcing Original and Crystal to share DOM composition.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, browser visual harness.

---

## Context capsule

- Phase 5 inspector/catalog/access is green.
- Do not wrap or import legacy React widgets from V3 renderers.
- Pure formatting/selection algorithms may be moved with characterization tests.
- A widget is complete only after Original + Crystal + mock states + inspector consumer + migration + visual snapshot pass.

### Task 6.1: Define shared functional column contracts

**Files:**
- Create: `vantare-v2/frontend/src/overlay/widget-types/shared/widget-column.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/shared/widget-column.test.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/shared/scoring-readers.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/shared/scoring-readers.test.ts`

- [ ] **Step 1: Write failing column tests**

Use:

```ts
export type WidgetColumnV3 = {
  id: string;
  metricId: string;
  enabled: boolean;
  widthPreset: "xs" | "sm" | "md" | "lg" | "auto";
  format?: Record<string, unknown>;
  style?: { align?: "left" | "center" | "right" };
};
```

Test unique IDs, known metric IDs per widget, safe format keys, deterministic width pixels and structured cloning. The inspector never edits raw numeric width.

- [ ] **Step 2: Write failing safe scoring-reader tests**

Create typed readers for string/number/boolean from generic scoring records. Missing/wrong values return explicit undefined/defaults and never throw. Reject NaN/Infinity.

- [ ] **Step 3: Implement and run**

```powershell
pnpm --dir vantare-v2/frontend test -- widget-column.test.ts scoring-readers.test.ts
git add vantare-v2/frontend/src/overlay/widget-types/shared
git commit -m "feat(overlay): add safe shared widget content contracts"
```

### Task 6.2: Migrate Standings functional model

**Files:**
- Create: `vantare-v2/frontend/src/overlay/widget-types/standings/standings-content.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/standings/standings-content.test.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/standings/standings-view-model.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/standings/standings-view-model.test.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/standings/standings-definition.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/standings/standings-definition.test.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/standings/StandingsContentInspector.tsx`
- Create: `vantare-v2/frontend/src/overlay/widget-types/standings/StandingsContentInspector.test.tsx`

- [ ] **Step 1: Write failing content tests**

```ts
export type StandingsMetricId =
  | "position" | "driverNumber" | "driverName" | "vehicleClass"
  | "gap" | "interval" | "currentLap" | "lastLap" | "bestLap"
  | "pit" | "tireCompound";

export type StandingsContent = {
  columns: WidgetColumnV3[];
};
```

Default columns are position, driverNumber, driverName, gap and bestLap enabled. Parser accepts Phase 1 migrated content, maps legacy numeric widths to the nearest preset and rejects duplicate/unknown metrics.

- [ ] **Step 2: Write failing ViewModel tests**

```ts
export type StandingsRowViewModel = {
  id: string;
  position: number;
  driverNumber: string;
  driverName: string;
  vehicleClass: string;
  gapText: string;
  intervalText: string;
  currentLapText: string;
  lastLapText: string;
  bestLapText: string;
  pitText: string;
  tireCompound: string;
  isPlayer: boolean;
  isLeader: boolean;
};

export type StandingsViewModel = WidgetViewModelBase & {
  type: "standings";
  sessionLabel: string;
  remainingText: string;
  columns: readonly WidgetColumnV3[];
  rows: readonly StandingsRowViewModel[];
};
```

Cover Practice/Qualifying/Race formatting, class/tire/PIT values, player/leader state, optional columns, 60-row stress input, malformed rows and missing/stale/disconnected/error snapshots.

- [ ] **Step 3: Implement pure content/model**

Move formatting semantics from legacy modules only after equivalent tests pass. The ViewModel does not emit HTML strings.

- [ ] **Step 4: Implement definition and content inspector**

Default size is 520x560, 15 Hz, aspect locked with unlock supported, tier `overlays.basic`. Inspector supports:

- enable/disable known columns;
- reorder columns through up/down controls;
- width presets, alignment and supported format presets;
- no raw `metricId` editing;
- no control without a ViewModel/renderer consumer.

All edits dispatch one `widget/content` command.

- [ ] **Step 5: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- standings-content.test.ts standings-view-model.test.ts standings-definition.test.ts StandingsContentInspector.test.tsx
git add vantare-v2/frontend/src/overlay/widget-types/standings
git commit -m "feat(standings): add pure functional definition"
```

### Task 6.3: Implement Standings Original and Crystal

**Files:**
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-original/standings/StandingsOriginal.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-original/standings/StandingsOriginal.test.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/standings/StandingsCrystal.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/standings/StandingsCrystal.test.tsx`
- Modify: both manifests and token stylesheets

- [ ] **Step 1: Write failing renderer tests**

For each system assert all enabled columns render in configured order, optional columns disappear, 60 rows do not corrupt keys, player/leader/PIT/tire states are visible, status states are deterministic and renderer uses only model/settings.

- [ ] **Step 2: Implement Original structure**

Use an opaque broadcast table with separate session header, column header and compact row striping. Root IDs:

```text
data-widget-system="vantare-original"
data-widget-renderer="standings"
data-standings-row="<row-id>"
```

- [ ] **Step 3: Implement Crystal structure**

Use a materially distinct glass frame, floating session meta, crystal column header and segmented row cards. Do not reuse Original row DOM through a shared component; shared pure value formatting is allowed.

- [ ] **Step 4: Register and prove settings consumption**

Each manifest declares Standings settings/control descriptors and config version 1. Tests mutate every exposed setting and assert a DOM/style effect.

- [ ] **Step 5: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- StandingsOriginal.test.tsx StandingsCrystal.test.tsx design-system-registry.test.ts
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/overlay/design-systems/vantare-original/standings vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/standings vantare-v2/frontend/src/overlay/design-systems/vantare-original/manifest.ts vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/manifest.ts vantare-v2/frontend/src/overlay/design-systems/vantare-original/tokens.css vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/tokens.css
git commit -m "feat(standings): add Original and Crystal renderers"
```

### Task 6.4: Migrate Relative functional model

**Files:**
- Create: `vantare-v2/frontend/src/overlay/widget-types/relative/relative-content.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/relative/relative-content.test.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/relative/relative-view-model.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/relative/relative-view-model.test.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/relative/relative-definition.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/relative/relative-definition.test.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/relative/RelativeContentInspector.tsx`
- Create: `vantare-v2/frontend/src/overlay/widget-types/relative/RelativeContentInspector.test.tsx`

- [ ] **Step 1: Write failing content tests**

```ts
export type RelativeContent = {
  columns: WidgetColumnV3[];
  rangeAhead: number;
  rangeBehind: number;
  classScope: "all" | "sameClass";
  includePlayer: boolean;
  rowHeightMode: "compact" | "fill";
};
```

Defaults: 3 ahead, 3 behind, all classes, include player, compact. Clamp ranges 0..20. Columns support position, class, carNumber, driverName, gap, bestLap and lastLap.

- [ ] **Step 2: Write failing row-selection/model tests**

Model rows around the player in scoring order, preserve requested ahead/behind counts at list boundaries, filter class correctly, include/exclude player, format gaps/laps and handle malformed/missing data. Cover 100-row stress input and all status states.

```ts
export type RelativeViewModel = WidgetViewModelBase & {
  type: "relative";
  columns: readonly WidgetColumnV3[];
  rowHeightMode: "compact" | "fill";
  rows: readonly RelativeRowViewModel[];
};
```

- [ ] **Step 3: Implement definition and inspector**

Default size 430x300, 15 Hz, aspect locked/unlock supported, tier `overlays.advanced`. Inspector provides constrained ahead/behind selectors, class scope, include-player, compact/fill, columns/formats/width presets. Every field is consumed by selection/model/render tests.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- relative-content.test.ts relative-view-model.test.ts relative-definition.test.ts RelativeContentInspector.test.tsx
git add vantare-v2/frontend/src/overlay/widget-types/relative
git commit -m "feat(relative): add pure functional definition"
```

### Task 6.5: Implement Relative Original and Crystal

**Files:**
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-original/relative/RelativeOriginal.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-original/relative/RelativeOriginal.test.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/relative/RelativeCrystal.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/relative/RelativeCrystal.test.tsx`
- Modify: both manifests and token stylesheets

- [ ] **Step 1: Write failing renderer tests**

Assert column order, compact/fill classes, player highlight, ahead/behind tone, class color, intrinsic minimum width, status states and complete settings consumption.

- [ ] **Step 2: Implement Original**

Opaque compact rows with direct class/gap accents. Fill mode distributes available height without a renderer DOM measurement loop.

- [ ] **Step 3: Implement Crystal**

Distinct glass stack with separated player card and translucent neighbor rows. Respect intrinsic column width and the host frame without reading `clientWidth` inside render.

- [ ] **Step 4: Register, run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- RelativeOriginal.test.tsx RelativeCrystal.test.tsx design-system-registry.test.ts
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/overlay/design-systems/vantare-original/relative vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/relative vantare-v2/frontend/src/overlay/design-systems/vantare-original/manifest.ts vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/manifest.ts vantare-v2/frontend/src/overlay/design-systems/vantare-original/tokens.css vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/tokens.css
git commit -m "feat(relative): add Original and Crystal renderers"
```

### Task 6.6: Migrate Pedals functional model

**Files:**
- Create: `vantare-v2/frontend/src/overlay/widget-types/pedals/pedals-view-model.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/pedals/pedals-view-model.test.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/pedals/pedals-definition.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/pedals/pedals-definition.test.ts`

- [ ] **Step 1: Write failing model tests**

```ts
export type PedalsViewModel = WidgetViewModelBase & {
  type: "pedals";
  throttle: number;
  brake: number;
  clutch: number;
  throttleText: string;
  brakeText: string;
  clutchText: string;
};
```

Clamp values 0..1, round percentage text, handle missing/status states and never mutate snapshot.

- [ ] **Step 2: Implement definition**

Content is empty. Default size 120x160, 30 Hz, aspect locked/unlock supported, tier `overlays.basic`. Sections omit Content.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- pedals-view-model.test.ts pedals-definition.test.ts
git add vantare-v2/frontend/src/overlay/widget-types/pedals
git commit -m "feat(pedals): add pure functional definition"
```

### Task 6.7: Implement Pedals Original and Crystal

**Files:**
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-original/pedals/PedalsOriginal.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-original/pedals/PedalsOriginal.test.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/pedals/PedalsCrystal.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/pedals/PedalsCrystal.test.tsx`
- Modify: both manifests and token stylesheets

- [ ] **Step 1: Write failing renderer tests**

Assert three bars, exact percentages, 0/100 extremes, color settings, status states, no background rectangle in transparent Original setting and no telemetry hooks/imports.

- [ ] **Step 2: Implement Original**

Three direct vertical racing bars with compact labels and optional transparent container.

- [ ] **Step 3: Implement Crystal**

Three separated glass channels with distinct material/highlights and structurally different labels/meters.

- [ ] **Step 4: Register, run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- PedalsOriginal.test.tsx PedalsCrystal.test.tsx design-system-registry.test.ts
git add vantare-v2/frontend/src/overlay/design-systems/vantare-original/pedals vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/pedals vantare-v2/frontend/src/overlay/design-systems/vantare-original/manifest.ts vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/manifest.ts vantare-v2/frontend/src/overlay/design-systems/vantare-original/tokens.css vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/tokens.css
git commit -m "feat(pedals): add Original and Crystal renderers"
```

### Task 6.8: Complete registry, catalog, designs and migration contracts

**Files:**
- Modify: `vantare-v2/frontend/src/overlay/core/widget-registry.ts`
- Modify: `vantare-v2/frontend/src/overlay/core/widget-registry.test.ts`
- Modify: `vantare-v2/frontend/src/overlay/design-systems/official-designs.ts`
- Modify: `vantare-v2/frontend/src/overlay/design-systems/official-designs.test.ts`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/catalog/studio-catalog.test.ts`
- Modify: `vantare-v2/frontend/src/overlay/core/profile-contract-fixture.test.ts`

- [ ] **Step 1: Write failing completeness tests**

Expect exactly four widget definitions and eight widget/system registrations. Every pair has default settings accepted by its parser, non-empty sizes/capabilities and a base official design. Catalog returns exactly four entries.

- [ ] **Step 2: Add official base designs**

For each widget add Original and Crystal base designs. Add named legacy-equivalent designs only where the Phase 1 migration preserves them; they remain designs, never systems.

- [ ] **Step 3: Assert golden migration parses through real definitions**

For every widget in the Go V2-to-V3 golden `profile-v3-core-widgets-from-v2.golden.json`:

1. parse content with its definition;
2. resolve exact system registration;
3. parse settings;
4. build ViewModel from ready mock;
5. render `WidgetVisualHost` without diagnostics.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- widget-registry.test.ts official-designs.test.ts studio-catalog.test.ts profile-contract-fixture.test.ts
git add vantare-v2/frontend/src/overlay/core/widget-registry.ts vantare-v2/frontend/src/overlay/core/widget-registry.test.ts vantare-v2/frontend/src/overlay/design-systems/official-designs.ts vantare-v2/frontend/src/overlay/design-systems/official-designs.test.ts vantare-v2/frontend/src/hub/overlay-studio/catalog/studio-catalog.test.ts vantare-v2/frontend/src/overlay/core/profile-contract-fixture.test.ts
git commit -m "feat(overlay): complete four-widget V3 registry"
```

### Task 6.9: Complete visual and parity matrix

**Files:**
- Modify: `vantare-v2/frontend/src/overlay-harness/OverlayParityHarness.tsx`
- Modify: `vantare-v2/frontend/src/overlay-harness/OverlayParityHarness.test.tsx`
- Modify: `vantare-v2/frontend/scripts/overlay-studio-visual.mjs`
- Create/Modify: `vantare-v2/frontend/testdata/overlay-studio-visual/*.png`

- [ ] **Step 1: Generate the required matrix**

Capture each widget x Original/Crystal x Studio/Desktop/OBS for ready state. Also capture every widget/system in stale/disconnected/error, Standings 60-row stress, Relative compact/fill and Pedals zero/full.

- [ ] **Step 2: Add programmatic parity assertions**

For the same widget/system/snapshot, compare renderer root HTML (excluding outer surface attributes) across Studio/Desktop/OBS. Assert ViewModel serialized values are identical.

- [ ] **Step 3: Review screenshots manually**

Confirm:

- no clipping/empty unexplained area;
- Original and Crystal are visibly/compositionally distinct;
- fonts/assets are local;
- Crystal blur does not leak outside widget bounds;
- transparent backgrounds remain transparent;
- Standings/Relative columns fit configured widths;
- Studio chrome does not appear in Desktop/OBS shots.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- OverlayParityHarness.test.tsx
pnpm --dir vantare-v2/frontend visual:overlay-studio:update
pnpm --dir vantare-v2/frontend visual:overlay-studio
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/overlay-harness vantare-v2/frontend/scripts/overlay-studio-visual.mjs vantare-v2/frontend/testdata/overlay-studio-visual
git commit -m "test(overlay): lock four-widget visual parity"
```

## Phase 6 review gate

- [ ] Run all four widget ViewModel, renderer, inspector and registry tests.
- [ ] Run the visual matrix twice.
- [ ] Verify no V3 renderer imports legacy widget components or telemetry transports.
- [ ] Verify every inspector content/appearance control has a consumer assertion.
- [ ] Stress-review Standings and Relative large data sets for performance and keys.
- [ ] Confirm catalog contains exactly four widgets.
- [ ] Confirm all eight widget/system combinations are explicit.
- [ ] Run full frontend tests/build/lint.
- [ ] Perform the master phase code-review brief.
- [ ] Fix P0/P1 and resolve or record P2 findings.
- [ ] Update `vantare-v2/docs/current-plan.md` and mark Phase 6 green.
