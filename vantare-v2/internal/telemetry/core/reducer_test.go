package core

import (
	"context"
	"errors"
	"reflect"
	"runtime"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestReducerAppliesOrderedBatchesAndRejectsDuplicatesAndGaps(t *testing.T) {
	tests := []struct {
		name    string
		cursors []schema.Cursor
		wantErr error
	}{
		{
			name:    "ordered",
			cursors: []schema.Cursor{{Epoch: 1, Sequence: 1}, {Epoch: 1, Sequence: 2}, {Epoch: 1, Sequence: 3}},
		},
		{
			name:    "duplicate",
			cursors: []schema.Cursor{{Epoch: 1, Sequence: 1}, {Epoch: 1, Sequence: 1}},
			wantErr: ErrStaleBatch,
		},
		{
			name:    "sequence gap",
			cursors: []schema.Cursor{{Epoch: 1, Sequence: 1}, {Epoch: 1, Sequence: 3}},
			wantErr: ErrSequenceGap,
		},
		{
			name:    "epoch gap",
			cursors: []schema.Cursor{{Epoch: 1, Sequence: 1}, {Epoch: 3, Sequence: 1}},
			wantErr: ErrEpochGap,
		},
		{
			name:    "new epoch must start at one",
			cursors: []schema.Cursor{{Epoch: 1, Sequence: 1}, {Epoch: 2, Sequence: 2}},
			wantErr: ErrInvalidEpochReset,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			reducer := NewReducer()
			for index, cursor := range test.cursors {
				_, err := reducer.Apply(testBatch(cursor, "spa", index+1))
				if err != nil {
					if !errors.Is(err, test.wantErr) {
						t.Fatalf("Apply() error = %v, want %v", err, test.wantErr)
					}
					return
				}
			}
			if test.wantErr != nil {
				t.Fatalf("Apply() error = nil, want %v", test.wantErr)
			}
		})
	}
}

func TestReducerRejectsInvalidFirstCursor(t *testing.T) {
	tests := []struct {
		name   string
		cursor schema.Cursor
	}{
		{name: "zero", cursor: schema.Cursor{}},
		{name: "partial", cursor: schema.Cursor{Epoch: 1}},
		{name: "first sequence is not one", cursor: schema.Cursor{Epoch: 1, Sequence: 2}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := NewReducer().Apply(testBatch(test.cursor, "spa", 1))
			if !errors.Is(err, ErrInvalidInitialCursor) {
				t.Fatalf("Apply() error = %v, want %v", err, ErrInvalidInitialCursor)
			}
		})
	}
}

func TestReducerAppliesBatchAllOrNothing(t *testing.T) {
	reducer := NewReducer()
	first, err := reducer.Apply(testBatch(schema.Cursor{Epoch: 1, Sequence: 1}, "spa", 2))
	if err != nil {
		t.Fatalf("first Apply(): %v", err)
	}

	invalid := testBatch(schema.Cursor{Epoch: 1, Sequence: 2}, "lemans", 2)
	invalid.State.Vehicles[1].Identity.Vehicle = invalid.State.Vehicles[0].Identity.Vehicle
	if _, err := reducer.Apply(invalid); !errors.Is(err, ErrDuplicateVehicle) {
		t.Fatalf("invalid Apply() error = %v, want %v", err, ErrDuplicateVehicle)
	}

	got, ok := reducer.Current()
	if !ok {
		t.Fatal("Current() reports no snapshot after accepted batch")
	}
	if got.Header().Cursor != first.Header().Cursor {
		t.Fatalf("cursor after rejected batch = %+v, want %+v", got.Header().Cursor, first.Header().Cursor)
	}
	gotState, _ := got.Value()
	if value, _ := gotState.TrackName.Value(); value != "spa" {
		t.Fatalf("track after rejected batch = %q, want spa", value)
	}
}

func TestReducerRejectsVehicleFromDifferentRun(t *testing.T) {
	batch := testBatch(schema.Cursor{Epoch: 1, Sequence: 1}, "spa", 2)
	batch.State.Vehicles[1].Identity.Session = "other-session"
	if _, err := NewReducer().Apply(batch); !errors.Is(err, ErrVehicleRunMismatch) {
		t.Fatalf("Apply() error = %v, want %v", err, ErrVehicleRunMismatch)
	}
}

func TestReducerRejectsVehicleCountOutsideCompleteBatch(t *testing.T) {
	batch := testBatch(schema.Cursor{Epoch: 1, Sequence: 1}, "spa", 2)
	batch.State.VehicleCount = present(schema.Count(3))
	if _, err := NewReducer().Apply(batch); !errors.Is(err, ErrVehicleCountMismatch) {
		t.Fatalf("Apply() error = %v, want %v", err, ErrVehicleCountMismatch)
	}
}

func TestReducerAcceptsNextEpochReset(t *testing.T) {
	reducer := NewReducer()
	if _, err := reducer.Apply(testBatch(schema.Cursor{Epoch: 4, Sequence: 1}, "spa", 1)); err != nil {
		t.Fatalf("initial Apply(): %v", err)
	}
	got, err := reducer.Apply(testBatch(schema.Cursor{Epoch: 5, Sequence: 1}, "lemans", 1))
	if err != nil {
		t.Fatalf("epoch reset Apply(): %v", err)
	}
	if got.Header().Cursor != (schema.Cursor{Epoch: 5, Sequence: 1}) {
		t.Fatalf("cursor = %+v, want epoch reset", got.Header().Cursor)
	}
}

func TestReducerAndSnapshotOwnMutableState(t *testing.T) {
	reducer := NewReducer()
	batch := testBatch(schema.Cursor{Epoch: 1, Sequence: 1}, "spa", 2)
	snapshot, err := reducer.Apply(batch)
	if err != nil {
		t.Fatalf("Apply(): %v", err)
	}

	batch.State.Vehicles[0].Identity.Vehicle = "mutated-input"
	firstRead, _ := snapshot.Value()
	firstRead.Vehicles[0].Identity.Vehicle = "mutated-consumer"
	secondRead, _ := snapshot.Value()
	if secondRead.Vehicles[0].Identity.Vehicle != "vehicle-0" {
		t.Fatalf("snapshot vehicle = %q, want defensive copy", secondRead.Vehicles[0].Identity.Vehicle)
	}

	current, _ := reducer.Current()
	currentState, _ := current.Value()
	if currentState.Vehicles[0].Identity.Vehicle != "vehicle-0" {
		t.Fatalf("reducer vehicle = %q, want owned input", currentState.Vehicles[0].Identity.Vehicle)
	}
}

func TestSnapshotCopiesAreSafeToMutateConcurrently(t *testing.T) {
	reducer := NewReducer()
	snapshot, err := reducer.Apply(testBatch(schema.Cursor{Epoch: 1, Sequence: 1}, "spa", 64))
	if err != nil {
		t.Fatalf("Apply(): %v", err)
	}

	var wait sync.WaitGroup
	for worker := 0; worker < 16; worker++ {
		wait.Add(1)
		go func(worker int) {
			defer wait.Done()
			for iteration := 0; iteration < 100; iteration++ {
				value, ok := snapshot.Value()
				if !ok {
					t.Error("Snapshot.Value() returned empty")
					return
				}
				value.Vehicles[worker].Identity.Vehicle = identity.VehicleID("consumer")
			}
		}(worker)
	}
	wait.Wait()

	value, _ := snapshot.Value()
	if value.Vehicles[0].Identity.Vehicle != "vehicle-0" {
		t.Fatalf("shared mutation escaped: %q", value.Vehicles[0].Identity.Vehicle)
	}
}

func TestReducerIsDeterministic(t *testing.T) {
	left := NewReducer()
	right := NewReducer()
	cursors := []schema.Cursor{
		{Epoch: 8, Sequence: 1},
		{Epoch: 8, Sequence: 2},
		{Epoch: 9, Sequence: 1},
	}

	for index, cursor := range cursors {
		batch := testBatch(cursor, "spa", 64)
		batch.State.Vehicles[0].LapNumber = present(session.LapNumber(index))
		leftSnapshot, leftErr := left.Apply(batch)
		rightSnapshot, rightErr := right.Apply(batch)
		if leftErr != nil || rightErr != nil {
			t.Fatalf("Apply() errors = (%v, %v)", leftErr, rightErr)
		}
		leftValue, _ := leftSnapshot.Value()
		rightValue, _ := rightSnapshot.Value()
		if leftSnapshot.Header() != rightSnapshot.Header() || !reflect.DeepEqual(leftValue, rightValue) {
			t.Fatalf("same batch sequence produced different snapshots")
		}
	}
}

func TestReducerRunLifecycleAndCancellation(t *testing.T) {
	reducer := NewReducer()
	batches := make(chan Batch)
	snapshots := make(chan envelope.Snapshot[ObservedState])
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- reducer.Run(ctx, batches, snapshots)
	}()

	batches <- testBatch(schema.Cursor{Epoch: 1, Sequence: 1}, "spa", 1)
	select {
	case snapshot := <-snapshots:
		if snapshot.Header().Cursor.Sequence != 1 {
			t.Fatalf("published sequence = %d, want 1", snapshot.Header().Cursor.Sequence)
		}
	case <-time.After(time.Second):
		t.Fatal("Run() did not publish accepted batch")
	}

	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Run() error = %v, want context canceled", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run() did not stop after cancellation")
	}

	closed := make(chan Batch)
	close(closed)
	if err := reducer.Run(context.Background(), closed, snapshots); err != nil {
		t.Fatalf("Run() after completed lifecycle = %v", err)
	}
}

func TestReducerDoesNotApplyBufferedBatchWhenAlreadyCancelled(t *testing.T) {
	reducer := NewReducer()
	batches := make(chan Batch, 1)
	batches <- testBatch(schema.Cursor{Epoch: 1, Sequence: 1}, "spa", 1)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if err := reducer.Run(ctx, batches, make(chan envelope.Snapshot[ObservedState])); !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context canceled", err)
	}
	if _, ok := reducer.Current(); ok {
		t.Fatal("cancelled Run() accepted a buffered batch")
	}
}

func TestReducerRejectsConcurrentRun(t *testing.T) {
	reducer := NewReducer()
	ctx, cancel := context.WithCancel(context.Background())
	batches := make(chan Batch)
	snapshots := make(chan envelope.Snapshot[ObservedState])
	done := make(chan error, 1)
	go func() {
		done <- reducer.Run(ctx, batches, snapshots)
	}()

	deadline := time.Now().Add(time.Second)
	for !reducer.Running() && time.Now().Before(deadline) {
		runtime.Gosched()
	}
	if err := reducer.Run(context.Background(), batches, snapshots); !errors.Is(err, ErrReducerRunning) {
		t.Fatalf("second Run() error = %v, want %v", err, ErrReducerRunning)
	}
	if _, err := reducer.Apply(testBatch(schema.Cursor{Epoch: 1, Sequence: 1}, "spa", 1)); !errors.Is(err, ErrReducerRunning) {
		t.Fatalf("Apply() during Run error = %v, want %v", err, ErrReducerRunning)
	}
	cancel()
	<-done
}

func FuzzReducerCursorValidation(f *testing.F) {
	f.Add(uint64(1), uint64(1), uint64(1), uint64(2))
	f.Add(uint64(2), uint64(1), uint64(3), uint64(1))
	f.Fuzz(func(t *testing.T, firstEpoch, firstSequence, nextEpoch, nextSequence uint64) {
		reducer := NewReducer()
		_, _ = reducer.Apply(testBatch(
			schema.Cursor{Epoch: schema.Epoch(firstEpoch), Sequence: schema.Sequence(firstSequence)},
			"spa",
			1,
		))
		_, _ = reducer.Apply(testBatch(
			schema.Cursor{Epoch: schema.Epoch(nextEpoch), Sequence: schema.Sequence(nextSequence)},
			"lemans",
			1,
		))
	})
}

func BenchmarkReducerApply64Vehicles(b *testing.B) {
	reducer := NewReducer()
	sequence := schema.Sequence(1)
	batch := testBatch(schema.Cursor{Epoch: 1, Sequence: sequence}, "spa", 64)
	b.ReportAllocs()
	for b.Loop() {
		batch.Header.Cursor.Sequence = sequence
		if _, err := reducer.Apply(batch); err != nil {
			b.Fatal(err)
		}
		sequence++
	}
}

func testBatch(cursor schema.Cursor, track string, vehicleCount int) Batch {
	vehicles := make([]VehicleState, vehicleCount)
	for index := range vehicles {
		vehicles[index] = VehicleState{
			Identity: identity.RunIdentity{
				Event:   "event",
				Session: "session",
				Vehicle: identity.VehicleID("vehicle-" + strconv.Itoa(index)),
			},
			Name:      present(vehicle.VehicleName("car")),
			LapNumber: present(session.LapNumber(index)),
		}
	}
	return Batch{
		Header: envelope.Header{
			Source: "canonical-driver",
			Cursor: cursor,
			Identity: identity.RunIdentity{
				Event:   "event",
				Session: "session",
			},
		},
		State: ObservedState{
			TrackName:    present(track),
			SessionType:  present(session.TypeRace),
			VehicleCount: present(schema.Count(vehicleCount)),
			Vehicles:     vehicles,
		},
	}
}

func present[T comparable](value T) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		panic(err)
	}
	return field
}
