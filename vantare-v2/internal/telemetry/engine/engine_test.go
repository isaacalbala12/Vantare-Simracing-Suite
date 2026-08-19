package engine

import (
	"context"
	"errors"
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
	legacyFacts := &testFactCollector{}
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

func TestApplyIsAllOrNothing(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		err  error
		wrap func(*core.Reducer, *core.SessionCoordinator, *derive.Pipeline) *TelemetryEngine
	}{
		{
			name: "reduce", err: core.ErrDuplicateVehicle,
			wrap: func(reducer *core.Reducer, coordinator *core.SessionCoordinator, pipeline *derive.Pipeline) *TelemetryEngine {
				return newWithStages(failingReducer{Reducer: reducer, err: core.ErrDuplicateVehicle}, coordinator, pipeline)
			},
		},
		{
			name: "coordinate", err: core.ErrFactBatchOverflow,
			wrap: func(reducer *core.Reducer, coordinator *core.SessionCoordinator, pipeline *derive.Pipeline) *TelemetryEngine {
				return newWithStages(reducer, failingCoordinator{SessionCoordinator: coordinator, err: core.ErrFactBatchOverflow}, pipeline)
			},
		},
		{
			name: "derive", err: derive.ErrInvalidDefinition,
			wrap: func(reducer *core.Reducer, coordinator *core.SessionCoordinator, pipeline *derive.Pipeline) *TelemetryEngine {
				return newWithStages(reducer, coordinator, failingPipeline{Pipeline: pipeline, err: derive.ErrInvalidDefinition})
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			reducer := core.NewReducer()
			coordinator := core.NewSessionCoordinator(core.SessionCoordinatorConfig{})
			pipeline := derive.NewPipeline(derive.Config{})
			baselineEngine := New(reducer, coordinator, pipeline)
			baseline, err := baselineEngine.Apply(context.Background(), engineBatch(1))
			if err != nil {
				t.Fatalf("baseline Apply() error = %v", err)
			}
			beforeObserved, _ := reducer.Current()
			beforeCoordinatorHeader, beforeFactSequence, _ := coordinator.Current()
			beforeFinal, _ := pipeline.Current()

			result, err := test.wrap(reducer, coordinator, pipeline).Apply(context.Background(), engineBatch(2))
			if !errors.Is(err, test.err) {
				t.Fatalf("Apply() error = %v, want %v", err, test.err)
			}
			afterObserved, ok := reducer.Current()
			if !ok || afterObserved.Header() != beforeObserved.Header() {
				t.Fatalf("reducer cursor changed after failed Apply: before=%#v after=%#v", beforeObserved.Header(), afterObserved.Header())
			}
			afterCoordinatorHeader, afterFactSequence, ok := coordinator.Current()
			if !ok || afterCoordinatorHeader != beforeCoordinatorHeader || afterFactSequence != beforeFactSequence {
				t.Fatalf("coordinator changed after failed Apply: before=(%#v,%d) after=(%#v,%d)", beforeCoordinatorHeader, beforeFactSequence, afterCoordinatorHeader, afterFactSequence)
			}
			afterFinal, ok := pipeline.Current()
			if !ok || afterFinal.Header() != beforeFinal.Header() {
				t.Fatalf("derive cursor changed after failed Apply: before=%#v after=%#v", beforeFinal.Header(), afterFinal.Header())
			}
			if result.Cursor != (schema.Cursor{}) || len(result.Facts) != 0 {
				t.Fatalf("failed Apply result = %+v", result)
			}
			if baseline.Cursor != beforeObserved.Header().Cursor {
				t.Fatalf("baseline cursor = %#v, reducer = %#v", baseline.Cursor, beforeObserved.Header().Cursor)
			}
		})
	}
}

func TestApplyRetryDoesNotDivergeCursors(t *testing.T) {
	t.Parallel()
	reducer := core.NewReducer()
	coordinator := core.NewSessionCoordinator(core.SessionCoordinatorConfig{})
	pipeline := &failOncePipeline{Pipeline: derive.NewPipeline(derive.Config{}), err: derive.ErrInvalidDefinition}
	engine := newWithStages(reducer, coordinator, pipeline)
	batch := engineBatch(1)

	if _, err := engine.Apply(context.Background(), batch); !errors.Is(err, derive.ErrInvalidDefinition) {
		t.Fatalf("first Apply() error = %v", err)
	}
	result, err := engine.Apply(context.Background(), batch)
	if err != nil {
		t.Fatalf("retry Apply() error = %v", err)
	}
	if result.Cursor != batch.Header.Cursor {
		t.Fatalf("retry cursor = %#v, want %#v", result.Cursor, batch.Header.Cursor)
	}
}

type testFactCollector struct {
	values []envelope.Fact[core.SessionFact]
}

func (collector *testFactCollector) WriteFacts(_ context.Context, facts []envelope.Fact[core.SessionFact]) error {
	collector.values = append(collector.values, facts...)
	return nil
}

type failingReducer struct {
	*core.Reducer
	err error
}

func (stage failingReducer) Prepare(core.Batch) (core.ReducerCandidate, error) {
	return core.ReducerCandidate{}, stage.err
}

type failingCoordinator struct {
	*core.SessionCoordinator
	err error
}

func (stage failingCoordinator) Prepare(context.Context, envelope.Snapshot[core.ObservedState]) (core.CoordinatorCandidate, error) {
	return core.CoordinatorCandidate{}, stage.err
}

type failingPipeline struct {
	*derive.Pipeline
	err error
}

func (stage failingPipeline) Prepare(context.Context, envelope.Snapshot[core.ObservedState]) (derive.PipelineCandidate, error) {
	return derive.PipelineCandidate{}, stage.err
}

type failOncePipeline struct {
	*derive.Pipeline
	err error
}

func (stage *failOncePipeline) Prepare(ctx context.Context, observed envelope.Snapshot[core.ObservedState]) (derive.PipelineCandidate, error) {
	if stage.err != nil {
		err := stage.err
		stage.err = nil
		return derive.PipelineCandidate{}, err
	}
	return stage.Pipeline.Prepare(ctx, observed)
}

func engineBatch(sequence schema.Sequence) core.Batch {
	return core.Batch{
		Header: envelope.Header{
			Source:   "engine-test",
			Cursor:   schema.Cursor{Epoch: 1, Sequence: sequence},
			Clock:    schema.NewClock(schema.Field[time.Duration]{}, schema.Field[time.Duration]{}, time.Date(2026, time.August, 19, 12, 0, 0, 0, time.UTC)),
			Identity: identity.RunIdentity{Event: "event-1", Session: "session-1"},
		},
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
