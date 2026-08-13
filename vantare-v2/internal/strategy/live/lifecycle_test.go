package live

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	telemetryprojection "github.com/vantare/overlays/v2/internal/telemetry/projection"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestSnapshotCursorRulesAreAtomicAndLatestWins(t *testing.T) {
	engine := newLiveEngine(t)
	first := progressProjection(3, 7, 1)
	if err := engine.ApplySnapshot(first); err != nil {
		t.Fatal(err)
	}
	want := engine.Snapshot()

	if err := engine.ApplySnapshot(first); err != nil {
		t.Fatalf("exact duplicate = %v", err)
	}
	conflict := first
	conflict.Player.CompletedLaps.Value = 2
	if err := engine.ApplySnapshot(conflict); !errors.Is(err, ErrCursorConflict) {
		t.Fatalf("same cursor conflict = %v", err)
	}
	if got := engine.Snapshot(); !reflect.DeepEqual(got, want) {
		t.Fatal("cursor conflict mutated prior state")
	}

	for _, older := range []strategyprojection.SnapshotV1{
		progressProjection(2, 999, 2),
		progressProjection(3, 6, 2),
	} {
		if err := engine.ApplySnapshot(older); !errors.Is(err, ErrOutOfOrder) {
			t.Fatalf("older cursor %+v = %v", older.Metadata, err)
		}
		if got := engine.Snapshot(); !reflect.DeepEqual(got, want) {
			t.Fatal("out-of-order snapshot mutated prior state")
		}
	}

	gap := progressProjection(3, 42, 2)
	if err := engine.ApplySnapshot(gap); err != nil {
		t.Fatalf("latest-wins gap rejected: %v", err)
	}
	if got := engine.Snapshot(); got.Cursor != (Cursor{Epoch: 3, Sequence: 42}) {
		t.Fatalf("gap cursor = %+v", got.Cursor)
	}
}

func TestNewEpochResetsProgressAndPreservesActivePlan(t *testing.T) {
	engine := newLiveEngine(t)
	if err := engine.ApplySnapshot(progressProjection(4, 9, 1)); err != nil {
		t.Fatal(err)
	}
	active := engine.Snapshot().ActivePlan

	nextEpoch := emptyProjection(5, 20)
	if err := engine.ApplySnapshot(nextEpoch); err != nil {
		t.Fatal(err)
	}
	got := engine.Snapshot()
	if got.Cursor != (Cursor{Epoch: 5, Sequence: 20}) || !reflect.DeepEqual(got.ActivePlan, active) {
		t.Fatalf("epoch reset lost cursor/plan: %+v", got)
	}
	if got.CompletedLaps.State() != ValueUnsupported || got.CompletedLaps.Usable() || got.Stint.Usable() || got.NextAction.Usable() {
		t.Fatalf("epoch reset retained live progress: %+v", got)
	}
}

func TestProjectionInputIsOwnedAndInvalidDuplicateIsValidatedFirst(t *testing.T) {
	engine := newLiveEngine(t)
	input := progressProjection(1, 1, 1)
	if err := engine.ApplySnapshot(input); err != nil {
		t.Fatal(err)
	}
	want := engine.Snapshot()
	input.Capabilities[0] = strategyprojection.CapabilityFuel

	duplicate := progressProjection(1, 1, 1)
	if err := engine.ApplySnapshot(duplicate); err != nil {
		t.Fatalf("owned duplicate changed after caller mutation: %v", err)
	}
	invalidDuplicate := duplicate
	invalidDuplicate.CapturedAt = "not-a-time"
	if err := engine.ApplySnapshot(invalidDuplicate); !errors.Is(err, ErrInvalidProjection) {
		t.Fatalf("invalid duplicate = %v", err)
	}
	if got := engine.Snapshot(); !reflect.DeepEqual(got, want) {
		t.Fatal("invalid duplicate mutated prior state")
	}
}

func TestSourceStatusIsMonotonicAtomicAndLeavingLiveDowngradesImmediately(t *testing.T) {
	engine := newLiveEngine(t)
	if err := engine.ApplySnapshot(progressProjection(1, 1, 1)); err != nil {
		t.Fatal(err)
	}
	leftLive := SourceStatus{
		State: SourceDegraded, Revision: 2, ReconnectAttempt: 1,
		UpdatedAt: time.Date(2026, 8, 13, 10, 1, 0, 0, time.UTC),
	}
	if err := engine.ApplySourceStatus(leftLive); err != nil {
		t.Fatal(err)
	}
	downgraded := engine.Snapshot()
	if downgraded.CompletedLaps.State() != ValueStale || downgraded.CompletedLaps.Usable() ||
		downgraded.Stint.State() != ValueStale || downgraded.NextAction.State() != ValueStale {
		t.Fatalf("leaving live did not downgrade derived state: %+v", downgraded)
	}
	if downgraded.Status != "idle" {
		t.Fatalf("degraded source status = %q, want idle", downgraded.Status)
	}

	if err := engine.ApplySourceStatus(leftLive); err != nil {
		t.Fatalf("exact source duplicate = %v", err)
	}
	conflict := leftLive
	conflict.State = SourceStale
	if err := engine.ApplySourceStatus(conflict); !errors.Is(err, ErrSourceConflict) {
		t.Fatalf("same source revision conflict = %v", err)
	}
	older := leftLive
	older.Revision = 1
	if err := engine.ApplySourceStatus(older); !errors.Is(err, ErrOutOfOrder) {
		t.Fatalf("old source revision = %v", err)
	}
	if got := engine.Snapshot(); !reflect.DeepEqual(got, downgraded) {
		t.Fatal("rejected source status mutated prior state")
	}
}

func TestReturningLiveDoesNotReviveOldDataButNewSnapshotDoes(t *testing.T) {
	engine := newLiveEngine(t)
	if err := engine.ApplySnapshot(progressProjection(8, 1, 1)); err != nil {
		t.Fatal(err)
	}
	if err := engine.ApplySourceStatus(sourceStatus(SourceConnecting, 2, 1)); err != nil {
		t.Fatal(err)
	}
	if err := engine.ApplySourceStatus(sourceStatus(SourceLive, 3, 1)); err != nil {
		t.Fatal(err)
	}
	if got := engine.Snapshot(); got.CompletedLaps.State() != ValueStale || got.CompletedLaps.Usable() || got.Status != "idle" {
		t.Fatalf("reconnect revived old data: %+v", got)
	}
	if err := engine.ApplySnapshot(progressProjection(9, 10, 1)); err != nil {
		t.Fatal(err)
	}
	if got := engine.Snapshot(); !got.CompletedLaps.Usable() || got.Status != "monitoring" || got.ActivePlan.ActivationID != "activation-1" {
		t.Fatalf("new epoch did not restore fresh monitoring while preserving plan: %+v", got)
	}
}

func TestReconnectAttemptIncreaseDowngradesEvenWhenSourceRemainsLive(t *testing.T) {
	engine := newLiveEngine(t)
	if err := engine.ApplySnapshot(progressProjection(1, 1, 1)); err != nil {
		t.Fatal(err)
	}
	reconnected := SourceStatus{
		State: SourceLive, Revision: 2, ReconnectAttempt: 1,
		UpdatedAt: time.Date(2026, 8, 13, 10, 1, 0, 0, time.UTC),
	}
	if err := engine.ApplySourceStatus(reconnected); err != nil {
		t.Fatal(err)
	}
	stale := engine.Snapshot()
	if stale.CompletedLaps.State() != ValueStale || stale.CompletedLaps.Usable() || stale.Status != "idle" {
		t.Fatalf("coalesced reconnect retained fresh data: %+v", stale)
	}
	if err := engine.ApplySnapshot(progressProjection(1, 2, 2)); err != nil {
		t.Fatal(err)
	}
	fresh := engine.Snapshot()
	if fresh.CompletedLaps.State() != ValueFresh || !fresh.CompletedLaps.Usable() || fresh.Status != "monitoring" {
		t.Fatalf("new post-reconnect snapshot did not restore fresh data: %+v", fresh)
	}
}

func TestLifecycleDowngradesFuelAndDeviationUntilPostBoundarySnapshot(t *testing.T) {
	tests := []struct {
		name      string
		boundary  SourceStatus
		after     *SourceStatus
		freshFuel energy.FuelAmount
		wantDelta float64
	}{
		{
			name: "live to degraded",
			boundary: SourceStatus{
				State: SourceDegraded, Revision: 2, ReconnectAttempt: 0,
				UpdatedAt: time.Date(2026, 8, 13, 10, 1, 0, 0, time.UTC),
			},
			after: statusPointer(SourceStatus{
				State: SourceLive, Revision: 3, ReconnectAttempt: 0,
				UpdatedAt: time.Date(2026, 8, 13, 10, 2, 0, 0, time.UTC),
			}),
			freshFuel: 24, wantDelta: -3,
		},
		{
			name: "coalesced reconnect while live",
			boundary: SourceStatus{
				State: SourceLive, Revision: 2, ReconnectAttempt: 1,
				UpdatedAt: time.Date(2026, 8, 13, 10, 1, 0, 0, time.UTC),
			},
			freshFuel: 26, wantDelta: -1,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			engine := newLiveEngine(t)
			if err := engine.ApplySnapshot(fuelProgressProjection(1, 1, 1, 25, 40)); err != nil {
				t.Fatal(err)
			}
			assertFuelReadModel(t, engine.Snapshot(), ValueFresh, true, 25, 40, -2)

			if err := engine.ApplySourceStatus(test.boundary); err != nil {
				t.Fatal(err)
			}
			assertFuelReadModel(t, engine.Snapshot(), ValueStale, false, 25, 40, -2)
			if test.after != nil {
				if err := engine.ApplySourceStatus(*test.after); err != nil {
					t.Fatal(err)
				}
				assertFuelReadModel(t, engine.Snapshot(), ValueStale, false, 25, 40, -2)
			}

			if err := engine.ApplySnapshot(fuelProgressProjection(1, 2, 1, test.freshFuel, 40)); err != nil {
				t.Fatal(err)
			}
			assertFuelReadModel(t, engine.Snapshot(), ValueFresh, true, contract.FuelLiters(test.freshFuel), 40, test.wantDelta)
		})
	}
}

func TestSourceStatusRejectsInvalidMetadataWithoutMutation(t *testing.T) {
	engine := newLiveEngine(t)
	want := engine.Snapshot()
	now := time.Date(2026, 8, 13, 10, 2, 0, 0, time.UTC)
	tests := []SourceStatus{
		{State: "unknown", Revision: 2, UpdatedAt: now},
		{State: SourceLive, Revision: 0, UpdatedAt: now},
		{State: SourceLive, Revision: uint64(maxSafeInteger) + 1, UpdatedAt: now},
		{State: SourceLive, Revision: 2, ReconnectAttempt: -1, UpdatedAt: now},
		{State: SourceLive, Revision: 2, UpdatedAt: time.Time{}},
		{State: SourceLive, Revision: 2, UpdatedAt: time.Date(2026, 8, 13, 12, 2, 0, 0, time.FixedZone("CEST", 2*60*60))},
	}
	for _, status := range tests {
		if err := engine.ApplySourceStatus(status); !errors.Is(err, ErrInvalidSource) {
			t.Fatalf("status %+v error = %v", status, err)
		}
		if got := engine.Snapshot(); !reflect.DeepEqual(got, want) {
			t.Fatalf("invalid status mutated state: %+v", status)
		}
	}
}

func TestSourceStatusAcceptsUTCRFC3339NanoPrecision(t *testing.T) {
	engine := newLiveEngine(t)
	status := SourceStatus{
		State: SourceLive, Revision: 2,
		UpdatedAt: time.Date(2026, 8, 13, 10, 2, 0, 123456789, time.UTC),
	}
	if err := engine.ApplySourceStatus(status); err != nil {
		t.Fatalf("nanosecond UTC status rejected: %v", err)
	}
	got, present := engine.Snapshot().Source.Value()
	if !present || !got.UpdatedAt.Equal(status.UpdatedAt) {
		t.Fatalf("nanosecond timestamp not preserved: %+v,%t", got, present)
	}
}

func TestSourceAbsenceIsIdleAndExplicitStoppedIsStopped(t *testing.T) {
	plan, err := NewPlan(PlanInput{ActivePlan: validActivePlan(t), Stints: []Stint{{ID: "race", Laps: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	engine, err := NewEngine(plan)
	if err != nil {
		t.Fatal(err)
	}
	initial := engine.Snapshot()
	if initial.Source.State() != ValueMissing || initial.Source.Usable() || initial.Status != "idle" {
		t.Fatalf("initial source absence was fabricated: %+v", initial)
	}
	if err := engine.ApplySourceStatus(sourceStatus(SourceStopped, 1, 0)); err != nil {
		t.Fatal(err)
	}
	stopped := engine.Snapshot()
	status, present := stopped.Source.Value()
	if !present || !stopped.Source.Usable() || status.State != SourceStopped || stopped.Status != "stopped" {
		t.Fatalf("explicit stopped source = %+v", stopped)
	}
}

func TestSourceStatusAcceptsOnlyTheSevenContractStates(t *testing.T) {
	states := []SourceState{
		SourceStopped, SourceDetecting, SourceConnecting, SourceLive,
		SourceDegraded, SourceStale, SourceError,
	}
	for index, state := range states {
		engine := newLiveEngine(t)
		if err := engine.ApplySourceStatus(sourceStatus(state, 2, index)); err != nil {
			t.Fatalf("state %q: %v", state, err)
		}
		got, present := engine.Snapshot().Source.Value()
		if !present || got.State != state {
			t.Fatalf("state %q projected as %+v,%t", state, got, present)
		}
	}
}

func TestReplayIsDeterministicAcrossGapsEpochsAndLifecycle(t *testing.T) {
	type step struct {
		status     *SourceStatus
		projection *strategyprojection.SnapshotV1
		wantCursor Cursor
		wantState  ValueState
	}
	steps := []step{
		{projection: projectionPointer(progressProjection(1, 1, 0)), wantCursor: Cursor{1, 1}, wantState: ValueFresh},
		{projection: projectionPointer(progressProjection(1, 50, 1)), wantCursor: Cursor{1, 50}, wantState: ValueFresh},
		{status: statusPointer(sourceStatus(SourceStale, 2, 1)), wantCursor: Cursor{1, 50}, wantState: ValueStale},
		{status: statusPointer(sourceStatus(SourceLive, 3, 1)), wantCursor: Cursor{1, 50}, wantState: ValueStale},
		{projection: projectionPointer(progressProjection(2, 7, 2)), wantCursor: Cursor{2, 7}, wantState: ValueFresh},
	}
	for replay := 0; replay < 20; replay++ {
		engine := newLiveEngine(t)
		for index, current := range steps {
			var err error
			if current.status != nil {
				err = engine.ApplySourceStatus(*current.status)
			} else {
				err = engine.ApplySnapshot(*current.projection)
			}
			if err != nil {
				t.Fatalf("replay %d step %d: %v", replay, index, err)
			}
			got := engine.Snapshot()
			if got.Cursor != current.wantCursor || got.CompletedLaps.State() != current.wantState {
				t.Fatalf("replay %d step %d = cursor %+v state %v", replay, index, got.Cursor, got.CompletedLaps.State())
			}
		}
	}
}

func TestLogicalSoakRemainsBoundedAndLatestWins(t *testing.T) {
	engine := newLiveEngine(t)
	const snapshots = 10_000
	for sequence := 1; sequence <= snapshots; sequence++ {
		projection := progressProjection(1, schema.Sequence(sequence), standings.CompletedLaps(sequence%4))
		if err := engine.ApplySnapshot(projection); err != nil {
			t.Fatalf("sequence %d: %v", sequence, err)
		}
	}
	got := engine.Snapshot()
	if got.Cursor != (Cursor{Epoch: 1, Sequence: snapshots}) {
		t.Fatalf("final cursor = %+v", got.Cursor)
	}
	if len(engine.plan.Stints()) != 2 || len(engine.plan.FuelTargets()) != 4 {
		t.Fatal("logical soak grew immutable plan storage")
	}
}

func progressProjection(epoch schema.Epoch, sequence schema.Sequence, completed standings.CompletedLaps) strategyprojection.SnapshotV1 {
	projection := emptyProjection(epoch, sequence)
	projection.Player.CompletedLaps = projectedField(completed, telemetryprojection.FreshnessFresh)
	projection.Capabilities = []strategyprojection.Capability{strategyprojection.CapabilityProgress}
	return projection
}

func fuelProgressProjection(
	epoch schema.Epoch,
	sequence schema.Sequence,
	completed standings.CompletedLaps,
	amount energy.FuelAmount,
	capacity energy.FuelCapacity,
) strategyprojection.SnapshotV1 {
	projection := progressProjection(epoch, sequence, completed)
	projection.Player.FuelLiters = projectedField(amount, telemetryprojection.FreshnessFresh)
	projection.Player.FuelCapacity = projectedField(capacity, telemetryprojection.FreshnessFresh)
	projection.Capabilities = append(projection.Capabilities, strategyprojection.CapabilityFuel)
	return projection
}

func assertFuelReadModel(
	t testing.TB,
	model ReadModel,
	wantState ValueState,
	wantUsable bool,
	wantAmount contract.FuelLiters,
	wantCapacity contract.FuelLiters,
	wantDeviation float64,
) {
	t.Helper()
	amount, amountPresent := model.FuelAmount.Value()
	capacity, capacityPresent := model.FuelCapacity.Value()
	deviation, deviationPresent := model.FuelDeviationLiters.Value()
	if model.FuelAmount.State() != wantState || model.FuelCapacity.State() != wantState || model.FuelDeviationLiters.State() != wantState ||
		model.FuelAmount.Usable() != wantUsable || model.FuelCapacity.Usable() != wantUsable || model.FuelDeviationLiters.Usable() != wantUsable ||
		!amountPresent || !capacityPresent || !deviationPresent || amount != wantAmount || capacity != wantCapacity || deviation != wantDeviation {
		t.Fatalf("fuel read model = amount %v,%t/%v capacity %v,%t/%v deviation %v,%t/%v; want state %v usable %t values %v/%v/%v",
			amount, amountPresent, model.FuelAmount.State(), capacity, capacityPresent, model.FuelCapacity.State(),
			deviation, deviationPresent, model.FuelDeviationLiters.State(), wantState, wantUsable, wantAmount, wantCapacity, wantDeviation)
	}
}

func sourceStatus(state SourceState, revision uint64, reconnect int) SourceStatus {
	return SourceStatus{
		State: state, Revision: revision, ReconnectAttempt: reconnect,
		UpdatedAt: time.Date(2026, 8, 13, 10, int(revision), 0, 0, time.UTC),
	}
}

func projectionPointer(value strategyprojection.SnapshotV1) *strategyprojection.SnapshotV1 {
	return &value
}
func statusPointer(value SourceStatus) *SourceStatus { return &value }
