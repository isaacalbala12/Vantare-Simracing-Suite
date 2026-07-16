# CrewChief V4 Parity Review — Cycle 2

**Date:** 2026-06-28
**Reviewer:** Explorer (automated audit)
**Scope:** Verify cycle-1 fixes, re-audit all 19 monitors + runtime + service for code quality, SOLID, bugs, races, style, and CC parity gaps

---

## 1. Cycle 1 Fix Verification

### 1.1 Position start evaluation — ✅ FIXED

**Cycle 1 finding:** Start evaluation used absolute position thresholds (terrible > 15, bad >= 10, ok >= 5, good < 5) instead of CC's delta-from-start-position logic.

**Current code** (`position/monitor.go:156-186`):
```go
deltaPos := int32(player.Place) - int32(m.sessionStartPlace)
switch {
case deltaPos > 5:  // terrible — lost >5 positions
case deltaPos > 3:  // bad — lost >3 positions
case deltaPos < 0:  // good — gained positions
default:            // ok
}
```

**Verdict:** Correctly uses delta-from-start-position. Thresholds match CC: `terrible > startPos+5`, `bad > startPos+3`, `good < startPos` (CC uses `< startPos-1` requiring ≥2 positions gained — minor non-material difference).

### 1.2 PushNow gap threshold — ❌ NOT FIXED

**Cycle 1 finding:** Gap threshold fixed at 1.0s instead of CC's per-class variable `checkGaps()`.

**Current code** (`push/monitor.go:40`):
```go
const DefaultGapThresholdSec = 1.0
```

**Verdict:** Still hardcoded 1.0s. The `NewMonitorWithThreshold` constructor exists for tests but no production wiring uses a variable threshold. CC's `checkGaps()` logic with per-track-class windows is not implemented. **Material difference remains.**

### 1.3 RaceTime pearl disable — ✅ FIXED

**Cycle 1 finding:** `racetime.pearls_disable` event was missing from runtime wiring.

**Current code:**
- `racetime/monitor.go:29` — `EventPearlsDisable = "racetime.pearls_disable"` constant defined
- `racetime/monitor.go:117-125` — emitted when `rem/60 < 3`
- `core/runtime.go:612` — mapped in `eventTextKeyMap`
- `core/runtime.go:842-843` — mapped in switch fallback

**Verdict:** Fully wired. Event reaches runtime and is enqueued as `racetime.pearls_disable` text key. Fix confirmed.

### 1.4 LapCounter position-variant messages — ❌ NOT FIXED

**Cycle 1 finding:** CC uses 3 variants (lead/top3/normal) for last lap and 2-to-go; Vantare uses single events.

**Current code** (`laps/monitor.go`):
- `EventLastLap` — single event type, always fires
- `EventTwoToGo` — single event type, always fires
- Payload includes `position` field but no event-type differentiation

**Verdict:** No position-variant events added. All players hear the same "last lap" regardless of whether they're leading, in top 3, or midfield. **Material difference remains.**

### 1.5 SetExtendedReader races — ✅ SAFE (not a runtime issue)

**Cycle 1 concern:** Race condition on `SetExtendedReader` in penalties/engine monitors.

**Current code:**
- Both monitors use `mu.Lock()` around `SetExtendedReader` writes
- Both monitors read `m.extendedReader` under `mu.Lock()` then use local copy
- Runtime calls `Trigger` sequentially under `r.mu.Lock()`
- `SetExtendedReader` is never called in production runtime path anyway

**Verdict:** No concurrent access path exists because `SetExtendedReader` is never called in the production pipeline. If wired in future, the mutex pattern is correct (pointer swap under lock, local copy used after unlock).

### 1.6 Dead maps / unused adapter infra — ⚠️ PARTIALLY ADDRESSED

**Cycle 1 finding:** Unused maps and adapter infrastructure.

**Current code:**
- All maps in opponents, multiclass, watchedopponents monitors are populated and cleaned up
- `ExtendedReader` infrastructure (`extended_reader.go`, `pitinfo_reader.go`) exists but is **never wired** by `core.Runtime.NewRuntime()` — neither `SetExtendedReader` nor `SetPitInfoReader` is called in the production path
- `OverlaysLiveAdapter` is constructed but only used when `source == "lmu"`

**Verdict:** Maps are used. Extended readers remain dead code (wired in tests only). This is acceptable as future-proof infrastructure for LMU plugin data.

---

## 2. Review 1: Code Review (SOLID, Bugs, Races)

### 2.1 SOLID Assessment

| Principle | Status | Notes |
|-----------|--------|-------|
| **S**ingle Responsibility | ✅ | Each monitor package has one responsibility |
| **O**pen/Closed | ✅ | Monitor interface allows adding monitors without modifying existing code |
| **L**iskov Substitution | ✅ | All monitors satisfy `Monitor` interface correctly |
| **I**nterface Segregation | ✅ | `Monitor` interface has single method `Trigger` |
| **D**ependency Inversion | ⚠️ | Monitors depend on `telemetry.Frame` concrete type rather than an interface — acceptable for this codebase |

### 2.2 Potential Race Conditions

| Location | Issue | Severity |
|----------|-------|----------|
| `fuel/monitor.go:104-108` | `SetCapacity` uses `mu.Lock()` but `Trigger` reads `m.capacity` without lock | **Low** — SetCapacity and Trigger are called sequentially from runtime, but concurrent SetCapacity+Trigger would race. Moot since SetCapacity is never called in production. |
| `penalties/monitor.go:158-174` | `readHistoryMessageType` reads `m.lastHistoryMsg` without lock after releasing mu | **Low** — runtime serializes all Trigger calls; no concurrent access path |
| `engine/monitor.go:271-273` | `m.extendedReader` read under lock, `m.lastOilPressureFire`/`m.lastOilPressureMsg` not locked | **Low** — same reasoning; runtime serializes |
| `multiclass/monitor.go:231-233` | `m.playerClass` read under lock then used | **Low** — correct pattern |

**Verdict:** No exploitable race conditions due to runtime serialization. The lock patterns are correct defensive programming.

### 2.3 Error Handling

| Location | Issue | Severity |
|----------|-------|----------|
| `push/monitor.go:109` | `_ = prev` — prev parameter silently ignored | **Info** — acceptable, prev not needed for push logic |
| `tyre/monitor.go:93` | `_ = prev` — same pattern | **Info** |
| `engine/monitor.go:193` | `_ = prev` — same pattern | **Info** |
| `racetime/monitor.go:94` | `_ = prev` — same pattern | **Info** |
| `sessionend/monitor.go:81` | `_ = prev` — same pattern | **Info** |
| `multiclass/monitor.go:227` | `_ = prev` — same pattern | **Info** |
| `watchedopponents/monitor.go:78` | `_ = prev` — same pattern | **Info** |
| `lmu/extended_reader.go:126,130` | `_, _, _ = procUnmapViewOfFile/CloseHandle` — error ignored on Close | **Info** — syscall cleanup, common pattern |
| `lmu/pitinfo_reader.go:108,112` | Same pattern | **Info** |
| `spotter/geometry.go:144` | `_ = GridSide(frame)` — dead function call, result discarded | **Low** — unnecessary no-op |

### 2.4 NEW Issues Found

| # | File | Issue | Severity |
|---|------|-------|----------|
| 1 | `spotter/geometry.go:144` | **Dead code:** `_ = GridSide(frame)` calls a pure function for no reason. `GridSide` has no side effects; the result is discarded. The comment says "se evalúa para extensión futura" but it should be removed until actually needed. | **Low** |
| 2 | `push/monitor.go:227` | **Hardcoded threshold:** Push-to-hold uses hardcoded `gapSecs < 20` instead of configurable threshold | **Low** — minor, CC uses variable thresholds |
| 3 | `core/runtime.go:187-188` | **Flags adapter drops Payload:** `flagsAdapter.Trigger` creates `monitorEventAdapter` without Payload while all other adapters include it. This is by design (flag events have no payload) but inconsistent with other adapters. | **Info** |

### 2.5 Summary: Code Review

- **Cycle 1 fixes applied:** 3 of 5 (Position delta, RaceTime pearl disable, SetExtendedReader safety)
- **Cycle 1 fixes not applied:** 2 (PushNow gap threshold, LapCounter position variants)
- **New issues found:** 3 (all Low/Info severity)
- **Remaining code issues:** 2 (dead GridSide call, hardcoded push-to-hold threshold)

---

## 3. Review 2: Go Skills (Style, Naming, Idioms)

### 3.1 Naming Convention Violations

| # | Location | Issue |
|---|----------|-------|
| 1 | `strategy/monitor.go:20` | **`EventStrategySectorFuel_Low`** contains underscore in constant name. Go convention is camelCase: `EventStrategySectorFuelLow`. The underscore breaks the naming flow and looks non-idiomatic. |

### 3.2 Error Handling

- All errors in production code are properly handled (no bare `_` ignores in non-test code)
- Errors in cleanup paths (`Close()`, `UnmapViewOfFile`) use `_` — acceptable Go pattern for cleanup

### 3.3 Unused Code

| # | Location | Item | Status |
|---|----------|------|--------|
| 1 | `spotter/geometry.go:144` | `_ = GridSide(frame)` — dead call | **Unused** |
| 2 | `lmu/extended_reader.go` | `ExtendedReader` struct + all methods | **Never instantiated in production** (tests only) |
| 3 | `lmu/pitinfo_reader.go` | `PitInfoReader` struct + all methods | **Never instantiated in production** (tests only) |
| 4 | `penalties/monitor.go:68-70,81-85,157-175` | `SetExtendedReader`, `readHistoryMessageType`, `classifyFromHistoryMessage`, `extendedReader`, `lastHistoryMsg` | **Dead code** — never triggered in production |
| 5 | `engine/monitor.go:109-111,121-132,267-284` | `SetExtendedReader`, extended reader read path, `lastOilPressureMsg` | **Dead code** — never triggered in production |
| 6 | `push/monitor.go:103-105` | `NewMonitorWithThreshold` | **Unused in production** (test-only) |
| 7 | `fuel/monitor.go:97-99,104-108` | `NewMonitorWithCapacity`, `SetCapacity` | **Unused in production** (test-only) |
| 8 | `timings/monitor.go:78-86` | `NewMonitorWithInterval`, `NewMonitorWithReportInterval` | **Unused in production** (test-only) |

### 3.4 Unused Parameters

`_ = prev` pattern found in 8 monitors: push, tyre, engine, racetime, sessionend, multiclass, watchedopponents, timings. All use the same `Trigger(nowMS int64, prev, curr *telemetry.Frame)` signature where prev is unused. This is because the `Monitor` interface requires both prev and curr. **Acceptable pattern** — the alternative would be a different interface per monitor.

### 3.5 Long Functions (>100 lines)

| Function | File | Lines | Verdict |
|----------|------|-------|---------|
| `Monitor.Trigger` | `position/monitor.go` | 215 | **Too long** — should be refactored into helper methods for: session detection, initialization, start evaluation, overtake detection, gap sampling, last-place tracking, position change detection |
| `Monitor.Trigger` | `engine/monitor.go` | 132 | Long but logically coherent — borderline |
| `Monitor.Trigger` | `fuel/monitor.go` | 121 | Long but well-structured with helpers — acceptable |
| `Monitor.Trigger` | `opponents/monitor.go` | 109 | Long but delegates to helpers — acceptable |
| `telemetryLoop` | `service/engineer_service.go` | 140 | Long but necessary for the state machine — borderline |
| `scanOpponents` | `multiclass/monitor.go` | 90 | Just under 100 — borderline |

### 3.6 Package Doc Comments

✅ **All 19 monitor packages have meaningful doc comments** describing CC parity status and scope.

### 3.7 Slice/Map Init Patterns

✅ All maps initialized with `make(map[...]...)` — idiomatic.
✅ All slices are either nil-initialized or via `make([]T, 0)` — consistent.

### 3.8 Other Style Issues

| # | Location | Issue |
|---|----------|-------|
| 1 | `opponents/monitor.go:467-475` | `isOpponentAnnounced` is a standalone function taking `*Monitor` rather than a method. In Go, if it operates on Monitor state, it should be `func (m *Monitor) isOpponentAnnounced(id int32) bool`. Minor style violation. |
| 2 | `push/monitor.go:108` | Despite `_ = prev`, the function signature `Trigger(nowMS int64, prev *telemetry.Frame, curr *telemetry.Frame) []Event` names `prev` then ignores it. Most other monitors use the collapsed form `prev, curr *telemetry.Frame` when prev is needed. Inconsistent. |

### 3.9 `go vet` Warnings

| File | Line | Warning |
|------|------|---------|
| `lmu/extended_reader.go` | 75 | `possible misuse of unsafe.Pointer` — standard Windows mmap pattern, vet can't verify safety |
| `lmu/pitinfo_reader.go` | 65 | Same pattern |

Both are standard `unsafe.Slice((*byte)(unsafe.Pointer(addr)), size)` patterns for Windows shared memory. **Not bugs**, but the warning should be suppressed with a comment or vet directive.

---

## 4. Review 3: CC Parity Gaps

### 4.1 Cycle 1 Fixes Applied

| Gap | Status | Evidence |
|-----|--------|----------|
| Position start delta | ✅ **FIXED** | Now uses `deltaPos := currentPos - startPos` with CC-matching thresholds |
| RaceTime pearl disable | ✅ **FIXED** | `EventPearlsDisable` emitted at `<3min` and wired in runtime |
| PushNow gap threshold | ❌ **NOT FIXED** | Still hardcoded 1.0s (`DefaultGapThresholdSec`) |
| LapCounter position variants | ❌ **NOT FIXED** | Still single `EventLastLap`/`EventTwoToGo` |

### 4.2 Actionable CC Parity Gaps (from cycle 1)

#### 4.2.1 LapCounter position-variant messages

**Status: ❌ NOT IMPLEMENTED**

CC has 3 variants for last lap and 2-to-go messages (lead/top3/normal). Vantare has single events with no position-dependent variant selection.

**Evidence:**
- `laps/monitor.go:33-35` — single `EventLastLap` and `EventTwoToGo` constants
- Payload includes `position` field but no behavioral differentiation
- No event type suffix for lead/top3 variants

**Fix required:** Emit position-suffixed event types (e.g., `EventLastLap_Leading`, `EventLastLap_Top3`, `EventLastLap`) or select variant based on `player.Place`.

#### 4.2.2 PushNow gap threshold

**Status: ❌ NOT FIXED**

`push/monitor.go:40` still hardcodes `DefaultGapThresholdSec = 1.0`. CC's `checkGaps()` computes variable thresholds per class/track length.

**Evidence:**
- Line 40: `const DefaultGapThresholdSec = 1.0`
- Line 188: `gapSecs < m.threshold` uses fixed threshold
- No `checkGaps()` equivalent exists

**Fix required:** Implement `checkGaps()` logic from CC PushNow.cs, computing variable gap thresholds based on car class and track length.

#### 4.2.3 RaceTime pearl disable event

**Status: ✅ IMPLEMENTED AND WIRED**

- `racetime/monitor.go:29` — `EventPearlsDisable` constant
- `racetime/monitor.go:117-125` — emitted when `rem/60 < 3`
- `core/runtime.go:612` — mapped in eventTextKeyMap
- `core/runtime.go:842-843` — switch fallback

#### 4.2.4 Other actionable gaps

| Gap | File | Status | Notes |
|-----|------|--------|-------|
| Flags FCY 32 sub-phase folders | `flags/monitor.go` | ❌ **BLOCKED** | Needs YellowFlagState offset validation |
| Tyre brake/lock/spin | `tyre/monitor.go` | ❌ **BLOCKED** | Needs LMUWheel struct |
| Car class audio folders | `multiclass/monitor.go` | ❌ **BLOCKED** | Needs audio infrastructure |
| DriverSwaps stint timing | `driverswaps/monitor.go` | ❌ **BLOCKED** | Needs game data (DriverStintSecondsRemaining) |

**Not actionable items skipped per instructions** (FCY sub-phases, tyre brakes/lock/spin, car class audio, stock car rules, lucky dog, DriverSwaps stint timing).

### 4.3 Remaining CC Parity Material Differences

| # | Monitor | Gap | Priority |
|---|---------|-----|----------|
| 1 | **PushNow** | Fixed 1.0s threshold instead of CC's variable `checkGaps()` | **High** |
| 2 | **Laps** | Position-variant last lap / 2-to-go messages missing | **Medium** |
| 3 | **Position** | Start evaluation "good" threshold (`< 0`) vs CC (`< startPos-1`) — minor | **Low** |

All other cycle-1 material differences remain as documented (103 total in cycle 1, minus 2 fixed = **101 remaining material differences**). However, most are blocked by external infrastructure (audio, LMU data, game telemetry).

### 4.4 CC Parity Summary

| Metric | Cycle 1 | Cycle 2 | Change |
|--------|---------|---------|--------|
| **MATCH** | 89 | 91 | +2 (position delta fix, pearl disable wiring) |
| **DIFFERENT** | 47 | 47 | Unchanged |
| **MISSING** | 231 | 231 | Unchanged |
| **MATERIAL differences** | 103 | 101 | -2 (fixed) |
| **Actionable remaining** | — | 3 | PushNow gap, Laps position variants, minor position threshold |

---

## 5. Overall Summary

### Cycle 1 Fixes: 3 of 5 Applied

| Fix | Applied? |
|-----|----------|
| Position start evaluation: absolute→delta | ✅ Yes |
| RaceTime pearl disable event wiring | ✅ Yes |
| SetExtendedReader race safety | ✅ Yes (already safe, documented) |
| PushNow gap threshold variable | ❌ No |
| LapCounter position-variant messages | ❌ No |

### New Issues Found: 5

| # | Severity | Issue |
|---|----------|-------|
| 1 | **Low** | `spotter/geometry.go:144` — dead `_ = GridSide(frame)` call |
| 2 | **Style** | `strategy/monitor.go:20` — `EventStrategySectorFuel_Low` has underscore in name |
| 3 | **Style** | `position/monitor.go:100-315` — `Trigger` function is 215 lines (needs refactoring) |
| 4 | **Style** | `opponents/monitor.go:467` — `isOpponentAnnounced` should be a method, not standalone function |
| 5 | **Info** | `push/monitor.go:227` — hardcoded 20s threshold for push-to-hold |

### Remaining Gaps

| Category | Count |
|----------|-------|
| **Code issues needing fixing** | 2 (dead GridSide call, EventStrategySectorFuel_Low naming) |
| **Actionable CC parity gaps** | 3 (PushNow gap, Laps position variants, minor position threshold) |
| **Blocked CC parity gaps** | 98+ (blocked by audio infra, LMU data, game telemetry) |
| **Total material differences remaining** | 101 |

### Items That Still Need Fixing

1. **PushNow gap threshold** (`push/monitor.go:40`): Replace hardcoded 1.0s with variable threshold matching CC's `checkGaps()` logic
2. **LapCounter position variants** (`laps/monitor.go:33-35`): Add position-suffixed event types for lead/top3/normal variants
3. **Remove dead code** (`spotter/geometry.go:144`): Delete `_ = GridSide(frame)` line
4. **Rename constant** (`strategy/monitor.go:20`): `EventStrategySectorFuel_Low` → `EventStrategySectorFuelLow`
5. **Refactor** (`position/monitor.go:100-315`): Break 215-line Trigger into smaller helper methods

---

*End of cycle 2 parity review. 3 actionable CC gaps remain. No high-severity bugs found. Code quality is solid with minor style issues.*
