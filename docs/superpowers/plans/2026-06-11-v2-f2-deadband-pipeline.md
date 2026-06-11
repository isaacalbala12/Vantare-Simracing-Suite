# v2 Fase 2 — Deadband Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `internal/telemetry/pipeline` with a deadband filter that suppresses unchanged player/session fields before broadcast, using thresholds from `internal/core/deadband.go`.

**Architecture:** `Filter` holds `lastEmitted *models.Telemetry`. On each normalized snapshot, compare field-by-field with `core.ShouldEmit`. If nothing material changed, return `(nil, false)`. If changed, return `(snapshot, true)` and update last. Speed uses m/s with threshold `0.1/3.6` (~0.1 km/h). Session/vehicles emit only when their deadbanded fields change.

**Tech Stack:** Go 1.22+, `internal/core`, `pkg/models`, depends on plan 1 normalizer (not imported — tests pass snapshots directly)

**References:** `docs/V2-STACK-AND-PERFORMANCE.md` §7.8, `vantare-v2/internal/core/deadband.go`

**Prerequisite:** Plan `2026-06-11-v2-f2-normalizer.md` merged or normalizer package exists.

---

## File map

| File | Responsibility |
|------|----------------|
| `internal/core/deadband.go` | Add `ThresholdSpeedMPS` constant |
| `internal/telemetry/pipeline/filter.go` | `Filter` + `ShouldPublish` |
| `internal/telemetry/pipeline/filter_test.go` | Unit tests |

---

### Task 1: Speed threshold constant

**Files:**
- Modify: `vantare-v2/internal/core/deadband.go`
- Modify: `vantare-v2/internal/core/deadband_test.go`

- [ ] **Step 1: Write the failing test**

Add to `deadband_test.go`:
```go
func TestThresholdSpeedMPS(t *testing.T) {
	// 0.1 km/h ≈ 0.0278 m/s
	if ShouldEmit(10.0, 10.02, ThresholdSpeedMPS) {
		t.Fatal("0.02 m/s change should be below ~0.1 km/h threshold")
	}
	if !ShouldEmit(10.0, 10.05, ThresholdSpeedMPS) {
		t.Fatal("0.05 m/s change should exceed threshold")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd vantare-v2 && go test ./internal/core/ -run ThresholdSpeedMPS -v`

Expected: FAIL — `ThresholdSpeedMPS` undefined

- [ ] **Step 3: Add constant**

In `deadband.go` after existing thresholds:
```go
// ThresholdSpeedMPS is ~0.1 km/h expressed in m/s (see V2 doc §7.8).
const ThresholdSpeedMPS = 0.1 / 3.6
```

- [ ] **Step 4: Run test**

Run: `cd vantare-v2 && go test ./internal/core/ -v`

Expected: PASS

- [ ] **Step 5: Commit** (optional per orchestrator)

---

### Task 2: Filter — first emit always publishes

**Files:**
- Create: `vantare-v2/internal/telemetry/pipeline/filter.go`
- Create: `vantare-v2/internal/telemetry/pipeline/filter_test.go`

- [ ] **Step 1: Write the failing test**

`filter_test.go`:
```go
package pipeline_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/pipeline"
	"github.com/vantare/overlays/v2/pkg/models"
)

func sampleTelemetry(speed float64) *models.Telemetry {
	return &models.Telemetry{
		Connected: true,
		Player: &models.PlayerTelemetry{
			Speed:     speed,
			Gear:      4,
			EngineRPM: 5000,
			Fuel:      50,
		},
		Session: &models.SessionInfo{TrackName: "Spa"},
	}
}

func TestFilterFirstEmit(t *testing.T) {
	f := pipeline.NewFilter()
	snap := sampleTelemetry(20)
	out, ok := f.ShouldPublish(snap)
	if !ok || out == nil {
		t.Fatal("first snapshot must publish")
	}
}
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd vantare-v2 && go test ./internal/telemetry/pipeline/ -run FilterFirstEmit -v`

- [ ] **Step 3: Implement filter.go**

```go
package pipeline

import (
	"github.com/vantare/overlays/v2/internal/core"
	"github.com/vantare/overlays/v2/pkg/models"
)

type Filter struct {
	last *models.Telemetry
}

func NewFilter() *Filter {
	return &Filter{}
}

func (f *Filter) ShouldPublish(next *models.Telemetry) (*models.Telemetry, bool) {
	if next == nil {
		return nil, false
	}
	if f.last == nil {
		f.last = cloneTelemetry(next)
		return f.last, true
	}
	if !f.playerChanged(f.last, next) && !f.sessionChanged(f.last, next) {
		return nil, false
	}
	f.last = cloneTelemetry(next)
	return f.last, true
}

func (f *Filter) playerChanged(prev, next *models.Telemetry) bool {
	pp, np := prev.Player, next.Player
	if (pp == nil) != (np == nil) {
		return true
	}
	if pp == nil {
		return false
	}
	if pp.Gear != np.Gear {
		return true
	}
	if core.ShouldEmit(pp.Speed, np.Speed, core.ThresholdSpeedMPS) {
		return true
	}
	if core.ShouldEmit(pp.EngineRPM, np.EngineRPM, core.ThresholdRPM) {
		return true
	}
	if core.ShouldEmit(pp.Fuel, np.Fuel, core.ThresholdFuel) {
		return true
	}
	if core.ShouldEmit(pp.DeltaBest, np.DeltaBest, core.ThresholdGap) {
		return true
	}
	if core.ShouldEmit(pp.Throttle, np.Throttle, 0.01) {
		return true
	}
	if core.ShouldEmit(pp.Brake, np.Brake, 0.01) {
		return true
	}
	if core.ShouldEmit(pp.Steering, np.Steering, 0.01) {
		return true
	}
	if pp.LapNumber != np.LapNumber {
		return true
	}
	return false
}

func (f *Filter) sessionChanged(prev, next *models.Telemetry) bool {
	ps, ns := prev.Session, next.Session
	if (ps == nil) != (ns == nil) {
		return true
	}
	if ps == nil {
		return false
	}
	if ps.TrackName != ns.TrackName || ps.GamePhase != ns.GamePhase {
		return true
	}
	if ps.NumVehicles != ns.NumVehicles {
		return true
	}
	if core.ShouldEmit(ps.SessionTime, ns.SessionTime, 0.01) {
		return true
	}
	return false
}

func cloneTelemetry(t *models.Telemetry) *models.Telemetry {
	if t == nil {
		return nil
	}
	c := *t
	if t.Player != nil {
		p := *t.Player
		c.Player = &p
	}
	if t.Session != nil {
		s := *t.Session
		c.Session = &s
	}
	if t.Vehicles != nil {
		c.Vehicles = append([]models.VehicleScoring(nil), t.Vehicles...)
	}
	return &c
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd vantare-v2 && go test ./internal/telemetry/pipeline/ -run FilterFirstEmit -v`

---

### Task 3: Filter suppresses noise

**Files:**
- Modify: `vantare-v2/internal/telemetry/pipeline/filter_test.go`

- [ ] **Step 1: Write test**

```go
func TestFilterSuppressesRPMNoise(t *testing.T) {
	f := pipeline.NewFilter()
	_, _ = f.ShouldPublish(sampleTelemetry(20))

	quiet := sampleTelemetry(20.001)
	quiet.Player.EngineRPM = 5000 + 10 // below ThresholdRPM 50
	_, ok := f.ShouldPublish(quiet)
	if ok {
		t.Fatal("expected suppress for small RPM change")
	}
}

func TestFilterEmitsGearChange(t *testing.T) {
	f := pipeline.NewFilter()
	_, _ = f.ShouldPublish(sampleTelemetry(20))

	shift := sampleTelemetry(20)
	shift.Player.Gear = 5
	_, ok := f.ShouldPublish(shift)
	if !ok {
		t.Fatal("gear change must publish")
	}
}
```

- [ ] **Step 2: Run tests**

Run: `cd vantare-v2 && go test ./internal/telemetry/pipeline/ -v`

Expected: PASS

- [ ] **Step 3: Full suite**

Run: `cd vantare-v2 && go test ./...`

Expected: PASS

---

## Acceptance criteria

- [ ] First snapshot always publishes
- [ ] RPM +10 with same speed/gear does not publish
- [ ] Gear change publishes
- [ ] `ThresholdSpeedMPS` documented and tested
- [ ] No goroutines or Subscribe API in this package

## Out of scope

- Diff JSON shape (plan 3)
- Vehicle standings row-by-row deadband (future — only session numVehicles for now)
