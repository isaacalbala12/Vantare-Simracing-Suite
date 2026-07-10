# Overlay Studio V3 Phase 7 Production Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire V3 persistence, live telemetry, Studio, Desktop and OBS into production while keeping each cut reversible until the full cross-surface gate passes.

**Architecture:** Go exposes correlated V3 load/save/design events and migration-aware HTTP profiles. Transport adapters publish into one telemetry store per surface; a common runtime surface resolves session layout, visibility, frames and `WidgetVisualHost`. The Hub route switches last.

**Tech Stack:** Go, Wails v3 events, SSE, React, TypeScript, Vitest, Go tests, browser harness.

---

## Context capsule

- Phases 0–6 are green.
- This is the first phase allowed to switch production consumers.
- Make one integration seam per commit and preserve a revertable previous commit.
- A successful V3 save must refresh an active overlay only after atomic disk success.
- Run Go/gofmt and module-relative `git add internal|pkg|cmd` blocks from `vantare-v2`; run frontend and documentation blocks from the monorepo root.

### Task 7.1: Register correlated V3 profile and design event handlers

**Files:**
- Modify: `vantare-v2/cmd/vantare/main.go`
- Modify: `vantare-v2/internal/app/studio_profile_service.go`
- Modify: `vantare-v2/internal/app/studio_profile_service_test.go`
- Modify: `vantare-v2/internal/app/widget_design_service.go`
- Modify: `vantare-v2/internal/app/widget_design_service_test.go`

- [ ] **Step 1: Write failing handler tests**

Extract registration into testable methods if current `main.go` closures prevent direct tests. Assert request IDs echo on all responses/errors and these incoming payloads decode strictly:

```text
studio:profile:load { requestId, file }
studio:profile:save { requestId, expectedRevision, document }
design:list/save/delete/rename { requestId, ... }
```

Invalid/missing document, file, ID or revision emits the matching error without panic or disk mutation.

- [ ] **Step 2: Verify RED**

```powershell
go test ./internal/app/... -run "StudioProfileService.*Handler|WidgetDesignService.*Handler" -count=1
```

- [ ] **Step 3: Implement and register**

Construct one `StudioProfileService` and one `WidgetDesignService` during app startup. Register new event names beside legacy handlers. Do not remove `layout:save` or preset handlers yet.

- [ ] **Step 4: Run and commit**

```powershell
gofmt -w cmd/vantare/main.go internal/app/studio_profile_service.go internal/app/studio_profile_service_test.go internal/app/widget_design_service.go internal/app/widget_design_service_test.go
go test ./internal/app/... ./cmd/vantare/... -run "StudioProfile|WidgetDesign|Hub" -count=1
git add cmd/vantare/main.go internal/app/studio_profile_service.go internal/app/studio_profile_service_test.go internal/app/widget_design_service.go internal/app/widget_design_service_test.go
git commit -m "feat(app): register Overlay Studio V3 services"
```

### Task 7.2: Add normalized Wails and SSE telemetry adapters

**Files:**
- Create: `vantare-v2/frontend/src/overlay/core/telemetry-adapter.ts`
- Create: `vantare-v2/frontend/src/overlay/core/telemetry-adapter.test.ts`
- Create: `vantare-v2/frontend/src/overlay/core/telemetry-rate-coordinator.ts`
- Create: `vantare-v2/frontend/src/overlay/core/telemetry-rate-coordinator.test.ts`
- Create: `vantare-v2/frontend/src/overlay/transports/wails-telemetry-adapter.ts`
- Create: `vantare-v2/frontend/src/overlay/transports/wails-telemetry-adapter.test.ts`
- Create: `vantare-v2/frontend/src/overlay/transports/sse-telemetry-adapter.ts`
- Create: `vantare-v2/frontend/src/overlay/transports/sse-telemetry-adapter.test.ts`

- [ ] **Step 1: Write failing normalization tests**

Convert Phase 0 legacy/live payload fixtures to `TelemetrySnapshot` and assert Delta, Standings, Relative and Pedals required fields, canonical `qualifying`, normalized pedals, immutable scoring and explicit disconnected/error state.

- [ ] **Step 2: Write failing lifecycle tests**

For each adapter assert:

- one transport subscription/EventSource per adapter;
- multiple widget hosts do not add transport subscriptions;
- start/stop are idempotent;
- parse errors publish `error` without crashing;
- disconnect publishes `disconnected`;
- stale threshold publishes `stale` through injected clock/scheduler;
- reconnect publishes ready and clears error;
- cleanup cancels timers and listeners.
- one scheduler exists per distinct active updateHz bucket, not per widget;
- widgets sharing 15 Hz share a bucket, while 15 Hz and 30 Hz receive bounded independent notifications;
- stale/disconnected/error publishes immediately to every bucket.

- [ ] **Step 3: Implement adapters**

```ts
export interface TelemetryAdapter {
  readonly coordinator: TelemetryRateCoordinator;
  start(): void;
  stop(): void;
}

export function normalizeLegacyTelemetry(input: unknown, capturedAt: number): TelemetrySnapshot;
export function createWailsTelemetryAdapter(options: WailsTelemetryOptions): TelemetryAdapter;
export function createSseTelemetryAdapter(options: SseTelemetryOptions): TelemetryAdapter;
```

The coordinator exposes `getSnapshot(hz)`, `subscribe(hz, listener)`, `publish(snapshot)` and `dispose()`. Use one injected scheduler per distinct Hz; remove it after the last subscriber. Reuse existing payload parsing only through pure imported functions. Do not retain `telemetryKey` render counters.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- telemetry-adapter.test.ts telemetry-rate-coordinator.test.ts wails-telemetry-adapter.test.ts sse-telemetry-adapter.test.ts
git add vantare-v2/frontend/src/overlay/core/telemetry-adapter.ts vantare-v2/frontend/src/overlay/core/telemetry-adapter.test.ts vantare-v2/frontend/src/overlay/core/telemetry-rate-coordinator.ts vantare-v2/frontend/src/overlay/core/telemetry-rate-coordinator.test.ts vantare-v2/frontend/src/overlay/transports
git commit -m "feat(overlay): centralize live telemetry adapters"
```

### Task 7.3: Build the common V3 runtime surface

**Files:**
- Create: `vantare-v2/frontend/src/overlay/runtime/resolve-runtime-layout.ts`
- Create: `vantare-v2/frontend/src/overlay/runtime/resolve-runtime-layout.test.ts`
- Create: `vantare-v2/frontend/src/overlay/runtime/RuntimeWidgetFrame.tsx`
- Create: `vantare-v2/frontend/src/overlay/runtime/RuntimeWidgetFrame.test.tsx`
- Create: `vantare-v2/frontend/src/overlay/runtime/RuntimeOverlaySurface.tsx`
- Create: `vantare-v2/frontend/src/overlay/runtime/RuntimeOverlaySurface.test.tsx`

- [ ] **Step 1: Write failing layout tests**

Map snapshot session to layout type. Use exact session when present, otherwise general. Endurance selects endurance when source says endurance. Practice/qualifying/race do not materialize missing layouts at runtime.

- [ ] **Step 2: Write failing surface tests**

Assert:

- widgets sorted by z-index;
- disabled and conditionally invisible widgets absent;
- empty layout renders transparent empty surface;
- frame uses layout x/y/w/h and host with supplied render mode;
- same document/snapshot renders same widget roots for Desktop and OBS;
- preserved legacy widgets are skipped with one non-fatal diagnostic and remain in every loaded/saved document;
- one bad renderer diagnostic does not remove siblings;
- no Studio selection/resize chrome exists.

- [ ] **Step 3: Implement**

```ts
export type RuntimeOverlaySurfaceProps = {
  document: ProfileDocumentV3;
  telemetry: TelemetryRateCoordinator;
  renderMode: "desktop" | "obs";
  layoutOrigin?: { x: number; y: number };
};
```

The surface subscribes once to the latest snapshot for session/visibility decisions; each `RuntimeWidgetFrame` uses `useRateLimitedTelemetry(telemetry, widget.behavior.updateHz)` before calling the pure host. Fullscreen Desktop uses origin zero. OBS keeps 1920x1080 profile coordinates unless server explicitly returns a matching shrink-wrap origin.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- resolve-runtime-layout.test.ts RuntimeWidgetFrame.test.tsx RuntimeOverlaySurface.test.tsx
git add vantare-v2/frontend/src/overlay/runtime
git commit -m "feat(overlay): add shared V3 runtime surface"
```

### Task 7.4: Serve migration-aware V3 profiles to OBS

**Files:**
- Modify: `vantare-v2/internal/server/profile.go`
- Create: `vantare-v2/internal/server/profile_test.go`
- Modify: `vantare-v2/pkg/config/profile_v3_store.go`
- Modify: `vantare-v2/pkg/config/profile_v3_store_test.go`

- [ ] **Step 1: Write failing HTTP tests**

Request V0, V2 and V3 fixtures and assert HTTP 200 returns:

```json
{
  "document": { "schemaVersion": 3 },
  "revision": "<sha256>",
  "layoutOrigin": { "x": 0, "y": 0 }
}
```

Invalid profiles return safe HTTP 400/404 without filesystem paths. Traversal remains rejected. Empty V3 profile returns 200.

- [ ] **Step 2: Implement endpoint cut**

Use `ProfileDocumentStore.Load`; do not expose legacy profile fields on the V3 endpoint. If backward compatibility is still needed by a non-V3 consumer, add `/api/profile-v3` for this commit and switch `/api/profile` only in Task 7.7.

- [ ] **Step 3: Run and commit**

```powershell
gofmt -w internal/server/profile.go internal/server/profile_test.go pkg/config/profile_v3_store.go pkg/config/profile_v3_store_test.go
go test ./internal/server/... ./pkg/config/... -count=1
git add internal/server/profile.go internal/server/profile_test.go pkg/config/profile_v3_store.go pkg/config/profile_v3_store_test.go
git commit -m "feat(server): serve migration-aware profile v3"
```

### Task 7.5: Switch the Go overlay lifecycle to Profile V3

**Files:**
- Modify: `vantare-v2/internal/app/studio_profile_service.go`
- Modify: `vantare-v2/internal/app/studio_profile_service_test.go`
- Modify: `vantare-v2/internal/app/overlay_controller.go`
- Modify: `vantare-v2/internal/app/overlay_controller_test.go`
- Modify: `vantare-v2/internal/window/manager.go`
- Modify: `vantare-v2/internal/window/manager_test.go`
- Modify: `vantare-v2/cmd/vantare/main.go`

- [ ] **Step 1: Write failing V3 lifecycle tests**

Assert startup/load, hub activation, overlay start, next/previous profile and successful save all make one canonical `StudioProfileService` own path/document/revision. The runtime broadcast is:

```text
overlay:profile-v3-loaded {
  document,
  revision,
  layoutOrigin,
  windowMode
}
```

Test empty profiles, V2 in-memory migration, fullscreen origin zero, racing click-through, streaming without a Desktop window, and errors that leave the prior active document/window intact. The former edit-mode hotkey requests Hub navigation/focus to Overlay Studio for the active profile and never toggles runtime editing chrome.

- [ ] **Step 2: Change controller/window inputs to V3**

`OverlayController.Start` receives a validated `*config.ProfileDocumentV3`. Add focused V3 window methods that consume display mode/monitor and keep racing/edit fullscreen. Do not convert V3 back into legacy `ProfileConfig`; that would create a second canonical model.

- [ ] **Step 3: Make StudioProfileService canonical for cycling/runtime broadcasts**

Add profiles directory discovery, `NextProfile`, `PreviousProfile` and `EmitRuntimeLoaded` to the V3 service with table-driven tests. Main startup and profile hotkeys call this service. Keep the legacy service registered only for untouched non-V3 callers until Phase 8 consumer audit.

- [ ] **Step 4: Run Go gates and commit**

```powershell
gofmt -w internal/app/studio_profile_service.go internal/app/studio_profile_service_test.go internal/app/overlay_controller.go internal/app/overlay_controller_test.go internal/window/manager.go internal/window/manager_test.go cmd/vantare/main.go
go test ./internal/app/... ./internal/window/... ./cmd/vantare/... -run "StudioProfile|OverlayController|Window|ProfileCycl" -count=1
git add internal/app/studio_profile_service.go internal/app/studio_profile_service_test.go internal/app/overlay_controller.go internal/app/overlay_controller_test.go internal/window/manager.go internal/window/manager_test.go cmd/vantare/main.go
git commit -m "refactor(overlay): switch Go runtime lifecycle to profile v3"
```

### Task 7.6: Switch Desktop runtime to V3 host

**Files:**
- Modify: `vantare-v2/frontend/src/overlay/CompositeApp.tsx`
- Modify: `vantare-v2/frontend/src/overlay/CompositeApp.test.tsx`
- Create: `vantare-v2/frontend/src/overlay/runtime/DesktopOverlayRuntime.tsx`
- Create: `vantare-v2/frontend/src/overlay/runtime/DesktopOverlayRuntime.test.tsx`

- [ ] **Step 1: Write failing Desktop integration tests**

Assert `overlay:profile-v3-loaded` profile load, one Wails adapter subscription, shared host roots, empty profile, layout/session switching, conditional visibility, save-triggered refresh and no duplicate widget map.

Assert the old edit-mode event does not mount drag/resize frames. Its replacement navigation event focuses Overlay Studio with the active profile while the running overlay remains click-through and unchanged until Studio Save.

- [ ] **Step 2: Implement Desktop runtime wrapper**

`CompositeApp` becomes route/event glue only: create adapter, subscribe to the canonical V3 runtime broadcast, render `DesktopOverlayRuntime`, handle reminder banner and cleanup. Remove local widget component maps, legacy `profile:loaded` parsing and `telemetryKey`.

- [ ] **Step 3: Run focused frontend and Go window tests**

```powershell
pnpm --dir vantare-v2/frontend test -- CompositeApp.test.tsx DesktopOverlayRuntime.test.tsx
go test ./internal/window/... ./internal/app/... -run "Window|Overlay|Profile" -count=1
```

- [ ] **Step 4: Commit reversible Desktop cut**

```powershell
git add vantare-v2/frontend/src/overlay/CompositeApp.tsx vantare-v2/frontend/src/overlay/CompositeApp.test.tsx vantare-v2/frontend/src/overlay/runtime
git commit -m "refactor(overlay): switch Desktop runtime to V3 host"
```

### Task 7.7: Switch OBS runtime to V3 host

**Files:**
- Modify: `vantare-v2/frontend/src/overlay/ObsOverlayApp.tsx`
- Modify: `vantare-v2/frontend/src/overlay/ObsOverlayApp.test.tsx`
- Create: `vantare-v2/frontend/src/overlay/runtime/ObsOverlayRuntime.tsx`
- Create: `vantare-v2/frontend/src/overlay/runtime/ObsOverlayRuntime.test.tsx`

- [ ] **Step 1: Write failing OBS integration tests**

Assert encoded profile parameter, V3 endpoint, one SSE adapter, shared host roots, error/disconnect/reconnect, empty profile, conditional visibility, session layout and cleanup. Mock `EventSource` and fetch; no network in tests.

- [ ] **Step 2: Implement OBS wrapper**

`ObsOverlayApp` owns fetch/adapter lifecycle and renders `ObsOverlayRuntime`. Remove local widget map, visibility duplication and `telemetryKey`. Switch final endpoint from temporary `/api/profile-v3` to `/api/profile` if Task 7.4 used a parallel route.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- ObsOverlayApp.test.tsx ObsOverlayRuntime.test.tsx RuntimeOverlaySurface.test.tsx
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/overlay/ObsOverlayApp.tsx vantare-v2/frontend/src/overlay/ObsOverlayApp.test.tsx vantare-v2/frontend/src/overlay/runtime/ObsOverlayRuntime.tsx vantare-v2/frontend/src/overlay/runtime/ObsOverlayRuntime.test.tsx
git commit -m "refactor(overlay): switch OBS runtime to V3 host"
```

### Task 7.8: Refresh active overlays after successful Studio save

**Files:**
- Modify: `vantare-v2/internal/app/studio_profile_service.go`
- Modify: `vantare-v2/internal/app/studio_profile_service_test.go`
- Modify: `vantare-v2/internal/app/overlay_controller.go`
- Modify: `vantare-v2/internal/app/overlay_controller_test.go`
- Modify: `vantare-v2/cmd/vantare/main.go`

- [ ] **Step 1: Write failing refresh-order tests**

Assert:

- failed save causes zero overlay refreshes;
- conflict causes zero refreshes;
- successful save updates disk, service revision, runtime document and then emits saved;
- stopped overlay is not started by save;
- running active profile refreshes once;
- running different profile does not refresh;
- empty active profile refreshes to transparent surface.

- [ ] **Step 2: Implement explicit callback**

Avoid a global event feedback loop. Inject a callback from `main.go` into `StudioProfileService` that checks the active controller target and publishes/reloads the saved V3 document after success.

- [ ] **Step 3: Run and commit**

```powershell
gofmt -w internal/app/studio_profile_service.go internal/app/studio_profile_service_test.go internal/app/overlay_controller.go internal/app/overlay_controller_test.go cmd/vantare/main.go
go test ./internal/app/... ./cmd/vantare/... -run "StudioProfile|OverlayController" -count=1
git add internal/app/studio_profile_service.go internal/app/studio_profile_service_test.go internal/app/overlay_controller.go internal/app/overlay_controller_test.go cmd/vantare/main.go
git commit -m "feat(overlay): refresh active runtime after profile save"
```

### Task 7.9: Switch the Hub Overlay Studio route

**Files:**
- Modify: `vantare-v2/frontend/src/hub/pages/OverlaysStudioPage.tsx`
- Modify: `vantare-v2/frontend/src/hub/pages/OverlaysStudioPage.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/NoActiveProfileState.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/NoActiveProfileState.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/StudioRoute.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/StudioRoute.test.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.test.tsx`

- [ ] **Step 1: Write failing route tests**

Assert:

- active profile file loads directly into V3 editor without home intermediary;
- no active profile shows create/select/recommended actions;
- header menu opens Own profiles, Recommended, Community and OBS management views;
- returning from management restores editor/profile;
- changing profile uses Save/Discard/Cancel;
- route/page navigation while dirty is guarded;
- V3 provider uses real Wails client in production and injected client in tests;
- Studio Live uses the single Wails telemetry adapter/coordinator and each frame consumes its configured updateHz;
- Studio Mock uses the same coordinator contract with deterministic published snapshots;
- no synthetic/EMPTY_PROFILE fallback;
- overlay start/stop controls use active saved profile.

- [ ] **Step 2: Implement route orchestrator**

Keep management views reusable, but remove `V52OverlaysHome` from the default flow. Resolve active profile ID to its file from the profiles list before loading. Loading state, missing file and load error are explicit. Create one Wails telemetry adapter for the Studio route, pass its coordinator through preview context, and make `StudioWidgetFrame` call `useRateLimitedTelemetry` with the widget behavior frequency.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- OverlaysStudioPage.test.tsx StudioRoute.test.tsx NoActiveProfileState.test.tsx OverlayStudioV3.test.tsx
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/hub/pages/OverlaysStudioPage.tsx vantare-v2/frontend/src/hub/pages/OverlaysStudioPage.test.tsx vantare-v2/frontend/src/hub/overlay-studio/StudioRoute.tsx vantare-v2/frontend/src/hub/overlay-studio/StudioRoute.test.tsx vantare-v2/frontend/src/hub/overlay-studio/NoActiveProfileState.tsx vantare-v2/frontend/src/hub/overlay-studio/NoActiveProfileState.test.tsx vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.tsx vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.test.tsx
git commit -m "refactor(studio): switch Hub route to Overlay Studio V3"
```

### Task 7.10: Run production cross-surface smoke before retirement

**Files:**
- Modify: `vantare-v2/docs/manual-verification.md`
- Modify: `vantare-v2/docs/current-plan.md`

- [ ] **Step 1: Run automated gates**

```powershell
pnpm --dir vantare-v2/frontend test
pnpm --dir vantare-v2/frontend build
pnpm --dir vantare-v2/frontend lint
pnpm --dir vantare-v2/frontend visual:overlay-studio
```

From `vantare-v2`:

```powershell
go test ./...
```

- [ ] **Step 2: Run manual Wails smoke**

For a migrated copy of the Phase 0 profile:

1. Open Studio; verify direct active profile and migration without disk write, including the read-only warning for preserved telemetry widgets.
2. Switch each session; edit/save an independent Race layout.
3. Drag/resize Delta, save, undo/redo, reopen and verify persistence.
4. Switch Original/Crystal on all four widgets.
5. Verify Mock session/location and Live disconnected state.
6. Start Desktop overlay; save Studio and verify one automatic refresh.
7. Open Browser View; verify saved state and SSE reconnect.
8. Delete all four V3 widgets, save, verify transparent Desktop/OBS and confirm preserved legacy payloads remain in JSON.
9. Restore fixture and verify the former edit hotkey opens/focuses Overlay Studio while Desktop remains fullscreen and click-through.
10. Force save conflict and disk write failure; verify draft remains intact.

- [ ] **Step 3: Record evidence and rollback**

Document commands, results, screenshots, created `.pre-v3.bak`, tested profile copy and the exact commits to revert in order: Hub route, OBS, Desktop. Do not test migration on the user's only profile copy.

- [ ] **Step 4: Commit documentation**

```powershell
git add vantare-v2/docs/manual-verification.md vantare-v2/docs/current-plan.md
git commit -m "docs: record Overlay Studio V3 production smoke"
```

## Phase 7 review gate

- [ ] Full frontend tests/build/lint and visual harness pass.
- [ ] `go test ./...` passes.
- [ ] Studio, Desktop and OBS inspect to the same renderer modules.
- [ ] Exactly one live transport subscription exists per surface.
- [ ] Active overlay refresh occurs only after save success.
- [ ] Empty profiles work across all surfaces.
- [ ] Direct active-profile entry and dirty navigation work.
- [ ] Manual rollback has been rehearsed on a test profile.
- [ ] Perform the master phase code-review brief with extra emphasis on persistence and runtime lifecycle.
- [ ] Fix P0/P1 and resolve or record P2 findings.
- [ ] Mark Phase 7 green; do not delete legacy code until Phase 8.
