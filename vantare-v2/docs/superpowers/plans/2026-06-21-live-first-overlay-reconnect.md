> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# Live-First Overlay Reconnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Abrir overlay` explicitly try to connect to LMU at that moment, while keeping mock telemetry as a visual fallback when LMU is unavailable.

**Architecture:** Keep the app live-first by default. Introduce a small telemetry source manager in `internal/app` that owns "live intent + fallback mock" behavior, exposes source status, and can be asked to retry LMU before an overlay opens. Wire `overlay:start` through that retry path without changing `WidgetStudio`/`LayoutStudio` responsibilities.

**Tech Stack:** Go 1.25, Wails v3 events, React/TypeScript frontend, existing telemetry service/source abstractions.

---

## Context

The user confirmed manual verification is good and chose approach C:
- The normal product behavior should be live-first.
- Mock data should remain available as fallback so users can test how overlays look.
- The app must try connecting to LMU when the user clicks `Abrir overlay`, not only when Vantare starts.

Current relevant behavior:
- `cmd/vantare/main.go` defaults `-live=true`.
- `internal/app/app.go` calls `app.New(*live)` once at startup.
- `internal/telemetry/service/source_lmu.go` already retries late inside `LMUSource.Read()` if the reader is nil.
- If app startup creates a mock source, `overlay:start` currently does not switch back to live.
- `overlay:start` is handled in `cmd/vantare/main.go` and calls `hubSvc.StartOverlay(target)`.
- `HubService.StartOverlay` loads profile and creates overlay runtime.

Important product boundary:
- `WidgetStudio` remains appearance/data only.
- `LayoutStudio` remains position/size/layout only.
- This plan must not redesign Overlays Studio UI beyond a small source-status indicator if needed.

## File Structure

Modify:
- `internal/app/app.go`
  - Replace direct source ownership with a focused manager.
  - Add `EnsureLiveTelemetry()` and `SourceInfo()` delegation.
- `internal/app/telemetry_source_manager.go`
  - New file. Owns live-first source selection, mock fallback, and explicit reconnect attempts.
- `internal/app/telemetry_source_manager_test.go`
  - New unit tests for startup fallback, reconnect success, and mock fallback.
- `internal/app/app_test.go`
  - Update existing tests that assert one startup open call.
- `cmd/vantare/main.go`
  - Call `vapp.EnsureLiveTelemetry()` inside `overlay:start` before `hubSvc.StartOverlay(target)`.
  - Emit source status after explicit reconnect attempt.
- `docs/current-plan.md`
  - Add a short status note after implementation only.

Optional only if UI status is already easy to wire:
- `frontend/src/hub/components/Topbar.tsx`
- `frontend/src/hub/HubApp.tsx`
  - Show clearer source status labels if backend emits a status event.

Do not modify:
- `WidgetStudio` behavior.
- `LayoutStudio` responsibilities.
- Profile JSON schema.
- Overlay widget rendering.
- Build/package configuration.

## Task 1: Add Telemetry Source Manager

**Files:**
- Create: `internal/app/telemetry_source_manager.go`
- Create: `internal/app/telemetry_source_manager_test.go`

- [ ] **Step 1: Write failing tests for live-first fallback and explicit reconnect**

Create `internal/app/telemetry_source_manager_test.go`:

```go
package app

import (
	"errors"
	"sync/atomic"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

type stubSource struct {
	info service.SourceInfo
}

func (s stubSource) Read() []byte { return nil }
func (s stubSource) Info() service.SourceInfo {
	return s.info
}

func TestTelemetrySourceManagerUsesMockWhenLiveUnavailable(t *testing.T) {
	var calls int32
	mgr := NewTelemetrySourceManager(TelemetrySourceManagerConfig{
		UseLive: true,
		OpenLive: func() (service.Source, error) {
			atomic.AddInt32(&calls, 1)
			return nil, errors.New("lmu unavailable")
		},
		Mock: stubSource{info: service.SourceInfo{
			Kind:      service.SimulatorMock,
			Name:      "Mock telemetry",
			Live:      false,
			Available: true,
		}},
	})

	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("startup open calls=%d, want 1", got)
	}
	info := mgr.Info()
	if info.Kind != service.SimulatorMock || info.Live {
		t.Fatalf("info=%+v, want mock fallback", info)
	}
}

func TestTelemetrySourceManagerReconnectsToLiveOnEnsure(t *testing.T) {
	var calls int32
	liveSource := stubSource{info: service.SourceInfo{
		Kind:      service.SimulatorLMU,
		Name:      "Le Mans Ultimate",
		Live:      true,
		Available: true,
	}}
	mgr := NewTelemetrySourceManager(TelemetrySourceManagerConfig{
		UseLive: true,
		OpenLive: func() (service.Source, error) {
			call := atomic.AddInt32(&calls, 1)
			if call == 1 {
				return nil, errors.New("lmu unavailable")
			}
			return liveSource, nil
		},
		Mock: stubSource{info: service.SourceInfo{
			Kind:      service.SimulatorMock,
			Name:      "Mock telemetry",
			Live:      false,
			Available: true,
		}},
	})

	if err := mgr.EnsureLive(); err != nil {
		t.Fatalf("EnsureLive() error=%v", err)
	}
	info := mgr.Info()
	if info.Kind != service.SimulatorLMU || !info.Live || !info.Available {
		t.Fatalf("info=%+v, want live LMU", info)
	}
	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Fatalf("open calls=%d, want 2", got)
	}
}

func TestTelemetrySourceManagerKeepsMockWhenEnsureLiveFails(t *testing.T) {
	mgr := NewTelemetrySourceManager(TelemetrySourceManagerConfig{
		UseLive: true,
		OpenLive: func() (service.Source, error) {
			return nil, errors.New("lmu unavailable")
		},
		Mock: stubSource{info: service.SourceInfo{
			Kind:      service.SimulatorMock,
			Name:      "Mock telemetry",
			Live:      false,
			Available: true,
		}},
	})

	if err := mgr.EnsureLive(); err == nil {
		t.Fatal("EnsureLive() error=nil, want error while fallback remains active")
	}
	info := mgr.Info()
	if info.Kind != service.SimulatorMock || info.Live {
		t.Fatalf("info=%+v, want mock fallback", info)
	}
}
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
go test ./internal/app -run TestTelemetrySourceManager
```

Expected:
- FAIL because `NewTelemetrySourceManager` and `TelemetrySourceManagerConfig` do not exist.

- [ ] **Step 3: Implement the manager**

Create `internal/app/telemetry_source_manager.go`:

```go
package app

import (
	"fmt"
	"sync"

	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

type TelemetrySourceManagerConfig struct {
	UseLive  bool
	OpenLive func() (service.Source, error)
	Mock     service.Source
}

type TelemetrySourceManager struct {
	mu       sync.RWMutex
	useLive  bool
	openLive func() (service.Source, error)
	mock     service.Source
	current  service.Source
}

func NewTelemetrySourceManager(cfg TelemetrySourceManagerConfig) *TelemetrySourceManager {
	m := &TelemetrySourceManager{
		useLive:  cfg.UseLive,
		openLive: cfg.OpenLive,
		mock:     cfg.Mock,
		current:  cfg.Mock,
	}
	if m.current == nil {
		m.current = createMockSource()
	}
	if m.useLive {
		_ = m.tryLiveLocked()
	}
	return m
}

func (m *TelemetrySourceManager) Source() service.Source {
	if m == nil {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.current
}

func (m *TelemetrySourceManager) Read() []byte {
	src := m.Source()
	if src == nil {
		return nil
	}
	return src.Read()
}

func (m *TelemetrySourceManager) Info() service.SourceInfo {
	return service.InfoForSource(m.Source())
}

func (m *TelemetrySourceManager) EnsureLive() error {
	if m == nil {
		return fmt.Errorf("telemetry source manager is nil")
	}
	if !m.useLive {
		return nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.tryLiveLocked()
}

func (m *TelemetrySourceManager) tryLiveLocked() error {
	if m.openLive == nil {
		return fmt.Errorf("live telemetry opener is not configured")
	}
	src, err := m.openLive()
	if err != nil {
		if m.current == nil {
			m.current = m.mock
		}
		return err
	}
	if src == nil {
		return fmt.Errorf("live telemetry opener returned nil source")
	}
	if m.current != src {
		closeSource(m.current)
	}
	m.current = src
	return nil
}

func (m *TelemetrySourceManager) Close() {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	closeSource(m.current)
	m.current = nil
}

func closeSource(src service.Source) {
	if closer, ok := src.(interface{ Close() error }); ok {
		_ = closer.Close()
	}
}
```

- [ ] **Step 4: Run manager tests**

Run:

```powershell
go test ./internal/app -run TestTelemetrySourceManager
```

Expected:
- PASS.

## Task 2: Wire App to the Manager

**Files:**
- Modify: `internal/app/app.go`
- Modify: `internal/app/app_test.go`

- [ ] **Step 1: Write failing app-level reconnect test**

Append to `internal/app/app_test.go`:

```go
func TestAppEnsureLiveTelemetryRetriesAfterStartupFallback(t *testing.T) {
	t.Cleanup(func() { app.SetOpenLMUSource(service.OpenLMUSource) })

	var calls int32
	app.SetOpenLMUSource(func() (*service.LMUSource, error) {
		call := atomic.AddInt32(&calls, 1)
		if call == 1 {
			return nil, errors.New("lmu unavailable")
		}
		return &service.LMUSource{}, nil
	})

	a := app.New(true)
	if err := a.EnsureLiveTelemetry(); err != nil {
		t.Fatalf("EnsureLiveTelemetry() error=%v", err)
	}
	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Fatalf("OpenLMUSource calls=%d, want 2", got)
	}
}
```

- [ ] **Step 2: Run failing app test**

Run:

```powershell
go test ./internal/app -run TestAppEnsureLiveTelemetryRetriesAfterStartupFallback
```

Expected:
- FAIL because `EnsureLiveTelemetry` does not exist.

- [ ] **Step 3: Modify `internal/app/app.go`**

Change the `App` struct and `New` function to use the manager. The resulting relevant sections should look like this:

```go
type App struct {
	Telemetry *service.Service
	sources   *TelemetrySourceManager
	lmuSource *service.LMUSource
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}
```

Replace the source selection block inside `New(useLiveLMU bool)` with:

```go
	manager := NewTelemetrySourceManager(TelemetrySourceManagerConfig{
	UseLive: useLiveLMU,
	OpenLive: func() (service.Source, error) {
		s, err := openLMUSource()
		if err != nil {
			log.Printf("warning: live LMU source unavailable: %v (falling back to mock)", err)
			return nil, err
		}
		lmuSrc = s
		log.Printf("live LMU source opened")
		return wrapLMUSourceWithREST(s), nil
	},
	Mock: createMockSource(),
})

svc := service.New(service.Config{
	ReadHz: 60,
	EmitHz: 30,
	Source: manager,
})

return &App{Telemetry: svc, sources: manager, lmuSource: lmuSrc}
```

Add these methods:

```go
func (a *App) EnsureLiveTelemetry() error {
	if a == nil || a.sources == nil {
		return nil
	}
	return a.sources.EnsureLive()
}
```

Update `StopTelemetry()` to close through the manager:

```go
func (a *App) StopTelemetry() {
	if a.cancel != nil {
		a.cancel()
	}
	a.wg.Wait()
	if a.sources != nil {
		a.sources.Close()
	}
}
```

Update `TelemetrySource()` so status readers see the manager, not a stale startup source:

```go
func (a *App) TelemetrySource() service.Source {
	if a == nil || a.sources == nil {
		return nil
	}
	return a.sources
}
```

Update `SourceInfo()`:

```go
func (a *App) SourceInfo() service.SourceInfo {
	if a == nil || a.sources == nil {
		return service.SourceInfo{Kind: service.SimulatorUnknown, Name: "No source", Live: false, Available: false}
	}
	return a.sources.Info()
}
```

- [ ] **Step 4: Run app tests**

Run:

```powershell
go test ./internal/app -run "TestNew|TestApp"
```

Expected:
- PASS.

## Task 3: Retry LMU on `overlay:start`

**Files:**
- Modify: `cmd/vantare/main.go`

- [ ] **Step 1: Add explicit reconnect before overlay start**

Find the existing `overlay:start` handler in `cmd/vantare/main.go`:

```go
wailsApp.Event.On("overlay:start", func(event *application.CustomEvent) {
	target := readProfileTarget(event)
	_, err := hubSvc.StartOverlay(target)
	if err != nil {
		log.Printf("overlay:start error: %v", err)
		emitHubError(err.Error())
		return
	}
})
```

Replace it with:

```go
wailsApp.Event.On("overlay:start", func(event *application.CustomEvent) {
	target := readProfileTarget(event)
	if err := vapp.EnsureLiveTelemetry(); err != nil {
		log.Printf("overlay:start live telemetry unavailable, using fallback: %v", err)
	}
	emitter.Emit("telemetry:source-status", vapp.SourceInfo())

	_, err := hubSvc.StartOverlay(target)
	if err != nil {
		log.Printf("overlay:start error: %v", err)
		emitHubError(err.Error())
		return
	}
})
```

This keeps mock fallback usable. A failed reconnect logs the issue and updates status, but does not block the overlay window.

- [ ] **Step 2: Run Go tests**

Run:

```powershell
go test ./...
```

Expected:
- PASS.

## Task 4: Optional Source Status UI

**Files:**
- Modify: `frontend/src/hub/HubApp.tsx`
- Modify: `frontend/src/hub/components/Topbar.tsx`
- Test: existing frontend tests if affected.

Only do this task if the worker can keep it small. If it grows beyond two files plus tests, stop and ask for a separate UI plan.

- [ ] **Step 1: Add source status type in `HubApp.tsx`**

Add local type:

```ts
type SourceStatus = {
  kind: string;
  name: string;
  live: boolean;
  available: boolean;
};
```

Add state:

```ts
const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
```

Inside the existing `useEffect`, subscribe:

```ts
const unsubSource = Events.On('telemetry:source-status', (event: { data: SourceStatus }) => {
  setSourceStatus(event.data);
});
```

Cleanup:

```ts
unsubSource?.();
```

Pass to topbar:

```tsx
<Topbar activeSection={section} onNavigate={handleNavigate} version={version} sourceStatus={sourceStatus} />
```

- [ ] **Step 2: Update `Topbar.tsx` props**

Add prop:

```ts
sourceStatus?: {
  kind: string;
  name: string;
  live: boolean;
  available: boolean;
} | null;
```

Derive label:

```ts
const sourceLabel = sourceStatus?.live
  ? sourceStatus.available
    ? 'LMU conectado'
    : 'Esperando LMU'
  : 'Mock';
```

Render that label where current live/lite indicator is shown. Do not redesign navigation.

- [ ] **Step 3: Run frontend checks**

Run:

```powershell
pnpm --dir frontend test -- HubApp.test.tsx Topbar.test.tsx
pnpm --dir frontend build
```

Expected:
- PASS. If those exact test files do not exist, run:

```powershell
pnpm --dir frontend test
pnpm --dir frontend build
```

## Task 5: Documentation and Verification

**Files:**
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Update current plan**

Add this bullet under the current status section:

```markdown
Reconexión live-first aprobada para overlays:
- Al pulsar `Abrir overlay`, la app intenta reconectar con LMU antes de abrir la ventana.
- Si LMU no está disponible, el overlay sigue abriendo con datos mock como fallback visual.
- `-live=false` queda como modo explícito de desarrollo/testing.
```

- [ ] **Step 2: Run final checks**

Run:

```powershell
go test ./...
pnpm --dir frontend test
pnpm --dir frontend build
```

Expected:
- PASS.

- [ ] **Step 3: Manual verification**

Run:

```powershell
go run ./cmd/vantare -live=true -profile configs/example-racing.json
```

Manual steps:
1. Start Vantare while LMU is closed.
2. Go to `Overlays Studio > Mis perfiles`.
3. Click `Abrir overlay`.
4. Confirm overlay opens with mock/fallback data and app does not error.
5. Close overlay.
6. Start LMU and enter a session where shared memory is available.
7. Click `Abrir overlay` again.
8. Confirm logs show LMU live source attached or source status shows `LMU conectado`.
9. Confirm overlay data updates from live source.
10. Stop overlay from UI and confirm it closes cleanly.

## Self-Review

Spec coverage:
- Live-first default: covered by manager and existing `-live=true` default.
- Explicit retry on `Abrir overlay`: covered by Task 3.
- Mock fallback when LMU unavailable: covered by Task 1 and manual verification.
- No WidgetStudio/LayoutStudio responsibility drift: explicitly excluded.
- Tests and docs: covered by Tasks 1, 2, 5.

Placeholder scan:
- No `TBD`, `TODO`, or unspecified implementation steps remain.

Type consistency:
- `TelemetrySourceManagerConfig`, `NewTelemetrySourceManager`, `EnsureLive`, `EnsureLiveTelemetry`, and `telemetry:source-status` are named consistently across tasks.
