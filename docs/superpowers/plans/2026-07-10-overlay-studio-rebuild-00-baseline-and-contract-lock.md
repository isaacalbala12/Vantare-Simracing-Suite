# Overlay Studio V3 Phase 0 Baseline and Contract Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove contradictory instructions, capture a reproducible legacy baseline and freeze the user-visible behavior that V3 must preserve or intentionally replace.

**Architecture:** This phase changes documentation and adds characterization fixtures/tests only. Production behavior remains legacy; the outcome is a green, reviewable safety net and an explicit architectural authority for later phases.

**Tech Stack:** Markdown, React Testing Library, Vitest, Go tests, existing JSON profiles.

---

## Context capsule

- Worktree root: `C:\Users\isaac\emdash\worktrees\vantare-v2\refactor`.
- App module: `vantare-v2`.
- Branch: `refactor` at or after `f22d64b`.
- Visual reference: root `layout-studio-v10.html`.
- Do not edit production Overlay Studio code in this phase.
- Do not use `vantare-core`.

### Task 0.1: Make V3 authority explicit

**Files:**
- Create: `vantare-v2/docs/adr/0003-overlay-studio-v3-rebuild.md`
- Modify: `vantare-v2/AGENTS.md`
- Modify: `vantare-v2/docs/current-plan.md`
- Modify: `docs/superpowers/plans/2026-07-10-layout-studio-subnav-redesign.md`

- [ ] **Step 1: Verify the contradiction exists**

Run from the worktree root:

```powershell
rg -n "WidgetStudio|LayoutStudio|stricta separación|strict separation" vantare-v2/AGENTS.md vantare-v2/docs/current-plan.md docs/superpowers/plans/2026-07-10-layout-studio-subnav-redesign.md
```

Expected: at least one match requiring separate WidgetStudio/LayoutStudio responsibilities and the old sub-navigation plan describing local widget drafts.

- [ ] **Step 2: Write ADR 0003**

Create the ADR with these exact decisions:

```markdown
# ADR 0003: Reconstrucción paralela de Overlay Studio V3

- Estado: aceptada
- Fecha: 2026-07-10

## Contexto

Overlay Studio mantiene contratos duplicados entre editor, preview, Desktop y OBS. WidgetStudio fue eliminado y la edición de apariencia, contenido, comportamiento y layout pertenece ahora a un único editor. Los sistemas visuales completos son el pilar del producto.

## Decisión

Construir un núcleo V3 paralelo y retirar el legado después de validar Delta, Standings, Relative y Pedals. Un `WidgetVisualHost` compartido recibe ViewModels funcionales puros y selecciona renderizadores versionados de `vantare-original` o `vantare-crystal`. El perfil V3 separa layout, comportamiento, contenido y visual. Studio mantiene un único borrador global con guardado explícito.

## Consecuencias

- La regla histórica de separación WidgetStudio/LayoutStudio deja de aplicar a V3.
- El legado permanece congelado como referencia y rollback hasta el corte final.
- Los perfiles V0/V2 se migran mediante funciones puras y backups.
- Studio, Desktop y OBS deben compartir host y renderizadores.
- Los diseños se aplican como copias y nunca contienen posición, identidad o z-order.
- La primera entrega termina con Delta, Standings, Relative y Pedals en Original y Crystal.

## Fuera de alcance

Selección múltiple, grupos, widgets adicionales, resoluciones arbitrarias y creación no-code de sistemas visuales pertenecen a expansión.
```

- [ ] **Step 3: Update repository guidance**

Replace the obsolete separation bullet in `vantare-v2/AGENTS.md` with:

```markdown
- Overlay Studio V3 es un único editor de layout, contenido, comportamiento y apariencia. Mantén separadas sus capas internas: el canvas solo gestiona interacción espacial; el inspector edita el documento; los renderizadores visuales reciben ViewModels puros y nunca acceden a persistencia, permisos, Wails/SSE ni posición. Consulta ADR 0003 y el plan maestro V3.
```

Add a top note to `vantare-v2/docs/current-plan.md` linking the master plan and stating that no V3 production code has been switched yet.

Add this banner immediately below the title of the old sub-navigation plan:

```markdown
> **SUPERSEDED 2026-07-10:** No ejecutar. Conservado como referencia histórica del HTML v10. Overlay Studio V3 reemplaza el borrador local por widget y reconstruye inspector, preview, estado y runtime mediante el plan maestro `2026-07-10-overlay-studio-rebuild-master.md`.
```

- [ ] **Step 4: Verify authority text**

Run:

```powershell
rg -n "ADR 0003|único editor|SUPERSEDED 2026-07-10|Overlay Studio V3" vantare-v2/AGENTS.md vantare-v2/docs/current-plan.md vantare-v2/docs/adr/0003-overlay-studio-v3-rebuild.md docs/superpowers/plans/2026-07-10-layout-studio-subnav-redesign.md
git diff --check
```

Expected: all four files match; `git diff --check` exits 0.

- [ ] **Step 5: Commit the authority cut**

```powershell
git add vantare-v2/AGENTS.md vantare-v2/docs/current-plan.md vantare-v2/docs/adr/0003-overlay-studio-v3-rebuild.md docs/superpowers/plans/2026-07-10-layout-studio-subnav-redesign.md
git commit -m "docs: lock Overlay Studio V3 rebuild authority"
```

### Task 0.2: Record a clean executable baseline

**Files:**
- Create: `vantare-v2/docs/overlay-studio-v3-baseline.md`

- [ ] **Step 1: Check dependency availability without changing lockfiles**

Run:

```powershell
Test-Path vantare-v2/frontend/node_modules
pnpm --version
go version
```

Expected: tool versions print. If `node_modules` is absent, run `pnpm install --frozen-lockfile` from the monorepo root and verify `git status --short` still shows no lockfile changes.

- [ ] **Step 2: Run the legacy frontend baseline**

```powershell
pnpm --dir vantare-v2/frontend test
pnpm --dir vantare-v2/frontend build
pnpm --dir vantare-v2/frontend lint
```

Expected: test and build exit 0. Record the exact file/test counts. If lint is pre-existing red, record the exact rule, file and exit code; do not modify lint configuration.

- [ ] **Step 3: Run the legacy Go baseline**

Run from `vantare-v2`:

```powershell
go test ./pkg/config/... ./internal/app/... ./internal/server/... ./internal/window/...
go test ./...
```

Expected: both commands exit 0. Record skipped fixture tests separately.

- [ ] **Step 4: Write the baseline report**

The report must contain:

```markdown
# Overlay Studio V3 baseline — 2026-07-10

## Revision

- Branch and commit: output of `git branch --show-current` and `git rev-parse --short HEAD`.
- Worktree before checks: clean or exact pre-existing paths.

## Frontend

- Test command and exact passing count.
- Build command and result.
- Lint command and result.

## Go

- Focused packages command and result.
- Full suite command and result.

## Known legacy defects intentionally not protected

- Mock selector does not alter PreviewCanvas data.
- Saved slots/columnGroups may not affect current renderers.
- Conditional visibility editing and runtime consumption diverge.
- Widget catalog and renderer maps diverge.
- Empty widget arrays are rejected by SaveProfileState.
- Inspector uses local drafts and duplicate design surfaces.

## Gate

Later phases may preserve valid user behavior but must not reproduce the listed defects.
```

Replace descriptive result sentences with the actual command outputs observed in Steps 2 and 3.

- [ ] **Step 5: Verify and commit**

```powershell
git diff --check
git add vantare-v2/docs/overlay-studio-v3-baseline.md
git commit -m "test: record Overlay Studio legacy baseline"
```

### Task 0.3: Add immutable legacy migration fixtures

**Files:**
- Create: `vantare-v2/pkg/config/testdata/profile-v0-core-widgets.json`
- Create: `vantare-v2/pkg/config/testdata/profile-v2-core-widgets.json`
- Create: `vantare-v2/pkg/config/testdata/widget-designs-v1.json`
- Create: `vantare-v2/pkg/config/profile_fixture_contract_test.go`

- [ ] **Step 1: Write the failing fixture contract test**

The table-driven test loads all three fixtures and asserts:

```go
func TestOverlayStudioV3LegacyFixturesAreStable(t *testing.T) {
	profileFiles := []string{
		"testdata/profile-v0-core-widgets.json",
		"testdata/profile-v2-core-widgets.json",
	}
	for _, name := range profileFiles {
		t.Run(name, func(t *testing.T) {
			profile, err := LoadFile(name)
			if err != nil {
				t.Fatalf("LoadFile(%q): %v", name, err)
			}
			seen := map[string]bool{}
			for _, widget := range profile.Widgets {
				seen[widget.Type] = true
			}
			for _, required := range []string{"delta", "standings", "relative", "pedals"} {
				if !seen[required] {
					t.Fatalf("fixture %q missing %s", name, required)
				}
			}
		})
	}
}
```

Add a second test that decodes `widget-designs-v1.json` into `map[string]any` and asserts a top-level `presets` array exists with at least one `vantare-crystal` or `glassmorphism-pro` value. The fixture deliberately protects legacy aliases for migration.

- [ ] **Step 2: Run the test and verify expected failure**

Run from `vantare-v2`:

```powershell
go test ./pkg/config/... -run OverlayStudioV3LegacyFixturesAreStable -count=1
```

Expected: FAIL because the fixture files do not exist.

- [ ] **Step 3: Add the fixtures**

Create both profile fixtures with exactly one enabled instance of each core widget. Use stable IDs `delta-main`, `standings-main`, `relative-main`, `pedals-main`, valid positive sizes and explicit positions. The V0 fixture omits `schemaVersion`, `layouts` and `variants`. The V2 fixture sets `schemaVersion: 2`, mirrors the four widgets in `layouts.general.widgets`, and includes variants that exercise:

- legacy `props.style: "glassmorphism-pro"`;
- `themeId: "vantare-crystal"`;
- Relative filters `rangeAhead`, `rangeBehind`, `classScope`, `includePlayer`, `rowHeightMode`;
- Standings columns including `bestLap`, `lastLap`, `interval` and `currentLap`;
- Pedals appearance colors.

Create the design fixture with one Original preset and one legacy Crystal preset. Do not use timestamps that change between runs; use `2026-07-10T00:00:00Z`. The V2 profile fixture also includes `telemetry` and `telemetry-vertical` instances so Phase 1 can prove safe preservation outside the four-widget scope.

- [ ] **Step 4: Run the fixture tests**

```powershell
go test ./pkg/config/... -run "OverlayStudioV3LegacyFixtures|LegacyDesignFixture" -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit fixtures**

```powershell
git add vantare-v2/pkg/config/testdata/profile-v0-core-widgets.json vantare-v2/pkg/config/testdata/profile-v2-core-widgets.json vantare-v2/pkg/config/testdata/widget-designs-v1.json vantare-v2/pkg/config/profile_fixture_contract_test.go
git commit -m "test: add Overlay Studio legacy migration fixtures"
```

### Task 0.4: Freeze cross-surface telemetry and render behavior

**Files:**
- Create: `vantare-v2/frontend/src/overlay-harness/legacy-core-contract.test.tsx`
- Modify: `vantare-v2/frontend/src/overlay/widgets/widget-preview-fixtures.ts`
- Modify: `vantare-v2/frontend/src/overlay/widgets/widget-preview-fixtures.test.ts`

- [ ] **Step 1: Add failing core-fixture assertions**

Export one deterministic telemetry fixture per state from `widget-preview-fixtures.ts`:

```ts
export const CORE_TELEMETRY_STATES = {
  readyRace: createWidgetPreviewTelemetry("race"),
  readyPractice: createWidgetPreviewTelemetry("practice"),
  readyQualifying: createWidgetPreviewTelemetry("qual"),
  pits: createWidgetPreviewTelemetry("pits"),
  disconnected: createDisconnectedWidgetPreviewTelemetry(),
  stale: createStaleWidgetPreviewTelemetry(),
} as const;
```

If the named creators do not exist, add pure creators returning the same `TelemetryRefState` type already consumed by legacy widgets. Use fixed driver names, lap times and timestamps.

Tests must assert that each fixture is deterministic under two calls and contains the fields read by Delta, Standings, Relative and Pedals.

- [ ] **Step 2: Verify the fixture tests fail**

```powershell
pnpm --dir vantare-v2/frontend test -- widget-preview-fixtures.test.ts
```

Expected: FAIL because the new exports/states do not exist.

- [ ] **Step 3: Add the smallest pure fixture implementation**

Do not add timers, Wails events, SSE or randomness. Return fresh structured values so a test cannot mutate another scenario.

- [ ] **Step 4: Add the legacy render contract test**

Render `DeltaWidget`, `StandingsWidget`, `RelativeWidget` and `PedalsWidget` once in mock mode using the established fixture source. Assert a stable root test ID for each and assert the ready fixture exposes meaningful text or bars. This is a behavior characterization, not a pixel snapshot.

- [ ] **Step 5: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- widget-preview-fixtures.test.ts legacy-core-contract.test.tsx
git diff --check
git add vantare-v2/frontend/src/overlay-harness/legacy-core-contract.test.tsx vantare-v2/frontend/src/overlay/widgets/widget-preview-fixtures.ts vantare-v2/frontend/src/overlay/widgets/widget-preview-fixtures.test.ts
git commit -m "test: characterize four core overlay widgets"
```

Expected: focused tests PASS.

### Task 0.5: Publish the dependency and consumer inventory

**Files:**
- Create: `vantare-v2/docs/overlay-studio-v3-inventory.md`

- [ ] **Step 1: Generate evidence with read-only searches**

```powershell
rg -n "WIDGETS|WIDGET_COMPONENTS|WIDGET_TYPES|OFFICIAL_DESIGNS|WidgetRenderer|WidgetHost" vantare-v2/frontend/src
rg -n "layout:save|profile:loaded|profile:request|preset:" vantare-v2/frontend/src vantare-v2/internal vantare-v2/cmd
rg -n "getTelemetryRef|useWidgetTelemetry|getMockTelemetry|EventSource|telemetry:update" vantare-v2/frontend/src
rg -n "WidgetStudio|WidgetPreviewPanel|widget mode|saveToWidget" vantare-v2/frontend/src vantare-v2/docs
```

- [ ] **Step 2: Write the inventory**

For each match group, record:

- source file;
- exported contract;
- consumers;
- whether it is reusable, adapter-only or retirement candidate;
- replacement phase number;
- deletion gate.

The document must explicitly enumerate duplicate widget maps, telemetry subscriptions, profile save paths, preset/design paths, visibility consumers, access gates and old WidgetStudio artifacts.

- [ ] **Step 3: Verify no consumer category is missing**

Run the same four searches and confirm every production file appears in the inventory table.

- [ ] **Step 4: Commit**

```powershell
git add vantare-v2/docs/overlay-studio-v3-inventory.md
git commit -m "docs: inventory Overlay Studio V3 consumers"
```

## Phase 0 review gate

- [ ] Run frontend full test/build/lint baseline again.
- [ ] Run `go test ./...` from `vantare-v2`.
- [ ] Confirm production code diff is limited to deterministic test fixture helpers.
- [ ] Review that the ADR and master plan agree on scope, systems and four widgets.
- [ ] Review fixtures for secrets, machine paths and unstable timestamps.
- [ ] Perform the phase code-review brief from the master plan.
- [ ] Fix all P0/P1 and resolve or record P2 findings.
- [ ] Update `vantare-v2/docs/current-plan.md` with Phase 0 evidence.
- [ ] Mark Phase 0 green in the master plan.
