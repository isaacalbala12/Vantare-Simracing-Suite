> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# UI2 WidgetStudio Visual Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `WidgetStudio` into a dense, ordered, professional widget editing surface inspired by the provided HTML mockup and RaceLabs-style control panels, without changing widget behavior or layout responsibilities.

**Architecture:** This is a visual/UX rework of `WidgetStudio` only. It may restructure local presentation components and CSS classes, but it must not change profile schema, widget renderer contracts, preview scaling architecture, persistence semantics, or the `WidgetStudio`/`LayoutStudio` responsibility split.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, existing Wails frontend runtime. No new dependencies.

---

## Product Direction

This plan intentionally leaves visual latitude to the UI/UX worker. The target is not to copy the HTML or RaceLabs screenshot literally. The target is:

- high-density control panel;
- strong order and hierarchy;
- compact settings rows;
- clear section grouping;
- professional sim-racing tool feel;
- fewer floating cards and less wasted vertical space;
- red used as accent/status, not heavy background fill;
- visible focus/hover/active states;
- no layout-editing affordances in `WidgetStudio`.

The worker may choose exact spacing, typography scale, grouping, local component names, and minor micro-interactions if they satisfy the non-negotiables below.

## Non-Negotiables

- Scope is `WidgetStudio` only.
- Do not redesign Home, `LayoutStudio`, `Mis perfiles`, `Recomendados por Vantare`, `Comunidad`, global navigation, overlay runtime, or OBS pages.
- Do not add drag, resize handles, cursor-move, X/Y/W/H controls, delete, duplicate, or open/stop overlay controls to `WidgetStudio`.
- Do not reintroduce `PreviewWidgetFrame` into `WidgetPreviewPanel`.
- Do not modify `WidgetRenderer`, `PreviewScaler`, or `WidgetSandboxPreview` unless a tiny wrapper/style change is strictly required and documented.
- Do not change profile schema, backend, Go services, config files, build config, or dependencies.
- Do not change behavior of Relative/Standings controls. This is visual and structural only.
- Keep checkerboard preview background. Do not add game image background.
- Do not add per-widget theme selection.
- Do not implement unsaved-navigation guard in this plan. Document as follow-up if needed.

## Creative Latitude

The worker is encouraged to improve beyond the examples in these areas:

- exact setting grouping and order inside the right panel;
- compact row layout for inputs/selects/toggles;
- local visual components and naming;
- section header styling;
- active/hover/focus treatment;
- status display for dirty/saved/saving/error states;
- treatment of `Práctica` / `Qualy` / `Carrera` selector;
- whether a settings search/filter is worth including.

The worker must explain any creative decision in the final report if it deviates from the examples.

## Required References

Read before implementation:

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/feature-architecture-map.md`
- `docs/widget-preview-bug-log.md`
- `docs/overlays-studio-visual-analysis-ui1.md`
- `C:/Users/isaac/Desktop/Vantare-Overlays/overlays_mockup.html`

Optional visual reference:

- User-provided RaceLabs screenshot in the current Codex conversation: use it for density/order inspiration, not literal copying.

## Expected Files

Likely files to modify:

- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/StudioWidgetList.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
- `frontend/src/hub/overlays/StandingsSettingsSection.tsx`
- `frontend/src/hub/overlays/WidgetStudio.test.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`
- `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`
- `frontend/src/hub/overlays/StandingsSettingsSection.test.tsx`

Files that may be created if they reduce duplication:

- `frontend/src/hub/overlays/studio-controls.tsx`
- `frontend/src/hub/overlays/studio-controls.test.tsx`

Files to avoid unless explicitly justified:

- `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/preview/WidgetRenderer.tsx`
- `frontend/src/hub/preview/PreviewScaler.tsx`
- `frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- backend files
- schema/profile files
- config JSON files
- build config

---

## Task 1: Baseline And Visual Contract

**Files:**
- Read only: all required references.
- Inspect: current `WidgetStudio` files listed above.

- [ ] **Step 1: Confirm clean scope**

Run:

```powershell
git status --short
```

Expected:
- Working tree should be clean or only contain unrelated user changes.
- If there are unrelated changes in target files, stop and report before editing.

- [ ] **Step 2: Read required docs**

Run:

```powershell
Get-Content -Raw AGENTS.md
Get-Content -Raw docs/current-plan.md
Get-Content -Raw docs/roadmap-execution-board.md
Get-Content -Raw docs/feature-architecture-map.md
Get-Content -Raw docs/widget-preview-bug-log.md
Get-Content -Raw docs/overlays-studio-visual-analysis-ui1.md
Get-Content -Raw C:/Users/isaac/Desktop/Vantare-Overlays/overlays_mockup.html
```

Expected:
- Scope is clear: `WidgetStudio` only.
- HTML is design inspiration for editing widgets only.
- RaceLabs is density/order inspiration.

- [ ] **Step 3: Write a short implementation note before coding**

Create a short note in the final report draft or worker scratchpad with:

```markdown
Visual direction:
- density: high;
- panel style: compact control panel;
- accordion: only for long/secondary sections;
- header: global minimal + right sticky widget header;
- canvas: checkerboard retained;
- layout controls: forbidden in WidgetStudio.
```

Expected:
- This note guides implementation but does not need to be committed as a file.

---

## Task 2: Local Control Components

**Files:**
- Create if useful: `frontend/src/hub/overlays/studio-controls.tsx`
- Create if useful: `frontend/src/hub/overlays/studio-controls.test.tsx`
- Modify only if not creating shared local components: existing section files.

**Intent:** Give the UI worker a small local toolkit for dense, ordered controls without introducing a large abstraction.

The worker may either:

- create local components in `studio-controls.tsx`, or
- keep controls inline if extraction would add noise.

Recommended local components:

- `StudioSection`
- `StudioSectionHeader`
- `StudioSettingRow`
- `StudioToggle`
- `StudioSelect`
- `StudioNumberInput`
- `StudioColorInput`

- [ ] **Step 1: Add focused tests if components are extracted**

If creating `studio-controls.tsx`, add tests covering:

```tsx
it("renders a dense section with accessible heading", () => {
  // Assert section label is visible and content renders.
});

it("renders toggle with accessible label and pressed/checked state", () => {
  // Assert user can identify state through accessible role/label.
});

it("renders select and number input with labels", () => {
  // Assert getByLabelText works for both controls.
});
```

Run:

```powershell
pnpm --dir frontend test -- studio-controls
```

Expected:
- PASS if component file exists.
- If no component file is created, explain why in final report.

- [ ] **Step 2: Implement local components or document inline approach**

Implementation guidance:

- Keep components small and local to `frontend/src/hub/overlays`.
- Prefer `children`, `label`, `description`, `className`, and existing native inputs.
- Avoid generic design-system abstractions that pretend to solve the whole app.
- Use semantic labels and visible focus states.
- Use Tailwind utilities already available.

Expected:
- Local controls make `RelativeSettingsSection` and `StandingsSettingsSection` easier to scan.
- No new dependencies.

---

## Task 3: WidgetStudio Shell And Header

**Files:**
- Modify: `frontend/src/hub/overlays/WidgetStudio.tsx`
- Test: `frontend/src/hub/overlays/WidgetStudio.test.tsx`

**Intent:** Make the editor shell feel like a focused tool. Header should be minimal and action-oriented.

- [ ] **Step 1: Update or add tests for responsibility boundaries**

Ensure `WidgetStudio.test.tsx` still asserts:

```tsx
expect(screen.queryByLabelText(/x/i)).toBeNull();
expect(screen.queryByLabelText(/y/i)).toBeNull();
expect(screen.queryByText(/delete/i)).toBeNull();
expect(screen.queryByText(/abrir overlay/i)).toBeNull();
```

Exact selectors may vary with existing tests. The behavior must be tested.

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio
```

Expected:
- PASS before or after adjustment, depending on existing tests.

- [ ] **Step 2: Redesign shell header visually**

Implementation constraints:

- Header includes back action, page title, save state, Save button.
- It should not duplicate detailed widget metadata if the right panel has sticky widget header.
- Keep Spanish copy consistent with existing UI.
- Do not add "Modo Edición" chip unless the worker has a strong reason; default is no.

Creative latitude:

- Worker can choose exact density, alignment, and microcopy.
- Worker can decide whether explanatory copy remains visible or becomes subtler.

Expected:
- The header is smaller and cleaner.
- Save state remains visible and usable.

---

## Task 4: Dense Widget List

**Files:**
- Modify: `frontend/src/hub/overlays/StudioWidgetList.tsx`
- Test: existing `WidgetStudio.test.tsx` or create focused list test if needed.

**Intent:** Turn the left panel into a compact, ordered list similar in density to RaceLabs-style control panels.

- [ ] **Step 1: Preserve behavior tests**

Ensure tests cover:

```tsx
// User can select relative/standings.
// Search/filter still works if currently implemented.
// Active/visible state remains readable.
// No layout controls appear.
```

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio
```

Expected:
- PASS.

- [ ] **Step 2: Restyle list**

Implementation constraints:

- Keep `Todos` / `Activos`.
- Keep search.
- Use compact rows.
- Use red as accent, not large alert background.
- Show widget name, type, and active/hidden state clearly.
- Keep keyboard/focus states visible.

Creative latitude:

- Worker may choose whether selected row uses left border, dot, subtle background, or another clear treatment.
- Worker may improve row ordering/spacing if behavior remains unchanged.

Expected:
- The panel feels denser and more ordered.
- Selection remains obvious but not visually noisy.

---

## Task 5: Right Settings Panel And Sticky Widget Header

**Files:**
- Modify: `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- Modify if needed: `frontend/src/hub/preview/PreviewInspector.tsx`
- Test: `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`

**Intent:** The right panel becomes the main control panel: sticky widget header, compact sections, clear hierarchy.

- [ ] **Step 1: Add or update tests**

Tests should verify:

```tsx
// Selected widget name appears in settings panel header.
// Widget type/status appears.
// PreviewInspector still renders general/appearance controls when widget exists.
// Relative/Standings settings still mount for matching widget types.
// No position/size/delete controls appear in WidgetStudio context.
```

Run:

```powershell
pnpm --dir frontend test -- WidgetSettingsPanel
```

Expected:
- PASS.

- [ ] **Step 2: Implement sticky header**

Implementation constraints:

- Header should remain visible while panel scrolls.
- It should include widget name and type/status.
- It may include dirty-state indicator if this can be done without duplicating save logic.
- Do not introduce new state.

Creative latitude:

- Worker may choose exact visual treatment: compact card header, bar, subtle border, or control-panel header.
- Worker may choose how much metadata to show as long as it helps scanning.

Expected:
- Right panel has a clear anchor and does not feel like disconnected cards.

- [ ] **Step 3: Compact section styling**

Implementation constraints:

- Sections should be clearly separated.
- Avoid nested cards.
- Avoid large empty gaps.
- Use high density while preserving legibility.
- Accordions are allowed only for long/secondary sections.

Expected:
- Panel resembles a dense control panel more than a form page.

---

## Task 6: Relative And Standings Sections

**Files:**
- Modify: `frontend/src/hub/overlays/RelativeSettingsSection.tsx`
- Modify: `frontend/src/hub/overlays/StandingsSettingsSection.tsx`
- Test: `frontend/src/hub/overlays/RelativeSettingsSection.test.tsx`
- Test: `frontend/src/hub/overlays/StandingsSettingsSection.test.tsx`

**Intent:** Apply the new panel language to the two complex widget-specific sections without changing behavior.

- [ ] **Step 1: Preserve existing behavior tests**

Run:

```powershell
pnpm --dir frontend test -- RelativeSettingsSection StandingsSettingsSection
```

Expected:
- PASS before major restyling.

- [ ] **Step 2: Reorder and group controls for clarity**

Implementation constraints:

- Relative:
  - columns first;
  - filters and row-height decisions together;
  - name/lap formatting grouped by domain.
- Standings:
  - optional columns first;
  - name formatting together;
  - lap column formatting grouped together.
- Do not change `onChangeProfile` payload semantics.
- Do not write to `widget.position`.
- Do not write to legacy `widget.props` for new variant-only settings.

Creative latitude:

- Worker may choose group names.
- Worker may combine or split visual groups if it makes the panel easier to scan.
- Worker may use accordions for sections that become too tall.

Expected:
- Same controls, better order, higher density.

- [ ] **Step 3: Restyle controls**

Implementation constraints:

- Native controls remain accessible.
- Labels remain visible or accessible.
- Numeric clamp behavior remains intact.
- Toggles remain clickable and keyboard accessible.

Run:

```powershell
pnpm --dir frontend test -- RelativeSettingsSection StandingsSettingsSection WidgetStudio WidgetSettingsPanel
```

Expected:
- PASS.

---

## Task 7: Preview Panel Polish

**Files:**
- Modify if needed: `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- Modify if needed: `frontend/src/hub/overlays/WidgetStudio.tsx`
- Avoid unless justified: `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`

**Intent:** Polish the wrapper around the existing preview without changing preview architecture.

- [ ] **Step 1: Verify preview architecture remains intact**

Run:

```powershell
rg -n "PreviewWidgetFrame" frontend/src/hub/overlays/WidgetPreviewPanel.tsx frontend/src/hub/overlays/WidgetSandboxPreview.tsx
```

Expected:
- No `PreviewWidgetFrame` usage in `WidgetPreviewPanel` / `WidgetSandboxPreview`.

- [ ] **Step 2: Polish preview controls**

Implementation constraints:

- Keep checkerboard.
- Keep `Práctica` / `Qualy` / `Carrera` selector for Standings.
- Selector remains preview-only and does not trigger save/dirty.
- Do not add game background.
- Do not change `WidgetRenderer`, `PreviewScaler`, or `WidgetSandboxPreview` behavior.

Creative latitude:

- Worker may style selector as segmented control, compact tabs, or subtle toolbar.
- Worker may improve preview panel border/radius/spacing.

Expected:
- Preview area feels integrated with the new control-panel language.

---

## Task 8: Documentation And Bug Log

**Files:**
- Modify: `docs/current-plan.md`
- Modify: `docs/roadmap-execution-board.md`
- Modify: `docs/widget-preview-bug-log.md` only if preview wrapper rules changed.

- [ ] **Step 1: Update docs after implementation**

Update docs only after tests pass.

Expected doc changes:

```markdown
UI2/UI3 WidgetStudio visual rework:
- scope remained WidgetStudio only;
- no LayoutStudio responsibilities were introduced;
- preview architecture remained intact;
- dense control-panel direction applied.
```

- [ ] **Step 2: Do not tag unless this is accepted as a functional checkpoint**

This is a visual UI feature, so it may become a functional checkpoint only after:

- implementation passes checks;
- manual visual review is accepted by Isaac;
- branch is committed and pushed.

Do not create tag during worker implementation unless explicitly instructed.

---

## Task 9: Full Verification

**Files:**
- No edits.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio WidgetSettingsPanel RelativeSettingsSection StandingsSettingsSection WidgetPreviewPanel WidgetSandboxPreview WidgetRenderer
```

Expected:
- PASS.

- [ ] **Step 2: Run full frontend tests**

Run:

```powershell
pnpm --dir frontend test
```

Expected:
- PASS.

- [ ] **Step 3: Run lint**

Run:

```powershell
pnpm --dir frontend lint
```

Expected:
- PASS or known non-blocking warning only.

- [ ] **Step 4: Run build**

Run:

```powershell
pnpm --dir frontend build
```

Expected:
- PASS.

- [ ] **Step 5: Run whitespace check**

Run:

```powershell
git diff --check
```

Expected:
- No whitespace errors. CRLF warnings are acceptable only if already known and non-blocking.

---

## Manual Verification Checklist

Run in the real app after implementation:

- [ ] Open `Overlays Studio -> Widgets`.
- [ ] Confirm the UI is dense and ordered, closer to RaceLabs control-panel density.
- [ ] Confirm the HTML reference influenced `WidgetStudio` only.
- [ ] Confirm no X/Y/W/H controls appear in `WidgetStudio`.
- [ ] Confirm no drag/resize/delete/open overlay controls appear in `WidgetStudio`.
- [ ] Select `relative`; verify columns, filters, formatting controls are still usable.
- [ ] Select `standings`; verify columns, mock scenario selector, formatting controls are still usable.
- [ ] Toggle `Práctica` / `Qualy` / `Carrera`; verify preview changes and Save is not enabled by that alone.
- [ ] Change one real widget setting; verify Save state still works.
- [ ] Open `LayoutStudio`; verify position/size controls still live there and internal widget settings do not appear there.
- [ ] Confirm preview centering/clipping remains correct for Relative and Standings.

---

## Review Checklist

Reviewer should verify:

- Scope stayed in `WidgetStudio`.
- Visual density is high, not merely decorative.
- RaceLabs reference informed order/density without cloning unrelated controls.
- No layout responsibilities leaked into `WidgetStudio`.
- No preview architecture regressions.
- No behavior changes in Relative/Standings settings.
- No new dependencies.
- Tests are not overly tied to arbitrary Tailwind classes unless intentionally guarding layout responsibility.

## Open Follow-Ups Not In This Plan

- Unsaved navigation guard when leaving `WidgetStudio`.
- Browser/Playwright visual harness.
- Global design system for the whole app.
- Home/LayoutStudio visual rework.
- Per-widget theme overrides.
