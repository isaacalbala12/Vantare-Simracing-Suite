package core

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

type factSink struct {
	err     error
	batches [][]envelope.Fact[SessionFact]
}

type discardFactSink struct{}

func (discardFactSink) WriteFacts(context.Context, []envelope.Fact[SessionFact]) error { return nil }

func (sink *factSink) WriteFacts(_ context.Context, facts []envelope.Fact[SessionFact]) error {
	if sink.err != nil {
		return sink.err
	}
	sink.batches = append(sink.batches, append([]envelope.Fact[SessionFact](nil), facts...))
	return nil
}

func TestSessionCoordinatorOrdersLifecycleFactsWithoutResettingOnSourceOrParticipants(t *testing.T) {
	now := time.Date(2026, 7, 27, 10, 0, 0, 0, time.UTC)
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{Now: func() time.Time { return now }})
	sink := &factSink{}

	first := coordinatorSnapshot(t, 1, 1, "shm", run("event", "session", "car-a", "team-a", "driver-a"), 2)
	setVehicleState(t, &first, 0, 4, false)
	if err := coordinator.Apply(context.Background(), first, sink); err != nil {
		t.Fatalf("first Apply(): %v", err)
	}

	second := coordinatorSnapshot(t, 1, 2, "rest", run("event", "session", "car-a", "team-a", "driver-a"), 3)
	setVehicleState(t, &second, 0, 5, true)
	secondValue, _ := second.Value()
	secondValue.Vehicles[0].Identity.Driver = "driver-b"
	secondValue.Vehicles[0].Identity.Team = "team-b"
	second, _ = envelope.NewSnapshot(second.Header(), secondValue, cloneObservedState)
	now = now.Add(time.Second)
	if err := coordinator.Apply(context.Background(), second, sink); err != nil {
		t.Fatalf("second Apply(): %v", err)
	}

	third := coordinatorSnapshot(t, 1, 3, "shm", run("event", "session", "car-a", "team-b", "driver-b"), 1)
	setVehicleState(t, &third, 0, 5, false)
	now = now.Add(time.Second)
	if err := coordinator.Apply(context.Background(), third, sink); err != nil {
		t.Fatalf("third Apply(): %v", err)
	}

	got := flattenFactValues(sink.batches)
	wantKinds := []FactKind{FactSessionStarted, FactDriverChanged, FactLapCompleted, FactPitEntered, FactPitExited}
	if !reflect.DeepEqual(kinds(got), wantKinds) {
		t.Fatalf("fact kinds = %v, want %v", kinds(got), wantKinds)
	}
	for index, fact := range got {
		if fact.Sequence != FactSequence(index+1) {
			t.Fatalf("fact[%d].Sequence = %d", index, fact.Sequence)
		}
	}
	if got[2].Lap != 5 || got[1].PreviousIdentity.Driver != "driver-a" || got[1].Identity.Driver != "driver-b" {
		t.Fatalf("transition facts = %+v", got)
	}
}

func TestSessionCoordinatorBriefReconnectPreservesSessionAndSequence(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := &factSink{}
	if err := coordinator.Apply(context.Background(), coordinatorSnapshot(t, 3, 1, "shm", run("e", "s", "v", "t", "d"), 1), sink); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.SetConnected(context.Background(), false, sink); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.SetConnected(context.Background(), false, sink); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.SetConnected(context.Background(), true, sink); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.Apply(context.Background(), coordinatorSnapshot(t, 3, 2, "rest", run("e", "s", "v", "t", "d"), 4), sink); err != nil {
		t.Fatal(err)
	}
	got := kinds(flattenFactValues(sink.batches))
	want := []FactKind{FactSessionStarted, FactConnectionLost, FactConnectionRecovered}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("kinds = %v, want %v", got, want)
	}
	header, sequence, ok := coordinator.Current()
	if !ok || header.Cursor != (schema.Cursor{Epoch: 3, Sequence: 2}) || sequence != 3 {
		t.Fatalf("current = (%+v,%d,%t)", header, sequence, ok)
	}
}

func TestSessionCoordinatorSessionAndVehicleResetsAreDistinct(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := &factSink{}
	steps := []envelope.Snapshot[ObservedState]{
		coordinatorSnapshot(t, 1, 1, "shm", run("e", "s1", "v1", "t", "d"), 1),
		coordinatorSnapshot(t, 2, 1, "rest", run("e", "s1", "v1", "t", "d"), 1),
		coordinatorSnapshot(t, 3, 1, "shm", run("e", "s1", "v2", "t", "d"), 1),
		coordinatorSnapshot(t, 4, 1, "shm", run("e", "s2", "v3", "t", "d"), 1),
	}
	for _, step := range steps {
		if err := coordinator.Apply(context.Background(), step, sink); err != nil {
			t.Fatal(err)
		}
	}
	got := kinds(flattenFactValues(sink.batches))
	want := []FactKind{FactSessionStarted, FactSessionEnded, FactSessionStarted}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("kinds = %v, want %v", got, want)
	}
}

func TestSessionCoordinatorExplicitEndIsIdempotentAndRestartable(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := &factSink{}
	first := coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "v", "t", "d"), 1)
	if err := coordinator.Apply(context.Background(), first, sink); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.EndSession(context.Background(), sink); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.EndSession(context.Background(), sink); err != nil {
		t.Fatal(err)
	}
	next := coordinatorSnapshot(t, 2, 1, "shm", run("e", "s", "v", "t", "d"), 1)
	if err := coordinator.Apply(context.Background(), next, sink); err != nil {
		t.Fatal(err)
	}
	got := kinds(flattenFactValues(sink.batches))
	want := []FactKind{FactSessionStarted, FactSessionEnded, FactSessionStarted}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("kinds = %v, want %v", got, want)
	}
}

func TestSessionCoordinatorLapHighWaterMarkSurvivesSourceRegression(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := &factSink{}
	first := coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "v", "t", "d"), 1)
	setVehicleState(t, &first, 0, 4, false)
	regressed := coordinatorSnapshot(t, 1, 2, "rest", run("e", "s", "v", "t", "d"), 1)
	setVehicleState(t, &regressed, 0, 2, false)
	recovered := coordinatorSnapshot(t, 1, 3, "shm", run("e", "s", "v", "t", "d"), 1)
	setVehicleState(t, &recovered, 0, 5, false)
	for _, snapshot := range []envelope.Snapshot[ObservedState]{first, regressed, recovered} {
		if err := coordinator.Apply(context.Background(), snapshot, sink); err != nil {
			t.Fatal(err)
		}
	}
	got := flattenFactValues(sink.batches)
	if len(got) != 2 || got[0].Kind != FactSessionStarted || got[1].Kind != FactLapCompleted || got[1].Lap != 5 {
		t.Fatalf("facts = %+v", got)
	}
}

func TestSessionCoordinatorRetainsVehicleHistoryAcrossAbsenceWithoutInferringPitTransition(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := &factSink{}

	first := coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "vehicle-0", "team", "driver"), 2)
	setVehicleState(t, &first, 1, 4, false)
	if err := coordinator.Apply(context.Background(), first, sink); err != nil {
		t.Fatal(err)
	}

	absent := coordinatorSnapshot(t, 1, 2, "shm", run("e", "s", "vehicle-0", "team", "driver"), 1)
	if err := coordinator.Apply(context.Background(), absent, sink); err != nil {
		t.Fatal(err)
	}

	readded := coordinatorSnapshot(t, 1, 3, "shm", run("e", "s", "vehicle-0", "team", "driver"), 2)
	setVehicleState(t, &readded, 1, 6, true)
	if err := coordinator.Apply(context.Background(), readded, sink); err != nil {
		t.Fatal(err)
	}

	continuous := coordinatorSnapshot(t, 1, 4, "shm", run("e", "s", "vehicle-0", "team", "driver"), 2)
	setVehicleState(t, &continuous, 1, 6, false)
	if err := coordinator.Apply(context.Background(), continuous, sink); err != nil {
		t.Fatal(err)
	}

	got := flattenFactValues(sink.batches)
	wantKinds := []FactKind{FactSessionStarted, FactLapCompleted, FactLapCompleted, FactPitExited}
	if !reflect.DeepEqual(kinds(got), wantKinds) {
		t.Fatalf("kinds = %v, want %v", kinds(got), wantKinds)
	}
	if got[1].Lap != 5 || got[2].Lap != 6 {
		t.Fatalf("readded lap facts = %d,%d, want 5,6", got[1].Lap, got[2].Lap)
	}
	for _, fact := range got {
		if fact.Kind == FactPitEntered {
			t.Fatal("pit entry was inferred across participant absence")
		}
	}
}

func TestSessionCoordinatorActiveVehicleChangePreservesRivalsAndBaselinesNewRun(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := &factSink{}

	first := coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "vehicle-0", "team-0", "driver-0"), 3)
	setVehicleState(t, &first, 1, 10, false)
	setVehicleState(t, &first, 2, 7, false)
	if err := coordinator.Apply(context.Background(), first, sink); err != nil {
		t.Fatal(err)
	}

	changed := coordinatorSnapshot(t, 2, 1, "shm", run("e", "s", "vehicle-2", "team-2", "driver-2"), 3)
	changedState, _ := changed.Value()
	changedState.Vehicles[0].Identity = run("e", "s", "vehicle-0", "team-0", "driver-0")
	changed, _ = envelope.NewSnapshot(changed.Header(), changedState, cloneObservedState)
	setVehicleState(t, &changed, 1, 11, true)
	setVehicleState(t, &changed, 2, 20, true)
	if err := coordinator.Apply(context.Background(), changed, sink); err != nil {
		t.Fatal(err)
	}

	got := flattenFactValues(sink.batches)
	if !reflect.DeepEqual(kinds(got), []FactKind{FactSessionStarted, FactLapCompleted, FactPitEntered}) {
		t.Fatalf("kinds = %v, want session start and stable rival lap/pit", kinds(got))
	}
	if got[1].Identity.Vehicle != "vehicle-1" || got[1].Lap != 11 {
		t.Fatalf("rival fact = %+v, want vehicle-1 lap 11", got[1])
	}
	if got[2].Identity.Vehicle != "vehicle-1" {
		t.Fatalf("rival pit fact = %+v, want vehicle-1", got[2])
	}
	for _, fact := range got[1:] {
		if fact.Identity.Vehicle == "vehicle-2" {
			t.Fatalf("new active run emitted a false historical fact: %+v", fact)
		}
	}
}

func TestSessionCoordinatorVehicleHistoryBudgetIsAtomicAndRetryable(t *testing.T) {
	if MaxSessionVehicleHistory != 104 {
		t.Fatalf("canonical history budget = %d, want 104 scoring slots", MaxSessionVehicleHistory)
	}
	if got := NewSessionCoordinator(SessionCoordinatorConfig{MaxVehicleHistory: 105}).maxVehicles; got != MaxSessionVehicleHistory {
		t.Fatalf("configured history budget widened to %d", got)
	}
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{MaxVehicleHistory: 2})
	sink := &factSink{}
	first := coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "vehicle-0", "team-0", "driver-0"), 2)
	setVehicleState(t, &first, 0, 0, false)
	setVehicleState(t, &first, 1, 0, false)
	if err := coordinator.Apply(context.Background(), first, sink); err != nil {
		t.Fatal(err)
	}

	overflow := coordinatorSnapshot(t, 1, 2, "shm", run("e", "s", "vehicle-0", "team-0", "driver-0"), 3)
	setVehicleState(t, &overflow, 1, 1, true)
	if err := coordinator.Apply(context.Background(), overflow, sink); !errors.Is(err, ErrVehicleHistoryOverflow) {
		t.Fatalf("overflow error = %v", err)
	}
	header, sequence, initialized := coordinator.Current()
	if !initialized || header.Cursor.Sequence != 1 || sequence != 1 || len(sink.batches) != 1 {
		t.Fatalf("overflow mutated/emitted state = (%+v,%d,%v,batches=%d)", header, sequence, initialized, len(sink.batches))
	}

	retry := coordinatorSnapshot(t, 1, 2, "shm", run("e", "s", "vehicle-0", "team-0", "driver-0"), 2)
	setVehicleState(t, &retry, 1, 1, true)
	if err := coordinator.Apply(context.Background(), retry, sink); err != nil {
		t.Fatalf("retry Apply(): %v", err)
	}
	got := flattenFactValues(sink.batches)
	if !reflect.DeepEqual(kinds(got), []FactKind{FactSessionStarted, FactLapCompleted, FactPitEntered}) {
		t.Fatalf("retry facts = %v", kinds(got))
	}
	if got[1].Identity.Vehicle != "vehicle-1" || got[1].Lap != 1 {
		t.Fatalf("retry lost rival lap = %+v", got[1])
	}
}

func TestSessionCoordinatorFactHeadersMatchOccurrenceIdentityCursorAndClock(t *testing.T) {
	times := []time.Time{
		time.Date(2026, 7, 27, 10, 0, 0, 0, time.UTC),
		time.Date(2026, 7, 27, 10, 0, 1, 0, time.UTC),
		time.Date(2026, 7, 27, 10, 0, 2, 0, time.UTC),
	}
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{Now: func() time.Time { return times[0] }})
	sink := &factSink{}

	first := coordinatorSnapshot(t, 1, 1, "shm", run("event", "session-a", "vehicle-0", "team-a", "driver-a"), 2)
	first = withSnapshotClock(t, first, times[0])
	setVehicleState(t, &first, 1, 4, false)
	if err := coordinator.Apply(context.Background(), first, sink); err != nil {
		t.Fatal(err)
	}

	second := coordinatorSnapshot(t, 1, 2, "shm", run("event", "session-a", "vehicle-0", "team-a", "driver-a"), 2)
	second = withSnapshotClock(t, second, times[1])
	secondState, _ := second.Value()
	rivalIdentity := secondState.Vehicles[1].Identity
	rivalIdentity.Team = "rival-team"
	rivalIdentity.Driver = "rival-driver"
	secondState.Vehicles[1].Identity = rivalIdentity
	secondState.Vehicles[1].CompletedLaps = present(standings.CompletedLaps(5))
	secondState.Vehicles[1].InPit = present(pit.InPit(true))
	second, _ = envelope.NewSnapshot(second.Header(), secondState, cloneObservedState)
	if err := coordinator.Apply(context.Background(), second, sink); err != nil {
		t.Fatal(err)
	}

	third := coordinatorSnapshot(t, 2, 1, "shm", run("event", "session-b", "vehicle-0", "team-b", "driver-b"), 1)
	third = withSnapshotClock(t, third, times[2])
	if err := coordinator.Apply(context.Background(), third, sink); err != nil {
		t.Fatal(err)
	}

	facts := flattenFacts(sink.batches)
	if len(facts) != 6 {
		t.Fatalf("fact count = %d, want 6", len(facts))
	}
	for _, index := range []int{1, 2, 3} {
		if facts[index].Header().Identity != rivalIdentity ||
			facts[index].Header().Cursor != second.Header().Cursor ||
			facts[index].Header().Clock != second.Header().Clock {
			t.Fatalf("rival fact[%d] header = %+v, want rival/current snapshot", index, facts[index].Header())
		}
	}
	ended := facts[4]
	if ended.Value().Kind != FactSessionEnded ||
		ended.Header().Identity.Session != "session-a" ||
		ended.Header().Cursor != second.Header().Cursor ||
		ended.Header().Clock != second.Header().Clock {
		t.Fatalf("session ended header = %+v value=%+v", ended.Header(), ended.Value())
	}
	started := facts[5]
	if started.Value().Kind != FactSessionStarted ||
		started.Header().Identity.Session != "session-b" ||
		started.Header().Cursor != third.Header().Cursor ||
		started.Header().Clock != third.Header().Clock {
		t.Fatalf("session started header = %+v value=%+v", started.Header(), started.Value())
	}
	for index, fact := range facts {
		if fact.Value().Sequence != FactSequence(index+1) {
			t.Fatalf("fact[%d] sequence = %d", index, fact.Value().Sequence)
		}
	}
}

func TestSessionCoordinatorRejectsDuplicateAndOutOfOrderWithoutMutation(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := &factSink{}
	first := coordinatorSnapshot(t, 5, 1, "shm", run("e", "s", "v", "t", "d"), 1)
	if err := coordinator.Apply(context.Background(), first, sink); err != nil {
		t.Fatal(err)
	}
	for _, cursor := range []schema.Cursor{{Epoch: 5, Sequence: 1}, {Epoch: 5, Sequence: 3}, {Epoch: 7, Sequence: 1}} {
		candidate := coordinatorSnapshot(t, cursor.Epoch, cursor.Sequence, "shm", run("e", "s", "v", "t", "d"), 1)
		if err := coordinator.Apply(context.Background(), candidate, sink); err == nil {
			t.Fatalf("cursor %+v accepted", cursor)
		}
	}
	header, sequence, _ := coordinator.Current()
	if header.Cursor != (schema.Cursor{Epoch: 5, Sequence: 1}) || sequence != 1 {
		t.Fatalf("state mutated = (%+v,%d)", header, sequence)
	}
}

func TestSessionCoordinatorRejectsInvalidVehicleIdentityWithoutMutation(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := &factSink{}
	snapshot := coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "v", "t", "d"), 1)
	state, _ := snapshot.Value()
	state.Vehicles[0].Identity.Vehicle = ""
	snapshot, _ = envelope.NewSnapshot(snapshot.Header(), state, cloneObservedState)
	if err := coordinator.Apply(context.Background(), snapshot, sink); !errors.Is(err, ErrMissingVehicleID) {
		t.Fatalf("Apply() error = %v", err)
	}
	if _, _, ok := coordinator.Current(); ok {
		t.Fatal("invalid identity advanced state")
	}
}

func TestSessionCoordinatorBackpressureAndOverflowAreAtomicAndRetryable(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{MaxFactBatch: 3})
	blocked := &factSink{err: ErrBackpressure}
	first := coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "v", "t", "d"), 1)
	setVehicleState(t, &first, 0, 0, false)
	if err := coordinator.Apply(context.Background(), first, blocked); !errors.Is(err, ErrBackpressure) {
		t.Fatalf("Apply() error = %v", err)
	}
	if _, _, ok := coordinator.Current(); ok {
		t.Fatal("backpressure advanced state")
	}
	sink := &factSink{}
	if err := coordinator.Apply(context.Background(), first, sink); err != nil {
		t.Fatalf("retry Apply(): %v", err)
	}

	jump := coordinatorSnapshot(t, 1, 2, "shm", run("e", "s", "v", "t", "d"), 1)
	setVehicleState(t, &jump, 0, 10, false)
	if err := coordinator.Apply(context.Background(), jump, sink); !errors.Is(err, ErrFactBatchOverflow) {
		t.Fatalf("overflow error = %v", err)
	}
	header, sequence, _ := coordinator.Current()
	if header.Cursor.Sequence != 1 || sequence != 1 {
		t.Fatalf("overflow advanced state = (%+v,%d)", header, sequence)
	}
}

func TestSessionCoordinatorClosedAndBackpressureMatrixLeavesStateUnchanged(t *testing.T) {
	operations := []struct {
		name     string
		run      func(*SessionCoordinator, FactBatchSink) error
		wantKind FactKind
	}{
		{
			name: "apply",
			run: func(coordinator *SessionCoordinator, sink FactBatchSink) error {
				next := coordinatorSnapshot(t, 1, 2, "shm", run("e", "s", "v", "team", "driver-b"), 1)
				return coordinator.Apply(context.Background(), next, sink)
			},
			wantKind: FactDriverChanged,
		},
		{
			name: "connection",
			run: func(coordinator *SessionCoordinator, sink FactBatchSink) error {
				return coordinator.SetConnected(context.Background(), false, sink)
			},
			wantKind: FactConnectionLost,
		},
		{
			name: "session end",
			run: func(coordinator *SessionCoordinator, sink FactBatchSink) error {
				return coordinator.EndSession(context.Background(), sink)
			},
			wantKind: FactSessionEnded,
		},
	}
	failures := []struct {
		name    string
		sink    func() FactBatchSink
		wantErr error
	}{
		{name: "nil sink", sink: func() FactBatchSink { return nil }, wantErr: ErrClosed},
		{name: "closed", sink: func() FactBatchSink { return &factSink{err: ErrClosed} }, wantErr: ErrClosed},
		{name: "backpressure", sink: func() FactBatchSink { return &factSink{err: ErrBackpressure} }, wantErr: ErrBackpressure},
	}

	for _, operation := range operations {
		for _, failure := range failures {
			t.Run(operation.name+"/"+failure.name, func(t *testing.T) {
				coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
				seedSink := &factSink{}
				seed := coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "v", "team", "driver-a"), 1)
				if err := coordinator.Apply(context.Background(), seed, seedSink); err != nil {
					t.Fatal(err)
				}
				beforeHeader, beforeSequence, beforeInitialized := coordinator.Current()

				if err := operation.run(coordinator, failure.sink()); !errors.Is(err, failure.wantErr) {
					t.Fatalf("error = %v, want %v", err, failure.wantErr)
				}
				afterHeader, afterSequence, afterInitialized := coordinator.Current()
				if afterHeader != beforeHeader || afterSequence != beforeSequence || afterInitialized != beforeInitialized {
					t.Fatalf("state changed after error: before=(%+v,%d,%v) after=(%+v,%d,%v)",
						beforeHeader, beforeSequence, beforeInitialized, afterHeader, afterSequence, afterInitialized)
				}

				retrySink := &factSink{}
				if err := operation.run(coordinator, retrySink); err != nil {
					t.Fatalf("retry error = %v", err)
				}
				values := flattenFactValues(retrySink.batches)
				if len(values) != 1 || values[0].Kind != operation.wantKind || values[0].Sequence != beforeSequence+1 {
					t.Fatalf("retry facts = %+v", values)
				}
			})
		}
	}
}

func TestSessionCoordinatorCancellationAndSingleOwner(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	sink := FactBatchSinkFunc(func(ctx context.Context, _ []envelope.Fact[SessionFact]) error {
		close(entered)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-release:
			return nil
		}
	})
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- coordinator.Apply(ctx, coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "v", "t", "d"), 1), sink)
	}()
	<-entered
	if err := coordinator.SetConnected(context.Background(), false, &factSink{}); !errors.Is(err, ErrCoordinatorRunning) {
		t.Fatalf("concurrent call error = %v", err)
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel error = %v", err)
	}
	if _, _, ok := coordinator.Current(); ok {
		t.Fatal("cancelled write advanced state")
	}
}

func TestSessionCoordinatorSinkCanReadLastCommittedState(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := FactBatchSinkFunc(func(context.Context, []envelope.Fact[SessionFact]) error {
		if _, _, initialized := coordinator.Current(); initialized {
			t.Fatal("candidate became visible before facts were accepted")
		}
		return nil
	})
	if err := coordinator.Apply(
		context.Background(),
		coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "v", "t", "d"), 1),
		sink,
	); err != nil {
		t.Fatal(err)
	}
	if _, _, initialized := coordinator.Current(); !initialized {
		t.Fatal("accepted state was not committed")
	}
}

func TestSessionCoordinatorReadersSeeOnlyCommittedStateWhileSinkIsBlocked(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	if err := coordinator.Apply(
		context.Background(),
		coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "v", "team", "driver-a"), 1),
		&factSink{},
	); err != nil {
		t.Fatal(err)
	}

	entered := make(chan struct{})
	release := make(chan struct{})
	sink := FactBatchSinkFunc(func(context.Context, []envelope.Fact[SessionFact]) error {
		close(entered)
		<-release
		return nil
	})
	done := make(chan error, 1)
	go func() {
		next := coordinatorSnapshot(t, 1, 2, "shm", run("e", "s", "v", "team", "driver-b"), 1)
		done <- coordinator.Apply(context.Background(), next, sink)
	}()
	<-entered

	var readers sync.WaitGroup
	errs := make(chan string, 16)
	for worker := 0; worker < 16; worker++ {
		readers.Add(1)
		go func() {
			defer readers.Done()
			for iteration := 0; iteration < 1000; iteration++ {
				header, sequence, initialized := coordinator.Current()
				if !initialized || header.Cursor.Sequence != 1 || sequence != 1 {
					errs <- fmt.Sprintf("reader saw candidate (%+v,%d,%v)", header, sequence, initialized)
					return
				}
			}
		}()
	}
	readers.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	header, sequence, _ := coordinator.Current()
	if header.Cursor.Sequence != 2 || sequence != 2 {
		t.Fatalf("committed state = (%+v,%d)", header, sequence)
	}
}

func TestSessionCoordinatorDeterministicAndFactOwnership(t *testing.T) {
	now := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)
	runOnce := func() [][]envelope.Fact[SessionFact] {
		coordinator := NewSessionCoordinator(SessionCoordinatorConfig{Now: func() time.Time { return now }})
		sink := &factSink{}
		if err := coordinator.Apply(context.Background(), coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "v", "t", "d"), 1), sink); err != nil {
			t.Fatal(err)
		}
		return sink.batches
	}
	left, right := runOnce(), runOnce()
	if !reflect.DeepEqual(left, right) {
		t.Fatalf("non-deterministic facts: %v != %v", left, right)
	}
	left[0][0] = envelope.NewFact(left[0][0].Header(), SessionFact{Kind: FactPitExited})
	if reflect.DeepEqual(left, right) {
		t.Fatal("sink batches share mutable ownership")
	}
}

type FactBatchSinkFunc func(context.Context, []envelope.Fact[SessionFact]) error

func (function FactBatchSinkFunc) WriteFacts(ctx context.Context, facts []envelope.Fact[SessionFact]) error {
	return function(ctx, facts)
}

func coordinatorSnapshot(
	t testing.TB,
	epoch schema.Epoch,
	sequence schema.Sequence,
	source envelope.SourceID,
	id identity.RunIdentity,
	participants int,
) envelope.Snapshot[ObservedState] {
	t.Helper()
	batch := testBatch(schema.Cursor{Epoch: epoch, Sequence: sequence}, "track", participants)
	batch.Header.Source = source
	batch.Header.Identity = id
	activeIndex := -1
	for index := range batch.State.Vehicles {
		batch.State.Vehicles[index].Identity.Event = id.Event
		batch.State.Vehicles[index].Identity.Session = id.Session
		if batch.State.Vehicles[index].Identity.Vehicle == id.Vehicle {
			activeIndex = index
		}
	}
	if activeIndex < 0 && len(batch.State.Vehicles) > 0 {
		activeIndex = 0
	}
	if activeIndex >= 0 {
		batch.State.Vehicles[activeIndex].Identity = id
	}
	snapshot, err := envelope.NewSnapshot(batch.Header, batch.State, cloneObservedState)
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func setVehicleState(t testing.TB, snapshot *envelope.Snapshot[ObservedState], index int, laps standings.CompletedLaps, inPit bool) {
	t.Helper()
	state, _ := snapshot.Value()
	state.Vehicles[index].CompletedLaps = present(laps)
	state.Vehicles[index].InPit = present(pit.InPit(inPit))
	next, err := envelope.NewSnapshot(snapshot.Header(), state, cloneObservedState)
	if err != nil {
		t.Fatal(err)
	}
	*snapshot = next
}

func run(event, sessionID, vehicle, team, driver string) identity.RunIdentity {
	return identity.RunIdentity{
		Event: identity.EventID(event), Session: identity.SessionID(sessionID),
		Vehicle: identity.VehicleID(vehicle), Team: identity.TeamID(team), Driver: identity.DriverID(driver),
	}
}

func flattenFactValues(batches [][]envelope.Fact[SessionFact]) []SessionFact {
	var result []SessionFact
	for _, batch := range batches {
		for _, fact := range batch {
			result = append(result, fact.Value())
		}
	}
	return result
}

func flattenFacts(batches [][]envelope.Fact[SessionFact]) []envelope.Fact[SessionFact] {
	var result []envelope.Fact[SessionFact]
	for _, batch := range batches {
		result = append(result, batch...)
	}
	return result
}

func withSnapshotClock(t testing.TB, snapshot envelope.Snapshot[ObservedState], received time.Time) envelope.Snapshot[ObservedState] {
	t.Helper()
	header := snapshot.Header()
	header.Clock = schema.NewClock(schema.Field[time.Duration]{}, schema.Field[time.Duration]{}, received)
	value, _ := snapshot.Value()
	result, err := envelope.NewSnapshot(header, value, cloneObservedState)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func kinds(facts []SessionFact) []FactKind {
	result := make([]FactKind, len(facts))
	for index := range facts {
		result[index] = facts[index].Kind
	}
	return result
}

func TestSessionCoordinatorRaceReaders(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := &factSink{}
	if err := coordinator.Apply(context.Background(), coordinatorSnapshot(t, 1, 1, "shm", run("e", "s", "v", "t", "d"), 1), sink); err != nil {
		t.Fatal(err)
	}
	var wait sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			for iteration := 0; iteration < 100; iteration++ {
				coordinator.Current()
			}
		}()
	}
	wait.Wait()
}

func BenchmarkSessionCoordinatorApply64Vehicles(b *testing.B) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	sink := discardFactSink{}
	sequence := schema.Sequence(1)
	b.ReportAllocs()
	for b.Loop() {
		b.StopTimer()
		snapshot := coordinatorSnapshot(b, 1, sequence, "shm", run("e", "s", "vehicle-0", "", ""), 64)
		b.StartTimer()
		if err := coordinator.Apply(context.Background(), snapshot, sink); err != nil {
			b.Fatal(err)
		}
		sequence++
	}
}

func FuzzSessionCoordinatorTransitions(f *testing.F) {
	f.Add([]byte{0, 1, 2, 3, 4, 5, 6, 7, 8})
	f.Add([]byte{8, 6, 5, 6, 3, 7})
	f.Fuzz(func(t *testing.T, transitions []byte) {
		if len(transitions) > 48 {
			transitions = transitions[:48]
		}
		now := time.Unix(0, 0).UTC()
		coordinator := NewSessionCoordinator(SessionCoordinatorConfig{
			Now:               func() time.Time { return now },
			MaxFactBatch:      64,
			MaxVehicleHistory: 8,
		})
		model := sessionOracle{maxVehicles: 8}
		id := run("event", "session", "vehicle-0", "team", "driver")
		initial := coordinatorSnapshot(t, 1, 1, "fuzz", id, 3)
		for index := 0; index < 3; index++ {
			setVehicleState(t, &initial, index, standings.CompletedLaps(index*10), false)
		}
		initial = withSnapshotClock(t, initial, now)
		initialState, _ := initial.Value()
		wantInitial, wantErr := model.apply(initial.Header(), initialState, now)
		initialSink := &factSink{}
		if err := coordinator.Apply(context.Background(), initial, initialSink); err != nil || wantErr != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(flattenFacts(initialSink.batches), wantInitial) {
			t.Fatalf("initial facts = %+v, want %+v", flattenFacts(initialSink.batches), wantInitial)
		}

		for step, transition := range transitions {
			beforeHeader, beforeSequence, beforeInitialized := coordinator.Current()
			header := model.header
			header.Source = envelope.SourceID(fmt.Sprintf("source-%d", transition%3))
			header.Cursor.Sequence++
			participants := 3
			forceBackpressure := false
			switch transition % 9 {
			case 0:
				header.Cursor = model.header.Cursor
			case 1:
				header.Cursor.Sequence++
			case 2:
				header.Cursor.Epoch++
				header.Cursor.Sequence = 1
			case 3:
				header.Cursor.Epoch++
				header.Cursor.Sequence = 1
				header.Identity.Session = identity.SessionID(fmt.Sprintf("session-%d-%d", step, transition))
			case 4:
				header.Cursor.Epoch++
				header.Cursor.Sequence = 1
				if header.Identity.Vehicle == "vehicle-0" {
					header.Identity = run(string(header.Identity.Event), string(header.Identity.Session), "vehicle-2", "team-2", "driver-2")
				} else {
					header.Identity = run(string(header.Identity.Event), string(header.Identity.Session), "vehicle-0", "team", "driver")
				}
			case 5:
				participants = 2
			case 7:
				header.Identity.Driver = identity.DriverID(fmt.Sprintf("driver-%d-%d", step, transition))
				header.Identity.Team = identity.TeamID(fmt.Sprintf("team-%d", step))
			case 8:
				header.Identity.Driver = identity.DriverID(fmt.Sprintf("blocked-driver-%d", step))
				forceBackpressure = true
			}

			snapshot := coordinatorSnapshot(
				t,
				header.Cursor.Epoch,
				header.Cursor.Sequence,
				header.Source,
				header.Identity,
				participants,
			)
			snapshot = withSnapshotClock(t, snapshot, now)
			state, _ := snapshot.Value()
			for index := range state.Vehicles {
				history := model.vehicles[state.Vehicles[index].Identity.Vehicle]
				increment := standings.CompletedLaps((int(transition) + index) % 3)
				state.Vehicles[index].CompletedLaps = present(history.completedLaps + increment)
				state.Vehicles[index].InPit = present(pit.InPit((int(transition)+index)&1 == 1))
			}
			snapshot, _ = envelope.NewSnapshot(snapshot.Header(), state, cloneObservedState)
			candidateModel := model.clone()
			wantFacts, oracleErr := candidateModel.apply(snapshot.Header(), state, now)
			sink := &factSink{}
			if forceBackpressure && oracleErr == nil && len(wantFacts) > 0 {
				sink.err = ErrBackpressure
			}
			gotErr := coordinator.Apply(context.Background(), snapshot, sink)
			if sink.err != nil && oracleErr == nil {
				oracleErr = sink.err
			}
			if !sameCoordinatorError(gotErr, oracleErr) {
				t.Fatalf("step %d error = %v, want %v", step, gotErr, oracleErr)
			}

			if oracleErr != nil {
				afterHeader, afterSequence, afterInitialized := coordinator.Current()
				if afterHeader != beforeHeader || afterSequence != beforeSequence || afterInitialized != beforeInitialized {
					t.Fatalf("step %d error mutated state: before=(%+v,%d,%v) after=(%+v,%d,%v)",
						step, beforeHeader, beforeSequence, beforeInitialized, afterHeader, afterSequence, afterInitialized)
				}
				if len(sink.batches) != 0 {
					t.Fatalf("step %d failed sink accepted facts", step)
				}
			} else {
				model = candidateModel
				gotFacts := flattenFacts(sink.batches)
				if len(gotFacts) != len(wantFacts) || (len(gotFacts) > 0 && !reflect.DeepEqual(gotFacts, wantFacts)) {
					t.Fatalf("step %d facts = %+v, want %+v", step, gotFacts, wantFacts)
				}
				gotHeader, gotSequence, initialized := coordinator.Current()
				if !initialized || gotHeader != model.header || gotSequence != model.factSequence {
					t.Fatalf("step %d state = (%+v,%d,%v), want (%+v,%d,true)",
						step, gotHeader, gotSequence, initialized, model.header, model.factSequence)
				}
			}
			now = now.Add(time.Nanosecond)
		}
	})
}

type oracleVehicle struct {
	identity      identity.RunIdentity
	completedLaps standings.CompletedLaps
	hasLaps       bool
	inPit         pit.InPit
	hasPit        bool
	lastSeen      schema.Cursor
}

type sessionOracle struct {
	initialized   bool
	sessionActive bool
	header        envelope.Header
	vehicles      map[identity.VehicleID]oracleVehicle
	factSequence  FactSequence
	maxVehicles   int
}

func (model sessionOracle) clone() sessionOracle {
	result := model
	if model.vehicles != nil {
		result.vehicles = make(map[identity.VehicleID]oracleVehicle, len(model.vehicles))
		for id, vehicle := range model.vehicles {
			result.vehicles[id] = vehicle
		}
	}
	return result
}

func (model *sessionOracle) apply(
	header envelope.Header,
	state ObservedState,
	occurred time.Time,
) ([]envelope.Fact[SessionFact], error) {
	if !header.Identity.SessionKnown() {
		return nil, ErrIncompleteRunIdentity
	}
	if !model.initialized {
		if header.Cursor.Epoch == 0 || header.Cursor.Sequence != 1 {
			return nil, ErrInvalidInitialCursor
		}
	} else {
		current := model.header.Cursor
		next := header.Cursor
		switch {
		case next.Epoch < current.Epoch || next.Epoch == current.Epoch && next.Sequence <= current.Sequence:
			return nil, ErrStaleBatch
		case next.Epoch == current.Epoch && next.Sequence != current.Sequence+1:
			return nil, ErrSequenceGap
		case next.Epoch == current.Epoch && !model.header.Identity.SameRun(header.Identity):
			return nil, ErrRunIdentityChanged
		case next.Epoch != current.Epoch && next.Epoch != current.Epoch+1:
			return nil, ErrEpochGap
		case next.Epoch == current.Epoch+1 && next.Sequence != 1:
			return nil, ErrInvalidEpochReset
		}
	}

	drafts := make([]sessionFactDraft, 0, 4)
	previousHeader := model.header
	previousVehicles := model.vehicles
	if !model.initialized || !model.sessionActive {
		drafts = append(drafts, oracleDraft(header, header.Identity, SessionFact{Kind: FactSessionStarted, OccurredUTC: occurred}))
		previousVehicles = nil
	} else if !previousHeader.Identity.SameSession(header.Identity) {
		drafts = append(drafts,
			oracleDraft(previousHeader, previousHeader.Identity, SessionFact{Kind: FactSessionEnded, OccurredUTC: occurred}),
			oracleDraft(header, header.Identity, SessionFact{Kind: FactSessionStarted, OccurredUTC: occurred, PreviousIdentity: previousHeader.Identity}),
		)
		previousVehicles = nil
	} else if previousHeader.Identity.Vehicle != header.Identity.Vehicle {
		delete(previousVehicles, header.Identity.Vehicle)
	}

	vehicles := previousVehicles
	if vehicles == nil {
		vehicles = make(map[identity.VehicleID]oracleVehicle)
	}
	trackedVehicles := len(vehicles)
	for _, observed := range state.Vehicles {
		if _, exists := vehicles[observed.Identity.Vehicle]; !exists {
			trackedVehicles++
			if trackedVehicles > model.maxVehicles {
				return nil, ErrVehicleHistoryOverflow
			}
		}
	}
	for _, observed := range state.Vehicles {
		previous, exists := previousVehicles[observed.Identity.Vehicle]
		current := previous
		current.identity = observed.Identity
		continuous := exists && previous.lastSeen == previousHeader.Cursor
		if exists && (previous.identity.Driver != observed.Identity.Driver || previous.identity.Team != observed.Identity.Team) {
			drafts = append(drafts, oracleDraft(header, observed.Identity, SessionFact{
				Kind: FactDriverChanged, OccurredUTC: occurred, PreviousIdentity: previous.identity,
			}))
		}
		if laps, present := observed.CompletedLaps.Value(); present && observed.CompletedLaps.Freshness() != schema.FreshnessInvalid {
			if exists && previous.hasLaps && laps > previous.completedLaps {
				for completed := previous.completedLaps + 1; ; completed++ {
					drafts = append(drafts, oracleDraft(header, observed.Identity, SessionFact{
						Kind: FactLapCompleted, OccurredUTC: occurred, Lap: session.LapNumber(completed),
					}))
					if completed == laps {
						break
					}
				}
			}
			if !exists || !previous.hasLaps || laps >= previous.completedLaps {
				current.completedLaps = laps
			}
			current.hasLaps = true
		}
		if inPit, present := observed.InPit.Value(); present && observed.InPit.Freshness() != schema.FreshnessInvalid {
			if continuous && previous.hasPit && inPit != previous.inPit {
				kind := FactPitExited
				if inPit {
					kind = FactPitEntered
				}
				drafts = append(drafts, oracleDraft(header, observed.Identity, SessionFact{
					Kind: kind, OccurredUTC: occurred, PreviousIdentity: previous.identity,
				}))
			}
			current.inPit, current.hasPit = inPit, true
		}
		current.lastSeen = header.Cursor
		vehicles[observed.Identity.Vehicle] = current
	}

	facts := make([]envelope.Fact[SessionFact], len(drafts))
	for index := range drafts {
		drafts[index].value.Sequence = model.factSequence + FactSequence(index) + 1
		facts[index] = envelope.NewFact(drafts[index].header, drafts[index].value)
	}
	model.initialized = true
	model.sessionActive = true
	model.header = header
	model.vehicles = vehicles
	model.factSequence += FactSequence(len(facts))
	return facts, nil
}

func oracleDraft(header envelope.Header, factIdentity identity.RunIdentity, value SessionFact) sessionFactDraft {
	header.Identity = factIdentity
	value.Identity = factIdentity
	return sessionFactDraft{header: header, value: value}
}

func sameCoordinatorError(got, want error) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return errors.Is(got, want)
}
