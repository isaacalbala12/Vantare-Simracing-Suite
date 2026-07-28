package derive

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func TestReducerCoordinatorDeriveFanoutContract(t *testing.T) {
	t.Parallel()

	fanout := core.NewFanout[FinalState](core.FanoutConfig{})
	snapshots, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	facts, err := fanout.SubscribeFacts(context.Background(), 0)
	if err != nil {
		t.Fatalf("SubscribeFacts() error = %v", err)
	}
	t.Cleanup(func() {
		if err := fanout.Close(context.Background()); err != nil {
			t.Fatalf("fanout Close() error = %v", err)
		}
	})

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
	if err := coordinator.Apply(context.Background(), observed, fanout); err != nil {
		t.Fatalf("SessionCoordinator.Apply() error = %v", err)
	}
	final, err := NewPipeline(Config{}).Apply(context.Background(), observed)
	if err != nil {
		t.Fatalf("Pipeline.Apply() error = %v", err)
	}
	if err := fanout.PublishSnapshot(
		final,
		core.FanoutStatus{State: driver.StateLive},
		1,
		time.Microsecond,
	); err != nil {
		t.Fatalf("PublishSnapshot() error = %v", err)
	}

	frame, err := snapshots.Next(context.Background())
	if err != nil {
		t.Fatalf("snapshot Next() error = %v", err)
	}
	state, ok := frame.Snapshot.Value()
	if !ok || len(state.Derived.ControlsHistory.Samples) != 1 {
		t.Fatalf("final snapshot = %#v, present=%v", state, ok)
	}
	sample := state.Derived.ControlsHistory.Samples[0]
	if sample.Throttle != 0 || sample.Brake != 0 || sample.Clutch != 0 {
		t.Fatalf("valid zero controls changed: %#v", sample)
	}
	if frame.FactSequence != 1 || frame.Status.State != driver.StateLive {
		t.Fatalf("atomic frame = %#v", frame)
	}
	fact, err := facts.Next(context.Background())
	if err != nil {
		t.Fatalf("fact Next() error = %v", err)
	}
	if fact.Value().Sequence != 1 || fact.Value().Kind != core.FactSessionStarted {
		t.Fatalf("initial fact = %#v", fact.Value())
	}
}
