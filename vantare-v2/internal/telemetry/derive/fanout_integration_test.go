package derive

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func TestReducerCoordinatorDeriveContract(t *testing.T) {
	t.Parallel()

	zero, err := schema.NewField(
		schema.Ratio(0),
		schema.ProvenanceObserved,
		schema.FreshnessFresh,
	)
	if err != nil {
		t.Fatalf("NewField(zero) error = %v", err)
	}
	run := identity.RunIdentity{
		Event:   "event",
		Session: "session",
		Vehicle: "vehicle",
		Team:    "team",
		Driver:  "driver",
	}
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 1, Sequence: 1},
		Identity: run,
	}
	reducer := core.NewReducer()
	observed, err := reducer.Apply(core.Batch{
		Header: header,
		State: core.ObservedState{Vehicles: []core.VehicleState{{
			Identity: run,
			Throttle: zero,
			Brake:    zero,
			Clutch:   zero,
		}}},
	})
	if err != nil {
		t.Fatalf("Reducer.Apply() error = %v", err)
	}
	coordinator := core.NewSessionCoordinator(core.SessionCoordinatorConfig{
		Now: func() time.Time { return time.Unix(1, 0).UTC() },
	})
	sink := &factCollector{}
	if err := coordinator.Apply(context.Background(), observed, sink); err != nil {
		t.Fatalf("SessionCoordinator.Apply() error = %v", err)
	}
	final, err := NewPipeline(Config{}).Apply(context.Background(), observed)
	if err != nil {
		t.Fatalf("Pipeline.Apply() error = %v", err)
	}
	state, ok := final.Value()
	if !ok || len(state.Derived.ControlsHistory.Samples) != 1 {
		t.Fatalf("final snapshot = %#v, present=%v", state, ok)
	}
	sample := state.Derived.ControlsHistory.Samples[0]
	if sample.Throttle != 0 || sample.Brake != 0 || sample.Clutch != 0 {
		t.Fatalf("valid zero controls changed: %#v", sample)
	}
	if len(sink.facts) != 1 || sink.facts[0].Value().Sequence != 1 ||
		sink.facts[0].Value().Kind != core.FactSessionStarted {
		t.Fatalf("initial facts = %#v", sink.facts)
	}
}
