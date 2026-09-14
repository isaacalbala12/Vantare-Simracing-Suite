package derive

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

// TestControlSampleCarriesCanonicalSpeedRPMGearWithQuality is the A1 RED triple,
// part 1 (fuente/procedencia): SpeedMPS/EngineRPM/Gear must come from the active
// canonical VehicleState as schema.Field, preserving present/freshness/
// provenance, with SpeedMPS in m/s (the source unit, never km/h).
func TestControlSampleCarriesCanonicalSpeedRPMGearWithQuality(t *testing.T) {
	pipeline := NewPipeline(Config{})
	speed, err := schema.NewField(82.5, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	rpm, err := schema.NewField(vehicle.EngineRPM(7250), schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	gear, err := schema.NewField(vehicle.Gear(4), schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	output, err := pipeline.Apply(context.Background(), observedSnapshotWithMotion(
		t, 1, 1, "event-a", "session-a", "vehicle-a",
		schema.FreshnessFresh, .75, .125, 0,
		speed, rpm, gear,
	))
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	state, _ := output.Value()
	if len(state.Derived.ControlsHistory.Samples) != 1 {
		t.Fatalf("samples = %d, want 1", len(state.Derived.ControlsHistory.Samples))
	}
	sample := state.Derived.ControlsHistory.Samples[0]
	if got, present := sample.SpeedMPS.Value(); !present || got != 82.5 {
		t.Fatalf("SpeedMPS = %v, %v; want 82.5 present (m/s, fuente canonica)", got, present)
	}
	if sample.SpeedMPS.Freshness() != schema.FreshnessFresh {
		t.Fatalf("SpeedMPS freshness = %v, want fresh", sample.SpeedMPS.Freshness())
	}
	if sample.SpeedMPS.Provenance() != schema.ProvenanceObserved {
		t.Fatalf("SpeedMPS provenance = %v, want observed", sample.SpeedMPS.Provenance())
	}
	if got, present := sample.EngineRPM.Value(); !present || got != vehicle.EngineRPM(7250) {
		t.Fatalf("EngineRPM = %v, %v; want 7250 present", got, present)
	}
	if sample.EngineRPM.Freshness() != schema.FreshnessFresh || sample.EngineRPM.Provenance() != schema.ProvenanceObserved {
		t.Fatalf("EngineRPM quality not preserved: %+v", sample.EngineRPM)
	}
	if got, present := sample.Gear.Value(); !present || got != vehicle.Gear(4) {
		t.Fatalf("Gear = %v, %v; want 4 present", got, present)
	}
	if sample.Gear.Freshness() != schema.FreshnessFresh || sample.Gear.Provenance() != schema.ProvenanceObserved {
		t.Fatalf("Gear quality not preserved: %+v", sample.Gear)
	}
}

// TestControlSampleKeepsRealCaptureInstant is the A1 RED triple, part 2
// (timestamps reales): every sample records the envelope reception instant,
// never a reconstructed spacing.
func TestControlSampleKeepsRealCaptureInstant(t *testing.T) {
	pipeline := NewPipeline(Config{})
	var last time.Time
	for sequence := schema.Sequence(1); sequence <= 3; sequence++ {
		output, err := pipeline.Apply(context.Background(), observedSnapshot(
			t, 1, sequence, "event-a", "session-a", "vehicle-a", schema.FreshnessFresh, .1, .2, .3,
		))
		if err != nil {
			t.Fatalf("Apply: %v", err)
		}
		state, _ := output.Value()
		samples := state.Derived.ControlsHistory.Samples
		last = samples[len(samples)-1].CapturedAt
		if want := observedCapturedAt(sequence); !last.Equal(want) {
			t.Fatalf("sample CapturedAt = %v, want %v", last, want)
		}
	}
	state, _ := pipeline.Current()
	current, _ := state.Value()
	samples := current.Derived.ControlsHistory.Samples
	for index := 1; index < len(samples); index++ {
		if !samples[index].CapturedAt.After(samples[index-1].CapturedAt) {
			t.Fatalf("capture instants not monotone: %+v", samples)
		}
	}
}

// TestControlSamplePreservesDegradedMotionQuality is the A1 RED triple,
// part 3 (calidad por muestra): a stale or missing motion field rides along
// with its own quality while fresh pedals still append the sample.
func TestControlSamplePreservesDegradedMotionQuality(t *testing.T) {
	staleSpeed, err := schema.NewField(60.0, schema.ProvenanceObserved, schema.FreshnessStale)
	if err != nil {
		t.Fatal(err)
	}
	rpm, err := schema.NewField(vehicle.EngineRPM(6000), schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	gear, err := schema.NewField(vehicle.Gear(3), schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	pipeline := NewPipeline(Config{})
	output, err := pipeline.Apply(context.Background(), observedSnapshotWithMotion(
		t, 1, 1, "event-a", "session-a", "vehicle-a",
		schema.FreshnessFresh, .5, .5, 0,
		staleSpeed, rpm, gear,
	))
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	state, _ := output.Value()
	if len(state.Derived.ControlsHistory.Samples) != 1 {
		t.Fatalf("stale motion must not block a fresh pedal sample: %+v", state.Derived.ControlsHistory.Samples)
	}
	if got := state.Derived.ControlsHistory.Samples[0].SpeedMPS.Freshness(); got != schema.FreshnessStale {
		t.Fatalf("SpeedMPS freshness = %v, want stale preserved", got)
	}

	missingPipeline := NewPipeline(Config{})
	output, err = missingPipeline.Apply(context.Background(), observedSnapshotWithMotion(
		t, 1, 1, "event-a", "session-a", "vehicle-a",
		schema.FreshnessFresh, .5, .5, 0,
		schema.MissingField[float64](), rpm, gear,
	))
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	missingState, _ := output.Value()
	if len(missingState.Derived.ControlsHistory.Samples) != 1 {
		t.Fatalf("missing motion must not block a fresh pedal sample: %+v", missingState.Derived.ControlsHistory.Samples)
	}
	if _, present := missingState.Derived.ControlsHistory.Samples[0].SpeedMPS.Value(); present {
		t.Fatal("missing SpeedMPS must stay not-present, never zero")
	}
}

// TestControlsHistoryKeepsLimitResetAndAlignmentWithMotion is the A1 RED
// triple, part 4 (tope/reset/alineacion): max 120 samples, reset vigente por
// epoch + SameSession, and the motion fields stay aligned with the pedals.
func TestControlsHistoryKeepsLimitResetAndAlignmentWithMotion(t *testing.T) {
	pipeline := NewPipeline(Config{})
	speed, err := schema.NewField(50.0, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	rpm, err := schema.NewField(vehicle.EngineRPM(7000), schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	gear, err := schema.NewField(vehicle.Gear(4), schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	var state FinalState
	for sequence := schema.Sequence(1); sequence <= MaxControlsHistory+1; sequence++ {
		output, err := pipeline.Apply(context.Background(), observedSnapshotWithMotion(
			t, 1, sequence, "event-a", "session-a", "vehicle-a",
			schema.FreshnessFresh, .1, .2, .3,
			speed, rpm, gear,
		))
		if err != nil {
			t.Fatalf("Apply: %v", err)
		}
		state, _ = output.Value()
	}
	if len(state.Derived.ControlsHistory.Samples) != MaxControlsHistory {
		t.Fatalf("samples = %d, want %d", len(state.Derived.ControlsHistory.Samples), MaxControlsHistory)
	}
	first := state.Derived.ControlsHistory.Samples[0]
	if first.Cursor.Sequence != 2 {
		t.Fatalf("oldest sample seq = %d, want 2 (overflow drops the oldest)", first.Cursor.Sequence)
	}
	for index, sample := range state.Derived.ControlsHistory.Samples {
		if _, present := sample.SpeedMPS.Value(); !present {
			t.Fatalf("sample %d lost its motion field: not aligned", index)
		}
		if !sample.CapturedAt.Equal(observedCapturedAt(sample.Cursor.Sequence)) {
			t.Fatalf("sample %d lost its capture instant", index)
		}
	}

	reset, err := pipeline.Apply(context.Background(), observedSnapshotWithMotion(
		t, 2, 1, "event-a", "session-a", "vehicle-a",
		schema.FreshnessFresh, .4, .5, .6,
		speed, rpm, gear,
	))
	if err != nil {
		t.Fatalf("reset Apply: %v", err)
	}
	resetState, _ := reset.Value()
	if len(resetState.Derived.ControlsHistory.Samples) != 1 {
		t.Fatalf("epoch reset must restart the series: %+v", resetState.Derived.ControlsHistory.Samples)
	}
	if _, present := resetState.Derived.ControlsHistory.Samples[0].Gear.Value(); !present {
		t.Fatal("reset sample lost its motion fields")
	}
}

// observedSnapshotWithMotion mirrors observedSnapshot but also drives the
// canonical motion fields of the active vehicle.
func observedSnapshotWithMotion(
	t *testing.T,
	epoch schema.Epoch,
	sequence schema.Sequence,
	event identity.EventID,
	sessionID identity.SessionID,
	vehicleID identity.VehicleID,
	freshness schema.Freshness,
	throttle, brake, clutch schema.Ratio,
	speed schema.Field[float64],
	rpm schema.Field[vehicle.EngineRPM],
	gear schema.Field[vehicle.Gear],
) envelope.Snapshot[core.ObservedState] {
	t.Helper()
	field := func(value schema.Ratio) schema.Field[schema.Ratio] {
		if freshness == schema.FreshnessMissing {
			return schema.MissingField[schema.Ratio]()
		}
		result, err := schema.NewField(value, schema.ProvenanceObserved, freshness)
		if err != nil {
			t.Fatalf("create field: %v", err)
		}
		return result
	}
	header := envelope.Header{
		Cursor: schema.Cursor{Epoch: epoch, Sequence: sequence},
		Identity: identity.RunIdentity{
			Event: event, Session: sessionID, Vehicle: vehicleID,
		},
		Clock: schema.NewClock(
			schema.Field[time.Duration]{}, schema.Field[time.Duration]{},
			observedOrigin.Add(time.Duration(sequence)*50*time.Millisecond),
		),
	}
	state := core.ObservedState{Vehicles: []core.VehicleState{{
		Identity:  header.Identity,
		Throttle:  field(throttle),
		Brake:     field(brake),
		Clutch:    field(clutch),
		SpeedMPS:  speed,
		EngineRPM: rpm,
		Gear:      gear,
	}}}
	snapshot, err := envelope.NewSnapshot(header, state, cloneObservedForTest)
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}
