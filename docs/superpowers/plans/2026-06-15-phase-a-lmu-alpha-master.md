# Fase A — Cierre Alpha LMU Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close an end-to-end usable alpha of Vantare Overlays for Le Mans Ultimate, including visual editor, demo mode, reliable delta best, hotkeys, OBS setup, and minimal polish.

**Architecture:** Keep the existing Wails v3 event-driven architecture. Frontend owns layout editing and demo mode. Go backend owns telemetry pipeline, delta engine, and global settings. All state flows through `telemetry-ref.ts`, Wails Events, and profile JSON files.

**Tech Stack:** Go 1.23+, Wails v3 alpha, React 19, TypeScript, Tailwind CSS, Vitest, `github.com/micropkg/go-hotkeys`.

**Release gate:** No tag or release may be created until:
1. The code-review-and-quality skill has been applied to all changed files.
2. A manual smoke-test checklist has been completed (or documented as impossible in the current environment).
3. `go test ./...`, `pnpm --dir vantare-v2/frontend test`, and `pnpm --dir vantare-v2/frontend build` all pass.

---
## File Structure

| File | Responsibility |
|---|---|
| `vantare-v2/frontend/src/hub/preview/PreviewCanvas.tsx` | Canvas with draggable/resizeable widget frames. |
| `vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.tsx` | Wrapper for each widget: handles drag, resize handles, selection. |
| `vantare-v2/frontend/src/hub/preview/PreviewInspector.tsx` | Right panel: name, updateHz, position, size, enabled, type, duplicate, delete, reset. |
| `vantare-v2/frontend/src/hub/preview/WidgetList.tsx` | Left panel: list of widgets, selection, add. |
| `vantare-v2/frontend/src/hub/pages/PreviewPage.tsx` | Orchestrates PreviewCanvas, WidgetList, PreviewInspector, overlay controls, save flow, undo/redo. |
| `vantare-v2/frontend/src/overlay/widgets/mock-telemetry.ts` | Mock telemetry generator. To be extended with animation. |
| `vantare-v2/frontend/src/lib/useDemoMode.ts` | Hook that pumps mock telemetry into `telemetry-ref` when demo mode is active. |
| `vantare-v2/internal/telemetry/delta/engine.go` | New delta engine: computes delta by lap distance against a reference lap. |
| `vantare-v2/internal/telemetry/delta/store.go` | Stores reference laps by mode (self/session/global). |
| `vantare-v2/internal/telemetry/delta/engine_test.go` | Tests for delta engine. |
| `vantare-v2/internal/app/telemetry_bridge.go` | Wires delta engine into telemetry pipeline. |
| `vantare-v2/internal/app/settings_service.go` | Persists global settings (delta mode, hotkeys, CPU sampling toggle). |
| `vantare-v2/internal/app/hotkeys.go` | Registers/unregisters global Windows hotkeys. |
| `vantare-v2/internal/app/hotkeys_test.go` | Tests for hotkey parsing and profile switching logic. |
| `vantare-v2/internal/ops/sampler.go` | Adds CPU sampling via `gopsutil`. |
| `vantare-v2/internal/ops/sampler_test.go` | Tests for CPU sampler. |
| `vantare-v2/frontend/src/hub/pages/SettingsPage.tsx` | Adds delta mode selector, hotkey inputs, OBS section, CPU toggle. |
| `vantare-v2/frontend/src/hub/components/ObsSetup.tsx` | Standalone OBS setup section. |
| `vantare-v2/frontend/src/overlay/OverlayApp.tsx` or visibility hook | Evaluates `visibleWhen` rules per widget. |
| `vantare-v2/frontend/src/lib/visibility.ts` | Pure function: `(widget, telemetryState) => boolean`. |
| `vantare-v2/frontend/src/lib/visibility.test.ts` | Tests for visibility rules. |

---

## Task 1: Editor — Snap Drag and Canvas Boundaries

**Files:**
- Modify: `vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- Modify: `vantare-v2/frontend/src/hub/preview/PreviewCanvas.tsx`
- Test: `vantare-v2/frontend/src/hub/preview/PreviewCanvas.test.tsx`

- [ ] **Step 1: Add snap and boundary helpers**

Create `vantare-v2/frontend/src/lib/canvas-math.ts`:

```typescript
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const SNAP_PX = 8;

export function snap(value: number, grid = SNAP_PX): number {
  return Math.round(value / grid) * grid;
}

export function clampPosition(
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, CANVAS_WIDTH - w)),
    y: Math.max(0, Math.min(y, CANVAS_HEIGHT - h)),
  };
}
```

- [ ] **Step 2: Wire helpers into PreviewWidgetFrame drag handler**

In `PreviewWidgetFrame.tsx`, after computing new position, apply:

```typescript
const snappedX = snap(newX);
const snappedY = snap(newY);
const { x, y } = clampPosition(snappedX, snappedY, position.w, position.h);
```

- [ ] **Step 3: Write test for snap and boundaries**

In `PreviewCanvas.test.tsx`:

```typescript
it("snaps dragged widget to 8px grid and clamps to canvas", () => {
  // simulate drag to x=15, y=7 with widget 100x100
  // expect final position x=8, y=0
});
```

- [ ] **Step 4: Run frontend tests**

```bash
pnpm --dir vantare-v2/frontend test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add vantare-v2/frontend/src/lib/canvas-math.ts \
        vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.tsx \
        vantare-v2/frontend/src/hub/preview/PreviewCanvas.test.tsx
git commit -m "feat(preview): snap drag to 8px grid and clamp to canvas"
```

---

## Task 2: Editor — Resize with Fixed Ratios

**Files:**
- Modify: `vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- Modify: `vantare-v2/frontend/src/lib/canvas-math.ts`
- Test: `vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.test.tsx`

- [ ] **Step 1: Add aspect ratios and resize helpers**

In `canvas-math.ts`:

```typescript
export const WIDGET_MIN_SIZE = { w: 80, h: 40 };

export const WIDGET_RATIOS: Record<string, number | null> = {
  standings: null, // free
  relative: 0.5,
  delta: 4,
  telemetry: 2,
  "telemetry-vertical": 0.5,
  pedals: 2,
};

export function resizeWithRatio(
  type: string,
  startW: number,
  startH: number,
  deltaX: number,
  deltaY: number,
): { w: number; h: number } {
  const ratio = WIDGET_RATIOS[type];
  if (ratio == null) {
    return {
      w: Math.max(WIDGET_MIN_SIZE.w, startW + deltaX),
      h: Math.max(WIDGET_MIN_SIZE.h, startH + deltaY),
    };
  }
  // Drive from height; width follows ratio
  const h = Math.max(WIDGET_MIN_SIZE.h, startH + deltaY);
  const w = Math.max(WIDGET_MIN_SIZE.w, h * ratio);
  return { w, h };
}
```

- [ ] **Step 2: Add bottom-right resize handle to PreviewWidgetFrame**

Render a handle at bottom-right. On mousedown, start resize mode. On mousemove, compute new size and call `onChangePosition` with snapped/clamped bounds.

- [ ] **Step 3: Write test for ratio resize and minimum size**

```typescript
it("resizes delta widget maintaining 4:1 ratio", () => { ... });
it("does not resize below minimum 80x40", () => { ... });
it("allows free resize for standings", () => { ... });
```

- [ ] **Step 4: Run tests**

```bash
pnpm --dir vantare-v2/frontend test
```

- [ ] **Step 5: Commit**

```bash
git add vantare-v2/frontend/src/lib/canvas-math.ts \
        vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.tsx \
        vantare-v2/frontend/src/hub/preview/PreviewWidgetFrame.test.tsx
git commit -m "feat(preview): add bottom-right resize with fixed ratios"
```

---

## Task 3: Editor — Inspector Improvements

**Files:**
- Modify: `vantare-v2/frontend/src/hub/preview/PreviewInspector.tsx`
- Modify: `vantare-v2/frontend/src/hub/preview/WidgetList.tsx`
- Modify: `vantare-v2/frontend/src/hub/pages/PreviewPage.tsx`
- Test: `vantare-v2/frontend/src/hub/preview/PreviewInspector.test.tsx`

- [ ] **Step 1: Add name input and updateHz input**

In `PreviewInspector.tsx`, add controlled inputs bound to `widget.name` and `widget.updateHz` (default 60).

- [ ] **Step 2: Show widget type**

Display `widget.type` read-only.

- [ ] **Step 3: Add duplicate, delete with confirmation, and reset buttons**

```typescript
function duplicateWidget(widget: WidgetConfig): WidgetConfig {
  return { ...widget, id: crypto.randomUUID(), name: `${widget.name} copy` };
}

function resetWidgetPosition(widget: WidgetConfig): WidgetConfig {
  return { ...widget, position: { x: 0, y: 0, w: widget.position.w, h: widget.position.h } };
}
```

Delete uses `window.confirm("¿Eliminar este widget?")` for now.

- [ ] **Step 4: Improve numeric input UX**

Add `step` 8 for position fields, arrow key handlers for nudge (Shift+10px).

- [ ] **Step 5: Add WidgetList add button**

Add a "+" button to create a default widget of selected type.

- [ ] **Step 6: Write tests for duplicate, delete, reset**

```typescript
it("duplicates selected widget", () => { ... });
it("deletes selected widget after confirm", () => { ... });
it("resets widget position", () => { ... });
```

- [ ] **Step 7: Run tests and commit**

```bash
pnpm --dir vantare-v2/frontend test
git add vantare-v2/frontend/src/hub/preview/PreviewInspector.tsx \
        vantare-v2/frontend/src/hub/preview/WidgetList.tsx \
        vantare-v2/frontend/src/hub/pages/PreviewPage.tsx \
        vantare-v2/frontend/src/hub/preview/PreviewInspector.test.tsx
git commit -m "feat(preview): extend inspector with name, updateHz, duplicate, delete, reset"
```

---

## Task 4: Editor — Save Layout + Undo/Redo + Auto-save

**Files:**
- Modify: `vantare-v2/frontend/src/hub/pages/PreviewPage.tsx`
- Modify: `vantare-v2/internal/app/profile_service.go` (if needed)
- Test: `vantare-v2/frontend/src/hub/pages/PreviewPage.test.tsx`

- [ ] **Step 1: Add undo/redo history to PreviewPage**

```typescript
const [history, setHistory] = useState<ProfileConfig[]>([]);
const [historyIndex, setHistoryIndex] = useState(-1);
```

Push to history when `updateDraft` is called, trim redo branch.

- [ ] **Step 2: Implement Ctrl+Z / Ctrl+Y handlers**

Listen for keydown in `PreviewPage` and call `setProfile(history[index - 1])` etc.

- [ ] **Step 3: Add auto-save debounced**

```typescript
useEffect(() => {
  if (!dirty) return;
  const id = setTimeout(() => saveProfile(), 800);
  return () => clearTimeout(id);
}, [profile, dirty]);
```

- [ ] **Step 4: Test undo/redo and auto-save**

```typescript
it("undoes last position change with Ctrl+Z", () => { ... });
it("auto-saves after debounce", () => { ... });
```

- [ ] **Step 5: Run tests and commit**

```bash
pnpm --dir vantare-v2/frontend test
git add vantare-v2/frontend/src/hub/pages/PreviewPage.tsx \
        vantare-v2/frontend/src/hub/pages/PreviewPage.test.tsx
git commit -m "feat(preview): auto-save, undo/redo, Ctrl+S"
```

---

## Task 5: Demo Mode — Hook and Toggle

**Files:**
- Create: `vantare-v2/frontend/src/lib/useDemoMode.ts`
- Modify: `vantare-v2/frontend/src/overlay/widgets/mock-telemetry.ts`
- Modify: `vantare-v2/frontend/src/hub/pages/PreviewPage.tsx`
- Test: `vantare-v2/frontend/src/lib/useDemoMode.test.ts`

- [ ] **Step 1: Animate mock telemetry**

In `mock-telemetry.ts`, export `generateAnimatedTelemetry(elapsedMs: number): TelemetryState` that varies positions, gaps, deltaBest, and inputs cyclically.

- [ ] **Step 2: Create useDemoMode hook**

```typescript
export function useDemoMode(enabled: boolean, hz: number) {
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      applyTelemetryUpdate(generateAnimatedTelemetry(elapsed));
    }, 1000 / hz);
    return () => clearInterval(interval);
  }, [enabled, hz]);
}
```

- [ ] **Step 3: Add toggle button in PreviewPage**

```typescript
<button onClick={() => setDemoMode(!demoMode)}>
  {demoMode ? "Demo: ON" : "Demo: OFF"}
</button>
```

- [ ] **Step 4: Stop demo on live telemetry**

Listen for telemetry events; if received and `demoMode` is true, set it false.

- [ ] **Step 5: Test hook**

```typescript
it("pumps mock telemetry when enabled", () => { ... });
it("stops when live telemetry arrives", () => { ... });
```

- [ ] **Step 6: Run tests and commit**

```bash
pnpm --dir vantare-v2/frontend test
git add vantare-v2/frontend/src/lib/useDemoMode.ts \
        vantare-v2/frontend/src/lib/useDemoMode.test.ts \
        vantare-v2/frontend/src/overlay/widgets/mock-telemetry.ts \
        vantare-v2/frontend/src/hub/pages/PreviewPage.tsx
git commit -m "feat(preview): animated demo mode with live override"
```

---

## Task 6: Delta Best — Engine by Lap Distance

**Files:**
- Create: `vantare-v2/internal/telemetry/delta/engine.go`
- Create: `vantare-v2/internal/telemetry/delta/store.go`
- Create: `vantare-v2/internal/telemetry/delta/engine_test.go`
- Modify: `vantare-v2/internal/app/lmu_enriched_source.go`
- Modify: `vantare-v2/internal/telemetry/fusion/fusion.go`
- Test: existing tests + new ones

- [ ] **Step 1: Define delta engine types**

```go
package delta

type ReferenceMode string

const (
	ModeSelf    ReferenceMode = "self"
	ModeSession ReferenceMode = "session"
	ModeGlobal  ReferenceMode = "global"
)

type ReferenceLap struct {
	Mode        ReferenceMode
	TrackName   string
	CarClass    string
	SampleEvery float64 // meters
	Points      []LapPoint
}

type LapPoint struct {
	Distance  float64 // meters from start/finish
	Time      float64 // seconds into lap
}
```

- [ ] **Step 2: Implement distance-based delta engine**

```go
func ComputeDelta(mode ReferenceMode, ref *ReferenceLap, current LapPoint) (float64, bool) {
	if ref == nil || len(ref.Points) == 0 {
		return 0, false
	}
	target := interpolateTime(ref.Points, current.Distance)
	return current.Time - target, true
}
```

- [ ] **Step 3: Build reference laps from live data**

In `store.go`, update references when a lap completes:

```go
func (s *Store) RecordPoint(vehicleID int, trackName, carClass string, distance, timeIntoLap float64)
func (s *Store) CompleteLap(vehicleID int, mode ReferenceMode) *ReferenceLap
```

- [ ] **Step 4: Wire engine into lmu_enriched_source.go**

Replace the simple `delta.AlphaDelta(rows)` call with a call to `delta.ComputeDelta(mode, ref, currentPoint)`. Mode comes from global settings.

- [ ] **Step 5: Add session/global approximations**

For session/global, build a synthetic reference lap from `BestLapTime` using average lap distance, since full per-distance data for others is unavailable. Document as approximation.

- [ ] **Step 6: Write tests with fixture**

Create fixture with a known reference lap and current points. Assert delta values.

- [ ] **Step 7: Run tests**

```bash
cd vantare-v2
go test ./internal/telemetry/delta/...
```

- [ ] **Step 8: Commit**

```bash
git add vantare-v2/internal/telemetry/delta/engine.go \
        vantare-v2/internal/telemetry/delta/store.go \
        vantare-v2/internal/telemetry/delta/engine_test.go \
        vantare-v2/internal/app/lmu_enriched_source.go \
        vantare-v2/internal/telemetry/fusion/fusion.go
git commit -m "feat(delta): distance-based delta engine with self/session/global modes"
```

---

## Task 7: Settings — Delta Mode, Hotkeys, CPU Toggle, OBS

**Files:**
- Create: `vantare-v2/internal/app/settings_service.go`
- Create: `vantare-v2/frontend/src/hub/components/ObsSetup.tsx`
- Modify: `vantare-v2/frontend/src/hub/pages/SettingsPage.tsx`
- Modify: `vantare-v2/cmd/vantare/main.go`
- Test: `vantare-v2/internal/app/settings_service_test.go`

- [ ] **Step 1: Define settings model**

```go
type AppSettings struct {
	DeltaMode        string            `json:"deltaMode"`
	Hotkeys          map[string]string `json:"hotkeys"`
	CpuSampling      bool              `json:"cpuSampling"`
}
```

- [ ] **Step 2: Implement SettingsService**

Persist to `{cfgDir}/app-settings.json`. Expose events: `settings:get`, `settings:save`.

- [ ] **Step 3: Wire events in main.go**

Register handlers for `settings:get` and `settings:save`. Emit `settings` on load.

- [ ] **Step 4: Add OBS setup section**

Create `ObsSetup.tsx` with URL display, copy buttons, and text instructions.

- [ ] **Step 5: Extend SettingsPage**

Add delta mode selector (`self`/`session`/`global`), hotkey inputs (toggle, next, prev), CPU toggle, and `ObsSetup` section.

- [ ] **Step 6: Test**

```bash
go test ./internal/app/...
pnpm --dir vantare-v2/frontend test
```

- [ ] **Step 7: Commit**

```bash
git add vantare-v2/internal/app/settings_service.go \
        vantare-v2/internal/app/settings_service_test.go \
        vantare-v2/frontend/src/hub/components/ObsSetup.tsx \
        vantare-v2/frontend/src/hub/pages/SettingsPage.tsx \
        vantare-v2/cmd/vantare/main.go
git commit -m "feat(settings): delta mode, hotkey config, cpu toggle, OBS setup"
```

---

## Task 8: Hotkeys — Global Windows Shortcuts

**Files:**
- Create: `vantare-v2/internal/app/hotkeys.go`
- Create: `vantare-v2/internal/app/hotkeys_test.go`
- Modify: `vantare-v2/cmd/vantare/main.go`
- Modify: `vantare-v2/internal/app/settings_service.go`
- Test: backend tests

- [ ] **Step 1: Install dependency**

```bash
cd vantare-v2
go get github.com/micropkg/go-hotkeys
```

- [ ] **Step 2: Implement hotkey registration**

```go
package app

type HotkeyManager struct {
	hk *hotkeys.Hotkeys
}

func NewHotkeyManager(emitter EventEmitter) *HotkeyManager { ... }
func (m *HotkeyManager) Register(combo string, action func()) error { ... }
func (m *HotkeyManager) UnregisterAll() { ... }
```

- [ ] **Step 3: Wire default actions in main.go**

- Toggle overlay visibility.
- Switch next/previous profile when overlay is running.

- [ ] **Step 4: Reload hotkeys when settings change**

Listen for `settings:save` and re-register.

- [ ] **Step 5: Test parsing and switching logic**

```go
func TestParseHotkeyCombo(t *testing.T) { ... }
func TestProfileSwitchCycles(t *testing.T) { ... }
```

- [ ] **Step 6: Commit**

```bash
git add vantare-v2/internal/app/hotkeys.go \
        vantare-v2/internal/app/hotkeys_test.go \
        vantare-v2/cmd/vantare/main.go \
        vantare-v2/internal/app/settings_service.go
git commit -m "feat(hotkeys): global windows shortcuts for overlay and profiles"
```

---

## Task 9: Ops Panel CPU

**Files:**
- Modify: `vantare-v2/internal/ops/sampler.go`
- Modify: `vantare-v2/frontend/src/hub/components/OpsPanel.tsx`
- Test: `vantare-v2/internal/ops/sampler_test.go`

- [ ] **Step 1: Add gopsutil dependency**

```bash
cd vantare-v2
go get github.com/shirou/gopsutil/v4/process
```

- [ ] **Step 2: Implement CPU sampling**

```go
func (s *Sampler) sampleCPU() (float64, error) {
	p, err := process.NewProcess(int32(os.Getpid()))
	if err != nil { return 0, err }
	return p.Percent(2 * time.Second)
}
```

Only sample if `settings.CpuSampling` is true. If disabled, emit `cpuPercent: -1` (N/D).

- [ ] **Step 3: Display in OpsPanel**

If value < 0, show "N/D"; otherwise show percentage with one decimal.

- [ ] **Step 4: Test**

```go
func TestCPUSampler(t *testing.T) { ... }
```

- [ ] **Step 5: Commit**

```bash
git add vantare-v2/internal/ops/sampler.go \
        vantare-v2/internal/ops/sampler_test.go \
        vantare-v2/frontend/src/hub/components/OpsPanel.tsx
git commit -m "feat(ops): measure process CPU via gopsutil with toggle"
```

---

## Task 10: Visibility Rules in Overlay

**Files:**
- Create: `vantare-v2/frontend/src/lib/visibility.ts`
- Create: `vantare-v2/frontend/src/lib/visibility.test.ts`
- Modify: `vantare-v2/frontend/src/overlay/OverlayApp.tsx`
- Modify: `vantare-v2/frontend/src/lib/profile.ts` (type)
- Modify: `vantare-v2/frontend/src/lib/useDemoMode.ts`
- Test: frontend tests

- [ ] **Step 1: Add visibleWhen type to profile**

```typescript
export type VisibleWhen = {
  inPit?: boolean;
  sessionType?: ("practice" | "qual" | "race" | "warmup")[];
};

export interface WidgetConfig {
  ...
  visibleWhen?: VisibleWhen;
}
```

- [ ] **Step 2: Implement visibility evaluator**

```typescript
export function isWidgetVisible(
  widget: WidgetConfig,
  state: TelemetryState,
): boolean {
  if (!widget.visibleWhen) return true;
  const { inPit, sessionType } = widget.visibleWhen;
  if (inPit != null && state.player?.inPit !== inPit) return false;
  if (sessionType != null && !sessionType.includes(state.sessionType)) return false;
  return true;
}
```

- [ ] **Step 3: Apply in OverlayApp**

Filter `widgets` before rendering; invisible ones removed from DOM.

- [ ] **Step 4: Add inPit toggle to demo mode**

`generateAnimatedTelemetry` accepts `inPitOverride` flag. Add toggle in PreviewPage.

- [ ] **Step 5: Test**

```typescript
it("hides widget when inPit condition mismatches", () => { ... });
it("shows widget when sessionType matches", () => { ... });
```

- [ ] **Step 6: Commit**

```bash
git add vantare-v2/frontend/src/lib/visibility.ts \
        vantare-v2/frontend/src/lib/visibility.test.ts \
        vantare-v2/frontend/src/overlay/OverlayApp.tsx \
        vantare-v2/frontend/src/lib/profile.ts \
        vantare-v2/frontend/src/lib/useDemoMode.ts \
        vantare-v2/frontend/src/hub/pages/PreviewPage.tsx
git commit -m "feat(overlay): visibility rules by inPit and sessionType"
```

---

## Task 11: Release v0.2.0-alpha.1

**Files:**
- Modify: `vantare-v2/cmd/vantare/main.go`
- Modify: `vantare-v2/build/config.yml`
- Modify: `vantare-v2/build/windows/nsis/project.nsi`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version to v0.2.0-alpha.1**

- [ ] **Step 2: Run full test suite**

```bash
cd vantare-v2
go test ./...
pnpm --dir frontend test
pnpm --dir frontend build
```

- [ ] **Step 3: Build installer**

Use existing NSIS batch/wrapper. Verify output binary and hash.

- [ ] **Step 4: Update CHANGELOG**

Add `v0.2.0-alpha.1` entry summarizing Fase A features.

- [ ] **Step 5: Commit and tag**

```bash
git add -A
git commit -m "release: v0.2.0-alpha.1 — LMU alpha closure"
git tag -a v0.2.0-alpha.1 -m "v0.2.0-alpha.1"
git push origin master
git push origin v0.2.0-alpha.1
```

- [ ] **Step 6: Create GitHub release**

```bash
gh release create v0.2.0-alpha.1 vantare-v2/bin/vantare-amd64-installer.exe \
  --repo isaacalbala12/Vantare-Overlays \
  --title "v0.2.0-alpha.1" \
  --notes-file release-notes.md \
  --prerelease
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Drag & drop + snap + boundaries | Task 1 |
| Resize fixed ratios | Task 2 |
| Inspector improvements | Task 3 |
| Save layout + undo/redo + auto-save | Task 4 |
| Demo mode | Task 5 |
| Delta Best self/session/global | Task 6 |
| Settings UI for delta mode + hotkeys + CPU + OBS | Task 7 |
| Hotkeys | Task 8 |
| Ops CPU | Task 9 |
| Visibility rules | Task 10 |
| Release | Task 11 |

## Mini-Plans for Subagents

Each of the following subagent assignments should use this master plan as context and implement its own tasks independently:

1. **Subagent `EditorAgent`**: Tasks 1–4 (visual editor).
2. **Subagent `DemoDeltaAgent`**: Tasks 5–6 (demo mode + delta best).
3. **Subagent `SettingsHotkeysAgent`**: Tasks 7–8 (settings, hotkeys, OBS).
4. **Subagent `PolishAgent`**: Tasks 9–10 (CPU, visibility rules).

After each subagent completes, run tests and review before merging into the main branch.
