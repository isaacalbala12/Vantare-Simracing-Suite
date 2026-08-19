package core

import (
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"sync"
	"testing"

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

func TestReducerPreservesExplicitFieldQualityAndLegitimateZero(t *testing.T) {
	batch := testBatch(schema.Cursor{Epoch: 1, Sequence: 1}, "spa", 1)
	batch.State.Vehicles[0].Gear = schema.MissingField[vehicle.Gear]()
	invalidSpeed, err := schema.NewField(0.0, schema.ProvenanceObserved, schema.FreshnessInvalid)
	if err != nil {
		t.Fatal(err)
	}
	batch.State.Vehicles[0].SpeedMPS = invalidSpeed
	batch.State.Vehicles[0].Throttle = present(schema.Ratio(0))

	snapshot, err := NewReducer().Apply(batch)
	if err != nil {
		t.Fatal(err)
	}
	state, _ := snapshot.Value()
	current := state.Vehicles[0]
	if current.Gear.Freshness() != schema.FreshnessMissing {
		t.Fatalf("gear freshness = %v, want missing", current.Gear.Freshness())
	}
	if current.SpeedMPS.Freshness() != schema.FreshnessInvalid {
		t.Fatalf("speed freshness = %v, want invalid", current.SpeedMPS.Freshness())
	}
	if throttle, ok := current.Throttle.Value(); !ok || throttle != 0 || current.Throttle.Freshness() != schema.FreshnessFresh {
		t.Fatalf("throttle = (%v,%t,%v), want present fresh zero", throttle, ok, current.Throttle.Freshness())
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

func TestReducerRequiresCompleteStableRunIdentityWithinEpoch(t *testing.T) {
	tests := []struct {
		name     string
		mutate   func(*Batch)
		wantErr  error
		firstErr bool
	}{
		{
			name: "first event missing",
			mutate: func(batch *Batch) {
				batch.Header.Identity.Event = ""
			},
			wantErr:  ErrIncompleteRunIdentity,
			firstErr: true,
		},
		{
			name: "first session missing",
			mutate: func(batch *Batch) {
				batch.Header.Identity.Session = ""
			},
			wantErr:  ErrIncompleteRunIdentity,
			firstErr: true,
		},
		{
			name: "event changes in same epoch",
			mutate: func(batch *Batch) {
				batch.Header.Identity.Event = "other-event"
				for index := range batch.State.Vehicles {
					batch.State.Vehicles[index].Identity.Event = "other-event"
				}
			},
			wantErr: ErrRunIdentityChanged,
		},
		{
			name: "session changes in same epoch",
			mutate: func(batch *Batch) {
				batch.Header.Identity.Session = "other-session"
				for index := range batch.State.Vehicles {
					batch.State.Vehicles[index].Identity.Session = "other-session"
				}
			},
			wantErr: ErrRunIdentityChanged,
		},
		{
			name: "vehicle changes in same epoch",
			mutate: func(batch *Batch) {
				batch.Header.Identity.Vehicle = "other-player-vehicle"
			},
			wantErr: nil,
		},
		{
			name: "partial next header cannot disable validation",
			mutate: func(batch *Batch) {
				batch.Header.Identity.Event = ""
			},
			wantErr: ErrIncompleteRunIdentity,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			reducer := NewReducer()
			if !test.firstErr {
				if _, err := reducer.Apply(testBatch(schema.Cursor{Epoch: 7, Sequence: 1}, "spa", 1)); err != nil {
					t.Fatalf("initial Apply(): %v", err)
				}
			}
			sequence := schema.Sequence(2)
			if test.firstErr {
				sequence = 1
			}
			batch := testBatch(schema.Cursor{Epoch: 7, Sequence: sequence}, "lemans", 1)
			test.mutate(&batch)
			if _, err := reducer.Apply(batch); !errors.Is(err, test.wantErr) {
				t.Fatalf("Apply() error = %v, want %v", err, test.wantErr)
			}
		})
	}
}

func TestReducerAllowsTeamAndDriverChangesWithinRun(t *testing.T) {
	reducer := NewReducer()
	first := testBatch(schema.Cursor{Epoch: 2, Sequence: 1}, "spa", 1)
	first.Header.Identity.Vehicle = "player-car-a"
	first.Header.Identity.Team = "team-a"
	first.Header.Identity.Driver = "driver-a"
	if _, err := reducer.Apply(first); err != nil {
		t.Fatalf("initial Apply(): %v", err)
	}

	next := testBatch(schema.Cursor{Epoch: 2, Sequence: 2}, "spa", 1)
	next.Header.Identity.Vehicle = "player-car-a"
	next.Header.Identity.Team = "team-b"
	next.Header.Identity.Driver = "driver-b"
	if _, err := reducer.Apply(next); err != nil {
		t.Fatalf("Apply() after team/driver change: %v", err)
	}
}

func TestReducerAllowsActiveVehicleToClearWithinEpoch(t *testing.T) {
	reducer := NewReducer()
	first := testBatch(schema.Cursor{Epoch: 2, Sequence: 1}, "spa", 1)
	first.Header.Identity.Vehicle = "vehicle-0"
	if _, err := reducer.Apply(first); err != nil {
		t.Fatalf("initial Apply(): %v", err)
	}
	next := testBatch(schema.Cursor{Epoch: 2, Sequence: 2}, "spa", 1)
	next.Header.Identity.Vehicle = ""
	snapshot, err := reducer.Apply(next)
	if err != nil {
		t.Fatalf("clear active vehicle Apply(): %v", err)
	}
	if snapshot.Header().Identity.Vehicle != "" {
		t.Fatalf("active vehicle = %q, want empty", snapshot.Header().Identity.Vehicle)
	}
}

func TestReducerAllowsRunIdentityChangeOnlyAtEpochReset(t *testing.T) {
	reducer := NewReducer()
	if _, err := reducer.Apply(testBatch(schema.Cursor{Epoch: 3, Sequence: 1}, "spa", 1)); err != nil {
		t.Fatalf("initial Apply(): %v", err)
	}

	reset := testBatch(schema.Cursor{Epoch: 4, Sequence: 1}, "lemans", 1)
	reset.Header.Identity.Event = "next-event"
	reset.Header.Identity.Session = "next-session"
	reset.Header.Identity.Vehicle = "next-player-vehicle"
	for index := range reset.State.Vehicles {
		reset.State.Vehicles[index].Identity.Event = "next-event"
		reset.State.Vehicles[index].Identity.Session = "next-session"
	}
	if _, err := reducer.Apply(reset); err != nil {
		t.Fatalf("Apply() valid identity reset: %v", err)
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

func FuzzReducerCursorValidation(f *testing.F) {
	f.Add(uint64(1), uint64(1), uint64(1), uint64(2))
	f.Add(uint64(2), uint64(1), uint64(3), uint64(1))
	f.Fuzz(func(t *testing.T, firstEpoch, firstSequence, nextEpoch, nextSequence uint64) {
		reducer := NewReducer()
		model := reducerModel{}
		cursors := []schema.Cursor{
			{Epoch: schema.Epoch(firstEpoch), Sequence: schema.Sequence(firstSequence)},
			{Epoch: schema.Epoch(nextEpoch), Sequence: schema.Sequence(nextSequence)},
		}
		for index, cursor := range cursors {
			track := fmt.Sprintf("track-%d", index)
			batch := testBatch(cursor, track, 1)
			wantErr := model.apply(batch)
			got, gotErr := reducer.Apply(batch)
			if !sameReducerError(gotErr, wantErr) {
				t.Fatalf("Apply(%+v) error = %v, want %v", cursor, gotErr, wantErr)
			}
			assertReducerMatchesModel(t, reducer, model)
			if wantErr == nil {
				value, ok := got.Value()
				if !ok {
					t.Fatalf("accepted cursor %+v returned empty snapshot", cursor)
				}
				if got.Header() != model.header || !reflect.DeepEqual(value, model.state) {
					t.Fatalf("accepted snapshot = (%+v, %+v), want (%+v, %+v)", got.Header(), value, model.header, model.state)
				}
			}
		}
	})
}

type reducerModel struct {
	initialized bool
	header      envelope.Header
	state       ObservedState
}

func (model *reducerModel) apply(batch Batch) error {
	cursor := batch.Header.Cursor
	run := batch.Header.Identity
	var err error
	switch {
	case !run.SessionKnown():
		err = ErrIncompleteRunIdentity
	case !model.initialized && (cursor.Epoch == 0 || cursor.Sequence != 1):
		err = ErrInvalidInitialCursor
	case model.initialized && (cursor.Epoch < model.header.Cursor.Epoch ||
		(cursor.Epoch == model.header.Cursor.Epoch && cursor.Sequence <= model.header.Cursor.Sequence)):
		err = ErrStaleBatch
	case model.initialized && cursor.Epoch == model.header.Cursor.Epoch &&
		cursor.Sequence != model.header.Cursor.Sequence+1:
		err = ErrSequenceGap
	case model.initialized && cursor.Epoch == model.header.Cursor.Epoch &&
		!model.header.Identity.SameRun(run):
		err = ErrRunIdentityChanged
	case model.initialized && cursor.Epoch != model.header.Cursor.Epoch &&
		cursor.Epoch != model.header.Cursor.Epoch+1:
		err = ErrEpochGap
	case model.initialized && cursor.Epoch == model.header.Cursor.Epoch+1 && cursor.Sequence != 1:
		err = ErrInvalidEpochReset
	}
	if err != nil {
		return err
	}
	model.initialized = true
	model.header = batch.Header
	model.state = batch.State
	model.state.Vehicles = append([]VehicleState(nil), batch.State.Vehicles...)
	return nil
}

func sameReducerError(got, want error) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return errors.Is(got, want)
}

func assertReducerMatchesModel(t *testing.T, reducer *Reducer, model reducerModel) {
	t.Helper()
	snapshot, ok := reducer.Current()
	if ok != model.initialized {
		t.Fatalf("Current() present = %t, want %t", ok, model.initialized)
	}
	if !ok {
		return
	}
	value, valueOK := snapshot.Value()
	if !valueOK {
		t.Fatal("Current() returned snapshot with no value")
	}
	if snapshot.Header() != model.header || !reflect.DeepEqual(value, model.state) {
		t.Fatalf("Current() = (%+v, %+v), want (%+v, %+v)", snapshot.Header(), value, model.header, model.state)
	}
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
