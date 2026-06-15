# Code Review: Relative + Standings Racing Enhancement

**Scope:** All commits from `1a6cef8` to `f01dd67`.

**Reviewed by:** Main agent

**Verdict:** Approve — all required and recommended issues addressed.

---

## Context

This change adds:
1. A backend Go `TimeGapToPlayer` computation for the Relative widget.
2. Class-color bars and signed-second gaps in the Relative widget.
3. Session-aware gap column (best lap in practice/qualifying, gap to leader in race) in the Standings widget.
4. Pit indicator moved to the driver number badge.
5. Stable gap computation based on lap-pace reference.
6. Frontend fingerprint caching and diff threshold tuning for performance.

All automated tests pass:
- Go: `go test ./...` → 16 packages ok
- Frontend: `pnpm test` → 25 files, 86 tests passed
- Frontend build: `pnpm build` → success
- Manual live verification completed by user

---

## Findings and Resolutions

### 1. Correctness: `gap.go` skipped vehicles at lapDistance == 0

**File:** `vantare-v2/internal/telemetry/gap/gap.go:41`

**Original:**
```go
if v.LapDistance <= 0 {
    continue
}
```

A car exactly at the start/finish line reports `lapDistance == 0`, which is a valid position.

**Resolution:** Changed to `if v.LapDistance < 0` and added `TestComputeTimeGaps_ZeroLapDistanceIsValid`.

### 2. Correctness: `service.go` did not guard against nil `raw`

**File:** `vantare-v2/internal/telemetry/service/service.go:133`

**Original:**
```go
gap.ComputeTimeGaps(raw)
snap, ok := s.filter.ShouldPublish(raw)
```

**Resolution:** Added `if raw == nil { return }` before `gap.ComputeTimeGaps(raw)`.

### 3. Performance: `pipeline/filter.go` still used tight thresholds

**File:** `vantare-v2/internal/telemetry/pipeline/filter.go:172-178`

**Original:** used `core.ThresholdGap` (0.001s) for `TimeBehindNext`/`TimeBehindLeader`.

**Resolution:** Aligned with diff layer at 0.01s for `TimeBehindNext`/`TimeBehindLeader`.

### 4. Performance: Standings fingerprint was oversized

**File:** `vantare-v2/frontend/src/overlay/widgets/StandingsWidget.tsx:88-89`

**Original:** fingerprint included static fields like `driverName`, `driverNumber`, `teamBrandColor`, `vehicleClass`.

**Resolution:** Reduced fingerprint to volatile/rendered fields only: `id`, `place`, `inPits`, `pitState`, `pitting`, `inGarageStall`, `fastestLap`, `bestLapTime`, `timeBehindLeader`, `lapsBehindLeader`, `tireCompound`.

### 5. Readability: `formatStandingsGap` used `"--"`

**File:** `vantare-v2/frontend/src/overlay/widgets/StandingsWidget.tsx:22-27`

**Original:** returned `"--"`.

**Resolution:** Changed to `"—"` for consistency with `formatSignedGap`.

### 6. Readability: Missing blank line in `gap_test.go`

**File:** `vantare-v2/internal/telemetry/gap/gap_test.go:79-80`

**Resolution:** Added blank line and reformatted the file cleanly.

---

## Verification

- `go test ./...` → PASS
- `pnpm test` → PASS (86 tests)
- `pnpm build` → PASS

---

## Verdict

**Approve.** All issues identified in the review have been resolved and the full test suite passes.
