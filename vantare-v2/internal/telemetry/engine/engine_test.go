package engine

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func TestEngineFacadeMatchesLegacyOrchestration(t *testing.T) {
	t.Parallel()
	batch := core.Batch{
		Header: envelope.Header{
			Source: "engine-facade-test",
			Cursor: schema.Cursor{Epoch: 1, Sequence: 1},
			Clock: schema.NewClock(
				schema.Field[time.Duration]{},
				schema.Field[time.Duration]{},
				time.Date(2026, time.August, 19, 12, 0, 0, 0, time.UTC),
			),
			Identity: identity.RunIdentity{Event: "event-1", Session: "session-1"},
		},
		State: core.ObservedState{},
	}
	now := func() time.Time { return batch.Header.Clock.ReceivedUTC }

	legacyReducer := core.NewReducer()
	legacyCoordinator := core.NewSessionCoordinator(core.SessionCoordinatorConfig{Now: now})
	legacyPipeline := derive.NewPipeline(derive.Config{})
	legacyObserved, err := legacyReducer.Apply(batch)
	if err != nil {
		t.Fatalf("legacy reducer Apply() error = %v", err)
	}
	legacyFacts := &factCollector{}
	if err := legacyCoordinator.Apply(context.Background(), legacyObserved, legacyFacts); err != nil {
		t.Fatalf("legacy coordinator Apply() error = %v", err)
	}
	legacyFinal, err := legacyPipeline.Apply(context.Background(), legacyObserved)
	if err != nil {
		t.Fatalf("legacy derive Apply() error = %v", err)
	}

	engine := New(
		core.NewReducer(),
		core.NewSessionCoordinator(core.SessionCoordinatorConfig{Now: now}),
		derive.NewPipeline(derive.Config{}),
	)
	got, err := engine.Apply(context.Background(), batch)
	if err != nil {
		t.Fatalf("TelemetryEngine.Apply() error = %v", err)
	}

	assertSnapshotsEqual(t, got.State, legacyFinal)
	if !reflect.DeepEqual(got.Facts, legacyFacts.values) {
		t.Fatalf("TelemetryEngine facts = %#v, legacy = %#v", got.Facts, legacyFacts.values)
	}
	if got.Cursor != legacyFinal.Header().Cursor {
		t.Fatalf("TelemetryEngine cursor = %#v, legacy = %#v", got.Cursor, legacyFinal.Header().Cursor)
	}
}

func assertSnapshotsEqual(
	t testing.TB,
	got envelope.Snapshot[derive.FinalState],
	want envelope.Snapshot[derive.FinalState],
) {
	t.Helper()
	gotValue, gotOK := got.Value()
	wantValue, wantOK := want.Value()
	if got.Header() != want.Header() || gotOK != wantOK || !reflect.DeepEqual(gotValue, wantValue) {
		t.Fatalf("snapshot = (%#v, %#v, %t), want (%#v, %#v, %t)", got.Header(), gotValue, gotOK, want.Header(), wantValue, wantOK)
	}
}
