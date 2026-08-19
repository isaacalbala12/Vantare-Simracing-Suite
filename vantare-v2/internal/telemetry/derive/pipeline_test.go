package derive

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func TestPipelineGoldenReplayOrderQualityAndOwnership(t *testing.T) {
	pipeline := NewPipeline(Config{MaxControlsHistory: 3})
	inputs := []envelope.Snapshot[core.ObservedState]{
		observedSnapshot(t, 1, 1, "event-a", "session-a", "vehicle-a", schema.FreshnessFresh, .1, .2, .3),
		observedSnapshot(t, 1, 2, "event-a", "session-a", "vehicle-a", schema.FreshnessStale, .4, .5, .6),
		observedSnapshot(t, 1, 3, "event-a", "session-a", "vehicle-a", schema.FreshnessFresh, .7, .8, .9),
		observedSnapshot(t, 1, 4, "event-a", "session-a", "vehicle-a", schema.FreshnessFresh, 0, 0, 0),
		observedSnapshot(t, 1, 5, "event-a", "session-a", "vehicle-a", schema.FreshnessFresh, 1, 1, 1),
	}

	var got FinalState
	for _, input := range inputs {
		output, err := pipeline.Apply(context.Background(), input)
		if err != nil {
			t.Fatalf("apply replay: %v", err)
		}
		if output.Header() != input.Header() {
			t.Fatal("pipeline changed the observed header")
		}
		got, _ = output.Value()
	}

	want := []ControlSample{
		{Cursor: schema.Cursor{Epoch: 1, Sequence: 3}, Vehicle: "vehicle-a", Throttle: .7, Brake: .8, Clutch: .9},
		{Cursor: schema.Cursor{Epoch: 1, Sequence: 4}, Vehicle: "vehicle-a", Throttle: 0, Brake: 0, Clutch: 0},
		{Cursor: schema.Cursor{Epoch: 1, Sequence: 5}, Vehicle: "vehicle-a", Throttle: 1, Brake: 1, Clutch: 1},
	}
	if !reflect.DeepEqual(got.Derived.ControlsHistory.Samples, want) {
		t.Fatalf("golden history:\n got  %+v\n want %+v", got.Derived.ControlsHistory.Samples, want)
	}
	if got.Derived.ControlsHistory.Freshness != schema.FreshnessFresh {
		t.Fatalf("history freshness = %v", got.Derived.ControlsHistory.Freshness)
	}
	if got.Derived.Gaps.Freshness != schema.FreshnessMissing ||
		got.Derived.Delta.Freshness != schema.FreshnessMissing {
		t.Fatal("unproven gap/delta must remain explicitly missing")
	}
	if !reflect.DeepEqual(got.Derived.Algorithms, []AlgorithmVersion{
		{ID: DerivationControlsHistory, Version: 1},
		{ID: DerivationSessionRemaining, Version: 1},
		{ID: DerivationRelativeGaps, Version: 1},
		{ID: DerivationSelfDelta, Version: 1},
	}) {
		t.Fatalf("snapshot algorithms = %+v", got.Derived.Algorithms)
	}

	got.Observed.Vehicles[0].Identity.Vehicle = "mutated"
	got.Derived.ControlsHistory.Samples[0].Vehicle = "mutated"
	got.Derived.Algorithms[0].Version = 99
	current, ok := pipeline.Current()
	if !ok {
		t.Fatal("missing current snapshot")
	}
	owned, _ := current.Value()
	if owned.Observed.Vehicles[0].Identity.Vehicle != "vehicle-a" ||
		owned.Derived.ControlsHistory.Samples[0].Vehicle != "vehicle-a" ||
		owned.Derived.Algorithms[0].Version != 1 {
		t.Fatal("consumer mutated pipeline-owned state")
	}
}

func TestPipelineMissingInvalidStaleDoNotEnterHistory(t *testing.T) {
	tests := []struct {
		name      string
		freshness schema.Freshness
	}{
		{name: "missing", freshness: schema.FreshnessMissing},
		{name: "invalid", freshness: schema.FreshnessInvalid},
		{name: "stale", freshness: schema.FreshnessStale},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			pipeline := NewPipeline(Config{})
			output, err := pipeline.Apply(context.Background(), observedSnapshot(
				t, 1, 1, "event", "session", "vehicle", test.freshness, .1, .2, .3,
			))
			if err != nil {
				t.Fatalf("Apply: %v", err)
			}
			state, _ := output.Value()
			if len(state.Derived.ControlsHistory.Samples) != 0 {
				t.Fatalf("history accepted %s input", test.name)
			}
			if state.Derived.ControlsHistory.Freshness != test.freshness {
				t.Fatalf("freshness = %v, want %v", state.Derived.ControlsHistory.Freshness, test.freshness)
			}
		})
	}
}

func TestPipelineResetsHistoryAtEveryDeclaredIdentityBoundary(t *testing.T) {
	tests := []struct {
		name    string
		event   identity.EventID
		session identity.SessionID
		vehicle identity.VehicleID
	}{
		{name: "epoch", event: "event-a", session: "session-a", vehicle: "vehicle-a"},
		{name: "session", event: "event-a", session: "session-b", vehicle: "vehicle-a"},
		{name: "run", event: "event-b", session: "session-b", vehicle: "vehicle-a"},
		{name: "vehicle", event: "event-a", session: "session-a", vehicle: "vehicle-b"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			pipeline := NewPipeline(Config{})
			if _, err := pipeline.Apply(context.Background(), observedSnapshot(t, 1, 1, "event-a", "session-a", "vehicle-a", schema.FreshnessFresh, .1, .2, .3)); err != nil {
				t.Fatal(err)
			}
			output, err := pipeline.Apply(context.Background(), observedSnapshot(t, 2, 1, test.event, test.session, test.vehicle, schema.FreshnessFresh, .4, .5, .6))
			if err != nil {
				t.Fatalf("reset apply: %v", err)
			}
			state, _ := output.Value()
			if len(state.Derived.ControlsHistory.Samples) != 1 ||
				state.Derived.ControlsHistory.Samples[0].Cursor.Epoch != 2 {
				t.Fatalf("history was not reset: %+v", state.Derived.ControlsHistory.Samples)
			}
		})
	}
}

func TestPipelineRejectsOrderAndCancellationAtomically(t *testing.T) {
	pipeline := NewPipeline(Config{})
	first := observedSnapshot(t, 1, 1, "event", "session", "vehicle", schema.FreshnessFresh, .1, .2, .3)
	if _, err := pipeline.Apply(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	before, _ := pipeline.Current()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := pipeline.Apply(ctx, observedSnapshot(t, 1, 2, "event", "session", "vehicle", schema.FreshnessFresh, .4, .5, .6)); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel error = %v", err)
	}
	if _, err := pipeline.Apply(context.Background(), observedSnapshot(t, 1, 3, "event", "session", "vehicle", schema.FreshnessFresh, .4, .5, .6)); !errors.Is(err, ErrSequenceGap) {
		t.Fatalf("gap error = %v", err)
	}
	after, _ := pipeline.Current()
	beforeState, _ := before.Value()
	afterState, _ := after.Value()
	if !reflect.DeepEqual(beforeState, afterState) || before.Header() != after.Header() {
		t.Fatal("failed apply changed committed state")
	}
	if _, err := pipeline.Apply(context.Background(), observedSnapshot(t, 1, 2, "event", "session", "vehicle", schema.FreshnessFresh, .4, .5, .6)); err != nil {
		t.Fatalf("retry after rollback: %v", err)
	}
}

func observedSnapshot(
	t *testing.T,
	epoch schema.Epoch,
	sequence schema.Sequence,
	event identity.EventID,
	sessionID identity.SessionID,
	vehicleID identity.VehicleID,
	freshness schema.Freshness,
	throttle, brake, clutch schema.Ratio,
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
	}
	state := core.ObservedState{Vehicles: []core.VehicleState{{
		Identity: header.Identity,
		Throttle: field(throttle),
		Brake:    field(brake),
		Clutch:   field(clutch),
	}}}
	snapshot, err := envelope.NewSnapshot(header, state, cloneObservedForTest)
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func cloneObservedForTest(state core.ObservedState) core.ObservedState {
	result := state
	result.Vehicles = append([]core.VehicleState(nil), state.Vehicles...)
	return result
}
