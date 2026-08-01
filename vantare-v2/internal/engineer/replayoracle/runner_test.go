package replayoracle

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/projectioninput"
	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestVirtualClockIsMonotonic(t *testing.T) {
	t.Parallel()

	clock := NewVirtualClock(1_000)
	if err := clock.Advance(250); err != nil {
		t.Fatal(err)
	}
	if got := clock.NowMS(); got != 1_250 {
		t.Fatalf("NowMS() = %d, want 1250", got)
	}
	if err := clock.Advance(-1); !errors.Is(err, ErrClockMovedBackwards) {
		t.Fatalf("Advance(-1) error = %v", err)
	}
	if got := clock.NowMS(); got != 1_250 {
		t.Fatalf("failed advance changed clock to %d", got)
	}
}

func TestVirtualClockRejectsOverflowAndUnsafeTime(t *testing.T) {
	t.Parallel()

	clock := NewVirtualClock(MaxVirtualTimeMS)
	if err := clock.Advance(1); !errors.Is(err, ErrClockOutOfRange) {
		t.Fatalf("Advance past safe range error = %v", err)
	}
	if got := clock.NowMS(); got != MaxVirtualTimeMS {
		t.Fatalf("failed advance changed clock to %d", got)
	}
	overflow := NewVirtualClock(math.MaxInt64)
	if err := overflow.Advance(1); !errors.Is(err, ErrClockOutOfRange) {
		t.Fatalf("MaxInt64 + 1 error = %v", err)
	}
	if got := overflow.NowMS(); got != math.MaxInt64 {
		t.Fatalf("overflow changed clock to %d", got)
	}
	if _, err := NewRunner().Run(Scenario{Version: ScenarioVersionV1, ID: "unsafe-start", StartMS: math.MaxInt64}); !errors.Is(err, ErrInvalidScenario) {
		t.Fatalf("unsafe scenario start error = %v", err)
	}
}

func TestRunnerRejectsOverflowedMessageDeadline(t *testing.T) {
	t.Parallel()

	state := newRunState(Scenario{Version: ScenarioVersionV1, ID: "invalid-deadline", StartMS: 1_000})
	state.queue.Enqueue(audio.Message{
		ID:        "overflowed",
		TextKey:   "spotter.car_left",
		Category:  audio.CategorySpotter,
		CreatedAt: MaxVirtualTimeMS,
		ExpiresAt: -1,
	})
	state.drain(0, OutcomeEmitted, ReasonCandidateEmitted)
	if !hasOutcome(state.report, OutcomeUnavailable, ReasonInvalidObservation, projectioninput.FamilySpotter) {
		t.Fatalf("overflowed deadline was not rejected: %+v", state.report.Outcomes)
	}
}

func TestRunnerApprovedFamiliesAreDeterministicAndMatchGolden(t *testing.T) {
	t.Parallel()

	scenario := approvedFamiliesScenario(t)
	var baseline []byte
	for run := 0; run < 20; run++ {
		report, err := NewRunner().Run(scenario)
		if err != nil {
			t.Fatalf("run %d: %v", run, err)
		}
		encoded, err := json.MarshalIndent(report, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		encoded = append(encoded, '\n')
		if run == 0 {
			baseline = encoded
			continue
		}
		if !bytes.Equal(encoded, baseline) {
			t.Fatalf("run %d drifted from deterministic baseline", run)
		}
	}

	want, err := os.ReadFile(filepath.Join("testdata", "v1", "approved-families.golden.json"))
	if err != nil {
		t.Fatalf("%v\ngenerated golden:\n%s", err, baseline)
	}
	if !bytes.Equal(baseline, want) {
		t.Fatalf("golden drift (-want +got):\nwant:\n%s\ngot:\n%s", want, baseline)
	}
}

func TestRunnerClassifiesEveryObservableOutcome(t *testing.T) {
	t.Parallel()

	left := fixtureObservation(t, fixtureValues{rivalX: 2.8})
	penalty := fixtureObservation(t, fixtureValues{penalties: 1})
	far := fixtureObservation(t, fixtureValues{epoch: 2, rivalX: 25})
	newEpoch := fixtureObservation(t, fixtureValues{epoch: 2, rivalX: 2.8})
	missingFuel := fixtureObservation(t, fixtureValues{epoch: 2, missingFuel: true})
	zeroFuel := fixtureObservation(t, fixtureValues{epoch: 2, fuelSet: true, fuel: 0})

	report, err := NewRunner().Run(Scenario{
		Version: ScenarioVersionV1,
		ID:      "outcome-contract",
		Seed:    42,
		StartMS: 1_000,
		Steps: []Step{
			{Snapshot: &left, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}, Hold: true},
			{AdvanceMS: 1_001, Drain: true},
			{Snapshot: &penalty, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPenalties}, Hold: true},
			{AdvanceMS: 1, Snapshot: &newEpoch, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}},
			{Snapshot: &zeroFuel, Families: []projectioninput.MonitorFamily{projectioninput.FamilyFuel}},
			{Snapshot: &missingFuel, Families: []projectioninput.MonitorFamily{projectioninput.FamilyFuel}},
			{Snapshot: &far, Families: []projectioninput.MonitorFamily{projectioninput.FamilyTyre}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	states := make(map[OutcomeState]bool)
	for _, outcome := range report.Outcomes {
		states[outcome.State] = true
	}
	for _, state := range []OutcomeState{OutcomeEmitted, OutcomeSuppressed, OutcomeExpired, OutcomeCancelled, OutcomeUnavailable} {
		if !states[state] {
			t.Fatalf("missing outcome state %q in %+v", state, report.Outcomes)
		}
	}
	if !hasOutcome(report, OutcomeSuppressed, ReasonNoCandidate, projectioninput.FamilyFuel) {
		t.Fatalf("fresh legitimate fuel zero was not treated as a usable no-candidate: %+v", report.Outcomes)
	}
	if !hasOutcome(report, OutcomeUnavailable, ReasonObservationNotReady, projectioninput.FamilyFuel) {
		t.Fatalf("missing fuel was not unavailable: %+v", report.Outcomes)
	}
	if !hasOutcome(report, OutcomeUnavailable, ReasonFamilyNotApproved, projectioninput.FamilyTyre) {
		t.Fatalf("disabled tyre family was not unavailable: %+v", report.Outcomes)
	}
}

func TestRunnerFailsClosedOnContextQualityAndVersion(t *testing.T) {
	t.Parallel()

	base := fixtureObservation(t, fixtureValues{epoch: 2, rivalX: 2.8})
	staleEpoch := fixtureObservation(t, fixtureValues{epoch: 1, rivalX: 2.8})
	sameEpochDifferentSession := fixtureObservation(t, fixtureValues{epoch: 2, sessionID: "other-session", rivalX: 2.8})
	unknownVersion := fixtureObservation(t, fixtureValues{epoch: 3, rivalX: 2.8})
	unknownVersion.ProjectionVersion = projection.Version(99)
	staleFuel := fixtureObservation(t, fixtureValues{staleFuel: true})

	tests := []struct {
		name       string
		steps      []Step
		wantReason Reason
	}{
		{
			name: "epoch moved backwards",
			steps: []Step{
				{Snapshot: &base, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}, Hold: true},
				{Snapshot: &staleEpoch, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}},
			},
			wantReason: ReasonStaleContext,
		},
		{
			name: "identity changed without epoch",
			steps: []Step{
				{Snapshot: &base, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}, Hold: true},
				{Snapshot: &sameEpochDifferentSession, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}},
			},
			wantReason: ReasonInvalidIdentityChange,
		},
		{
			name:       "unknown projection version",
			steps:      []Step{{Snapshot: &unknownVersion, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}}},
			wantReason: ReasonUnknownProjectionVersion,
		},
		{
			name:       "stale required field",
			steps:      []Step{{Snapshot: &staleFuel, Families: []projectioninput.MonitorFamily{projectioninput.FamilyFuel}}},
			wantReason: ReasonObservationNotReady,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			report, err := NewRunner().Run(Scenario{Version: ScenarioVersionV1, ID: tt.name, Steps: tt.steps})
			if err != nil {
				t.Fatal(err)
			}
			found := false
			for _, outcome := range report.Outcomes {
				if outcome.State == OutcomeUnavailable && outcome.Reason == tt.wantReason {
					found = true
				}
			}
			if !found {
				t.Fatalf("missing unavailable/%s in %+v", tt.wantReason, report.Outcomes)
			}
		})
	}
}

func TestRunnerOrdersFactsAndCancelsAtLifecycleBoundaries(t *testing.T) {
	t.Parallel()

	left := fixtureObservation(t, fixtureValues{rivalX: 2.8})
	lost := fixtureFact(engineerprojection.FactConnectionLost, 1, 1)
	duplicate := fixtureFact(engineerprojection.FactConnectionRecovered, 1, 1)
	unknown := fixtureFact(engineerprojection.FactKind("future.fact"), 1, 2)

	report, err := NewRunner().Run(Scenario{
		Version: ScenarioVersionV1,
		ID:      "ordered-facts",
		Steps: []Step{
			{Snapshot: &left, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}, Hold: true},
			{Facts: []engineerprojection.FactEnvelopeV1{lost}},
			{Facts: []engineerprojection.FactEnvelopeV1{duplicate}},
			{Facts: []engineerprojection.FactEnvelopeV1{unknown}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !hasOutcome(report, OutcomeCancelled, ReasonFactBoundary, projectioninput.FamilySpotter) {
		t.Fatalf("connection loss did not cancel the pending spotter decision: %+v", report.Outcomes)
	}
	if !hasOutcome(report, OutcomeUnavailable, ReasonStaleFact, "") {
		t.Fatalf("duplicate fact cursor was not rejected: %+v", report.Outcomes)
	}
	if !hasOutcome(report, OutcomeUnavailable, ReasonUnknownFact, "") {
		t.Fatalf("unknown fact kind was not rejected: %+v", report.Outcomes)
	}
}

func TestRunnerSessionStartedFactCancelsPendingFromPreviousSession(t *testing.T) {
	t.Parallel()

	left := fixtureObservation(t, fixtureValues{rivalX: 2.8})
	started := fixtureFact(engineerprojection.FactSessionStarted, 2, 1)
	report, err := NewRunner().Run(Scenario{
		Version: ScenarioVersionV1,
		ID:      "session-start-boundary",
		Steps: []Step{
			{Snapshot: &left, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}, Hold: true},
			{Facts: []engineerprojection.FactEnvelopeV1{started}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !hasOutcome(report, OutcomeCancelled, ReasonFactBoundary, projectioninput.FamilySpotter) {
		t.Fatalf("session start did not cancel prior pending decision: %+v", report.Outcomes)
	}
	for _, outcome := range report.Outcomes {
		if outcome.Family == projectioninput.FamilySpotter && outcome.State == OutcomeEmitted {
			t.Fatalf("old-session spotter message escaped after session start: %+v", outcome)
		}
	}
}

func TestRunnerRejectsMalformedFactTime(t *testing.T) {
	t.Parallel()

	fact := fixtureFact(engineerprojection.FactLapCompleted, 1, 1)
	fact.Fact.OccurredAt = "not-a-time"
	report, err := NewRunner().Run(Scenario{
		Version: ScenarioVersionV1,
		ID:      "malformed-fact-time",
		Steps:   []Step{{Facts: []engineerprojection.FactEnvelopeV1{fact}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !hasOutcome(report, OutcomeUnavailable, ReasonStaleFact, "") {
		t.Fatalf("malformed fact time was not rejected: %+v", report.Outcomes)
	}
}

func TestRunnerCancelsPendingDecisionsOnSessionVehicleAndDriverChanges(t *testing.T) {
	t.Parallel()

	base := fixtureObservation(t, fixtureValues{epoch: 1, rivalX: 2.8})
	tests := []struct {
		name string
		next engineerprojection.ObservationSnapshotV1
	}{
		{name: "session", next: fixtureObservation(t, fixtureValues{epoch: 2, sessionID: "session-b", rivalX: 2.8})},
		{name: "vehicle", next: fixtureObservation(t, fixtureValues{epoch: 2, vehicleID: "player-b", rivalX: 2.8})},
		{name: "driver", next: fixtureObservation(t, fixtureValues{epoch: 1, driverID: "driver-b", rivalX: 2.8})},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			report, err := NewRunner().Run(Scenario{
				Version: ScenarioVersionV1,
				ID:      "boundary-" + tt.name,
				Steps: []Step{
					{Snapshot: &base, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}, Hold: true},
					{Snapshot: &tt.next, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}},
				},
			})
			if err != nil {
				t.Fatal(err)
			}
			if !hasOutcome(report, OutcomeCancelled, ReasonIdentityChanged, projectioninput.FamilySpotter) {
				t.Fatalf("%s change did not cancel pending decision: %+v", tt.name, report.Outcomes)
			}
		})
	}
}

func TestRunnerRejectsCapabilityContradictionAndUnknownFamily(t *testing.T) {
	t.Parallel()

	snapshot := fixtureObservation(t, fixtureValues{})
	manifest, err := engineerprojection.NewManifest([]engineerprojection.Capability{
		{ID: engineerprojection.CapabilitySession, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityStandings, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityControls, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityPit, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityFuel, State: engineerprojection.CapabilityDegraded},
		{ID: engineerprojection.CapabilityGaps, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilitySpatial, State: engineerprojection.CapabilitySupported},
	})
	if err != nil {
		t.Fatal(err)
	}
	snapshot.Manifest = manifest
	unknown := projectioninput.MonitorFamily("future-family")
	report, err := NewRunner().Run(Scenario{
		Version: ScenarioVersionV1,
		ID:      "capability-fail-closed",
		Steps: []Step{
			{Snapshot: &snapshot, Families: []projectioninput.MonitorFamily{projectioninput.FamilyFuel, unknown}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !hasOutcome(report, OutcomeUnavailable, ReasonObservationNotReady, projectioninput.FamilyFuel) {
		t.Fatalf("degraded capability was not fail-closed: %+v", report.Outcomes)
	}
	if !hasOutcome(report, OutcomeUnavailable, ReasonUnknownFamily, unknown) {
		t.Fatalf("unknown family was not fail-closed: %+v", report.Outcomes)
	}
}

func TestRunnerValidatesCanonicalVehicleBudgetBeforeAdapting(t *testing.T) {
	t.Parallel()

	base := fixtureObservation(t, fixtureValues{})
	tests := []struct {
		name       string
		count      int
		wantReason Reason
	}{
		{name: "exact canonical limit", count: core.MaxSessionVehicleHistory},
		{name: "over canonical limit", count: core.MaxSessionVehicleHistory + 1, wantReason: ReasonVehicleLimit},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			snapshot := withVehicleCount(base, tt.count)
			report, err := NewRunner().Run(Scenario{
				Version: ScenarioVersionV1,
				ID:      "vehicle-budget-" + tt.name,
				Steps: []Step{{
					Snapshot: &snapshot,
					Families: []projectioninput.MonitorFamily{projectioninput.FamilyFuel},
				}},
			})
			if err != nil {
				t.Fatal(err)
			}
			if tt.wantReason == "" {
				if hasOutcome(report, OutcomeUnavailable, ReasonVehicleLimit, projectioninput.FamilyFuel) {
					t.Fatalf("exact vehicle limit was rejected: %+v", report.Outcomes)
				}
				if !hasOutcome(report, OutcomeSuppressed, ReasonNoCandidate, projectioninput.FamilyFuel) {
					t.Fatalf("exact vehicle limit did not traverse adapter/runtime: %+v", report.Outcomes)
				}
				return
			}
			if !hasOutcome(report, OutcomeUnavailable, tt.wantReason, projectioninput.FamilyFuel) {
				t.Fatalf("over-limit snapshot was not rejected before adaptation: %+v", report.Outcomes)
			}
		})
	}
}

func TestRunnerRejectsEveryPartialOrDisabledFamily(t *testing.T) {
	t.Parallel()

	snapshot := fixtureObservation(t, fixtureValues{})
	for _, contract := range projectioninput.MonitorContracts() {
		if contract.State == projectioninput.ParityApproved {
			continue
		}
		contract := contract
		t.Run(string(contract.Family), func(t *testing.T) {
			t.Parallel()
			report, err := NewRunner().Run(Scenario{
				Version: ScenarioVersionV1,
				ID:      "blocked-" + string(contract.Family),
				Steps: []Step{{
					Snapshot: &snapshot,
					Families: []projectioninput.MonitorFamily{contract.Family},
				}},
			})
			if err != nil {
				t.Fatal(err)
			}
			if !hasOutcome(report, OutcomeUnavailable, ReasonFamilyNotApproved, contract.Family) {
				t.Fatalf("family %q with parity %q did not fail closed: %+v", contract.Family, contract.State, report.Outcomes)
			}
		})
	}
}

func TestRunnerDoesNotApproveLegacyDecisionsOutsideCharacterizedScenarios(t *testing.T) {
	t.Parallel()

	penalty0 := fixtureObservation(t, fixtureValues{penalties: 0})
	penalty1 := fixtureObservation(t, fixtureValues{penalties: 1})
	track := fixtureObservation(t, fixtureValues{inPit: false})
	pitLane := fixtureObservation(t, fixtureValues{inPit: true})
	report, err := NewRunner().Run(Scenario{
		Version: ScenarioVersionV1,
		ID:      "legacy-output-boundary",
		StartMS: 1_000,
		Steps: []Step{
			{Snapshot: &penalty0, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPenalties}},
			{AdvanceMS: 30_000, Snapshot: &penalty1, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPenalties}},
			{Snapshot: &track, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPitStops}},
			{AdvanceMS: 1_000, Snapshot: &pitLane, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPitStops}},
			{AdvanceMS: 1_000, Snapshot: &track, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPitStops}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	for _, outcome := range report.Outcomes {
		if outcome.Family == projectioninput.FamilyPenalties && outcome.TextKey == "penalties.new_drivethrough" && outcome.State != OutcomeUnavailable {
			t.Fatalf("generic penalty counter was presented as proven drive-through: %+v", outcome)
		}
		if outcome.Family == projectioninput.FamilyPitStops &&
			outcome.TextKey != "" && outcome.TextKey != "pitstops.entry" && outcome.TextKey != "pitstops.exit" &&
			outcome.State != OutcomeUnavailable {
			t.Fatalf("unapproved pit decision was presented as emitted: %+v", outcome)
		}
	}
	if !hasOutcome(report, OutcomeUnavailable, ReasonDecisionNotApproved, projectioninput.FamilyPenalties) {
		t.Fatalf("specific penalty claim was not surfaced as unapproved: %+v", report.Outcomes)
	}
	if !hasOutcome(report, OutcomeUnavailable, ReasonDecisionNotApproved, projectioninput.FamilyPitStops) {
		t.Fatalf("extra pit decisions were not surfaced as unapproved: %+v", report.Outcomes)
	}
}

func TestDecisionApprovalMatchesTheCharacterizedBoundary(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		family  projectioninput.MonitorFamily
		textKey string
		want    bool
	}{
		{name: "spotter left", family: projectioninput.FamilySpotter, textKey: "spotter.car_left", want: true},
		{name: "fuel half tank", family: projectioninput.FamilyFuel, textKey: "fuel.low_half_tank", want: true},
		{name: "lap complete", family: projectioninput.FamilyLaps, textKey: "laps.lap_completed", want: true},
		{name: "timing gap", family: projectioninput.FamilyTimings, textKey: "timings.gap_report", want: true},
		{name: "pit entry", family: projectioninput.FamilyPitStops, textKey: "pitstops.entry", want: true},
		{name: "pit exit", family: projectioninput.FamilyPitStops, textKey: "pitstops.exit", want: true},
		{name: "specific penalty from generic counter", family: projectioninput.FamilyPenalties, textKey: "penalties.new_drivethrough"},
		{name: "pit box now", family: projectioninput.FamilyPitStops, textKey: "pitstops.box_now"},
		{name: "pit limiter", family: projectioninput.FamilyPitStops, textKey: "pitstops.engage_limiter"},
		{name: "pit window", family: projectioninput.FamilyPitStops, textKey: "pitstops.pit_window_open"},
		{name: "unknown decision", family: projectioninput.FamilySpotter, textKey: "spotter.future"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := decisionApproved(tt.family, tt.textKey); got != tt.want {
				t.Fatalf("decisionApproved(%q, %q) = %t, want %t", tt.family, tt.textKey, got, tt.want)
			}
		})
	}
}

func TestRunnerRejectsUnboundedHarnessInput(t *testing.T) {
	t.Parallel()

	if got := len(projectioninput.MonitorContracts()); got > MaxFamiliesPerStep {
		t.Fatalf("monitor contracts = %d, runner budget = %d", got, MaxFamiliesPerStep)
	}
	tooMany := make([]Step, MaxScenarioSteps+1)
	if _, err := NewRunner().Run(Scenario{Version: ScenarioVersionV1, ID: "too-large", Steps: tooMany}); !errors.Is(err, ErrScenarioLimit) {
		t.Fatalf("oversized scenario error = %v", err)
	}
	if _, err := NewRunner().Run(Scenario{Version: ScenarioVersionV1, ID: "backwards", Steps: []Step{{AdvanceMS: -1}}}); !errors.Is(err, ErrClockMovedBackwards) {
		t.Fatalf("backwards scenario error = %v", err)
	}
}

func hasOutcome(report Report, state OutcomeState, reason Reason, family projectioninput.MonitorFamily) bool {
	for _, outcome := range report.Outcomes {
		if outcome.State == state && outcome.Reason == reason && outcome.Family == family {
			return true
		}
	}
	return false
}

func approvedFamiliesScenario(t *testing.T) Scenario {
	t.Helper()
	left := fixtureObservation(t, fixtureValues{rivalX: 2.8})
	far := fixtureObservation(t, fixtureValues{rivalX: 25})
	penalty0 := fixtureObservation(t, fixtureValues{penalties: 0})
	penalty1 := fixtureObservation(t, fixtureValues{penalties: 1})
	fuel55 := fixtureObservation(t, fixtureValues{fuelSet: true, fuel: 55, lap: 3})
	fuel49 := fixtureObservation(t, fixtureValues{fuelSet: true, fuel: 49, lap: 4})
	lap3 := fixtureObservation(t, fixtureValues{lap: 3})
	lap4 := fixtureObservation(t, fixtureValues{lap: 4})
	timingA := fixtureObservation(t, fixtureValues{gapLeader: 10, gapNext: 2})
	timingB := fixtureObservation(t, fixtureValues{gapLeader: 11, gapNext: 2.5})
	track := fixtureObservation(t, fixtureValues{inPit: false})
	pitLane := fixtureObservation(t, fixtureValues{inPit: true})

	return Scenario{
		Version: ScenarioVersionV1,
		ID:      "approved-families",
		Seed:    20260801,
		StartMS: 1_000,
		Steps: []Step{
			{Snapshot: &left, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}},
			{AdvanceMS: 351, Snapshot: &far, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}},
			{AdvanceMS: 150, Snapshot: &far, Families: []projectioninput.MonitorFamily{projectioninput.FamilySpotter}},
			{Snapshot: &penalty0, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPenalties}},
			{AdvanceMS: 30_000, Snapshot: &penalty1, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPenalties}},
			{Snapshot: &fuel55, Families: []projectioninput.MonitorFamily{projectioninput.FamilyFuel}},
			{AdvanceMS: 40_000, Snapshot: &fuel49, Families: []projectioninput.MonitorFamily{projectioninput.FamilyFuel}},
			{Snapshot: &lap3, Families: []projectioninput.MonitorFamily{projectioninput.FamilyLaps}},
			{AdvanceMS: 1_000, Snapshot: &lap4, Families: []projectioninput.MonitorFamily{projectioninput.FamilyLaps}},
			{Snapshot: &timingA, Families: []projectioninput.MonitorFamily{projectioninput.FamilyTimings}},
			{AdvanceMS: 61_000, Snapshot: &timingB, Families: []projectioninput.MonitorFamily{projectioninput.FamilyTimings}},
			{Snapshot: &track, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPitStops}},
			{AdvanceMS: 1_000, Snapshot: &pitLane, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPitStops}},
			{AdvanceMS: 1_000, Snapshot: &track, Families: []projectioninput.MonitorFamily{projectioninput.FamilyPitStops}},
		},
	}
}

type fixtureValues struct {
	epoch         uint64
	sessionID     string
	vehicleID     string
	driverID      string
	rivalX        float64
	fuel          float64
	fuelSet       bool
	staleFuel     bool
	missingFuel   bool
	lap           int
	penalties     int
	inPit         bool
	sourceSeconds float64
	gapLeader     float64
	gapNext       float64
}

func fixtureObservation(t *testing.T, values fixtureValues) engineerprojection.ObservationSnapshotV1 {
	t.Helper()
	if values.epoch == 0 {
		values.epoch = 1
	}
	if values.sessionID == "" {
		values.sessionID = "session"
	}
	if values.vehicleID == "" {
		values.vehicleID = "player"
	}
	if values.driverID == "" {
		values.driverID = "driver"
	}
	if values.rivalX == 0 {
		values.rivalX = 2.8
	}
	if !values.fuelSet && !values.missingFuel && !values.staleFuel {
		values.fuel = 55
	}
	if values.lap == 0 {
		values.lap = 3
	}
	if values.sourceSeconds == 0 {
		values.sourceSeconds = 120
	}
	if values.gapLeader == 0 {
		values.gapLeader = 1.5
	}
	if values.gapNext == 0 {
		values.gapNext = 1.5
	}

	run := identity.RunIdentity{Event: "event", Session: identity.SessionID(values.sessionID), Vehicle: identity.VehicleID(values.vehicleID), Team: "team", Driver: identity.DriverID(values.driverID)}
	header := envelope.Header{
		Source:   "eng-04-sanitized-fixture",
		Cursor:   schema.Cursor{Epoch: schema.Epoch(values.epoch), Sequence: 1},
		Clock:    schema.NewClock(observedField(t, time.Duration(values.sourceSeconds*float64(time.Second))), observedField(t, time.Duration(values.sourceSeconds*float64(time.Second))), time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)),
		Identity: run,
	}
	orientation := spatial.Orientation{Row0: spatial.Vector3{X: 1}, Row1: spatial.Vector3{Y: 1}, Row2: spatial.Vector3{Z: 1}}
	player := core.VehicleState{
		Identity: run, DriverName: observedField(t, identity.DriverName("Player")), Name: observedField(t, vehicle.VehicleName("LMU")), VehicleClass: observedField(t, standings.VehicleClass("HYPERCAR")), Player: observedField(t, true),
		LapNumber: observedField(t, session.LapNumber(values.lap)), Gear: observedField(t, vehicle.Gear(4)), EngineRPM: observedField(t, vehicle.EngineRPM(7000)), SpeedMPS: observedField(t, 20.0),
		Throttle: observedField(t, schema.Ratio(0.7)), Brake: observedField(t, schema.Ratio(0)), Clutch: observedField(t, schema.Ratio(0)), Position: observedField(t, standings.Position(1)),
		CompletedLaps: observedField(t, standings.CompletedLaps(values.lap-1)), InPit: observedField(t, pit.InPit(values.inPit)), PitStopCount: observedField(t, pit.StopCount(0)), Sector: observedField(t, standings.SectorOne),
		LapDistance: observedField(t, standings.LapDistance(2000)), BestLapTime: observedField(t, standings.LapTime(210)), LastLapTime: observedField(t, standings.LapTime(211)), EstimatedLapTime: observedField(t, standings.LapTime(210.5)),
		PenaltyCount: observedField(t, standings.PenaltyCount(values.penalties)), TimeBehindLeader: observedField(t, standings.TimeGap(values.gapLeader)), LapsBehindLeader: observedField(t, standings.LapGap(0)),
		TimeBehindNext: observedField(t, standings.TimeGap(values.gapNext)), LapsBehindNext: observedField(t, standings.LapGap(0)),
		WorldPosition: observedField(t, spatial.Position{X: 100, Z: 100}), LocalVelocity: observedField(t, spatial.LocalVelocity{Z: 20}), Orientation: observedField(t, orientation),
	}
	switch {
	case values.missingFuel:
		player.Fuel = schema.MissingField[energy.Fuel]()
	case values.staleFuel:
		player.Fuel = fieldWithQuality(t, energy.Fuel{Amount: 55, Capacity: 100}, schema.ProvenanceObserved, schema.FreshnessStale)
	default:
		player.Fuel = observedField(t, energy.Fuel{Amount: energy.FuelAmount(values.fuel), Capacity: 100})
	}
	rival := player
	rival.Identity.Vehicle = "rival"
	rival.DriverName = observedField(t, identity.DriverName("Rival"))
	rival.Player = observedField(t, false)
	rival.Position = observedField(t, standings.Position(2))
	rival.WorldPosition = observedField(t, spatial.Position{X: 100 + values.rivalX, Z: 100})
	rival.TimeBehindLeader = observedField(t, standings.TimeGap(1.5))
	rival.TimeBehindNext = observedField(t, standings.TimeGap(1.5))

	state := core.ObservedState{
		SourceTime: observedField(t, time.Duration(values.sourceSeconds*float64(time.Second))), EndTime: observedField(t, session.EndTime(3600)), MaximumLaps: observedField(t, session.MaximumLaps(20)),
		TrackName: observedField(t, "Le Mans"), SessionType: observedField(t, session.TypeEndurance), VehicleCount: observedField(t, schema.Count(2)), PlayerPresent: observedField(t, true),
		Vehicles: []core.VehicleState{player, rival},
	}
	final := derive.FinalState{Observed: state, Derived: derive.DerivedState{
		SessionRemaining: fieldWithQuality(t, session.RemainingTime(3480), schema.ProvenanceDerived, schema.FreshnessFresh),
		Gaps: derive.GapSet{Freshness: schema.FreshnessFresh, Vehicles: []derive.VehicleGap{
			{Vehicle: "player", Time: fieldWithQuality(t, standings.RelativeTime(0), schema.ProvenanceDerived, schema.FreshnessFresh), Laps: fieldWithQuality(t, standings.RelativeLaps(0), schema.ProvenanceDerived, schema.FreshnessFresh)},
			{Vehicle: "rival", Time: fieldWithQuality(t, standings.RelativeTime(1.5), schema.ProvenanceDerived, schema.FreshnessFresh), Laps: fieldWithQuality(t, standings.RelativeLaps(0), schema.ProvenanceDerived, schema.FreshnessFresh)},
		}},
	}}
	snapshot, err := envelope.NewSnapshot(header, final, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = slices.Clone(value.Observed.Vehicles)
		value.Derived.Gaps.Vehicles = slices.Clone(value.Derived.Gaps.Vehicles)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := engineerprojection.NewManifest([]engineerprojection.Capability{
		{ID: engineerprojection.CapabilitySession, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityStandings, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityControls, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityPit, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityFuel, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityGaps, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilitySpatial, State: engineerprojection.CapabilitySupported},
	})
	if err != nil {
		t.Fatal(err)
	}
	result, err := engineerprojection.ProjectObservationV1(snapshot, manifest)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func fixtureFact(kind engineerprojection.FactKind, epoch, sequence uint64) engineerprojection.FactEnvelopeV1 {
	return engineerprojection.FactEnvelopeV1{
		Metadata: projection.Metadata{
			CanonicalVersion:  schema.CanonicalVersionV1,
			ProjectionVersion: engineerprojection.VersionV1,
			Epoch:             schema.Epoch(epoch),
			Sequence:          schema.Sequence(sequence),
			CapturedAt:        "2026-08-01T12:00:00Z",
		},
		Fact: engineerprojection.FactV1{
			Sequence:   core.FactSequence(sequence),
			Kind:       kind,
			OccurredAt: "2026-08-01T12:00:00Z",
			VehicleID:  "player",
		},
	}
}

func withVehicleCount(snapshot engineerprojection.ObservationSnapshotV1, count int) engineerprojection.ObservationSnapshotV1 {
	vehicles := make([]engineerprojection.VehicleObservationV1, count)
	for index := range vehicles {
		source := 1
		if index == 0 {
			source = 0
		}
		vehicles[index] = snapshot.Vehicles[source]
		if index != 0 {
			vehicles[index].ID = engineerprojection.VehicleID("vehicle-" + fmt.Sprint(index))
		}
	}
	snapshot.Vehicles = vehicles
	return snapshot
}

func observedField[T comparable](t *testing.T, value T) schema.Field[T] {
	t.Helper()
	return fieldWithQuality(t, value, schema.ProvenanceObserved, schema.FreshnessFresh)
}

func fieldWithQuality[T comparable](t *testing.T, value T, provenance schema.Provenance, freshness schema.Freshness) schema.Field[T] {
	t.Helper()
	result, err := schema.NewField(value, provenance, freshness)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
