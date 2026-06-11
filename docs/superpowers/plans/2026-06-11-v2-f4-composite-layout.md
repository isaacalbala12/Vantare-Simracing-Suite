# v2 Fase 4 — Composite Layout + Profile Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One composite overlay window driven by profile JSON — 3 widgets (delta, relative, standings), `racing` | `edit` modes, shrink-wrap bounds, click-through in racing, `skipWindowRefresh` on layout save.

**Architecture:** Go owns profile load/save + window geometry (`internal/window/`). Wails emits `profile:loaded` on startup and `telemetry:update` as today. Frontend renders widgets at absolute positions from profile; edit mode enables drag + emits `layout:save` → Go persists JSON + resizes window (no WebView recreate). Telemetry hot path stays **mutable ref + rAF** (no React state @ 30 Hz).

**Tech Stack:** Go 1.25+, Wails v3 alpha, React 19, TypeScript, Tailwind v4, Vitest

**Prerequisites:** Fase 3 ✅ — `cmd/vantare`, telemetry bridge, `configs/example-racing.json` stub, live LMU validated.

**References:** `docs/V2-STACK-AND-PERFORMANCE.md` §5.6–5.7, §8.5–8.8, §12.3 · `docs/V2-MASTER-PLAN.md` Fase 4 · v1 widgets (visual reference only): `apps/desktop/src/renderer/bundles/default/{delta,relative,standings}/`

---

## File map (target tree)

```
vantare-v2/
├── configs/
│   ├── example-racing.json          # 3 widgets, displayMode racing
│   └── example-edit.json            # same layout, displayMode edit
├── pkg/config/
│   ├── profile.go                   # ProfileConfig, WidgetConfig structs + JSON
│   └── profile_test.go
├── internal/window/
│   ├── bounds.go                    # shrink-wrap Rect from enabled widgets
│   ├── bounds_test.go
│   └── manager.go                   # ApplyMode(racing|edit), ApplyBounds, click-through
├── internal/app/
│   ├── profile_service.go           # Load/Save, Wails RegisterService
│   └── profile_service_test.go
├── cmd/vantare/main.go              # -profile, -edit flags, window manager wire
├── frontend/src/
│   ├── lib/
│   │   ├── telemetry-ref.ts         # + vehicles, session, deltaBest
│   │   ├── telemetry-ref.test.ts
│   │   ├── profile.ts               # types mirroring Go JSON
│   │   └── profile.test.ts
│   ├── overlay/
│   │   ├── CompositeApp.tsx         # layout shell, mode switch
│   │   ├── WidgetHost.tsx           # absolute position + optional drag
│   │   └── widgets/
│   │       ├── DeltaWidget.tsx
│   │       ├── RelativeWidget.tsx
│   │       └── StandingsWidget.tsx
│   └── main.tsx                     # mount CompositeApp
└── README.md                        # Fase 4 section
```

---

### Task 1: Profile schema (Go)

**Files:**
- Create: `pkg/config/profile.go`, `pkg/config/profile_test.go`
- Modify: `configs/example-racing.json` (add standings widget)

- [ ] **Step 1: Write failing tests**

```go
// pkg/config/profile_test.go
func TestLoadExampleRacing(t *testing.T) {
    p, err := config.LoadFile("configs/example-racing.json")
    if err != nil { t.Fatal(err) }
    if p.DisplayMode != config.ModeRacing { t.Fatalf("mode %q", p.DisplayMode) }
    if len(p.Widgets) < 2 { t.Fatal("expected widgets") }
}

func TestBoundsPadding(t *testing.T) {
    p := &config.ProfileConfig{Widgets: []config.WidgetConfig{
        {Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
        {Enabled: true, Position: config.Rect{X: 40, Y: 600, W: 320, H: 280}},
    }}
    b := config.CompositeBounds(p, 8)
    if b.W != 460+8*2 { t.Fatalf("w=%d", b.W) } // maxX-minX+pad*2
}
```

- [ ] **Step 2: Implement structs**

```go
type DisplayMode string
const (
    ModeRacing DisplayMode = "racing"
    ModeEdit   DisplayMode = "edit"
    ModeStreaming DisplayMode = "streaming" // load-only in F4; no window in F6
)

type Rect struct {
    X, Y, W, H int `json:"x,y,w,h"` // separate json tags
}

type WidgetConfig struct {
    ID       string         `json:"id"`
    Type     string         `json:"type"` // delta|relative|standings
    Enabled  bool           `json:"enabled"`
    UpdateHz int            `json:"updateHz,omitempty"`
    Position Rect           `json:"position"`
    Props    map[string]any `json:"props,omitempty"`
}

type ProfileConfig struct {
    ID           string      `json:"id,omitempty"`
    Name         string      `json:"name,omitempty"`
    DisplayMode  DisplayMode `json:"displayMode"`
    MonitorIndex int         `json:"monitorIndex"`
    Widgets      []WidgetConfig `json:"widgets"`
}
```

- [ ] **Step 3: `LoadFile`, `SaveFile`, `CompositeBounds`**

- [ ] **Step 4: Run** `go test ./pkg/config/ -v` — PASS

- [ ] **Step 5: Update `configs/example-racing.json`**

Add standings widget + ensure 3 widgets:

```json
{
  "id": "default-racing",
  "name": "Default Racing",
  "displayMode": "racing",
  "monitorIndex": 0,
  "widgets": [
    { "id": "delta", "type": "delta", "enabled": true, "updateHz": 30,
      "position": { "x": 760, "y": 40, "w": 400, "h": 48 } },
    { "id": "relative", "type": "relative", "enabled": true, "updateHz": 15,
      "position": { "x": 40, "y": 600, "w": 320, "h": 280 },
      "props": { "rangeAhead": 3, "rangeBehind": 3 } },
    { "id": "standings", "type": "standings", "enabled": true, "updateHz": 15,
      "position": { "x": 1560, "y": 40, "w": 340, "h": 420 },
      "props": { "maxRows": 12 } }
  ]
}
```

---

### Task 2: Window bounds + mode manager (Go)

**Files:**
- Create: `internal/window/bounds.go`, `internal/window/manager.go`, tests

- [ ] **Step 1: Bounds unit tests** (empty widgets → min 200×80 fallback)

- [ ] **Step 2: `Manager` struct**

```go
type Manager struct {
    win *application.WebviewWindow
    pad int
}

func (m *Manager) ApplyProfile(p *config.ProfileConfig, skipRefresh bool) {
    switch p.DisplayMode {
    case config.ModeEdit:
        m.win.SetIgnoreMouseEvents(false)
        m.win.SetResizable(true)
        // fullscreen on target monitor — use SetBounds to monitor work area
        m.applyEditFullscreen(p.MonitorIndex)
    default: // racing
        m.win.SetIgnoreMouseEvents(true)
        m.win.SetResizable(false)
        m.applyShrinkWrap(p, skipRefresh)
    }
}
```

- [ ] **Step 3: Shrink-wrap**

Use `config.CompositeBounds` → `win.SetSize(w,h)` + `win.SetPosition(x,y)` on target monitor. Offset window origin so widget coords remain as in profile (store profile-space origin = bounds minX/minY).

**Coordinate model:** Profile positions are **virtual desktop coords** (like v1). Window top-left = `(minX - pad, minY - pad)`. Frontend renders widgets at `(widget.x - minX + pad, widget.y - minY + pad)` OR pass `layoutOrigin` in `profile:loaded` event.

Prefer emitting `profile:loaded` payload:

```json
{
  "profile": { ... },
  "layoutOrigin": { "x": 32, "y": 32 },
  "windowMode": "racing"
}
```

- [ ] **Step 4: `skipWindowRefresh`**

When `skipRefresh == true`: only `SetBounds` / `SetSize`+`SetPosition` — never `Close()` / recreate window.

- [ ] **Step 5:** `go test ./internal/window/ -v` — PASS

---

### Task 3: Profile Wails service + main wiring

**Files:**
- Create: `internal/app/profile_service.go`
- Modify: `cmd/vantare/main.go`

- [ ] **Step 1: ProfileService**

```go
type ProfileService struct {
    path    string
    profile *config.ProfileConfig
    mgr     *window.Manager
    emitter EventEmitter // reuse for profile:loaded, layout:saved
}

// Methods exposed to Wails (RegisterService):
func (s *ProfileService) GetProfile() *config.ProfileConfig
func (s *ProfileService) SaveLayout(widgets []config.WidgetConfig) error
func (s *ProfileService) SetDisplayMode(mode config.DisplayMode) error
```

`SaveLayout` updates in-memory profile, writes JSON file, calls `mgr.ApplyProfile(p, true)`.

- [ ] **Step 2: CLI flags**

```go
profilePath := flag.String("profile", "configs/example-racing.json", "profile JSON path")
edit := flag.Bool("edit", false, "force edit mode (overrides profile displayMode)")
```

- [ ] **Step 3: Startup sequence**

1. Load profile
2. If `-edit`, set `DisplayMode = edit`
3. Create Wails window (start fullscreen if edit, else provisional size)
4. `RegisterService(profileService)`
5. Emit `profile:loaded` with layoutOrigin
6. `mgr.ApplyProfile(profile, false)` after window shown

- [ ] **Step 4: Tests** with fake window interface (extract `WindowHandle` interface for test doubles)

- [ ] **Step 5:** `go test ./internal/app/ -v` — PASS

---

### Task 4: Extend telemetry ref (vehicles + delta)

**Files:**
- Modify: `frontend/src/lib/telemetry-ref.ts`, tests

- [ ] **Step 1: Extend types**

```typescript
export type VehicleScoring = {
  id: number;
  driverName?: string;
  place?: number;
  isPlayer?: boolean;
  timeBehindLeader?: number;
};

export type TelemetryRefState = {
  seq: number;
  connected: boolean;
  speed: number;
  gear: number;
  rpm: number;
  fuel: number;
  deltaBest: number;
  trackName: string;
  vehicles: VehicleScoring[];
};
```

- [ ] **Step 2: Apply snapshot + diff** for `vehicles`, `session.trackName`, `player.deltaBest`

- [ ] **Step 3: Vitest** — fixture payload from `testdata/lmu-fixture.json` shape (minimal slice)

- [ ] **Step 4:** `pnpm test` — PASS

---

### Task 5: Composite overlay shell

**Files:**
- Create: `frontend/src/lib/profile.ts`, `frontend/src/overlay/CompositeApp.tsx`, `WidgetHost.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Listen `profile:loaded`** via `@wailsio/runtime` Events

- [ ] **Step 2: `WidgetHost`**

Absolute `left/top/width/height` from profile positions minus `layoutOrigin`.

Edit mode: `pointer-events-auto`, drag handle → update local layout state @ 10 Hz max.

Racing mode: `pointer-events-none` on hosts (click-through handled by Go `SetIgnoreMouseEvents(true)`).

- [ ] **Step 3: Widget registry**

```typescript
const WIDGETS: Record<string, ComponentType<{ editMode: boolean }>> = {
  delta: DeltaWidget,
  relative: RelativeWidget,
  standings: StandingsWidget,
};
```

- [ ] **Step 4: Save layout (edit mode)**

On mouseup after drag → call Wails service `SaveLayout` (generated binding or `Call.ByName` per wails3 docs). Debounce 300 ms.

- [ ] **Step 5: Build** `pnpm run build` — no TS errors

---

### Task 6: Three widgets (MVP visuals)

**Design:** Tailwind only — no port of `@vantare/ui-core`. Direct DOM refs inside each widget where values change @ 15–30 Hz.

**Files:**
- Create: `frontend/src/overlay/widgets/DeltaWidget.tsx`
- Create: `frontend/src/overlay/widgets/RelativeWidget.tsx`
- Create: `frontend/src/overlay/widgets/StandingsWidget.tsx`
- Optional: `frontend/src/overlay/widgets/widgets.test.ts` (formatters)

#### DeltaWidget
- Shows `deltaBest` as `+0.123s` / `-0.045s` / `—`
- Bar fill proportional to |delta| (cap 5s)
- Color: green faster, red slower

#### RelativeWidget
- Sort vehicles by `place`
- Find player index; show `rangeAhead` + player + `rangeBehind` (from props, default 3)
- Columns: place, truncated name, gap (use `timeBehindLeader` delta between rows)

#### StandingsWidget
- Top `maxRows` (default 12) by place
- Highlight player row (`isPlayer`)
- Columns: P, name, gap to leader

- [ ] **Step 1–3:** Implement widgets
- [ ] **Step 4:** Manual smoke with mock + `-live`

---

### Task 7: Edit mode UX

- [ ] **Step 1:** `-edit` flag opens fullscreen transparent window, widgets draggable
- [ ] **Step 2:** Visual edit chrome — dashed border + widget id label (edit only)
- [ ] **Step 3:** `SaveLayout` persists to profile path; verify file on disk updated
- [ ] **Step 4:** Toggle test: edit → save → restart with racing profile → shrink-wrap bounds match 3 widgets
- [ ] **Step 5:** Confirm no WebView flash on save (skipWindowRefresh)

**Keyboard (optional):** `Ctrl+S` saves layout in edit mode.

---

### Task 8: Tests, docs, acceptance

- [ ] **Go:** `go test ./...` green
- [ ] **Frontend:** `pnpm test` + `pnpm run build` green
- [ ] **Manual racing:** `go run ./cmd/vantare -live -profile configs/example-racing.json`
  - Window shrink-wraps to widget bbox (not full screen)
  - Clicks pass through to sim
  - 3 widgets visible with live data
- [ ] **Manual edit:** `go run ./cmd/vantare -live -profile configs/example-racing.json -edit`
  - Drag widget → save → JSON updated
- [ ] Update `vantare-v2/README.md` Fase 4 section
- [ ] Update `.omo/plans/v2-f4-composite-layout.md` status

---

## Acceptance criteria (Fase 4)

- [ ] Profile JSON loads; example has delta + relative + standings
- [ ] Racing mode: shrink-wrap bounds + `SetIgnoreMouseEvents(true)`
- [ ] Edit mode: fullscreen + drag + persist positions
- [ ] `SaveLayout` resizes window only (`skipWindowRefresh`) — no recreate
- [ ] 3 widgets render from `vehicles` / `player.deltaBest` telemetry
- [ ] Hot telemetry path avoids React state @ 30 Hz (refs + rAF)
- [ ] `go test ./...` and `pnpm test` green

## Out of scope (Fase 5+)

- Hub dashboard / visual profile CRUD
- `streaming` mode + SSE (Fase 6)
- Theme tokens / F1 skin (Fase 8)
- Widget resize handles (drag move only in F4)
- Multi-monitor picker UI (use `monitorIndex` in JSON only)
- stream-alerts widget

---

## Self-review checklist

| Requirement | Task |
|-------------|------|
| Profile JSON schema | 1 |
| Shrink-wrap bounds | 1, 2 |
| racing / edit modes | 2, 3, 7 |
| skipWindowRefresh | 2, 3, 7 |
| 3 widgets | 6 |
| Telemetry vehicles in ref | 4 |
| Click-through racing | 2 |
| Tests | 1, 2, 4, 8 |

## Risks

| Riesgo | Mitigación |
|--------|------------|
| Wails v3 alpha API drift | Document exact methods used; interface wrapper for tests |
| DPI / multi-monitor coords | Test on primary monitor first; use `SetPhysicalBounds` if blurry |
| Edit drag vs click-through | Go ignores mouse in racing; CSS `pointer-events` in edit only |
| Standings perf @ 44 cars | rAF throttles per widget `updateHz`; direct DOM row updates |

## Execution handoff

Plan saved. Executor should implement **Tasks 1→8 in order**, running tests after Tasks 1, 2, 4, and full suite at Task 8.

Checkpoint reviews after Tasks 2, 5, and 7 recommended.
