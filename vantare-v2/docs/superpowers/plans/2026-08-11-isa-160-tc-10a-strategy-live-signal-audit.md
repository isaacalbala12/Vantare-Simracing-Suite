# ISA-160 / TC-10A Strategy Live Signal Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Strategy live-signal audit with executable evidence that Fuel, pit and progress are canonical while Virtual Energy, tyres and weather remain unsupported until LMU evidence exists.

**Architecture:** This cut does not change production schema, the LMU driver or `StrategyLiveProjection`. It adds a test-only, versioned audit ledger backed by the existing hash-pinned LMU 1.4 fixtures, plus an end-to-end assertion through driver, mapper, reducer and derive. The human-readable audit is the contract for ISA-161: publish existing supported fields additively and keep unsupported families absent.

**Tech Stack:** Go 1.25, standard library only, Telemetry Core typed schema, existing LMU sanitized fixtures, Markdown.

---

## Scope and file map

- Create `internal/telemetry/drivers/lmu/strategy_signal_audit_test.go`: executable audit ledger, strict golden comparison and real LMU 1.4 Fuel path regression.
- Create `internal/telemetry/drivers/lmu/testdata/strategy_live_signals_v1.golden.json`: deterministic machine-readable matrix for the required signal families.
- Create `docs/telemetry-core/strategy-live-signal-audit-isa-160.md`: source/unit/authority/freshness/identity/evidence matrix and exact ISA-161 additive plan.
- Modify `docs/telemetry-core/lmu-authority-matrix.md`: preserve v3 as historical evidence and point to the current runtime v4 source/tests.
- Modify `docs/vantare-program/handoffs/telemetry-core.md`: replace the current next action with the verified ISA-160 state and remaining human gates.
- Modify `docs/current-plan.md`: prepend a concise ISA-160 status entry.

Production files under `internal/telemetry/schema`, `core`, `derive`, `drivers/lmu`, `projection/strategy` and Strategy itself must not change in this issue. The audit found no newly demonstrated VE, tyre or weather signal that justifies schema expansion.

### Task 1: Lock the real LMU 1.4 Fuel path

**Files:**
- Create: `internal/telemetry/drivers/lmu/strategy_signal_audit_test.go`
- Read fixture: `testdata/lmu-1.4-track-fixture.bin`

- [x] **Step 1: Write the end-to-end regression**

Add a test named `TestStrategySignalAuditCarriesRealLMU14FuelToFinalState`. It must read the hash-pinned LMU 1.4 track fixture, call the existing `runSingleLMU14Frame`, require exactly one `LMU_Data` open, locate the active vehicle by the final snapshot header identity and assert the exact observed Fuel pair:

```go
func TestStrategySignalAuditCarriesRealLMU14FuelToFinalState(t *testing.T) {
	frame, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-1.4-track-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	result, opens := runSingleLMU14Frame(t, frame)
	if opens != 1 {
		t.Fatalf("LMU_Data opens = %d, want one", opens)
	}
	final, ok := result.final.Value()
	if !ok {
		t.Fatal("final snapshot has no owned value")
	}
	playerID := result.final.Header().Identity.Vehicle
	for _, current := range final.Observed.Vehicles {
		if current.Identity.Vehicle != playerID {
			continue
		}
		fuel, present := current.Fuel.Value()
		if !present || current.Fuel.Provenance() != schema.ProvenanceObserved || current.Fuel.Freshness() != schema.FreshnessFresh {
			t.Fatalf("player fuel quality = present:%v provenance:%s freshness:%s", present, current.Fuel.Provenance(), current.Fuel.Freshness())
		}
		if fuel.Amount != energy.FuelAmount(83.80992715710434) || fuel.Capacity != energy.FuelCapacity(115) {
			t.Fatalf("player fuel = %+v", fuel)
		}
		return
	}
	t.Fatalf("player %q not found in final state", playerID)
}
```

- [x] **Step 2: Observe RED before completing the audit evidence**

Run:

```powershell
go test ./internal/telemetry/drivers/lmu -run '^TestStrategySignalAudit' -count=1
```

Actual RED was the missing golden while the E2E Fuel test passed against
existing production code, as intended for an audit-only cut. A later review
cycle also observed RED for incomplete identity/generation evidence before
GREEN. No production implementation was required.

- [x] **Step 3: Complete imports and run GREEN repeatedly**

Required imports are `encoding/json`, `os`, `path/filepath`, `reflect`, `testing`, plus `catalog`, `schema`, and `schema/energy` from Telemetry Core. Run the focal test with `-count=20`; expected result is PASS 20/20.

### Task 2: Make the audit matrix executable and closed

**Files:**
- Create: `internal/telemetry/drivers/lmu/strategy_signal_audit_test.go`
- Create: `internal/telemetry/drivers/lmu/testdata/strategy_live_signals_v1.golden.json`

- [x] **Step 1: Define test-only audit types and the exact ledger**

Use these closed values:

```go
type strategySignalAuditV1 struct {
	Schema  string                  `json:"schema"`
	Signals []strategySignalEntryV1 `json:"signals"`
}

type strategySignalEntryV1 struct {
	Key        string `json:"key"`
	Capability string `json:"capability"`
	Source     string `json:"source"`
	Unit       string `json:"unit"`
	Authority  string `json:"authority"`
	Freshness  string `json:"freshness"`
	Identity   string `json:"identity"`
	Evidence   string `json:"evidence"`
}
```

The ordered ledger must contain these exact keys and capability states:

```text
energy.fuel_amount                 supported
energy.fuel_capacity               supported
energy.virtual_energy              unsupported
tyres.identity                     unsupported
tyres.compound                     unsupported
tyres.wear                         unsupported
tyres.corner                       unsupported
weather.ambient_temperature        unsupported
weather.track_temperature          unsupported
weather.rain_intensity             unsupported
weather.track_wetness              unsupported
pit.in_pit                         supported
pit.stop_count                     supported
session.lap_number                 supported
standings.completed_laps           supported
standings.lap_distance              supported
session.maximum_laps               supported
session.remaining_time             supported
```

For every supported row, record the actual source, unit, field-level authority and TTL/freshness rule. For every unsupported row use `source: "none-admitted"`, `authority: "none"`, `freshness: "missing"`, and cite the exact excluded or unproduced contract. `tyres.corner` must say that the existing `wheels.Corner` locates brake-temperature measurements and is not a tyre identity.

Every player-only or per-vehicle supported row must also record the canonical
identity form `lmu-slot-N-generation-G`: G starts at 1, increments when a slot
disappears and reappears in the same session, and resets to 1 on a session
reset. REST cannot create identity.

- [x] **Step 2: Add strict golden verification**

Marshal the ledger with `json.MarshalIndent`, append one newline, compare byte-for-byte with `testdata/strategy_live_signals_v1.golden.json`, and fail on any difference. Also assert unique keys and the exact ordered key list above so a new signal cannot enter silently.

- [x] **Step 3: Add guards against unsupported production leakage**

Use reflection in this test to assert exact, ordered and reviewable field
allowlists for `Observation`, `core.VehicleState`, `core.ObservedState` and the
Strategy projection v1 structs. Assert the exact current Strategy v1
capabilities, reject the closed VE/tyres/weather catalog keys, and keep
`SignalWheelsBrakeTemperature` and `SignalWeatherAmbientTemperature` as
`LedgerExistingUnproduced`. These are audit-v1 guards: an evidence-backed
addition must update the audit, while a separate future projection version is
not prohibited.

Add behavioral generation coverage for
`generation-1 -> disappearance -> generation-2 -> session reset ->
generation-1`. Contrast every supported ledger row independently against the
product layout, `AuthorityMatrix()`, catalog unit/action and SHM/REST TTLs; the
golden is a reviewed snapshot, not its own oracle.

- [x] **Step 4: Run RED then GREEN**

Run:

```powershell
go test ./internal/telemetry/drivers/lmu -run '^TestStrategySignalAudit' -count=1
```

Expected RED before the golden exists: file-not-found or golden mismatch. Create the golden from the reviewed ledger, then run with `-count=20`; expected PASS.

### Task 3: Publish the human audit and the exact ISA-161 boundary

**Files:**
- Create: `docs/telemetry-core/strategy-live-signal-audit-isa-160.md`

- [x] **Step 1: Document the evidence matrix**

For every ledger row include: canonical type, source/offset or explicit absence, unit, authority/fusion, freshness, run/vehicle/corner identity, runtime state and evidence path. Separate static support from the 2026-08-10/11 live menu smoke: that smoke proves only that Fuel and lap number remain correctly `missing` with `PlayerPresent=false`; pit/progress remain supported by fixtures and static/runtime tests, not by the menu smoke.

- [x] **Step 2: Record the non-negotiable negative findings**

State explicitly:

- `FuelMult` from the retired fixture-only Extended decoder is a session fuel multiplier, not Virtual Energy.
- legacy Engineer tyre fields, wheel placeholders and the old Pit Manager weather client are not canonical evidence and cannot be reactivated as a second reader;
- `InPit` is only a boolean and does not mean pit lane, box, garage or pit-stop phase;
- ambient/track values in historical sidecars prove potential bytes, not an admitted unit/source contract;
- no fallback, zero conversion or estimate is authorized for unsupported families.

- [x] **Step 3: Define the additive ISA-161 plan**

ISA-161 may add only existing canonical fields to the Strategy projection: Fuel amount/capacity, source/end/remaining/max laps, lap distance/sector and the already published pit/progress fields. It must keep projection v1 backward-compatible through optional fields/capabilities, add old/new producer-consumer contract tests, transport/resync/replay/soak, and never include VE/tyres/weather until a separate evidence issue expands schema/driver/fusion. Do not implement ISA-161 in this branch.

### Task 4: Reconcile live state and run gates

**Files:**
- Modify: `docs/vantare-program/handoffs/telemetry-core.md`
- Modify: `docs/current-plan.md`
- Modify: `docs/telemetry-core/lmu-authority-matrix.md`

- [x] **Step 1: Record and refresh the real LMU smoke**

The fresh official opt-in harness run passed with LMU build `1.4.0.0`, `supported=true`, runtime `live`, `PlayerPresent=false`, fingerprint `active-grid-bijective;telemetry=not-required-no-player`; no raw or PII persisted.

- [x] **Step 2: Run the applicable gates**

```powershell
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
gofmt -w internal/telemetry/drivers/lmu/strategy_signal_audit_test.go
gofmt -l internal/telemetry
go test -count=20 ./internal/telemetry/drivers/lmu -run '^TestStrategySignalAudit'
go test -count=1 ./internal/telemetry/...
go test -count=1 ./...
go test -count=10 ./internal/telemetry/recording/sqlite -run '^TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles$'
go test -count=1 ./...
go vet ./internal/telemetry/...
git diff --check
```

The frozen frontend install exited 0 without tracked changes and the frontend
build passed. Focal, Telemetry Core and formatting gates pass. The first global
Go run failed only in `TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles`
with `recording commit exceeded budget`; that test then passed 10/10 in
isolation and a second global run passed completely. Keep this flake visible,
but do not attribute it to ISA-160: the audit delta does not touch recording or
the coordinator. `go vet ./internal/telemetry/...` still reports exactly the
two inherited Windows `unsafe.Pointer` warnings in `reader_windows.go:85` and
`version_windows.go:197`; those out-of-scope files remain unchanged.

Execution state:

- [x] `gofmt` and `gofmt -l` clean.
- [x] `pnpm --dir frontend install --frozen-lockfile` exits 0 without tracked
  changes; `pnpm --dir frontend build` passes.
- [x] Fresh LMU smoke passes for build `1.4.0.0`, supported/live and
  `PlayerPresent=false`, without raw or PII.
- [x] Strategy signal audit focal x20 passes.
- [x] `go test -count=1 ./internal/telemetry/...` passes.
- [x] `go vet ./internal/telemetry/...` re-run; only the two inherited
  `unsafe.Pointer` warnings above remain.
- [x] `git diff --check`, including new untracked files, passes.
- [x] Global `go test -count=1 ./...` passes on the second run. The first run
  exposed only the SQLite coordinator budget flake; its isolated repeat passed
  10/10 before the complete global rerun passed.
- [x] The previously recorded local gate set passed: frozen frontend install,
  frontend build, focal x20, full Telemetry Core and global Go suite.

- [ ] **Step 3: Review and external handoff**

Review the full diff, request independent specification/security and code-quality reviews, update Linear ISA-160 with the matrix and gate evidence, commit/push, open the PR to `nightly`, and mark it ready for review. Do not merge, promote, release, capture new raw telemetry or start ISA-161.

- [x] Local self-review plus specification and quality reviews completed; all
  findings addressed.
- [x] Linear ISA-160 updated with the final evidence, comment and PR link. It
  remains `In Progress` because the team has no `In Review` state.
- [x] Implementation rebased cleanly as `f26d8e3` on
  `origin/nightly@d195653`; PR #202 is OPEN and ready for review against `nightly`. The
  incoming Discord/changelog and release-manifest changes do not overlap
  ISA-160.
- [x] Historical Branch channel run `31442025096` passed completely for the
  previous published HEAD: policy in 9 s and
  blocking gates in 8m53s; frozen install, build, Go, frontend tests, visual
  advisory and lint advisory all passed. Historical GitGuardian passed too.
  These checks are not reusable for the rebased HEAD. The non-blocking Node 20
  deprecation/checkout-forced-Node-24 warning is outside ISA-160.
- [x] Isaac authorized acceptance and promotion.
- [ ] Publish the rebased HEAD and require CI for that exact published HEAD
  before materializing the authorized merge/promotion. No merge, promotion or
  release has occurred.

## Self-review

- Spec coverage: every required family has source/unit/authority/freshness/state; Fuel is reused; unsupported fields stay absent; the ISA-161 plan is executable; real LMU and existing sanitized fixtures provide evidence.
- Placeholder scan: no TBD/TODO or unspecified error handling remains.
- Type consistency: Fuel uses the existing atomic `schema.Field[energy.Fuel]`; no duplicate amount/capacity runtime fields are introduced; `session.remaining_time` remains derived.
- Scope: production behavior is unchanged. Any new LMU signal discovery requires its own evidence-backed issue.
