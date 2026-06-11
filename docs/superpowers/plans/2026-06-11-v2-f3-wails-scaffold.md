# v2 Fase 3 — Wails Overlay Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap Wails v3 app in `vantare-v2/` with one transparent overlay window, React frontend, and live telemetry from `internal/telemetry/service` pushed via Wails events (full snapshot + JSON diff).

**Architecture:** `cmd/vantare/main.go` starts Wails + `service.Service` with `OpenLMUSource()` (fallback `FuncSource` mock if LMU offline). Go goroutine subscribes to `service.Subscribe()` and emits `telemetry:update` to all WebView windows. React overlay reads events into a **mutable ref** (not React state @ 30 Hz). Window: frameless, transparent, always-on-top — shrink-wrap bounds deferred to plan 3b.

**Tech Stack:** Go 1.22+, Wails v3, React 19, TypeScript, Vite 6, Tailwind v4 (minimal)

**Prerequisites:** Fase 2 complete — `normalizer`, `pipeline`, `service`, `diff`, `OpenLMUSource()`.

**References:** `docs/V2-STACK-AND-PERFORMANCE.md` §8, §9.4, `docs/V2-MASTER-PLAN.md` Fase 3

---

## File map (target tree)

```
vantare-v2/
├── cmd/vantare/main.go              # Wails entry + service lifecycle
├── internal/app/
│   ├── app.go                       # App struct, telemetry bridge
│   └── telemetry_bridge.go          # Subscribe → Wails emit
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── overlay/App.tsx          # overlay route
│   │   └── lib/telemetry-ref.ts     # mutable ref + Wails listener
│   └── wailsjs/                     # generated bindings (wails3 generate)
├── build/config.yml                 # Wails v3 project config (if CLI creates)
└── Taskfile.yml or README section   # dev commands
```

---

### Task 1: Wails v3 project init

**Files:**
- Create: `vantare-v2/cmd/vantare/main.go` (stub)
- Create: `vantare-v2/frontend/` via Wails CLI
- Modify: `vantare-v2/go.mod` (wails v3 dependency)

- [ ] **Step 1: Verify tooling**

Run:
```bash
go version
node -v
pnpm -v
```

Expected: Go 1.22+, Node 20+, pnpm available.

- [ ] **Step 2: Install Wails v3 CLI**

Run:
```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@latest
wails3 version
```

Expected: v3.x without error.

- [ ] **Step 3: Initialize frontend (manual if CLI differs)**

Run from `vantare-v2/`:
```bash
mkdir -p frontend/src/overlay frontend/src/lib
cd frontend
pnpm create vite . --template react-ts
pnpm install
pnpm add -D tailwindcss @tailwindcss/vite
```

Edit `frontend/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { strictPort: true, port: 5173 },
  build: { outDir: "dist", emptyOutDir: true },
});
```

Edit `frontend/src/main.tsx` — mount overlay only for MVP:
```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { OverlayApp } from "./overlay/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
```

- [ ] **Step 4: Add Wails to go.mod**

Run from `vantare-v2/`:
```bash
go get github.com/wailsapp/wails/v3@latest
go mod tidy
```

- [ ] **Step 5: Stub main.go**

Create `cmd/vantare/main.go`:
```go
package main

import "log"

func main() {
	log.Println("vantare: run wails3 dev after Task 2 app wiring")
}
```

Run: `go build -o bin/vantare ./cmd/vantare`
Expected: builds without error.

- [ ] **Step 6: Commit** (optional)

---

### Task 2: App struct + telemetry service lifecycle

**Files:**
- Create: `vantare-v2/internal/app/app.go`
- Create: `vantare-v2/internal/app/telemetry_bridge.go`
- Create: `vantare-v2/internal/app/app_test.go`
- Modify: `vantare-v2/cmd/vantare/main.go`

- [ ] **Step 1: Write failing test for source selection**

`internal/app/app_test.go`:
```go
package app_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

func TestNewTelemetryServiceMockFallback(t *testing.T) {
	svc := app.NewTelemetryService(false)
	if svc == nil {
		t.Fatal("expected service")
	}
}

func TestNewTelemetryServiceUsesMockSource(t *testing.T) {
	svc := app.NewTelemetryService(false)
	// smoke: service should accept synthetic reads via internal mock source
	_ = lmu.BuildSyntheticBuffer()
	_ = svc
}
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `go test ./internal/app/ -run NewTelemetry -v`

- [ ] **Step 3: Implement app.go**

```go
package app

import (
	"context"
	"sync"

	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

type App struct {
	Telemetry *service.Service
	lmuSource *service.LMUSource
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

// NewTelemetryService builds a running telemetry pipeline.
// live=true attempts OpenLMUSource; falls back to synthetic buffer on error.
func NewTelemetryService(live bool) *service.Service {
	var src service.Source
	var lmuSrc *service.LMUSource
	if live {
		if s, err := service.OpenLMUSource(); err == nil {
			lmuSrc = s
			src = s
		}
	}
	if src == nil {
		buf := lmu.BuildSyntheticBuffer()
		src = service.FuncSource(func() []byte { return buf })
	}
	return service.New(service.Config{
		ReadHz: 60,
		EmitHz: 30,
		Source: src,
	})
}

func (a *App) StartTelemetry(ctx context.Context) {
	if a.Telemetry == nil {
		return
	}
	runCtx, cancel := context.WithCancel(ctx)
	a.cancel = cancel
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		_ = a.Telemetry.Run(runCtx)
	}()
}

func (a *App) StopTelemetry() {
	if a.cancel != nil {
		a.cancel()
	}
	a.wg.Wait()
	if a.lmuSource != nil {
		_ = a.lmuSource.Close()
	}
}
```

Adjust `NewTelemetryService` to return `*App` wrapping service — refactor test accordingly:

```go
func New(useLiveLMU bool) *App {
	svc := /* as above */
	return &App{Telemetry: svc, lmuSource: lmuSrc}
}
```

- [ ] **Step 4: Run tests — PASS**

Run: `go test ./internal/app/ -v`

---

### Task 3: Telemetry bridge → Wails events

**Files:**
- Modify: `internal/app/telemetry_bridge.go`
- Modify: `internal/app/app.go`
- Test: `internal/app/telemetry_bridge_test.go`

- [ ] **Step 1: Define event emitter interface (testable)**

```go
package app

import (
	"encoding/json"

	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

type EventEmitter interface {
	Emit(name string, data []byte)
}

type TelemetryBridge struct {
	svc      *service.Service
	emitter  EventEmitter
	unsub    func()
}

func NewTelemetryBridge(svc *service.Service, emitter EventEmitter) *TelemetryBridge {
	return &TelemetryBridge{svc: svc, emitter: emitter}
}

func (b *TelemetryBridge) Start() {
	ch, unsub := b.svc.Subscribe()
	b.unsub = unsub
	go func() {
		for upd := range ch {
			payload, err := json.Marshal(map[string]any{
				"seq":      upd.Seq,
				"snapshot": upd.Snapshot,
				"diff":     upd.Diff,
			})
			if err != nil {
				continue
			}
			b.emitter.Emit("telemetry:update", payload)
		}
	}()
}

func (b *TelemetryBridge) Stop() {
	if b.unsub != nil {
		b.unsub()
	}
}
```

- [ ] **Step 2: Write test with fake emitter**

```go
type fakeEmitter struct {
	events []string
}

func (f *fakeEmitter) Emit(name string, data []byte) {
	f.events = append(f.events, name)
}

func TestTelemetryBridgeEmits(t *testing.T) {
	svc := app.New(false).Telemetry // or helper
	fe := &fakeEmitter{}
	bridge := app.NewTelemetryBridge(svc, fe)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go svc.Run(ctx)
	bridge.Start()
	time.Sleep(100 * time.Millisecond)
	bridge.Stop()
	cancel()
	if len(fe.events) == 0 {
		t.Fatal("expected at least one telemetry event")
	}
}
```

- [ ] **Step 3: Run test — PASS**

Run: `go test ./internal/app/ -run Bridge -v`

---

### Task 4: Wails window + main entry

**Files:**
- Modify: `cmd/vantare/main.go`
- Create: Wails config per v3 docs

- [ ] **Step 1: Wire Wails application**

Implement `main.go` using Wails v3 application API (adjust to installed version):

```go
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type wailsEmitter struct {
	app *application.App
}

func (w *wailsEmitter) Emit(name string, data []byte) {
	w.app.Event.Emit(name, string(data))
}

func main() {
	vapp := app.New(false) // --live flag in Task 5
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	wailsApp := application.New(application.Options{
		Name: "Vantare Overlays",
		Assets: application.AssetOptions{
			Handler: application.BundledAssetHandler("frontend/dist"),
		},
	})

	bridge := app.NewTelemetryBridge(vapp.Telemetry, &wailsEmitter{app: wailsApp})
	vapp.StartTelemetry(ctx)
	bridge.Start()
	defer bridge.Stop()
	defer vapp.StopTelemetry()

	wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Vantare Overlay",
		Width:  400,
		Height: 120,
		Frameless: true,
		BackgroundType: application.BackgroundTypeTransparent,
		AlwaysOnTop: true,
		URL: "/",
	})

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
```

**Note:** Exact Wails v3 API may differ — consult `wails3 docs` and Sprint reference. Adjust imports/options to match installed version; document deviations in PR notes.

- [ ] **Step 2: Build frontend**

```bash
cd vantare-v2/frontend && pnpm run build
```

- [ ] **Step 3: Run dev**

```bash
cd vantare-v2
wails3 dev
```

Expected: transparent window opens, no crash.

- [ ] **Step 4: Manual smoke**

Window visible on desktop. Check devtools console for Wails runtime loaded.

---

### Task 5: React overlay — telemetry ref (no 30 Hz state)

**Files:**
- Create: `frontend/src/lib/telemetry-ref.ts`
- Create: `frontend/src/overlay/App.tsx`
- Create: `frontend/src/index.css` (Tailwind)

- [ ] **Step 1: telemetry-ref.ts**

```typescript
export type PlayerDiff = {
  speed?: number;
  rpm?: number;
  gear?: number;
  fuel?: number;
};

export type TelemetryPayload = {
  seq: number;
  snapshot: {
    connected: boolean;
    player?: { speed: number; gear: number; engineRPM: number; fuel: number };
  };
  diff?: { t: number; d: Record<string, unknown> };
};

const state = {
  seq: 0,
  speed: 0,
  gear: 0,
  rpm: 0,
  fuel: 0,
};

export function getTelemetryRef() {
  return state;
}

export function applyTelemetryUpdate(payload: TelemetryPayload) {
  state.seq = payload.seq;
  const p = payload.snapshot.player;
  if (p) {
    state.speed = p.speed;
    state.gear = p.gear;
    state.rpm = p.engineRPM;
    state.fuel = p.fuel;
  }
  const pd = payload.diff?.d?.player as PlayerDiff | undefined;
  if (pd?.speed != null) state.speed = pd.speed;
  if (pd?.rpm != null) state.rpm = pd.rpm;
  if (pd?.gear != null) state.gear = pd.gear;
  if (pd?.fuel != null) state.fuel = pd.fuel;
}
```

- [ ] **Step 2: App.tsx — rAF display loop**

```tsx
import { useEffect, useRef } from "react";
import { applyTelemetryUpdate, getTelemetryRef } from "../lib/telemetry-ref";

export function OverlayApp() {
  const speedRef = useRef<HTMLSpanElement>(null);
  const gearRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // @ts-expect-error Wails runtime
    const off = window.runtime?.EventsOn?.("telemetry:update", (raw: string) => {
      applyTelemetryUpdate(JSON.parse(raw));
    });
    let id = 0;
    const tick = () => {
      const t = getTelemetryRef();
      if (speedRef.current) speedRef.current.textContent = `${(t.speed * 3.6).toFixed(0)} km/h`;
      if (gearRef.current) gearRef.current.textContent = String(t.gear);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      off?.();
    };
  }, []);

  return (
    <div className="rounded-lg bg-black/60 px-4 py-2 font-mono text-white backdrop-blur-sm">
      <span ref={speedRef}>0 km/h</span>
      <span className="mx-2 text-white/40">|</span>
      <span ref={gearRef}>N</span>
    </div>
  );
}
```

- [ ] **Step 3: Build + run — verify speed/gear update with mock telemetry**

Expected: values change (mock synthetic) without React re-render storm (only rAF DOM writes).

---

### Task 6: CLI flags + README

**Files:**
- Modify: `cmd/vantare/main.go` — `-live` flag
- Modify: `vantare-v2/README.md`

- [ ] **Step 1: Add `-live` flag**

```go
live := flag.Bool("live", false, "use LMU shared memory (fallback mock)")
flag.Parse()
vapp := app.New(*live)
```

- [ ] **Step 2: Document dev loop**

Add to `vantare-v2/README.md`:
```markdown
## Wails overlay (Fase 3)

pnpm --dir frontend install
pnpm --dir frontend build
go run ./cmd/vantare              # mock telemetry
go run ./cmd/vantare -live        # LMU must be running
wails3 dev                        # hot reload
```

- [ ] **Step 3: Acceptance checklist**

- [ ] Window: frameless + transparent
- [ ] Telemetry visible (speed + gear)
- [ ] Task Manager RAM < 120 MB (stretch < 80 MB with one widget — note actual)
- [ ] `go test ./...` still PASS

---

## Acceptance criteria (Fase 3 MVP)

- [ ] `cmd/vantare` starts Wails overlay window
- [ ] Telemetry flows: `LMUSource/mock → service → bridge → telemetry:update → DOM ref`
- [ ] React does NOT `useState` on speed/rpm at 30 Hz
- [ ] `-live` flag uses `OpenLMUSource()` with mock fallback
- [ ] `go test ./...` green (Go packages)

## Out of scope (Fase 3b / Fase 4)

- Shrink-wrap window bounds from widget layout
- Hub window, profile JSON, multi-widget composite
- HTTP SSE / OBS mode
- Click-through racing mode

---

## Self-review checklist

| Requirement | Task |
|-------------|------|
| Wails v3 shell | 1, 4 |
| Service wired | 2, 3 |
| Live LMU source | 2 (`OpenLMUSource`) |
| Diff payload to frontend | 3 (JSON includes diff) |
| DOM direct hot path | 5 |
| Transparent overlay | 4 |

## Execution handoff

Plan saved. Two execution options:

1. **Subagent-Driven** — one task per subagent, review between tasks
2. **Inline** — single session with checkpoints after Tasks 2, 4, 6

Which approach?
