# Overlay Studio V3 Phase 8 Quality Authoring and Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden V3 for long-term use by completing localization, accessibility, performance budgets, visual-system authoring documentation and verified removal of duplicate legacy paths.

**Architecture:** Quality contracts become executable checks, future system work starts from a tested template, and legacy code is removed only after consumer searches and full gates prove V3 owns production.

**Tech Stack:** TypeScript, React, CSS, Vitest, Playwright library scripts, Go tests, Markdown.

---

## Context capsule

- Phase 7 production smoke is green.
- V3 is now the production path; legacy remains only for rollback until Task 8.7.
- No new widgets or product features enter this phase.
- Preserve Go legacy JSON decoding/migration even after frontend retirement.
- Run Go/gofmt and module-relative `git add internal|pkg|cmd` blocks from `vantare-v2`; run frontend and documentation blocks from the monorepo root.

### Task 8.1: Complete four-language V3 localization

**Files:**
- Modify: `vantare-v2/frontend/src/i18n/locales/es.ts`
- Modify: `vantare-v2/frontend/src/i18n/locales/en.ts`
- Modify: `vantare-v2/frontend/src/i18n/locales/pt.ts`
- Modify: `vantare-v2/frontend/src/i18n/locales/it.ts`
- Modify: `vantare-v2/frontend/src/i18n/i18n.test.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/overlay-studio-i18n.test.ts`
- Modify: all V3 UI components containing user-facing hardcoded copy

- [ ] **Step 1: Write failing key-parity tests**

Enumerate every `studio.v3.*` key from Spanish and assert exact key parity/non-empty values in all four locales. Cover header, profiles, sessions, widget list, canvas, mock/live, backgrounds, inspector sections/controls, designs, catalog, access, dirty/recovery/conflict/errors and Browser View.

- [ ] **Step 2: Write failing source-boundary test**

Scan `frontend/src/hub/overlay-studio/**/*.tsx` for known Spanish UI literals and fail unless text is a technical ID, test ID or documented proper name. This prevents future partial translations.

- [ ] **Step 3: Add translations and replace literals**

Use `useI18n` following existing patterns. Keep `vantare-original`, `vantare-crystal`, widget type IDs, metric IDs and JSON filenames untranslated. Human labels “Vantare Original” and “Vantare Crystal” remain brand names.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- i18n.test.ts overlay-studio-i18n.test.ts
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/i18n vantare-v2/frontend/src/hub/overlay-studio
git commit -m "feat(studio): localize Overlay Studio V3"
```

### Task 8.2: Close accessibility and keyboard navigation

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/overlay-studio-a11y.test.tsx`
- Modify: V3 shell, canvas, inspector, catalog and dialog components implicated by failing tests
- Modify: `vantare-v2/frontend/scripts/overlay-studio-visual.mjs`

- [ ] **Step 1: Write failing accessibility tests**

Assert:

- all icon buttons have accessible names;
- rail/catalog/list use correct selected/pressed states;
- dialogs have role, label, initial focus, focus trap and focus restoration;
- canvas frames are keyboard-focusable and announce widget/type/system/state;
- focus is visible;
- disabled premium controls explain why;
- color inputs have text labels;
- no duplicate IDs;
- status changes use appropriate live regions without excessive announcements;
- hotkeys ignore editable controls.

- [ ] **Step 2: Add browser-only keyboard checks**

In the harness, navigate header -> widget list -> canvas -> inspector entirely by keyboard at wide/small modes. Open/close each dialog/drawer and confirm focus returns. Verify Escape cancels canvas interaction.

- [ ] **Step 3: Fix only evidenced accessibility gaps**

Do not redesign the visual hierarchy. Add semantic roles/labels/focus management and CSS focus states in focused components.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- overlay-studio-a11y.test.tsx studio-hotkeys.test.ts
pnpm --dir vantare-v2/frontend visual:overlay-studio
git add vantare-v2/frontend/src/hub/overlay-studio vantare-v2/frontend/scripts/overlay-studio-visual.mjs
git commit -m "fix(studio): complete accessibility and keyboard flow"
```

### Task 8.3: Enforce runtime performance budgets

**Files:**
- Modify: `vantare-v2/frontend/src/overlay/core/telemetry-rate-coordinator.ts`
- Modify: `vantare-v2/frontend/src/overlay/core/telemetry-rate-coordinator.test.ts`
- Modify: `vantare-v2/frontend/src/overlay/runtime/RuntimeWidgetFrame.tsx`
- Modify: `vantare-v2/frontend/src/overlay/runtime/RuntimeWidgetFrame.test.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.test.tsx`
- Create: `vantare-v2/frontend/src/overlay-harness/overlay-performance.test.tsx`
- Modify: Crystal token stylesheets
- Modify: `vantare-v2/docs/overlay-performance-audit.md`

- [ ] **Step 1: Extend rate-coordinator regression tests**

One transport store feeds rate buckets. Assert:

- one scheduler per distinct active Hz, not per widget;
- two 15 Hz widgets share a bucket;
- 15 Hz and 30 Hz receive bounded notification counts under a 60 Hz source;
- changing `updateHz` moves subscription buckets and cleans old bucket;
- last subscriber removes scheduler;
- stale/disconnected/error publishes immediately regardless of rate;
- injected fake scheduler makes tests deterministic.

- [ ] **Step 2: Harden the existing coordinator**

```ts
export interface TelemetryRateCoordinator {
  getSnapshot(hz: number): TelemetrySnapshot;
  subscribe(hz: number, listener: () => void): () => void;
  publish(snapshot: TelemetrySnapshot): void;
  dispose(): void;
}

export function useRateLimitedTelemetry(
  coordinator: TelemetryRateCoordinator,
  hz: number,
): TelemetrySnapshot;
```

Adapters publish into the coordinator. Runtime/Studio frames subscribe using `widget.behavior.updateHz`; renderers still receive plain snapshots.

- [ ] **Step 3: Write performance regression tests**

Use render counters/profiler around 20 mixed widget instances and 120 source updates. Assert render counts respect buckets, a single bad widget is isolated and no transport count grows with widget count. Test Standings 60 rows and Relative 41 rows without unstable wall-clock thresholds.

- [ ] **Step 4: Enforce Crystal CSS budget**

Each Crystal widget root may have at most one `backdrop-filter` material layer. OBS/Desktop modes use a bounded blur variable no greater than 16px; reduced-motion disables nonessential looping animation. Add source/style tests for these limits.

- [ ] **Step 5: Run benchmark/manual frame capture and document**

Use existing `frame-budget` utilities and browser harness to capture representative Studio drag and OBS update traces. Record machine/browser, instance counts and observations in `overlay-performance-audit.md`; do not claim deterministic CI timing.

- [ ] **Step 6: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- telemetry-rate-coordinator.test.ts overlay-performance.test.tsx RuntimeWidgetFrame.test.tsx StudioWidgetFrame.test.tsx
pnpm --dir vantare-v2/frontend visual:overlay-studio
git add vantare-v2/frontend/src/overlay/core/telemetry-rate-coordinator.ts vantare-v2/frontend/src/overlay/core/telemetry-rate-coordinator.test.ts vantare-v2/frontend/src/overlay/runtime/RuntimeWidgetFrame.tsx vantare-v2/frontend/src/overlay/runtime/RuntimeWidgetFrame.test.tsx vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.tsx vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.test.tsx vantare-v2/frontend/src/overlay-harness/overlay-performance.test.tsx vantare-v2/frontend/src/overlay/design-systems/vantare-crystal vantare-v2/docs/overlay-performance-audit.md
git commit -m "perf(overlay): enforce V3 telemetry and Crystal budgets"
```

### Task 8.4: Add bounded production diagnostics

**Files:**
- Create: `vantare-v2/frontend/src/overlay/core/widget-diagnostics.ts`
- Create: `vantare-v2/frontend/src/overlay/core/widget-diagnostics.test.ts`
- Modify: `vantare-v2/frontend/src/overlay/core/WidgetVisualHost.tsx`
- Modify: `vantare-v2/frontend/src/overlay/core/WidgetVisualHost.test.tsx`
- Modify: `vantare-v2/frontend/src/overlay/runtime/RuntimeOverlaySurface.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/StudioRoute.tsx`
- Modify: `vantare-v2/internal/app/studio_profile_service.go`
- Modify: `vantare-v2/internal/app/studio_profile_service_test.go`

- [ ] **Step 1: Write failing diagnostic tests**

Use stable codes for unknown type/system/version, invalid content/settings, renderer exception, preserved widget, migration failure, conflict and save failure. Assert widget diagnostics contain type/system/surface/code but never telemetry rows, driver names, tokens or complete profile JSON.

- [ ] **Step 2: Implement a bounded collector**

```ts
export type WidgetDiagnostic = {
  code: string;
  widgetId?: string;
  widgetType?: string;
  systemId?: string;
  surface: "studio" | "desktop" | "obs" | "harness";
  message: string;
  occurredAt: string;
};

export function createWidgetDiagnosticCollector(limit = 100): {
  report(diagnostic: WidgetDiagnostic): void;
  list(): readonly WidgetDiagnostic[];
  counts(): Readonly<Record<string, number>>;
  clear(): void;
};
```

Wire one collector per surface through host callbacks. Go logs only operation/profile ID/revision-safe metadata for migration/save failures. Do not add remote analytics or network transport.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- widget-diagnostics.test.ts WidgetVisualHost.test.tsx RuntimeOverlaySurface.test.tsx
go test ./internal/app/... -run StudioProfileService -count=1
git add vantare-v2/frontend/src/overlay/core/widget-diagnostics.ts vantare-v2/frontend/src/overlay/core/widget-diagnostics.test.ts vantare-v2/frontend/src/overlay/core/WidgetVisualHost.tsx vantare-v2/frontend/src/overlay/core/WidgetVisualHost.test.tsx vantare-v2/frontend/src/overlay/runtime/RuntimeOverlaySurface.tsx vantare-v2/frontend/src/hub/overlay-studio/StudioRoute.tsx vantare-v2/internal/app/studio_profile_service.go vantare-v2/internal/app/studio_profile_service_test.go
git commit -m "feat(overlay): add bounded V3 diagnostics"
```

### Task 8.5: Create the visual-system authoring kit

**Files:**
- Create: `vantare-v2/frontend/src/overlay/design-systems/_template/manifest.ts`
- Create: `vantare-v2/frontend/src/overlay/design-systems/_template/ExampleRenderer.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/_template/tokens.css`
- Create: `vantare-v2/frontend/src/overlay/design-systems/_template/contract.test.tsx`
- Create: `vantare-v2/frontend/scripts/check-design-system.mjs`
- Modify: `vantare-v2/frontend/package.json`
- Create: `vantare-v2/docs/design-system-authoring-v3.md`
- Create: `vantare-v2/docs/html-to-widget-system-porting.md`
- Create: `vantare-v2/docs/templates/design-system-port-worksheet.md`

- [ ] **Step 1: Write a failing template contract check**

The check verifies a system folder has manifest/version/ID, sequential system/config migration maps, scoped CSS root, local assets, settings parser/defaults, explicit supported widgets, renderer contract tests and no forbidden imports/remote URLs.

Add package script:

```json
"design-system:check": "node scripts/check-design-system.mjs"
```

- [ ] **Step 2: Create a compile-safe unregistered template**

The template uses ID `example-system` only inside its folder and is never imported by production registry. It demonstrates one complete renderer receiving model/settings/renderMode, one control descriptor, scoped CSS and status states.

- [ ] **Step 3: Write the authoring guide**

The guide must let a smaller model add a system/widget pair in this exact order:

1. Copy `_template` to a kebab-case folder.
2. Choose stable ID and version 1.
3. Map HTML regions to ViewModel fields in the worksheet.
4. Remove telemetry/business/persistence JS from source HTML.
5. Convert remote fonts/assets to local repository assets.
6. Build a structurally complete React renderer.
7. Scope CSS under `data-widget-system`.
8. Declare/validate settings and inspector controls.
9. Add a pure migration for every supported prior system/config version and a missing-gap test.
10. Register one explicit widget compatibility.
11. Add ready/missing/stale/disconnected/error tests.
12. Add Studio/Desktop/OBS harness snapshots.
13. Run focused/full/check commands and code review.

Include exact forbidden responsibilities and a troubleshooting table for clipping, scaling, blur, missing fonts, unsupported versions and migration.

- [ ] **Step 4: Write the HTML porting guide/worksheet**

The worksheet captures source HTML region, semantic responsibility, ViewModel field, visual setting, local asset, interaction removed, responsive behavior and test assertion. Include a filled Delta example for Original and Crystal.

- [ ] **Step 5: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- design-systems/_template/contract.test.tsx
pnpm --dir vantare-v2/frontend design-system:check
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/overlay/design-systems/_template vantare-v2/frontend/scripts/check-design-system.mjs vantare-v2/frontend/package.json vantare-v2/docs/design-system-authoring-v3.md vantare-v2/docs/html-to-widget-system-porting.md vantare-v2/docs/templates/design-system-port-worksheet.md
git commit -m "docs(overlay): add visual system authoring kit"
```

### Task 8.6: Update living architecture and testing documentation

**Files:**
- Modify: `vantare-v2/docs/widget-architecture.md`
- Modify: `vantare-v2/docs/widget-design-systems.md`
- Modify: `vantare-v2/docs/widget-rendering-preview-contract.md`
- Modify: `vantare-v2/docs/testing-strategy.md`
- Modify: `vantare-v2/docs/visual-regression-harness.md`
- Modify: `vantare-v2/docs/product-widget-customization.md`
- Modify: `vantare-v2/docs/current-plan.md`

- [ ] **Step 1: Replace obsolete architecture claims**

Documents must consistently state:

- one Studio editor, not WidgetStudio/LayoutStudio split;
- profile V3 separation;
- Original/Crystal as complete systems;
- designs as copied templates;
- pure ViewModels/shared host;
- editor-only canvas chrome;
- four-widget completion scope;
- expansion boundary.
- buttons/Fit as current zoom behavior and wheel zoom/pan as documented expansion;
- current Practice/Qualifying/Race + Track/Pits mocks and future rain/safety-car/damage/traffic/flags scenarios.

Mark historical sections explicitly rather than silently deleting useful bug context.

- [ ] **Step 2: Replace obsolete commands/paths**

Testing docs use current V3 focused tests, `visual:overlay-studio` and `design-system:check`. Remove instructions that verify WidgetStudio-specific separation.

- [ ] **Step 3: Verify documentation consistency**

```powershell
rg -n "WidgetStudio|save to widget|Guardar en widget|glassmorphism-pro|LayoutStudio Limpio" vantare-v2/docs
```

Expected: remaining matches are only clearly labeled legacy/history/migration context.

- [ ] **Step 4: Commit**

```powershell
git add vantare-v2/docs
git commit -m "docs(overlay): align living docs with Studio V3"
```

### Task 8.7: Retire duplicate legacy frontend paths

**Files:**
- Create: `vantare-v2/docs/overlay-studio-v3-retirement-audit.md`
- Delete after zero-consumer proof: legacy Overlay Studio/editor/preview files identified below
- Modify: affected test/import indexes and navigation files found by consumer audit

- [ ] **Step 1: Prove production V3 ownership**

Run:

```powershell
rg -n "LayoutStudio|useOverlayStudioState|WidgetSettingsPanel|PreviewCanvas|PreviewInspector|WidgetRenderer|WIDGET_COMPONENTS|const WIDGETS|widget-catalog|widget-variants|widget-presets" vantare-v2/frontend/src -g "*.ts" -g "*.tsx"
```

Classify every match as V3 production, legacy production, test-only, migration-only or dead. Stop if any legacy production consumer remains; migrate that consumer in its own TDD commit before deletion.

- [ ] **Step 2: Delete the verified editor candidates**

Expected deletion candidates once searches are clean:

```text
frontend/src/hub/overlays/LayoutStudio.tsx
frontend/src/hub/overlays/LayoutStudio.test.tsx
frontend/src/hub/overlays/useOverlayStudioState.ts
frontend/src/hub/overlays/useOverlayStudioState.test.tsx
frontend/src/hub/overlays/StudioWidgetList.tsx
frontend/src/hub/overlays/StudioWidgetList.test.tsx
frontend/src/hub/overlays/WidgetSettingsPanel.tsx
frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx
frontend/src/hub/overlays/WidgetConfigSections.tsx
frontend/src/hub/overlays/WidgetConfigSections.test.tsx
frontend/src/hub/overlays/RelativeSettingsSection.tsx
frontend/src/hub/overlays/RelativeSettingsSection.test.tsx
frontend/src/hub/overlays/StandingsSettingsSection.tsx
frontend/src/hub/overlays/StandingsSettingsSection.test.tsx
frontend/src/hub/overlays/PedalsSettingsSection.tsx
frontend/src/hub/overlays/PedalsSettingsSection.test.tsx
frontend/src/hub/overlays/WidgetPresetSection.tsx
frontend/src/hub/overlays/WidgetPresetSection.test.tsx
frontend/src/hub/overlays/WidgetVariantManager.tsx
frontend/src/hub/overlays/WidgetVariantManager.test.tsx
frontend/src/hub/overlays/widget-config-model.ts
frontend/src/hub/overlays/widget-config-model.test.ts
frontend/src/hub/overlays/widget-studio-empty-profile.ts
frontend/src/hub/overlays/widget-studio-empty-profile.test.ts
```

Delete `hub/preview` files only when `PreviewPage`/other routes have been removed or migrated and the same zero-consumer proof passes. Do not delete profile management/recommended/OBS setup views still used by the V3 header menu.

- [ ] **Step 3: Retire duplicate renderer maps and core legacy widgets**

After Desktop/OBS/Studio imports are V3-only, remove:

```text
frontend/src/overlay/shared-widget-map.ts
frontend/src/overlay/WidgetHost.tsx
frontend/src/overlay/WidgetHost.test.tsx
frontend/src/overlay/WidgetEditFrame.tsx
frontend/src/overlay/WidgetEditFrame.test.tsx
frontend/src/lib/widget-factory.ts
frontend/src/lib/widget-factory.test.ts
frontend/src/lib/widget-variants.ts
frontend/src/lib/widget-variants.test.ts
frontend/src/lib/widget-presets.ts
frontend/src/lib/widget-presets.test.ts
frontend/src/lib/widget-presets-store.ts
frontend/src/lib/widget-presets-store.test.ts
```

Delete legacy Delta/Standings/Relative/Pedals React renderers only after any pure formatting helpers have moved and `rg` proves zero imports. Preserve Phase 0 JSON fixtures, Go migration code and V3 `preservedWidgets` round-trip support permanently. Legacy telemetry renderers may be deleted after production imports reach zero because their original profile payload remains preserved for expansion.

- [ ] **Step 4: Record exact retirement evidence**

The audit document lists every deleted/retained file, the search proving no consumer, replacement path and reason for any retained legacy artifact.

- [ ] **Step 5: Run all gates before commit**

```powershell
pnpm --dir vantare-v2/frontend test
pnpm --dir vantare-v2/frontend build
pnpm --dir vantare-v2/frontend lint
pnpm --dir vantare-v2/frontend visual:overlay-studio
pnpm --dir vantare-v2/frontend design-system:check
```

From `vantare-v2`:

```powershell
go test ./...
```

- [ ] **Step 6: Commit retirement**

Stage only paths proven in the retirement audit:

```powershell
git add -A vantare-v2/frontend/src vantare-v2/docs/overlay-studio-v3-retirement-audit.md
git commit -m "refactor(studio): retire duplicate legacy editor paths"
```

### Task 8.8: Final architecture and product acceptance audit

**Files:**
- Create: `vantare-v2/docs/overlay-studio-v3-final-audit.md`
- Modify: `vantare-v2/docs/current-plan.md`

- [ ] **Step 1: Audit contracts independently**

Perform separate passes and record evidence for:

1. Data/persistence/migration/rollback.
2. Commands/history/dirty/recovery.
3. Registry/capability/design/version contracts.
4. Telemetry/ViewModel/render boundaries.
5. Studio/Desktop/OBS parity.
6. Access policy/bypass resistance.
7. Canvas interaction/responsive/accessibility.
8. Performance/resource cleanup.
9. I18n and documentation/authoring usability.
10. Legacy consumer/dead-code status.

- [ ] **Step 2: Trace every master decision**

Create a table mapping each locked decision and each Definition of Done item to code/tests/manual evidence. No row may say “not tested” when it affects correctness; unresolved items become findings.

- [ ] **Step 3: Run final code review**

Use the master review brief over the complete V3 commit range. Fix P0/P1 in separate TDD commits. Resolve P2 or record accepted risk with owner and expansion phase.

- [ ] **Step 4: Run final automated suite**

```powershell
pnpm --dir vantare-v2/frontend test
pnpm --dir vantare-v2/frontend build
pnpm --dir vantare-v2/frontend lint
pnpm --dir vantare-v2/frontend visual:overlay-studio
pnpm --dir vantare-v2/frontend design-system:check
git diff --check
```

From `vantare-v2`:

```powershell
go test ./...
```

- [ ] **Step 5: Run final manual matrix**

Repeat Phase 7 smoke in Spanish and one non-Spanish locale, wide/medium/small Studio, Original/Crystal, Mock/Live, Desktop/OBS, empty profile, migration, premium downgrade and save failure/conflict.

- [ ] **Step 6: Close the plan**

Update `current-plan.md` with commit range, exact test counts, screenshots, remaining accepted risks and statement that expansion may begin. Mark every phase and Definition of Done checkbox in the master plan truthfully.

- [ ] **Step 7: Commit final audit**

```powershell
git add vantare-v2/docs/overlay-studio-v3-final-audit.md vantare-v2/docs/current-plan.md docs/superpowers/plans/2026-07-10-overlay-studio-rebuild-master.md
git commit -m "docs: close Overlay Studio V3 rebuild audit"
```

## Phase 8 and project completion gate

- [ ] All master Definition of Done items are evidenced.
- [ ] All automated and manual matrices pass.
- [ ] No P0/P1 finding remains.
- [ ] No unreviewed P2 remains.
- [ ] Original and Crystal authoring kit passes its check.
- [ ] Legacy production consumers are zero.
- [ ] Four core widgets are complete; further widgets are explicitly expansion.
