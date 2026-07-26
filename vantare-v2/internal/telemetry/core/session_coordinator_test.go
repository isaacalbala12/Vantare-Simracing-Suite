package core

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
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
	for index := range batch.State.Vehicles {
		batch.State.Vehicles[index].Identity.Event = id.Event
		batch.State.Vehicles[index].Identity.Session = id.Session
		if index == 0 {
			batch.State.Vehicles[index].Identity = id
		}
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
	state.Vehicles[index].InPit = present(inPit)
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
	f.Add([]byte{1, 2, 3, 4, 5})
	f.Add([]byte{0xff, 0, 0xff, 1})
	f.Fuzz(func(t *testing.T, transitions []byte) {
		if len(transitions) > 32 {
			transitions = transitions[:32]
		}
		now := time.Unix(0, 0).UTC()
		coordinator := NewSessionCoordinator(SessionCoordinatorConfig{
			Now:          func() time.Time { return now },
			MaxFactBatch: 64,
		})
		sink := &factSink{}
		epoch := schema.Epoch(1)
		sequence := schema.Sequence(1)
		id := run("event", "session", "vehicle-0", "team", "driver")
		if err := coordinator.Apply(
			context.Background(),
			coordinatorSnapshot(t, epoch, sequence, "fuzz", id, 1),
			sink,
		); err != nil {
			t.Fatal(err)
		}
		lastFact := FactSequence(1)
		for _, transition := range transitions {
			switch transition % 5 {
			case 0:
				sequence++
			case 1:
				epoch++
				sequence = 1
			case 2:
				epoch++
				sequence = 1
				id.Session = identity.SessionID(string(rune('a' + transition%26)))
			case 3:
				epoch++
				sequence = 1
				id.Vehicle = identity.VehicleID("vehicle-" + string(rune('a'+transition%26)))
			case 4:
				sequence++
				id.Driver = identity.DriverID(string(rune('a' + transition%26)))
			}
			snapshot := coordinatorSnapshot(t, epoch, sequence, "fuzz", id, 1)
			err := coordinator.Apply(context.Background(), snapshot, sink)
			if err != nil {
				// Invalid generated cursors are observable and must not panic or
				// corrupt the last accepted fact sequence.
				_, current, initialized := coordinator.Current()
				if initialized && current < lastFact {
					t.Fatalf("fact sequence regressed from %d to %d", lastFact, current)
				}
				continue
			}
			_, current, _ := coordinator.Current()
			if current < lastFact {
				t.Fatalf("fact sequence regressed from %d to %d", lastFact, current)
			}
			lastFact = current
			now = now.Add(time.Nanosecond)
		}
	})
}
