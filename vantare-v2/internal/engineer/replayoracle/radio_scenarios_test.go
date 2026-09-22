package replayoracle

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/radio"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

// withCapabilityState rebuilds the fixture manifest with one capability moved
// out of CapabilitySupported, the same failure mode a degrading shared memory
// reader produces.
func withCapabilityState(t *testing.T, snapshot engineerprojection.ObservationSnapshotV1,
	id engineerprojection.CapabilityID, state engineerprojection.CapabilityState) engineerprojection.ObservationSnapshotV1 {
	t.Helper()
	capabilities := []engineerprojection.Capability{
		{ID: engineerprojection.CapabilitySession, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityStandings, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityControls, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityPit, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityFuel, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityGaps, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilitySpatial, State: engineerprojection.CapabilitySupported},
	}
	for index := range capabilities {
		if capabilities[index].ID == id {
			capabilities[index].State = state
		}
	}
	manifest, err := engineerprojection.NewManifest(capabilities)
	if err != nil {
		t.Fatal(err)
	}
	snapshot.Manifest = manifest
	return snapshot
}

// runRadioScenario executes the scripted steps once, re-runs the whole script
// twenty times to prove byte-identical output, then returns the report for
// semantic assertions and the golden comparison.
func runRadioScenario(t *testing.T, id string, limits radio.Limits, steps func(t *testing.T) []radioStep) radioReport {
	t.Helper()
	report := newRadioLab(t, 1000, limits).run(t, id, steps(t))
	want, err := json.Marshal(report)
	if err != nil {
		t.Fatal(err)
	}
	for run := 0; run < 20; run++ {
		again := newRadioLab(t, 1000, limits).run(t, id, steps(t))
		got, err := json.Marshal(again)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(want, got) {
			t.Fatalf("radio scenario %s run %d diverged", id, run)
		}
	}
	return report
}

// TestRadioLabMultiCycle scripts several laps of telemetry: the Spotter opens
// with car_left, renews still_there after the reminder window and downgrades
// the late clear to all_clear because reminders never renew delivery context;
// a second rival leaves inside its started window and earns clear_right, while
// the fuel cascade, a lap completion and cooldown-gated gap reports interleave
// at their own priorities.
func TestRadioLabMultiCycle(t *testing.T) {
	steps := func(t *testing.T) []radioStep {
		return []radioStep{
			{Snapshot: snapV(t, fixtureValues{rivalX: 2.8, fuelSet: true, fuel: 55, lap: 3, sequence: 1}), Drain: true},
			{AdvanceMS: 351, Snapshot: snapV(t, fixtureValues{rivalX: 2.8, fuelSet: true, fuel: 55, lap: 3, sequence: 2}), Drain: true},
			{AdvanceMS: 3000, Snapshot: snapV(t, fixtureValues{rivalX: 2.8, fuelSet: true, fuel: 55, lap: 3, sequence: 3}), Drain: true},
			{AdvanceMS: 400, Snapshot: snapV(t, fixtureValues{rivalX: 25, fuelSet: true, fuel: 55, lap: 3, sequence: 4}), Drain: true},
			{AdvanceMS: 151, Snapshot: snapV(t, fixtureValues{rivalX: 25, fuelSet: true, fuel: 55, lap: 3, sequence: 5}), Drain: true},
			{AdvanceMS: 1, Snapshot: snapV(t, fixtureValues{rivalX: -2.8, fuelSet: true, fuel: 55, lap: 3, sequence: 6}), Drain: true},
			{AdvanceMS: 400, Snapshot: snapV(t, fixtureValues{rivalX: 25, fuelSet: true, fuel: 55, lap: 3, sequence: 7}), Drain: true},
			{AdvanceMS: 151, Snapshot: snapV(t, fixtureValues{rivalX: 25, fuelSet: true, fuel: 55, lap: 3, sequence: 8}), Drain: true},
			{AdvanceMS: 1, Snapshot: snapV(t, fixtureValues{rivalX: 25, fuelSet: true, fuel: 49, lap: 4, sequence: 9}), Drain: true},
			{AdvanceMS: 1, Snapshot: snapV(t, fixtureValues{rivalX: 25, fuelSet: true, fuel: 1.5, lap: 4, sequence: 10}), Drain: true},
			{AdvanceMS: 1, Snapshot: snapV(t, fixtureValues{rivalX: 25, fuelSet: true, fuel: 0.9, lap: 4, sequence: 11}), Drain: true},
		}
	}
	report := runRadioScenario(t, "multi-cycle", radio.Limits{}, steps)

	assertRadioOutcome(t, report, "submitted", "spotter.car_left")
	assertRadioOutcome(t, report, "submitted", "spotter.still_there")
	assertRadioOutcome(t, report, "submitted", "spotter.all_clear")
	assertRadioOutcome(t, report, "submitted", "spotter.car_right")
	assertRadioOutcome(t, report, "submitted", "spotter.clear_right")
	assertRadioOutcome(t, report, "submitted", "fuel.low_half_tank")
	assertRadioOutcome(t, report, "submitted", "fuel.low_2l")
	assertRadioOutcome(t, report, "submitted", "fuel.low_1l")
	assertRadioIntentAbsent(t, report, "fuel.for_pit_now")
	assertRadioOutcome(t, report, "submitted", "laps.lap_completed")
	assertRadioOutcome(t, report, "submitted", "timings.gap_report")
	assertRadioOutcome(t, report, "rejected", "timings.gap_report")
	assertRadioOutcome(t, report, "ack_completed", "spotter.all_clear")
	assertRadioOutcome(t, report, "ack_completed", "spotter.clear_right")
	if countRadioOutcomes(report, "ack_failed", "") != 0 {
		t.Fatalf("unexpected delivery failure: %+v", report.Outcomes)
	}
	assertRadioGolden(t, report, "multi-cycle.golden.json")
}

// TestRadioLabSaturation fills the bounded pending queue with family traffic
// while a delivery is in flight, proves new work is rejected once full, then
// shows one P0 spotter message dropping every queued non-P0 and interrupting
// the active delivery before being delivered itself.
func TestRadioLabSaturation(t *testing.T) {
	limits := radio.DefaultLimits()
	limits.MaxPending = 3
	limits.Cooldowns = nil

	steps := func(t *testing.T) []radioStep {
		return []radioStep{
			{Snapshot: snapV(t, fixtureValues{rivalX: 25, fuelSet: true, fuel: 1.4, lap: 3, sequence: 1}), Drain: true, Hold: true},
			{AdvanceMS: 100, Snapshot: snapV(t, fixtureValues{rivalX: 25, fuelSet: true, fuel: 0.9, lap: 4, sequence: 2})},
			{AdvanceMS: 100, Snapshot: snapV(t, fixtureValues{rivalX: 2.8, fuelSet: true, fuel: 0.9, lap: 4, sequence: 3}), Drain: true},
			{AdvanceMS: 3100, Snapshot: snapV(t, fixtureValues{rivalX: 2.8, fuelSet: true, fuel: 0.9, lap: 4, sequence: 4}), Drain: true},
		}
	}
	report := runRadioScenario(t, "saturation", limits, steps)

	assertRadioOutcome(t, report, "held", "fuel.low_2l")
	assertRadioIntentAbsent(t, report, "fuel.for_pit_now")
	assertRadioOutcome(t, report, "rejected", "fuel.laps_remaining_2")
	assertRadioOutcome(t, report, "rejected", "laps.lap_completed")
	assertRadioOutcome(t, report, "rejected", "timings.gap_report")
	assertRadioOutcome(t, report, "dropped", "fuel.low_1l")
	assertRadioOutcome(t, report, "preempted_active", "spotter.car_left")
	assertRadioOutcome(t, report, "ack_interrupted", "fuel.low_2l")
	assertRadioOutcome(t, report, "ack_completed", "spotter.car_left")
	assertRadioOutcome(t, report, "ack_completed", "spotter.still_there")
	assertRadioGolden(t, report, "saturation.golden.json")
}

// TestRadioLabDegradation loses the spatial capability with a spotter delivery
// in flight (started deliveries survive intent resets), loses the fuel
// capability with a queued fuel message (pending work is purged), drops the
// source entirely, and proves the reconnect boundary: stale snapshots are
// rejected until a strictly newer one resumes the stream.
func TestRadioLabDegradation(t *testing.T) {
	steps := func(t *testing.T) []radioStep {
		degradedSpatial := withCapabilityState(t,
			fixtureObservation(t, fixtureValues{rivalX: 2.8, fuelSet: true, fuel: 49, lap: 3, sequence: 2}),
			engineerprojection.CapabilitySpatial, engineerprojection.CapabilityDegraded)
		degradedFuel := withCapabilityState(t,
			fixtureObservation(t, fixtureValues{rivalX: 25, fuelSet: true, fuel: 49, lap: 3, sequence: 3}),
			engineerprojection.CapabilityFuel, engineerprojection.CapabilityDegraded)
		return []radioStep{
			{Snapshot: snapV(t, fixtureValues{rivalX: 2.8, fuelSet: true, fuel: 55, lap: 3, sequence: 1}), Drain: true, Hold: true},
			{AdvanceMS: 100, Snapshot: &degradedSpatial},
			{AdvanceMS: 100, Release: true, Snapshot: &degradedFuel},
			{AdvanceMS: 100, Facts: []engineerprojection.FactEnvelopeV1{
				fixtureFact(engineerprojection.FactConnectionLost, 1, 1),
			}},
			{AdvanceMS: 100, Snapshot: snapV(t, fixtureValues{rivalX: 2.8, fuelSet: true, fuel: 49, lap: 3, sequence: 4})},
			{AdvanceMS: 100, Facts: []engineerprojection.FactEnvelopeV1{
				fixtureFact(engineerprojection.FactConnectionRecovered, 1, 2),
			}},
			{AdvanceMS: 100, Snapshot: snapV(t, fixtureValues{rivalX: -2.8, fuelSet: true, fuel: 49, lap: 3, sequence: 1})},
			{AdvanceMS: 100, Snapshot: snapV(t, fixtureValues{rivalX: -2.8, fuelSet: true, fuel: 49, lap: 3, sequence: 5}), Drain: true},
		}
	}
	report := runRadioScenario(t, "degradation", radio.Limits{}, steps)

	assertRadioOutcome(t, report, "held", "spotter.car_left")
	assertRadioOutcome(t, report, "spotter_unavailable", "")
	assertRadioOutcome(t, report, "ack_completed", "spotter.car_left")
	assertRadioOutcome(t, report, "submitted", "fuel.low_half_tank")
	assertRadioOutcome(t, report, "intents_reset", "")
	assertRadioDetail(t, report, "intents_reset", "fuel.low_half_tank")
	assertRadioOutcome(t, report, "reset", "")
	assertRadioOutcome(t, report, "snapshot_rejected", "")
	assertRadioOutcome(t, report, "ack_completed", "spotter.car_right")
	assertRadioGolden(t, report, "degradation.golden.json")
}

func snapV(t *testing.T, values fixtureValues) *engineerprojection.ObservationSnapshotV1 {
	t.Helper()
	snapshot := fixtureObservation(t, values)
	return &snapshot
}

func assertRadioOutcome(t *testing.T, report radioReport, event, intent string) {
	t.Helper()
	for _, outcome := range report.Outcomes {
		if outcome.Event == event && outcome.Intent == intent {
			return
		}
	}
	t.Fatalf("missing outcome %s %s: %+v", event, intent, report.Outcomes)
}

func assertRadioIntentAbsent(t *testing.T, report radioReport, intent string) {
	t.Helper()
	for _, outcome := range report.Outcomes {
		if outcome.Intent == intent {
			t.Fatalf("unauthorized intent %s: %+v", intent, outcome)
		}
	}
}

func assertRadioDetail(t *testing.T, report radioReport, event, detail string) {
	t.Helper()
	for _, outcome := range report.Outcomes {
		if outcome.Event == event && bytes.Contains([]byte(outcome.Detail), []byte(detail)) {
			return
		}
	}
	t.Fatalf("missing outcome %s with detail %q: %+v", event, detail, report.Outcomes)
}

func countRadioOutcomes(report radioReport, event, intent string) int {
	count := 0
	for _, outcome := range report.Outcomes {
		if outcome.Event == event && outcome.Intent == intent {
			count++
		}
	}
	return count
}

func assertRadioGolden(t *testing.T, report radioReport, name string) {
	t.Helper()
	encoded, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join("testdata", "radio", name)
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v\ngenerated golden:\n%s", err, encoded)
	}
	if !bytes.Equal(append(encoded, '\n'), want) {
		t.Fatalf("radio golden %s mismatch\ngenerated:\n%s", name, encoded)
	}
}
