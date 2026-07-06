# Plan: WIDGET-PREVIEW-PARITY-01 — canonical fixtures, size and density

## Context

Widget Studio currently lets the same widget look different across official designs, but the preview is not yet stable enough for visual review or user trust. The goal is stricter than "use the same mock data": for the same widget and same preview scenario, all official designs must use the same pilots/items, same semantic values, same visible density, same preview bounding size, and same row/item count unless the design explicitly hides an optional column as part of its visual language.

Only the implicit visual customization of the design system may differ: colors, typography, borders, glass effects, badges, decorative labels, icons, and template-specific styling.

This plan is written for Mimo v2.5. Keep each microcut small. Do not implement broad rewrites.

## Mimo v2.5 Execution Rules

This task must be executed mechanically. Do not reinterpret the product goal.

1. First create tests/visual assertions that fail with the current behavior.
2. Implement the smallest code needed to satisfy those tests.
3. Keep all parity logic preview-only unless a test proves an existing runtime path already uses the same safe helper without changing live behavior.
4. Do not "improve" widget visual design while doing fixture/size parity. This task is about consistency between designs of the same widget.
5. Do not choose different mock data per official design.
6. Do not let official design variants change semantic columns for `standings` or `relative` in preview. If existing designs currently enable different columns, normalize them for preview through the preview contract layer, not by deleting the official design definitions unless absolutely necessary.
7. Do not touch `LayoutStudio`, OBS runtime, backend, calendar, access policy, billing, package manifests, or dependencies.
8. Do not commit screenshots.
9. If a microcut needs more than 5 productive files, stop and report why before continuing.
10. Final review happens at the end, not after every microcut.

## Non-negotiable Boundaries

- Do not touch `LayoutStudio`.
- Do not mutate or write `position`, `x`, `y`, `w`, or `h`.
- Do not change runtime OBS rendering behavior unless a test proves it is preview-only and cannot affect live runtime.
- Do not add dependencies.
- Do not modify backend Go, Supabase/Auth, Calendar, access policy, or billing.
- Do not use screenshots/PNGs as committed artifacts.
- Do not use `generateAnimatedTelemetry()` for static design preview parity.
- Do not make visual tests pass by weakening assertions.
- Stop and report if the target branch does not contain the latest Widget Studio / glassmorphism widget work referenced in `docs/current-plan.md`.

## Source of Truth

Read these first:

- `AGENTS.md`
- `docs/current-plan.md`
- `frontend/src/overlay/widgets/mock-telemetry.ts`
- `frontend/src/hub/preview/widget-preview-size.ts`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/preview/WidgetRenderer.tsx`
- `frontend/src/hub/widgets/widget-design-gallery.ts`
- The widget files for `standings`, `relative`, `delta`, and `pedals`

Reference HTML for visual intent:

- `docs/overlay-glassmorphism-pro.html`
- `docs/overlay-vantare-crystal-widgets.html`

## Definitions

### Canonical fixture

A stable preview data set for a widget type and scenario. It must define the same driver list, same player, same times, same gaps, same pedal values, same delta values, same session state, and same track/session metadata for all official designs of that widget.

### Preview parity contract

For each widget type:

- Same official designs use the same fixture.
- Same widget designs show the same semantic row/item count.
- Same widget designs use the same preview logical size.
- Same widget designs use the same player row and same ordering.
- Same widget designs use the same values and formatted values when the same metric is visible.
- Design differences are visual only.

### Allowed differences between official designs

- Color palette.
- Border radius and glass/card effects.
- Typography and labels.
- Decorative header/footer content.
- Badge shape.
- Optional presentation labels.
- Column header naming if the semantic column is the same.

### Not allowed differences between official designs

- Different pilot list for the same widget preview.
- Different player row.
- Different row count just because the design changed.
- Different preview height or scale for the same widget type.
- Different session time/track/gaps/delta/pedal values.
- Different data source path.
- Runtime-only animation in static design preview.

## Architecture Decision

Create a preview-only contract layer. It should sit between Widget Studio preview/harness code and widget rendering, not inside LayoutStudio and not in runtime OBS.

Recommended shape:

- `frontend/src/hub/preview/widget-preview-contract.ts`
  - canonical size per widget type
  - canonical visible counts per widget type
  - helper: `getWidgetPreviewContract(widgetType)`
- `frontend/src/overlay/widgets/widget-preview-fixtures.ts`
  - canonical telemetry fixture helpers for static preview
  - helper: `getCanonicalTelemetryFixture(scenario)`
  - helper(s) for widget-specific static values if needed, e.g. delta/pedals

If existing local patterns suggest better names, use them, but keep these responsibilities separate:

- Preview contract = size/density/count expectations.
- Preview fixture = stable data.
- Widget rendering = visual interpretation of props/data.

## Size Decision Procedure

Do not guess random pixel values. Use this procedure:

1. For each widget type, render every official design in the Widget Studio visual harness.
2. Measure the current natural content box of each design with Playwright (`getBoundingClientRect()`).
3. Choose one canonical preview envelope for the widget type:
   - `standings`: envelope must fit 20 rows without scroll inside the widget card.
   - `relative`: envelope must fit exactly 5 rows without scroll inside the widget card.
   - `delta`: envelope should be proportional to table widgets and must not visually dominate standings/relative.
   - `pedals`: envelope should be proportional to table widgets and must not visually dominate standings/relative.
4. Put the chosen values in code as named constants in the preview contract helper.
5. Tests must assert those constants are used in preview and that `widget.position` is not used as the source of truth for preview parity.

The worker must report the measured before/after dimensions in the final autoreview.

## Global Acceptance Criteria

- For `standings`, every official design renders the same canonical 20 visible pilots in the same order in Widget Studio preview.
- For `relative`, every official design renders the same canonical 5 visible rows: 2 cars ahead, the player row, and 2 cars behind.
- For `delta`, every official design renders the same delta value, timing labels, and session metadata.
- For `pedals`, every official design renders the same throttle/brake/clutch values.
- Same widget type has the same preview logical bounding size across its official designs.
- `standings` and `relative` official designs use the same enabled semantic column set in preview. Visual styling may differ; columns may not silently disappear per design.
- The preview-size fix does not mutate `widget.position`.
- Static preview does not call or rely on `generateAnimatedTelemetry()`.
- Existing official designs remain selectable and access-gated as before.
- Visual compare script can capture every official design and assert parity invariants before screenshots.

## Microcuts

### MC-0 — Preflight and branch sanity

**Description:** Verify that the worker is on the correct code state and that current Widget Studio/glassmorphism work exists before making changes.

**Acceptance criteria:**

- `git status --short` is recorded in the final report.
- Worker confirms whether `glassmorphism-primitives.ts` and current `OFFICIAL_DESIGNS` exist.
- Worker confirms no unrelated files are staged.
- If latest Widget Studio files are missing, stop and report target branch mismatch.

**Verification:**

- Run: `git status --short`
- Run: `rg "glassmorphism-primitives|standings-glassmorphism-pro|relative-glassmorphism-pro" frontend/src docs/current-plan.md`

**Files likely touched:** none

**Estimated scope:** XS

### MC-1 — RED tests for preview parity contract

**Description:** Add failing tests that define the desired behavior before implementation.

**Acceptance criteria:**

- Tests fail before implementation because no canonical preview contract/fixture exists or because size/count varies.
- Tests assert observable behavior, not only internal object shape.
- Tests cover standings, relative, delta and pedals at least once.

**Required tests:**

- `widget-preview-contract.test.ts`
  - same widget type returns one stable logical preview size.
  - sizes are preview-only and do not read `position`.
- `widget-preview-fixtures.test.ts`
  - canonical telemetry has exactly the expected player, driver order and values.
  - scenario changes session metadata but not pilot list.
- Widget Studio/preview integration test:
  - applying two official designs for the same widget does not change visible count or preview logical size.
- Standings preview parity test:
  - all official standings designs expose the same 20 canonical driver names in the same order.
- Relative preview parity test:
  - all official relative designs expose the same 5 canonical rows and same player row.
- Column parity test:
  - all standings official designs use the same enabled semantic columns in preview.
  - all relative official designs use the same enabled semantic columns in preview.

**Verification:**

- Run focused failing tests and record RED output.

**Files likely touched:**

- `frontend/src/hub/preview/widget-preview-contract.test.ts`
- `frontend/src/overlay/widgets/widget-preview-fixtures.test.ts`
- Existing preview/widget tests as needed

**Estimated scope:** M

### MC-2 — Canonical fixture helper

**Description:** Extract stable preview fixtures so all designs consume the same data.

**Acceptance criteria:**

- New helper returns a stable telemetry fixture for Widget Studio static previews.
- Standings uses a canonical 20-pilot fixture.
- Relative derives its 5 visible rows from the same canonical fixture: 2 ahead, player, 2 behind.
- Delta and pedals use stable values that do not drift between designs.
- No runtime live telemetry behavior changes.
- `generateAnimatedTelemetry()` is not used for static design parity.

**Verification:**

- `pnpm --dir frontend test -- widget-preview-fixtures`
- Existing widget tests still pass.

**Files likely touched:**

- `frontend/src/overlay/widgets/widget-preview-fixtures.ts`
- `frontend/src/overlay/widgets/widget-preview-fixtures.test.ts`
- `frontend/src/overlay/widgets/mock-telemetry.ts` only if needed to re-export/reuse data without duplication

**Estimated scope:** M

### MC-3 — Preview-only size and density contract

**Description:** Define stable preview logical size and visible item count per widget type.

**Acceptance criteria:**

- Same widget type has the same preview base size across official designs.
- Size contract is used only by Widget Studio preview/harness.
- `resolveWidgetPreviewBaseSize()` no longer lets official design columns cause different preview boxes for the same widget type unless explicitly allowed by contract.
- `widget.position` is preserved and not used as the primary preview size for Widget Studio parity.
- Standings official designs all receive the same preview envelope.
- Relative official designs all receive the same preview envelope.
- Delta official designs receive proportional preview envelopes and no design appears dramatically larger than the others.
- Pedals official designs receive proportional preview envelopes and no design appears dramatically larger than the others.

**Contract defaults:**

- `standings`: fixed preview envelope sized for 20 rows.
- `relative`: fixed preview envelope sized for 5 rows.
- `delta`: proportional preview envelope only. Designs do not need identical symmetry, but must look appropriately sized relative to the table widgets.
- `pedals`: proportional preview envelope only. Designs do not need identical symmetry, but must look appropriately sized relative to the table widgets.

**Verification:**

- `pnpm --dir frontend test -- widget-preview-size widget-preview-contract WidgetSandboxPreview`
- Add regression test proving `position` is unchanged.

**Files likely touched:**

- `frontend/src/hub/preview/widget-preview-contract.ts`
- `frontend/src/hub/preview/widget-preview-contract.test.ts`
- `frontend/src/hub/preview/widget-preview-size.ts`
- `frontend/src/hub/preview/widget-preview-size.test.ts`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx` only if needed to consume the contract

**Estimated scope:** M

### MC-4 — Standings parity across official designs

**Description:** Make all official standings designs use the same canonical pilots, visible count, player/leader state and preview height.

**Acceptance criteria:**

- `standings-leaderboard`, `standings-endurance`, and `standings-glassmorphism-pro` render the same 20 canonical pilots and same visible row count.
- Differences are limited to visual template, palette and labels.
- The enabled semantic column set is the same across all standings official designs in preview.
- Tire badges, number badges and text alignment use the same semantic source data.
- No design silently switches to a shorter or longer data set.

**Verification:**

- Widget tests assert canonical driver names/order for each standings official design.
- Visual compare script asserts same row count and same driver names before capturing screenshots.

**Files likely touched:**

- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- `frontend/src/overlay/widgets/StandingsWidget.test.tsx`
- `frontend/scripts/widget-studio-visual-compare.mjs`

**Estimated scope:** M

### MC-5 — Relative parity across official designs

**Description:** Make all official relative designs use the same canonical surrounding cars, same player row, same visible count and same preview height.

**Acceptance criteria:**

- All relative official designs render the same player row and same surrounding cars.
- Row count is exactly 5 rows: 2 ahead + player + 2 behind.
- The enabled semantic column set is the same across all relative official designs in preview.
- Gaps/best/last values come from the same canonical fixture.
- If a design hides a column, the hidden column does not change the selected vehicles or preview height.

**Verification:**

- Widget tests assert row count, player row and specific surrounding driver names for each relative official design.
- Visual compare script asserts the same visible relative participant set before screenshots.

**Files likely touched:**

- `frontend/src/overlay/widgets/RelativeWidget.tsx`
- `frontend/src/overlay/widgets/RelativeWidget.test.tsx`
- `frontend/scripts/widget-studio-visual-compare.mjs`

**Estimated scope:** M

### MC-6 — Delta and pedals parity across official designs

**Description:** Stabilize non-table widgets so different designs preserve the same values and comparable size.

**Acceptance criteria:**

- All delta designs show the same delta value and timing context.
- All pedals designs show the same throttle/brake/clutch values.
- Delta and pedals do not require identical outer symmetry between designs. They must be proportionally sized so no design appears absurdly larger/smaller than the rest of the preview catalog.
- Differences are visual and layout-style only.

**Verification:**

- Widget tests assert values for each official delta and pedals design.
- Visual compare script asserts data attributes or text values before screenshots.

**Files likely touched:**

- `frontend/src/overlay/widgets/DeltaWidget.tsx`
- `frontend/src/overlay/widgets/DeltaWidget.test.tsx`
- `frontend/src/overlay/widgets/PedalsWidget.tsx`
- `frontend/src/overlay/widgets/PedalsWidget.test.tsx`
- `frontend/scripts/widget-studio-visual-compare.mjs`

**Estimated scope:** M

### MC-7 — Playwright visual parity loop

**Description:** Harden the visual compare script so it checks parity invariants and captures all official designs.

**Acceptance criteria:**

- Script captures all official designs for standings, relative, delta and pedals.
- Script fails with exit 1 if:
  - same widget type has different visible counts across designs,
  - same widget type has different preview logical size across designs,
  - required canonical driver/value text is missing,
  - standings has fewer or more than 20 visible driver rows,
  - relative has fewer or more than 5 visible rows,
  - standings/relative column headers/semantic data columns differ between designs,
  - generated screenshot is blank or too small.
- Script writes side-by-side images to `docs/superpowers/screenshots/` but does not require committing them.

**Verification:**

- `node frontend/scripts/widget-studio-visual-compare.mjs`
- Final report includes screenshot output directory and count.

**Files likely touched:**

- `frontend/scripts/widget-studio-visual-compare.mjs`
- visual harness files only if absolutely needed

**Estimated scope:** M

### MC-8 — Documentation and current plan

**Description:** Document the contract so future workers do not regress it.

**Acceptance criteria:**

- `docs/current-plan.md` notes WIDGET-PREVIEW-PARITY-01 implementation status.
- Add or update docs explaining:
  - canonical fixtures,
  - preview-only sizing,
  - difference between data parity and design personalization,
  - no `position` mutation rule.
- Include manual verification steps.

**Verification:**

- `git diff --check -- docs frontend`

**Files likely touched:**

- `docs/current-plan.md`
- `docs/widget-architecture.md` or a new focused doc such as `docs/widget-preview-parity.md`

**Estimated scope:** S

## Checkpoints

### Checkpoint A — After MC-1 to MC-3

- [ ] RED tests were observed first.
- [ ] Canonical fixtures exist and are tested.
- [ ] Preview size contract exists and is tested.
- [ ] No LayoutStudio/runtime OBS changes.

### Checkpoint B — After MC-4 to MC-6

- [ ] Standings designs use same pilots/count/height.
- [ ] Relative designs use same surrounding cars/count/height.
- [ ] Delta/pedals designs use same values/size.
- [ ] Focused widget tests pass.

### Checkpoint C — Final

- [ ] `pnpm --dir frontend test -- widget-preview widget-preview-contract widget-preview-fixtures WidgetSandboxPreview StandingsWidget RelativeWidget DeltaWidget PedalsWidget`
- [ ] `pnpm --dir frontend exec tsc -b`
- [ ] `pnpm --dir frontend lint`
- [ ] `pnpm --dir frontend build`
- [ ] `node frontend/scripts/widget-studio-visual-compare.mjs`
- [ ] `git diff --check -- frontend docs`
- [ ] No screenshots staged.

## Final Report Required From Worker

The worker must report:

- Exact files touched.
- RED tests observed and final GREEN tests.
- Canonical fixture contents: row count, player, key values.
- Preview size contract values per widget type.
- Screenshot directory and count.
- Before/after measured preview dimensions per widget design.
- Confirmation that standings has 20 rows across all official designs.
- Confirmation that relative has 5 rows across all official designs.
- Confirmation that standings/relative semantic columns are equal across official designs.
- Confirmation that `position`, `x`, `y`, `w`, `h` were not written.
- Confirmation that LayoutStudio/runtime OBS/backend/access/calendar were not touched.
- Remaining visual differences, if any.
- Safe files for commit and files explicitly excluded.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Worker changes runtime widget behavior while fixing preview | High | Keep contract in hub preview layer and add tests proving OBS/runtime paths unchanged where practical. |
| Official designs intentionally hide/show columns | Medium | Keep semantic data and visible count stable; allow visual/column presentation differences only when documented. |
| Preview sizing conflicts with existing intrinsic width helpers | Medium | Use preview-only contract; do not remove intrinsic helpers unless tests prove safe. |
| Visual compare becomes brittle | Medium | Assert stable DOM data/count/size first, screenshots second. Avoid pixel-perfect tests unless comparing explicit CSS tokens. |
| Current branch lacks latest Widget Studio work | High | MC-0 stop condition before implementation. |

## Open Questions For Isaac

Resolved by Isaac:

1. Standings canonical visible count: 20 pilots.
2. Relative canonical visible count: 5 rows.
3. Standings/relative official designs must use the same enabled semantic column set in preview.
4. Same-size requirement applies only to Widget Studio preview/harness, not runtime OBS.
5. Delta and pedals need proportional sizing only, not perfect symmetry.
