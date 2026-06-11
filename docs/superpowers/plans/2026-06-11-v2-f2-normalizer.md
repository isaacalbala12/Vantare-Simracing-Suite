# v2 Fase 2 — Normalizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `internal/telemetry/normalizer` — converts raw LMU mmap bytes into a stable `*models.Telemetry` snapshot for downstream deadband/broadcast.

**Architecture:** Normalizer wraps `lmu.Parse(ParseFull)` and applies light stabilization (connected flag, vehicle slice trim, string trim). No deadband or throttling here — that is plan 2/3. Parser stays offset-only; normalizer owns “business-ready” snapshot shape.

**Tech Stack:** Go 1.22+, existing `internal/telemetry/lmu`, `pkg/models`

**References:** `docs/V2-STACK-AND-PERFORMANCE.md` §3.2, `vantare-v2/internal/telemetry/lmu/parser.go`, `vantare-v2/pkg/models/telemetry.go`

---

## File map

| File | Responsibility |
|------|----------------|
| `internal/telemetry/normalizer/normalizer.go` | `Normalizer` type + `FromBuffer` |
| `internal/telemetry/normalizer/normalizer_test.go` | Synthetic + fixture tests |
| `internal/telemetry/normalizer/doc.go` | Package doc comment |

---

### Task 1: Package scaffold + disconnected snapshot

**Files:**
- Create: `vantare-v2/internal/telemetry/normalizer/doc.go`
- Create: `vantare-v2/internal/telemetry/normalizer/normalizer.go`
- Create: `vantare-v2/internal/telemetry/normalizer/normalizer_test.go`

- [ ] **Step 1: Write the failing test**

```go
package normalizer_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/normalizer"
)

func TestFromBufferTooShort(t *testing.T) {
	n := normalizer.New()
	out := n.FromBuffer([]byte{1, 2, 3})
	if out == nil {
		t.Fatal("expected non-nil disconnected snapshot")
	}
	if out.Connected {
		t.Fatal("expected Connected=false for short buffer")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd vantare-v2 && go test ./internal/telemetry/normalizer/ -run FromBufferTooShort -v`

Expected: FAIL — package or `New` not found

- [ ] **Step 3: Write minimal implementation**

`doc.go`:
```go
// Package normalizer converts raw sim memory into stable Telemetry snapshots.
package normalizer
```

`normalizer.go`:
```go
package normalizer

import (
	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/pkg/models"
)

type Normalizer struct{}

func New() *Normalizer {
	return &Normalizer{}
}

func disconnected() *models.Telemetry {
	return &models.Telemetry{Connected: false}
}

func (n *Normalizer) FromBuffer(buf []byte) *models.Telemetry {
	if len(buf) < lmu.ObjectOutSize {
		return disconnected()
	}
	parsed := lmu.Parse(buf, lmu.ParseFull)
	if parsed == nil {
		return disconnected()
	}
	parsed.Connected = true
	n.stabilize(parsed)
	return parsed
}

func (n *Normalizer) stabilize(t *models.Telemetry) {
	if t.Session != nil && t.Session.TrackName != "" {
		t.Session.TrackName = trimNull(t.Session.TrackName)
	}
	if t.Session != nil && t.Session.PlayerName != "" {
		t.Session.PlayerName = trimNull(t.Session.PlayerName)
	}
	if t.Player != nil {
		t.Player.VehicleName = trimNull(t.Player.VehicleName)
		t.Player.TrackName = trimNull(t.Player.TrackName)
	}
	for i := range t.Vehicles {
		t.Vehicles[i].DriverName = trimNull(t.Vehicles[i].DriverName)
		t.Vehicles[i].VehicleClass = trimNull(t.Vehicles[i].VehicleClass)
	}
	if t.Session != nil {
		max := int(t.Session.NumVehicles)
		if max >= 0 && max < len(t.Vehicles) {
			t.Vehicles = t.Vehicles[:max]
		}
	}
}

func trimNull(s string) string {
	for i, r := range s {
		if r == 0 {
			return s[:i]
		}
	}
	return s
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd vantare-v2 && go test ./internal/telemetry/normalizer/ -run FromBufferTooShort -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add vantare-v2/internal/telemetry/normalizer/
git commit -m "feat(v2): add telemetry normalizer scaffold"
```

---

### Task 2: Synthetic buffer integration

**Files:**
- Modify: `vantare-v2/internal/telemetry/normalizer/normalizer_test.go`

- [ ] **Step 1: Write the failing test**

Add to `normalizer_test.go`:
```go
import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/normalizer"
)

func TestFromBufferSynthetic(t *testing.T) {
	n := normalizer.New()
	buf := lmu.BuildSyntheticBuffer()
	out := n.FromBuffer(buf)

	if !out.Connected {
		t.Fatal("expected connected")
	}
	if out.Session == nil || out.Session.TrackName != "Spa" {
		t.Fatalf("track: got %v", out.Session)
	}
	if out.Player == nil {
		t.Fatal("expected player")
	}
	if math.Abs(out.Player.Speed-15) > 0.01 {
		t.Fatalf("speed: got %v", out.Player.Speed)
	}
	if out.Player.Gear != 4 {
		t.Fatalf("gear: got %d", out.Player.Gear)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd vantare-v2 && go test ./internal/telemetry/normalizer/ -run FromBufferSynthetic -v`

Expected: PASS (implementation from Task 1 should already pass — if PASS, skip to Step 4)

- [ ] **Step 3: Fix stabilize if test fails**

Only change code if Step 2 fails.

- [ ] **Step 4: Run full package tests**

Run: `cd vantare-v2 && go test ./internal/telemetry/normalizer/ -v`

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add vantare-v2/internal/telemetry/normalizer/normalizer_test.go
git commit -m "test(v2): normalizer synthetic buffer coverage"
```

---

### Task 3: Real fixture integration

**Files:**
- Modify: `vantare-v2/internal/telemetry/normalizer/normalizer_test.go`

- [ ] **Step 1: Write the failing test**

Add:
```go
func TestFromBufferFixture(t *testing.T) {
	binPath := filepath.Join("..", "..", "..", "testdata", "lmu-fixture.bin")
	jsonPath := filepath.Join("..", "..", "..", "testdata", "lmu-fixture.json")
	if _, err := os.Stat(binPath); err != nil {
		t.Skip("fixture bin missing")
	}

	buf, err := os.ReadFile(binPath)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(jsonPath)
	if err != nil {
		t.Fatal(err)
	}
	var sidecar struct {
		Session struct {
			TrackName string `json:"trackName"`
		} `json:"session"`
	}
	if err := json.Unmarshal(raw, &sidecar); err != nil {
		t.Fatal(err)
	}

	n := normalizer.New()
	out := n.FromBuffer(buf)
	if !out.Connected || out.Session == nil {
		t.Fatal("expected connected session")
	}
	if out.Session.TrackName != sidecar.Session.TrackName {
		t.Fatalf("track: got %q want %q", out.Session.TrackName, sidecar.Session.TrackName)
	}
	if out.Player == nil {
		t.Fatal("expected player from fixture")
	}
}
```

Add imports: `encoding/json`, `os`, `path/filepath`

- [ ] **Step 2: Run test**

Run: `cd vantare-v2 && go test ./internal/telemetry/normalizer/ -run FromBufferFixture -v`

Expected: PASS (if fixture present) or SKIP

- [ ] **Step 3: Run full v2 test suite**

Run: `cd vantare-v2 && go test ./...`

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add vantare-v2/internal/telemetry/normalizer/
git commit -m "test(v2): normalizer validates lmu-fixture"
```

---

## Acceptance criteria (orchestrator review)

- [ ] `go test ./internal/telemetry/normalizer/` green
- [ ] `go test ./...` green
- [ ] `FromBuffer` returns `Connected: false` for short/invalid input
- [ ] `FromBuffer` matches synthetic + fixture track name
- [ ] No deadband/throttle code in this package

## Out of scope

- Deadband, diff, Subscribe API (plans 2 and 3)
- Wails bindings
- Commits only if user/orchestrator requested — executor may skip commits unless told to commit
