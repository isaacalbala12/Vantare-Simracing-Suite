> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Implement the tasks in this plan and stop. Do NOT proceed to other subagent plans. Do NOT run the release task.

# Subagent Plan — DemoDeltaAgent

**Goal:** Implement an animated demo mode in the Preview Workbench and build a distance-based delta engine with self/session/global modes.

**Context:** This is part of Fase A in `docs/superpowers/plans/2026-06-15-phase-a-lmu-alpha-master.md`. Implement only Tasks 5–6 from the master plan.

**Tech Stack:** React 19 + TypeScript (demo mode); Go 1.23 (delta engine).

**Definition of done for this subagent:**
1. All steps below are checked off.
2. Go tests pass.
3. Frontend tests pass.
4. Code is left ready for Main agent code review before release.

---

## Task 5: Demo Mode

**Files:**
- Modify: `vantare-v2/frontend/src/overlay/widgets/mock-telemetry.ts`
- Create: `vantare-v2/frontend/src/lib/useDemoMode.ts`
- Create: `vantare-v2/frontend/src/lib/useDemoMode.test.ts`
- Modify: `vantare-v2/frontend/src/hub/pages/PreviewPage.tsx`

- [ ] **Step 1: Extend mock-telemetry.ts with animation**

Current `mock-telemetry.ts` likely exports a static object. Add a generator function:

```typescript
export function generateAnimatedTelemetry(elapsedMs: number, inPit = false): TelemetryState {
  const t = elapsedMs / 1000;
  // Create 5-8 mock vehicles that move around the track
  const vehicles: VehicleScoring[] = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    position: ((i + 1) + Math.sin(t * 0.5 + i) * 0.5),
    driverName: `Driver ${i + 1}`,
    carNumber: `${10 + i}`,
    carClass: i < 3 ? "LMP3" : "GT3",
    gapToPlayer: (i - 2) * 1.2 + Math.sin(t + i) * 0.3,
    lap: 3 + Math.floor(t / 90),
    inPit: i === 0 && inPit,
  }));

  return {
    ...DEFAULT_TELEMETRY,
    connected: true,
    sessionState: "green",
    sessionType: "race",
    playerHasVehicle: true,
    player: {
      ...DEFAULT_TELEMETRY.player,
      speed: 180 + Math.sin(t) * 40,
      throttle: 70 + Math.sin(t * 2) * 20,
      brake: Math.max(0, Math.sin(t * 3) * 30),
      deltaBest: Math.sin(t) * 1.5,
      inPit,
    },
    vehicles,
  };
}
```

- [ ] **Step 2: Create useDemoMode hook**

```typescript
import { useEffect, useRef } from "react";
import { applyTelemetryUpdate, clearRuntimeTelemetry } from "./telemetry-ref";
import { generateAnimatedTelemetry } from "../overlay/widgets/mock-telemetry";

export function useDemoMode(enabled: boolean, hz: number, inPit = false) {
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) {
      clearRuntimeTelemetry();
      return;
    }
    startRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      applyTelemetryUpdate(generateAnimatedTelemetry(elapsed, inPit));
    }, 1000 / hz);
    return () => clearInterval(interval);
  }, [enabled, hz, inPit]);
}
```

- [ ] **Step 3: Wire demo mode into PreviewPage**

Add state:

```typescript
const [demoMode, setDemoMode] = useState(false);
const [demoInPit, setDemoInPit] = useState(false);
```

Use hook:

```typescript
useDemoMode(demoMode, 20, demoInPit);
```

Add buttons:

```typescript
<button onClick={() => setDemoMode(!demoMode)}>
  {demoMode ? "Demo ON" : "Demo OFF"}
</button>
{demoMode && (
  <button onClick={() => setDemoInPit(!demoInPit)}>
    {demoInPit ? "In Pit" : "On Track"}
  </button>
)}
```

- [ ] **Step 4: Disable demo mode on live telemetry**

Listen for telemetry events in PreviewPage. If `demoMode` is true and a live telemetry event arrives, set `demoMode` false.

- [ ] **Step 5: Write tests**

```typescript
it("pumps telemetry when demo mode is enabled", () => { ... });
it("clears telemetry when demo mode is disabled", () => { ... });
it("disables demo mode when live telemetry arrives", () => { ... });
```

- [ ] **Step 6: Run tests and commit**

```bash
pnpm --dir vantare-v2/frontend test
git add vantare-v2/frontend/src/overlay/widgets/mock-telemetry.ts \
        vantare-v2/frontend/src/lib/useDemoMode.ts \
        vantare-v2/frontend/src/lib/useDemoMode.test.ts \
        vantare-v2/frontend/src/hub/pages/PreviewPage.tsx
git commit -m "feat(preview): animated demo mode with live override"
```

---

## Task 6: Delta Best Engine

**Files:**
- Create: `vantare-v2/internal/telemetry/delta/engine.go`
- Create: `vantare-v2/internal/telemetry/delta/store.go`
- Create: `vantare-v2/internal/telemetry/delta/engine_test.go`
- Modify: `vantare-v2/internal/app/lmu_enriched_source.go`
- Modify: `vantare-v2/internal/telemetry/fusion/fusion.go`

- [ ] **Step 1: Define delta types in engine.go**

```go
package delta

type ReferenceMode string

const (
	ModeSelf    ReferenceMode = "self"
	ModeSession ReferenceMode = "session"
	ModeGlobal  ReferenceMode = "global"
)

type LapPoint struct {
	Distance     float64
	TimeIntoLap  float64
}

type ReferenceLap struct {
	Mode      ReferenceMode
	TrackName string
	CarClass  string
	Points    []LapPoint
}

func ComputeDelta(ref *ReferenceLap, current LapPoint) (float64, bool) {
	if ref == nil || len(ref.Points) == 0 {
		return 0, false
	}
	target := interpolateTime(ref.Points, current.Distance)
	return current.TimeIntoLap - target, true
}

func interpolateTime(points []LapPoint, distance float64) float64 {
	// linear interpolation between nearest points
	// assume points sorted by Distance
	if distance <= points[0].Distance {
		return points[0].TimeIntoLap
	}
	if distance >= points[len(points)-1].Distance {
		return points[len(points)-1].TimeIntoLap
	}
	for i := 1; i < len(points); i++ {
		if distance < points[i].Distance {
			p0, p1 := points[i-1], points[i]
			ratio := (distance - p0.Distance) / (p1.Distance - p0.Distance)
			return p0.TimeIntoLap + ratio*(p1.TimeIntoLap-p0.TimeIntoLap)
		}
	}
	return points[len(points)-1].TimeIntoLap
}
```

- [ ] **Step 2: Implement reference lap store**

```go
package delta

type Store struct {
	selfLaps    map[string]*ReferenceLap // key: track+carClass+vehicleID
	sessionLap  *ReferenceLap
	globalLap   *ReferenceLap
	liveBuffers map[string][]LapPoint
}

func NewStore() *Store {
	return &Store{
		selfLaps:    make(map[string]*ReferenceLap),
		liveBuffers: make(map[string][]LapPoint),
	}
}

func (s *Store) RecordPoint(vehicleID int, trackName, carClass string, distance, timeIntoLap float64) {
	key := fmt.Sprintf("%s|%s|%d", trackName, carClass, vehicleID)
	point := LapPoint{Distance: distance, TimeIntoLap: timeIntoLap}
	s.liveBuffers[key] = append(s.liveBuffers[key], point)
}

func (s *Store) CompleteLap(vehicleID int, trackName, carClass string, bestLapTime float64, mode ReferenceMode) {
	key := fmt.Sprintf("%s|%s|%d", trackName, carClass, vehicleID)
	points := s.liveBuffers[key]
	if len(points) == 0 {
		return
	}
	ref := &ReferenceLap{Mode: mode, TrackName: trackName, CarClass: carClass, Points: points}
	switch mode {
	case ModeSelf:
		s.selfLaps[key] = ref
	case ModeSession:
		if s.sessionLap == nil || bestLapTime < s.sessionLap.TotalTime() {
			s.sessionLap = ref
		}
	case ModeGlobal:
		if s.globalLap == nil || bestLapTime < s.globalLap.TotalTime() {
			s.globalLap = ref
		}
	}
	s.liveBuffers[key] = nil
}

func (r *ReferenceLap) TotalTime() float64 {
	if len(r.Points) == 0 {
		return 0
	}
	return r.Points[len(r.Points)-1].TimeIntoLap
}
```

- [ ] **Step 3: Build session/global approximations**

When a lap completes and mode is session/global, but we only have best lap time (not distance data for others), create a synthetic reference lap with evenly spaced points:

```go
func SyntheticReference(totalTime float64, trackLength float64) *ReferenceLap {
	points := make([]LapPoint, 0, 20)
	for i := 0; i <= 20; i++ {
		d := trackLength * float64(i) / 20
		t := totalTime * float64(i) / 20
		points = append(points, LapPoint{Distance: d, TimeIntoLap: t})
	}
	return &ReferenceLap{Mode: ModeSession, Points: points}
}
```

Document this as approximation.

- [ ] **Step 4: Wire into lmu_enriched_source.go**

Replace `delta.AlphaDelta(rows)` usage with:

```go
mode := delta.ReferenceMode(settings.DeltaMode)
playerVehicleID := findPlayerVehicleID(rows)
ref := deltaStore.GetReference(mode, playerVehicleID, trackName, carClass, trackLength, bestLapTime)
current := delta.LapPoint{Distance: playerRow.LapDistance, TimeIntoLap: playerRow.TimeIntoLap}
d, ok := delta.ComputeDelta(ref, current)
```

- [ ] **Step 5: Update fusion.go if needed**

Ensure `deltaBest` flows into `models.Telemetry.Player.DeltaBest`.

- [ ] **Step 6: Write tests with fixture**

Create a reference lap of points and assert delta at different distances.

```go
func TestComputeDelta(t *testing.T) {
	ref := &ReferenceLap{Points: []LapPoint{
		{Distance: 0, TimeIntoLap: 0},
		{Distance: 1000, TimeIntoLap: 20},
		{Distance: 2000, TimeIntoLap: 40},
	}}
	current := LapPoint{Distance: 1000, TimeIntoLap: 21}
	delta, ok := ComputeDelta(ref, current)
	if !ok || math.Abs(delta-1.0) > 0.001 {
		t.Fatalf("expected delta 1.0, got %v", delta)
	}
}
```

- [ ] **Step 7: Run tests and commit**

```bash
cd vantare-v2
go test ./internal/telemetry/delta/...
git add vantare-v2/internal/telemetry/delta/engine.go \
        vantare-v2/internal/telemetry/delta/store.go \
        vantare-v2/internal/telemetry/delta/engine_test.go \
        vantare-v2/internal/app/lmu_enriched_source.go \
        vantare-v2/internal/telemetry/fusion/fusion.go
git commit -m "feat(delta): distance-based delta engine with self/session/global modes"
```

---

## Final verification

```bash
cd vantare-v2
go test ./...
pnpm --dir frontend test
pnpm --dir frontend build
```

Report back which tests pass/fail.
