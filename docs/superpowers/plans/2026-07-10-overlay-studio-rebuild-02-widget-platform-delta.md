# Overlay Studio V3 Phase 2 Widget Platform and Delta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the complete V3 rendering architecture with Delta in Original and Crystal through one shared host and deterministic Mock/Live-compatible telemetry pipeline.

**Architecture:** A functional widget registry builds pure ViewModels; a separate design-system registry selects complete renderers. A central external telemetry store feeds the shared `WidgetVisualHost`, which is exercised in a browser harness before any production route is switched.

**Tech Stack:** React 19, TypeScript, `useSyncExternalStore`, Vitest, Testing Library, existing Playwright library, Vite.

---

## Context capsule

- Phase 1 profile and design contracts are green.
- Legacy widgets remain production consumers.
- Phase 2 registers only Delta. Standings, Relative and Pedals deliberately return an unsupported diagnostic until Phase 6.
- Renderer code is pure React. It must not call Wails, SSE, profile stores, access policy, timers or `getTelemetryRef`.

### Task 2.1: Define functional widget registry contracts

**Files:**
- Create: `vantare-v2/frontend/src/overlay/core/widget-definition.ts`
- Create: `vantare-v2/frontend/src/overlay/core/widget-registry.ts`
- Create: `vantare-v2/frontend/src/overlay/core/widget-registry.test.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/delta/delta-definition.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/delta/delta-definition.test.ts`

- [ ] **Step 1: Write failing registry tests**

Assert:

```ts
expect(widgetTypeRegistry.list().map((item) => item.type)).toEqual(["delta"]);
expect(widgetTypeRegistry.get("delta").capabilities.inspectorSections).toEqual([
  "design", "appearance", "behavior", "layout", "actions",
]);
expect(() => widgetTypeRegistry.get("standings")).toThrow(/not registered/i);
expect(widgetTypeRegistry.get("delta").createDefault("delta-1").layout).toEqual({
  x: 64, y: 64, w: 280, h: 96, zIndex: 0, aspectLocked: true,
});
```

- [ ] **Step 2: Verify RED**

```powershell
pnpm --dir vantare-v2/frontend test -- widget-registry.test.ts delta-definition.test.ts
```

Expected: FAIL because registry modules are missing.

- [ ] **Step 3: Implement focused generic contracts**

Use:

```ts
export type InspectorSectionId =
  | "design" | "appearance" | "content" | "behavior" | "layout" | "actions";

export type WidgetRuntimeStatus = "ready" | "missing" | "stale" | "disconnected" | "error";

export type WidgetViewModelBase = {
  type: CoreWidgetType;
  status: WidgetRuntimeStatus;
  statusMessage?: string;
};

export type WidgetCapabilities = {
  inspectorSections: readonly InspectorSectionId[];
  supportsAspectUnlock: boolean;
  minimumSize: { width: number; height: number };
  defaultSize: { width: number; height: number };
};

export type WidgetTypeDefinition<TContent extends Record<string, unknown>> = {
  type: CoreWidgetType;
  labelKey: string;
  capabilities: WidgetCapabilities;
  createDefault(id: string): WidgetInstanceV3;
  parseContent(input: unknown): TContent;
};
```

Implement a small `WidgetTypeRegistry` class that rejects duplicate registrations and returns readonly definitions. Instantiate and export `widgetTypeRegistry` with Delta only. The ViewModel builder is deliberately added in Task 2.3 after `TelemetrySnapshot` exists, so this first commit remains compilable without a forward reference.

- [ ] **Step 4: Implement Delta defaults and content**

Delta content is intentionally empty in V3:

```ts
export type DeltaContent = Record<string, never>;
```

The default widget uses Original system version/config version 1, 30 Hz, enabled behavior, empty content/settings and the tested layout. Do not import legacy `createDefaultWidget`.

- [ ] **Step 5: Run tests and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- widget-registry.test.ts delta-definition.test.ts
git diff --check
git add vantare-v2/frontend/src/overlay/core/widget-definition.ts vantare-v2/frontend/src/overlay/core/widget-registry.ts vantare-v2/frontend/src/overlay/core/widget-registry.test.ts vantare-v2/frontend/src/overlay/widget-types/delta/delta-definition.ts vantare-v2/frontend/src/overlay/widget-types/delta/delta-definition.test.ts
git commit -m "feat(overlay): add functional widget registry"
```

### Task 2.2: Add one central telemetry snapshot store

**Files:**
- Create: `vantare-v2/frontend/src/overlay/core/telemetry-snapshot.ts`
- Create: `vantare-v2/frontend/src/overlay/core/telemetry-store.ts`
- Create: `vantare-v2/frontend/src/overlay/core/telemetry-store.test.ts`
- Create: `vantare-v2/frontend/src/overlay/core/mock-scenarios.ts`
- Create: `vantare-v2/frontend/src/overlay/core/mock-scenarios.test.ts`

- [ ] **Step 1: Write failing store tests**

Assert one publish notifies all subscribers once, unsubscribe stops notifications, snapshots are immutable copies, and source state transitions are explicit:

```ts
const store = createTelemetryStore(initialSnapshot);
const listener = vi.fn();
const unsubscribe = store.subscribe(listener);
store.publish(nextSnapshot);
expect(listener).toHaveBeenCalledTimes(1);
expect(store.getSnapshot()).toEqual(nextSnapshot);
unsubscribe();
store.publish(thirdSnapshot);
expect(listener).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Define the normalized snapshot**

Create a narrow overlay-facing shape that adapters can construct from the existing telemetry ref:

```ts
export type TelemetrySnapshot = {
  status: "ready" | "missing" | "stale" | "disconnected" | "error";
  capturedAt: number;
  session: {
    type: "practice" | "qualifying" | "race" | "warmup" | "endurance";
    remainingSeconds?: number;
  };
  player: {
    inPit: boolean;
    deltaSeconds?: number;
    lastLapSeconds?: number;
    bestLapSeconds?: number;
    throttle?: number;
    brake?: number;
    clutch?: number;
  };
  scoring: readonly Record<string, unknown>[];
  errorMessage?: string;
};
```

Values use seconds and normalized pedal ranges 0..1.

- [ ] **Step 3: Implement the external store**

Required API:

```ts
export type TelemetryStore = {
  getSnapshot(): TelemetrySnapshot;
  subscribe(listener: () => void): () => void;
  publish(snapshot: TelemetrySnapshot): void;
};
export function createTelemetryStore(initial: TelemetrySnapshot): TelemetryStore;
export function useTelemetrySnapshot(store: TelemetryStore): TelemetrySnapshot;
```

`useTelemetrySnapshot` wraps `useSyncExternalStore`. The store has no timer and no transport.

- [ ] **Step 4: Add deterministic mock scenario dimensions**

Use two independent editor-only selectors:

```ts
export type MockSessionScenario = "practice" | "qualifying" | "race";
export type MockLocationScenario = "track" | "pits";
export type MockDataState = "ready" | "stale" | "disconnected" | "error";

export function buildMockTelemetry(input: {
  session: MockSessionScenario;
  location: MockLocationScenario;
  state?: MockDataState;
}): TelemetrySnapshot;
```

Use fixed `capturedAt=1_720_569_600_000`, fixed lap/delta/pedal values and the Phase 0 driver fixture. Tests assert all 3x2 ready combinations plus stale/disconnected/error.

- [ ] **Step 5: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- telemetry-store.test.ts mock-scenarios.test.ts
git add vantare-v2/frontend/src/overlay/core/telemetry-snapshot.ts vantare-v2/frontend/src/overlay/core/telemetry-store.ts vantare-v2/frontend/src/overlay/core/telemetry-store.test.ts vantare-v2/frontend/src/overlay/core/mock-scenarios.ts vantare-v2/frontend/src/overlay/core/mock-scenarios.test.ts
git commit -m "feat(overlay): add deterministic telemetry store"
```

### Task 2.3: Build the Delta ViewModel

**Files:**
- Create: `vantare-v2/frontend/src/overlay/widget-types/delta/delta-view-model.ts`
- Create: `vantare-v2/frontend/src/overlay/widget-types/delta/delta-view-model.test.ts`
- Modify: `vantare-v2/frontend/src/overlay/core/widget-definition.ts`
- Modify: `vantare-v2/frontend/src/overlay/core/widget-registry.test.ts`
- Modify: `vantare-v2/frontend/src/overlay/widget-types/delta/delta-definition.ts`

- [ ] **Step 1: Write failing model tests**

Use fixed snapshots and assert:

```ts
expect(buildDeltaViewModel(negative, {})).toMatchObject({
  type: "delta", status: "ready", tone: "gaining", deltaText: "-0.245",
});
expect(buildDeltaViewModel(positive, {})).toMatchObject({
  tone: "losing", deltaText: "+0.380",
});
expect(buildDeltaViewModel(zero, {}).deltaText).toBe("0.000");
expect(buildDeltaViewModel(disconnected, {}).status).toBe("disconnected");
```

Also test missing delta, stale, error, last-lap formatting and no mutation of snapshot/content.

- [ ] **Step 2: Verify RED**

```powershell
pnpm --dir vantare-v2/frontend test -- delta-view-model.test.ts
```

Expected: FAIL because builder is missing.

- [ ] **Step 3: Implement the pure model**

```ts
export type DeltaViewModel = WidgetViewModelBase & {
  type: "delta";
  tone: "gaining" | "neutral" | "losing";
  deltaText: string;
  lastLapText: string;
  bestLapText: string;
  progress: number;
};

export function buildDeltaViewModel(
  snapshot: TelemetrySnapshot,
  content: DeltaContent,
): DeltaViewModel;
```

Clamp progress to -1..1 using a 2-second full scale. Reuse pure formatting logic only if it has no legacy renderer/telemetry dependency; otherwise move the formatting into this module with regression tests.

Extend `WidgetTypeDefinition` in this same cut to `WidgetTypeDefinition<TContent, TModel>` and add the required `buildViewModel(snapshot, content)` property now that both referenced types exist. Update the registry test to prove every registered definition has a builder.

- [ ] **Step 4: Wire definition and run**

Set `deltaDefinition.buildViewModel = buildDeltaViewModel` and run:

```powershell
pnpm --dir vantare-v2/frontend test -- delta-view-model.test.ts delta-definition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add vantare-v2/frontend/src/overlay/widget-types/delta/delta-view-model.ts vantare-v2/frontend/src/overlay/widget-types/delta/delta-view-model.test.ts vantare-v2/frontend/src/overlay/core/widget-definition.ts vantare-v2/frontend/src/overlay/core/widget-registry.test.ts vantare-v2/frontend/src/overlay/widget-types/delta/delta-definition.ts
git commit -m "feat(delta): add pure Delta view model"
```

### Task 2.4: Define versioned design-system manifests

**Files:**
- Create: `vantare-v2/frontend/src/overlay/core/design-system-definition.ts`
- Create: `vantare-v2/frontend/src/overlay/core/design-system-registry.ts`
- Create: `vantare-v2/frontend/src/overlay/core/design-system-registry.test.ts`
- Create: `vantare-v2/frontend/src/overlay/core/visual-config-migration.ts`
- Create: `vantare-v2/frontend/src/overlay/core/visual-config-migration.test.ts`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-original/manifest.ts`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/manifest.ts`

- [ ] **Step 1: Write failing registry tests**

Assert exactly two systems, version 1, explicit Delta compatibility, duplicate rejection and explicit unsupported-pair errors.

```ts
expect(designSystemRegistry.list().map((system) => system.id)).toEqual([
  "vantare-original", "vantare-crystal",
]);
expect(designSystemRegistry.resolve("vantare-crystal", 1, "delta").widgetType).toBe("delta");
expect(() => designSystemRegistry.resolve("vantare-crystal", 1, "standings")).toThrow(/unsupported/i);
```

- [ ] **Step 2: Define renderer/manifests contracts**

```ts
export type WidgetRendererProps<TModel extends WidgetViewModelBase = WidgetViewModelBase> = {
  model: TModel;
  settings: Readonly<Record<string, unknown>>;
  renderMode: "studio" | "desktop" | "obs" | "harness";
};

export type WidgetSystemRegistration = {
  widgetType: CoreWidgetType;
  configVersion: number;
  defaultSettings: Readonly<Record<string, unknown>>;
  configMigrations: Readonly<Record<number, (settings: Record<string, unknown>) => Record<string, unknown>>>;
  parseSettings(input: unknown): Record<string, unknown>;
  Renderer: ComponentType<WidgetRendererProps>;
};

export type DesignSystemDefinition = {
  id: DesignSystemId;
  version: number;
  label: string;
  systemMigrations: Readonly<Record<number, (widgetType: CoreWidgetType, settings: Record<string, unknown>) => Record<string, unknown>>>;
  widgets: readonly WidgetSystemRegistration[];
};
```

- [ ] **Step 3: Implement registry and manifests with temporary test renderer**

Use a tiny renderer declared inside each manifest only until Task 2.5 replaces it. Both manifests register Delta only. Add pure sequential migration resolution: each key migrates from that version to the next version, and configuration migrations use the same rule. Tests cover 0→1 and a missing migration gap. Unknown version, gap and pair throw typed `DesignSystemResolutionError` containing system, version and widget type.

Also export `upgradeProfileVisualConfigs(document)`, returning `{ document, migratedWidgetIds }`. It migrates registered V3 widgets without touching preserved widgets, layout, behavior or content. It is pure and returns the original document when no migration is required.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- design-system-registry.test.ts visual-config-migration.test.ts
git add vantare-v2/frontend/src/overlay/core/design-system-definition.ts vantare-v2/frontend/src/overlay/core/design-system-registry.ts vantare-v2/frontend/src/overlay/core/design-system-registry.test.ts vantare-v2/frontend/src/overlay/core/visual-config-migration.ts vantare-v2/frontend/src/overlay/core/visual-config-migration.test.ts vantare-v2/frontend/src/overlay/design-systems/vantare-original/manifest.ts vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/manifest.ts
git commit -m "feat(overlay): add versioned design system registry"
```

### Task 2.5: Implement complete Original and Crystal Delta renderers

**Files:**
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-original/delta/DeltaOriginal.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-original/delta/DeltaOriginal.test.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-original/tokens.css`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/delta/DeltaCrystal.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/delta/DeltaCrystal.test.tsx`
- Create: `vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/tokens.css`
- Modify: both manifest files
- Modify: `vantare-v2/frontend/src/index.css`

- [ ] **Step 1: Write failing pure-renderer tests**

Each renderer must:

- render only from `model` and `settings`;
- expose `data-widget-renderer="delta"` and its system root;
- show gaining/losing/neutral text and state;
- show a deterministic missing/stale/disconnected/error presentation;
- contain no editor controls;
- accept different settings without changing functional text.

Use `vi.mock` assertions or source-boundary test to ensure renderer modules do not import `@wailsio/runtime`, telemetry stores, access modules or profile persistence.

- [ ] **Step 2: Implement Original renderer**

Use semantic structure:

```tsx
<section data-widget-system="vantare-original" data-widget-renderer="delta" data-status={model.status}>
  <header><span>DELTA</span><span>{model.lastLapText}</span></header>
  <strong data-tone={model.tone}>{model.deltaText}</strong>
  <div aria-hidden="true" className="vo-delta-track">
    <span className="vo-delta-center" />
    <span className="vo-delta-fill" style={{ "--delta-progress": model.progress } as CSSProperties} />
  </div>
</section>
```

Original uses opaque racing surfaces, condensed uppercase typography, compact borders and direct red/green performance color. Scope every selector under `[data-widget-system="vantare-original"]`.

- [ ] **Step 3: Implement Crystal renderer**

Use a structurally distinct component, not the Original DOM with token changes:

```tsx
<section data-widget-system="vantare-crystal" data-widget-renderer="delta" data-status={model.status}>
  <div className="vc-delta-glow" aria-hidden="true" />
  <div className="vc-delta-material">
    <div className="vc-delta-meta"><span>DELTA</span><span>{model.bestLapText}</span></div>
    <div className="vc-delta-value" data-tone={model.tone}>{model.deltaText}</div>
    <div className="vc-delta-meter" aria-hidden="true"><span style={{ "--delta-progress": model.progress } as CSSProperties} /></div>
  </div>
</section>
```

Crystal uses a local translucent material, controlled blur, inner highlight, glow and different spacing/composition. Scope every selector under `[data-widget-system="vantare-crystal"]`. Do not load remote assets/fonts.

- [ ] **Step 4: Wire manifests and CSS imports**

Replace temporary renderers in both manifests. Import each token stylesheet once from `index.css` using the repository's existing CSS import convention.

- [ ] **Step 5: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- DeltaOriginal.test.tsx DeltaCrystal.test.tsx design-system-registry.test.ts
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/overlay/design-systems/vantare-original vantare-v2/frontend/src/overlay/design-systems/vantare-crystal vantare-v2/frontend/src/index.css
git commit -m "feat(delta): add Original and Crystal renderers"
```

### Task 2.6: Implement the shared visual host and isolation boundary

**Files:**
- Create: `vantare-v2/frontend/src/overlay/core/WidgetVisualHost.tsx`
- Create: `vantare-v2/frontend/src/overlay/core/WidgetVisualHost.test.tsx`
- Create: `vantare-v2/frontend/src/overlay/core/WidgetRenderBoundary.tsx`
- Create: `vantare-v2/frontend/src/overlay/core/WidgetRenderBoundary.test.tsx`
- Create: `vantare-v2/frontend/src/overlay/core/widget-visual-settings.ts`
- Create: `vantare-v2/frontend/src/overlay/core/widget-visual-settings.test.ts`

- [ ] **Step 1: Write failing host tests**

Test:

- Original and Crystal resolve different renderer roots for the same Delta snapshot;
- both receive identical Delta ViewModel values;
- unknown system version displays diagnostic and calls `onDiagnostic`;
- unsupported pair displays diagnostic, never a silent fallback;
- invalid content/settings displays diagnostic;
- base settings and appearance overrides merge without mutating either input; nested plain objects merge and arrays replace;
- a throwing renderer is isolated and sibling host remains rendered;
- Studio/Desktop/OBS render modes do not change the chosen renderer.

- [ ] **Step 2: Implement host**

```ts
export type WidgetVisualHostProps = {
  widget: WidgetInstanceV3;
  snapshot: TelemetrySnapshot;
  renderMode: "studio" | "desktop" | "obs" | "harness";
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
};
```

Resolution order is fixed:

1. get functional definition;
2. parse content;
3. build ViewModel;
4. resolve system/widget registration and execute declared system/config migrations to the current version;
5. merge migrated base settings with appearance overrides and parse the result;
6. render inside `WidgetRenderBoundary`.

The host does not position or scale the widget. That remains the responsibility of canvas/runtime frames.

- [ ] **Step 3: Implement boundary**

The boundary renders a transparent diagnostic card with stable test ID and widget ID/type/system. It catches renderer exceptions only; registry/parse errors are converted by the host before render.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- widget-visual-settings.test.ts WidgetVisualHost.test.tsx WidgetRenderBoundary.test.tsx
git add vantare-v2/frontend/src/overlay/core/WidgetVisualHost.tsx vantare-v2/frontend/src/overlay/core/WidgetVisualHost.test.tsx vantare-v2/frontend/src/overlay/core/WidgetRenderBoundary.tsx vantare-v2/frontend/src/overlay/core/WidgetRenderBoundary.test.tsx vantare-v2/frontend/src/overlay/core/widget-visual-settings.ts vantare-v2/frontend/src/overlay/core/widget-visual-settings.test.ts
git commit -m "feat(overlay): add shared widget visual host"
```

### Task 2.7: Add deterministic parity and visual harness

**Files:**
- Create: `vantare-v2/frontend/overlay-studio-harness.html`
- Create: `vantare-v2/frontend/src/overlay-harness/main.tsx`
- Create: `vantare-v2/frontend/src/overlay-harness/OverlayParityHarness.tsx`
- Create: `vantare-v2/frontend/src/overlay-harness/OverlayParityHarness.test.tsx`
- Create: `vantare-v2/frontend/vite.overlay-studio-harness.config.ts`
- Create: `vantare-v2/frontend/scripts/overlay-studio-visual.mjs`
- Modify: `vantare-v2/frontend/package.json`

- [ ] **Step 1: Write failing harness component test**

The harness accepts query params `widget`, `system`, `session`, `location`, `state`, `surface`. Assert defaults are Delta/Original/Race/Track/Ready/Harness and invalid values render an explicit parameter error.

- [ ] **Step 2: Implement the harness**

Render a fixed 1920x1080 transparent stage with the V3 default Delta instance at a fixed position. `surface=studio|desktop|obs|harness` changes only the host `renderMode` and outer diagnostic label, never the widget renderer.

- [ ] **Step 3: Add Vite config and script**

Use the already installed `playwright` library, not `@playwright/test`. The script must:

1. start Vite with the dedicated config on an available local port;
2. open Chromium headless;
3. capture Original and Crystal Delta for ready, stale, disconnected and error;
4. capture each surface for one ready fixture;
5. compare current screenshots with checked-in baselines by decoding both PNGs in a Playwright page, drawing them to canvas and comparing `ImageData` pixels; do not add an image-diff dependency;
6. fail with a non-zero exit when dimensions differ or pixel delta exceeds the documented threshold;
7. always close browser/server in `finally`.

Add package script:

```json
"visual:overlay-studio": "node scripts/overlay-studio-visual.mjs",
"visual:overlay-studio:update": "node scripts/overlay-studio-visual.mjs --update"
```

- [ ] **Step 4: Generate and review baselines**

Store baselines under `vantare-v2/frontend/testdata/overlay-studio-visual/`. The script may create/replace baselines only with `--update`; normal mode fails if a baseline is missing. Run update once, review the images, then run normal mode. Review that Original and Crystal are structurally distinct and surfaces are visually identical for the widget pixels.

- [ ] **Step 5: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- OverlayParityHarness.test.tsx
pnpm --dir vantare-v2/frontend visual:overlay-studio:update
pnpm --dir vantare-v2/frontend visual:overlay-studio
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/overlay-studio-harness.html vantare-v2/frontend/src/overlay-harness vantare-v2/frontend/vite.overlay-studio-harness.config.ts vantare-v2/frontend/scripts/overlay-studio-visual.mjs vantare-v2/frontend/testdata/overlay-studio-visual vantare-v2/frontend/package.json
git commit -m "test(overlay): add shared visual parity harness"
```

## Phase 2 review gate

- [ ] Run all Phase 2 focused tests.
- [ ] Run full frontend tests, build and lint.
- [ ] Run visual harness twice and confirm deterministic output.
- [ ] Search new renderer folders for forbidden imports: `rg -n "@wailsio|EventSource|getTelemetryRef|access-policy|profile_service|localStorage" vantare-v2/frontend/src/overlay/design-systems` must return no matches.
- [ ] Confirm Original and Crystal use different component structures.
- [ ] Confirm host has no positioning or editor state.
- [ ] Perform the master phase code-review brief.
- [ ] Fix P0/P1 and resolve or record P2 findings.
- [ ] Update `vantare-v2/docs/current-plan.md` and mark Phase 2 green.
