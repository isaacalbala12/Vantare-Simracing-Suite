package live

import (
	"errors"
	"fmt"
	"math"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	telemetryprojection "github.com/vantare/overlays/v2/internal/telemetry/projection"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestNewPlanRejectsInvalidShapeAndOwnsInput(t *testing.T) {
	active := validActivePlan(t)
	tests := []struct {
		name   string
		stints []Stint
		target []FuelTarget
	}{
		{name: "empty stints"},
		{name: "unsafe stint id", stints: []Stint{{ID: "bad id", Laps: 1}}},
		{name: "duplicate stint id", stints: []Stint{{ID: "one", Laps: 1}, {ID: "one", Laps: 1}}},
		{name: "zero stint", stints: []Stint{{ID: "one", Laps: 0}}},
		{name: "negative stint", stints: []Stint{{ID: "one", Laps: -1}}},
		{name: "total overflow", stints: []Stint{{ID: "one", Laps: maxSafeInteger}, {ID: "two", Laps: 1}}},
		{name: "target outside plan", stints: []Stint{{ID: "one", Laps: 2}}, target: []FuelTarget{{CompletedLaps: 3, Fuel: 1}}},
		{name: "duplicate target", stints: []Stint{{ID: "one", Laps: 2}}, target: []FuelTarget{{CompletedLaps: 1, Fuel: 1}, {CompletedLaps: 1, Fuel: 2}}},
		{name: "negative fuel", stints: []Stint{{ID: "one", Laps: 2}}, target: []FuelTarget{{CompletedLaps: 1, Fuel: -1}}},
		{name: "non finite fuel", stints: []Stint{{ID: "one", Laps: 2}}, target: []FuelTarget{{CompletedLaps: 1, Fuel: contract.FuelLiters(math.NaN())}}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := NewPlan(PlanInput{ActivePlan: active, Stints: test.stints, FuelTargets: test.target})
			if !errors.Is(err, ErrInvalidPlan) {
				t.Fatalf("NewPlan error = %v, want ErrInvalidPlan", err)
			}
		})
	}
	invalidActive := active
	invalidActive.ContractVersion = "strategy.v99"
	if _, err := NewPlan(PlanInput{ActivePlan: invalidActive, Stints: []Stint{{ID: "one", Laps: 1}}}); !errors.Is(err, ErrInvalidPlan) {
		t.Fatalf("invalid active plan error = %v", err)
	}

	previous := active.Revision
	active.PreviousRevision = &previous
	stints := []Stint{{ID: "opening", Laps: 2}, {ID: "finish", Laps: 1}}
	targets := []FuelTarget{{CompletedLaps: 0, Fuel: 30}, {CompletedLaps: 2, Fuel: 10}}
	plan, err := NewPlan(PlanInput{ActivePlan: active, Stints: stints, FuelTargets: targets})
	if err != nil {
		t.Fatal(err)
	}
	stints[0].ID = "mutated"
	targets[0].Fuel = 999
	active.PreviousRevision.RevisionID = "mutated"
	gotStints := plan.Stints()
	gotTargets := plan.FuelTargets()
	gotActive := plan.ActivePlan()
	if gotStints[0].ID != "opening" || gotTargets[0].Fuel != 30 || gotActive.PreviousRevision.RevisionID == "mutated" {
		t.Fatalf("plan retained input alias: %+v %+v %+v", gotStints, gotTargets, gotActive)
	}
	gotStints[0].ID = "output-mutated"
	gotTargets[0].Fuel = 888
	gotActive.PreviousRevision.RevisionID = "output-mutated"
	if plan.Stints()[0].ID != "opening" || plan.FuelTargets()[0].Fuel != 30 || plan.ActivePlan().PreviousRevision.RevisionID == "output-mutated" {
		t.Fatal("plan exposed output alias")
	}
}

func TestApplySnapshotDistinguishesFreshZeroFromMissingStaleInvalidAndUnsupported(t *testing.T) {
	tests := []struct {
		name          string
		capability    bool
		otherProgress bool
		field         telemetryprojection.Field[standings.CompletedLaps]
		want          ValueState
		present       bool
	}{
		{name: "fresh zero", capability: true, field: projectedField(standings.CompletedLaps(0), telemetryprojection.FreshnessFresh), want: ValueFresh, present: true},
		{name: "missing in supported family", capability: true, otherProgress: true, field: telemetryprojection.MissingField[standings.CompletedLaps](), want: ValueMissing},
		{name: "stale", capability: true, field: projectedField(standings.CompletedLaps(0), telemetryprojection.FreshnessStale), want: ValueStale, present: true},
		{name: "invalid without usable capability", capability: false, field: projectedField(standings.CompletedLaps(0), telemetryprojection.FreshnessInvalid), want: ValueInvalid, present: true},
		{name: "unsupported family", capability: false, field: telemetryprojection.MissingField[standings.CompletedLaps](), want: ValueUnsupported},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			engine := newLiveEngine(t)
			snapshot := emptyProjection(1, 1)
			snapshot.Player.CompletedLaps = test.field
			if test.otherProgress {
				snapshot.Player.LapNumber = projectedField(session.LapNumber(1), telemetryprojection.FreshnessFresh)
			}
			if test.capability {
				snapshot.Capabilities = []strategyprojection.Capability{strategyprojection.CapabilityProgress}
			}
			if err := engine.ApplySnapshot(snapshot); err != nil {
				t.Fatal(err)
			}
			value := engine.Snapshot().CompletedLaps
			if value.State() != test.want {
				t.Fatalf("state = %v, want %v", value.State(), test.want)
			}
			got, present := value.Value()
			if present != test.present || (present && got != 0) {
				t.Fatalf("value = %v,%t, want zero,%t", got, present, test.present)
			}
		})
	}
}

func TestNewEngineRejectsZeroPlan(t *testing.T) {
	if _, err := NewEngine(Plan{}); !errors.Is(err, ErrInvalidPlan) {
		t.Fatalf("NewEngine zero plan error = %v", err)
	}
}

func TestNewPlanEnforcesBoundedStintsAndFuelTargets(t *testing.T) {
	t.Run("stints", func(t *testing.T) {
		stints := make([]Stint, 129)
		for index := range stints {
			stints[index] = Stint{ID: fmt.Sprintf("stint-%d", index), Laps: 1}
		}
		if _, err := NewPlan(PlanInput{ActivePlan: validActivePlan(t), Stints: stints[:128]}); err != nil {
			t.Fatalf("128 stints rejected: %v", err)
		}
		if _, err := NewPlan(PlanInput{ActivePlan: validActivePlan(t), Stints: stints}); !errors.Is(err, ErrInvalidPlan) {
			t.Fatalf("129 stints error = %v, want ErrInvalidPlan", err)
		}
	})

	t.Run("fuel targets", func(t *testing.T) {
		targets := make([]FuelTarget, 4097)
		for index := range targets {
			targets[index] = FuelTarget{CompletedLaps: contract.LapCount(index), Fuel: 0}
		}
		input := PlanInput{ActivePlan: validActivePlan(t), Stints: []Stint{{ID: "race", Laps: 4096}}}
		input.FuelTargets = targets[:4096]
		if _, err := NewPlan(input); err != nil {
			t.Fatalf("4096 fuel targets rejected: %v", err)
		}
		input.FuelTargets = targets
		if _, err := NewPlan(input); !errors.Is(err, ErrInvalidPlan) {
			t.Fatalf("4097 fuel targets error = %v, want ErrInvalidPlan", err)
		}
	})
}

func TestEngineAcceptsRealStrategyProjectionWithFreshZeroSectorAndFuel(t *testing.T) {
	engine := newLiveEngine(t)
	observed := schema.ProvenanceObserved
	fresh := schema.FreshnessFresh
	vehicleID := identity.VehicleID("player")
	final := derive.FinalState{Observed: core.ObservedState{Vehicles: []core.VehicleState{{
		Identity:      identity.RunIdentity{Event: "event", Session: "session", Vehicle: vehicleID},
		CompletedLaps: canonicalField(t, standings.CompletedLaps(0), observed, fresh),
		Sector:        canonicalField(t, standings.SectorUnknown, observed, fresh),
		Fuel:          canonicalField(t, energy.Fuel{Amount: 0, Capacity: 0}, observed, fresh),
	}}}}
	header := envelope.Header{
		Cursor: schema.Cursor{Epoch: 1, Sequence: 1},
		Clock: schema.NewClock(
			schema.MissingField[time.Duration](), schema.MissingField[time.Duration](),
			time.Date(2026, 8, 13, 10, 0, 0, 123456789, time.UTC),
		),
		Identity: identity.RunIdentity{Event: "event", Session: "session", Vehicle: vehicleID},
	}
	canonical, err := envelope.NewSnapshot(header, final, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = append([]core.VehicleState(nil), value.Observed.Vehicles...)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	projected, err := strategyprojection.ProjectV1(canonical)
	if err != nil {
		t.Fatal(err)
	}
	if err := engine.ApplySnapshot(projected); err != nil {
		t.Fatalf("ApplySnapshot(real ProjectV1 output): %v", err)
	}
	model := engine.Snapshot()
	amount, amountPresent := model.FuelAmount.Value()
	capacity, capacityPresent := model.FuelCapacity.Value()
	if !model.FuelAmount.Usable() || !model.FuelCapacity.Usable() || !amountPresent || !capacityPresent || amount != 0 || capacity != 0 {
		t.Fatalf("real fresh zero fuel lost: amount=%v,%t/%v capacity=%v,%t/%v", amount, amountPresent, model.FuelAmount.State(), capacity, capacityPresent, model.FuelCapacity.State())
	}
}

func TestApplySnapshotUsesCompletedLapsForStintExactFuelTargetAndActionBoundaries(t *testing.T) {
	engine := newLiveEngine(t)
	tests := []struct {
		completed standings.CompletedLaps
		fuel      energy.FuelAmount
		stintID   string
		inStint   contract.LapCount
		deviation float64
		action    ActionKind
		boundary  contract.LapCount
		status    contract.ExecutionStatus
	}{
		{completed: 0, fuel: 30, stintID: "opening", inStint: 0, deviation: 0, action: ActionPit, boundary: 2, status: contract.ExecutionMonitoring},
		{completed: 1, fuel: 25, stintID: "opening", inStint: 1, deviation: -2, action: ActionPit, boundary: 2, status: contract.ExecutionMonitoring},
		{completed: 2, fuel: 10, stintID: "finish", inStint: 0, deviation: 0, action: ActionFinish, boundary: 3, status: contract.ExecutionMonitoring},
		{completed: 3, fuel: 4, deviation: -1, action: ActionFinish, boundary: 3, status: contract.ExecutionCompleted},
		{completed: 4, fuel: 2, action: ActionFinish, boundary: 3, status: contract.ExecutionCompleted},
	}
	for index, test := range tests {
		snapshot := emptyProjection(1, schema.Sequence(index+1))
		snapshot.Player.LapNumber = projectedField(session.LapNumber(99), telemetryprojection.FreshnessFresh)
		snapshot.Player.CompletedLaps = projectedField(test.completed, telemetryprojection.FreshnessFresh)
		snapshot.Player.FuelLiters = projectedField(test.fuel, telemetryprojection.FreshnessFresh)
		snapshot.Player.FuelCapacity = projectedField(energy.FuelCapacity(40), telemetryprojection.FreshnessFresh)
		snapshot.Capabilities = []strategyprojection.Capability{strategyprojection.CapabilityProgress, strategyprojection.CapabilityFuel}
		if err := engine.ApplySnapshot(snapshot); err != nil {
			t.Fatalf("completed %d: %v", test.completed, err)
		}
		model := engine.Snapshot()
		if model.Status != test.status {
			t.Fatalf("completed %d status = %s, want %s", test.completed, model.Status, test.status)
		}
		progress, progressPresent := model.Stint.Value()
		if test.completed < 3 {
			if !progressPresent || progress.Stint.ID != test.stintID || progress.CompletedLaps != test.inStint {
				t.Fatalf("completed %d progress = %+v,%t", test.completed, progress, progressPresent)
			}
		} else if progressPresent {
			t.Fatalf("completed %d retained completed stint %+v", test.completed, progress)
		}
		action, present := model.NextAction.Value()
		if !present || action.Kind != test.action || action.LapBoundary != test.boundary {
			t.Fatalf("completed %d action = %+v,%t", test.completed, action, present)
		}
		deviation, deviationPresent := model.FuelDeviationLiters.Value()
		_, hasTarget := map[standings.CompletedLaps]bool{0: true, 1: true, 2: true, 3: true}[test.completed]
		if deviationPresent != hasTarget || (deviationPresent && deviation != test.deviation) {
			t.Fatalf("completed %d deviation = %v,%t, want %v,%t", test.completed, deviation, deviationPresent, test.deviation, hasTarget)
		}
	}
}

func TestApplySnapshotRejectsCapabilityAndMetadataConflictsAtomically(t *testing.T) {
	engine := newLiveEngine(t)
	valid := emptyProjection(1, 1)
	valid.Player.CompletedLaps = projectedField(standings.CompletedLaps(0), telemetryprojection.FreshnessFresh)
	valid.Capabilities = []strategyprojection.Capability{strategyprojection.CapabilityProgress}
	if err := engine.ApplySnapshot(valid); err != nil {
		t.Fatal(err)
	}
	want := engine.Snapshot()

	tests := []struct {
		name string
		edit func(*strategyprojection.SnapshotV1)
		err  error
	}{
		{name: "capability omitted", edit: func(s *strategyprojection.SnapshotV1) { s.Capabilities = nil }, err: ErrCapabilityConflict},
		{name: "unknown capability", edit: func(s *strategyprojection.SnapshotV1) { s.Capabilities = []strategyprojection.Capability{"weather"} }, err: ErrCapabilityConflict},
		{name: "wrong canonical version", edit: func(s *strategyprojection.SnapshotV1) { s.CanonicalVersion = 2 }, err: ErrInvalidProjection},
		{name: "wrong projection version", edit: func(s *strategyprojection.SnapshotV1) { s.ProjectionVersion = 2 }, err: ErrInvalidProjection},
		{name: "zero epoch", edit: func(s *strategyprojection.SnapshotV1) { s.Epoch = 0 }, err: ErrInvalidProjection},
		{name: "unsafe sequence", edit: func(s *strategyprojection.SnapshotV1) { s.Sequence = schema.Sequence(maxSafeInteger + 1) }, err: ErrInvalidProjection},
		{name: "non canonical timestamp", edit: func(s *strategyprojection.SnapshotV1) { s.CapturedAt = "2026-08-13T12:00:00+02:00" }, err: ErrInvalidProjection},
		{name: "contradictory missing quality", edit: func(s *strategyprojection.SnapshotV1) {
			s.Player.CompletedLaps.Present = false
			s.Player.CompletedLaps.Freshness = telemetryprojection.FreshnessFresh
		}, err: ErrInvalidProjection},
		{name: "contradictory atomic fuel quality", edit: func(s *strategyprojection.SnapshotV1) {
			s.Player.FuelLiters = projectedField(energy.FuelAmount(1), telemetryprojection.FreshnessFresh)
			s.Player.FuelCapacity = projectedField(energy.FuelCapacity(2), telemetryprojection.FreshnessStale)
			s.Capabilities = []strategyprojection.Capability{strategyprojection.CapabilityProgress, strategyprojection.CapabilityFuel}
		}, err: ErrInvalidProjection},
		{name: "fuel exceeds capacity", edit: func(s *strategyprojection.SnapshotV1) {
			s.Player.FuelLiters = projectedField(energy.FuelAmount(3), telemetryprojection.FreshnessFresh)
			s.Player.FuelCapacity = projectedField(energy.FuelCapacity(2), telemetryprojection.FreshnessFresh)
			s.Capabilities = []strategyprojection.Capability{strategyprojection.CapabilityProgress, strategyprojection.CapabilityFuel}
		}, err: ErrInvalidProjection},
		{name: "sector exceeds producer range", edit: func(s *strategyprojection.SnapshotV1) {
			s.Player.Sector = projectedField(standings.Sector(4), telemetryprojection.FreshnessFresh)
		}, err: ErrInvalidProjection},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := valid
			candidate.Sequence = 2
			test.edit(&candidate)
			if err := engine.ApplySnapshot(candidate); !errors.Is(err, test.err) {
				t.Fatalf("error = %v, want %v", err, test.err)
			}
			if got := engine.Snapshot(); !reflect.DeepEqual(got, want) {
				t.Fatalf("state mutated after error\ngot:  %+v\nwant: %+v", got, want)
			}
		})
	}
}

func validActivePlan(t testing.TB) contract.ActivePlan {
	t.Helper()
	active, err := contract.NewActivePlan("activation-1", contract.RevisionRef{
		PlanID: "plan-1", VariantID: "variant-1", RevisionID: "revision-1", ContentHash: strings.Repeat("a", 64),
	}, time.Date(2026, 8, 13, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	return active
}

func newLiveEngine(t testing.TB) *Engine {
	t.Helper()
	plan, err := NewPlan(PlanInput{
		ActivePlan: validActivePlan(t),
		Stints:     []Stint{{ID: "opening", Laps: 2}, {ID: "finish", Laps: 1}},
		FuelTargets: []FuelTarget{
			{CompletedLaps: 0, Fuel: 30}, {CompletedLaps: 1, Fuel: 27},
			{CompletedLaps: 2, Fuel: 10}, {CompletedLaps: 3, Fuel: 5},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	engine, err := NewEngine(plan)
	if err != nil {
		t.Fatal(err)
	}
	if err := engine.ApplySourceStatus(SourceStatus{
		State: SourceLive, Revision: 1, ReconnectAttempt: 0,
		UpdatedAt: time.Date(2026, 8, 13, 10, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatal(err)
	}
	return engine
}

func emptyProjection(epoch schema.Epoch, sequence schema.Sequence) strategyprojection.SnapshotV1 {
	return strategyprojection.SnapshotV1{
		Metadata: telemetryprojection.Metadata{
			CanonicalVersion:  schema.CanonicalVersionV1,
			ProjectionVersion: strategyprojection.VersionV1,
			Epoch:             epoch, Sequence: sequence, CapturedAt: "2026-08-13T10:00:00Z",
		},
		PayloadV1: strategyprojection.PayloadV1{
			TrackName: telemetryprojection.MissingField[string](), SessionType: telemetryprojection.MissingField[string](),
			SourceTime: telemetryprojection.MissingField[float64](), EndTime: telemetryprojection.MissingField[session.EndTime](),
			Remaining: telemetryprojection.MissingField[session.RemainingTime](), MaximumLaps: telemetryprojection.MissingField[session.MaximumLaps](),
			Player: strategyprojection.PlayerV1{
				LapNumber: telemetryprojection.MissingField[session.LapNumber](), CompletedLaps: telemetryprojection.MissingField[standings.CompletedLaps](),
				Sector: telemetryprojection.MissingField[standings.Sector](), LapDistance: telemetryprojection.MissingField[standings.LapDistance](),
				InPit: telemetryprojection.MissingField[pit.InPit](), PitStopCount: telemetryprojection.MissingField[pit.StopCount](),
				FuelLiters: telemetryprojection.MissingField[energy.FuelAmount](), FuelCapacity: telemetryprojection.MissingField[energy.FuelCapacity](),
			},
		},
	}
}

func projectedField[T comparable](value T, freshness telemetryprojection.Freshness) telemetryprojection.Field[T] {
	return telemetryprojection.Field[T]{Present: true, Value: value, Provenance: telemetryprojection.ProvenanceObserved, Freshness: freshness}
}

func canonicalField[T comparable](t testing.TB, value T, provenance schema.Provenance, freshness schema.Freshness) schema.Field[T] {
	t.Helper()
	field, err := schema.NewField(value, provenance, freshness)
	if err != nil {
		t.Fatal(err)
	}
	return field
}

func TestSnapshotSupportsConcurrentOwnedReads(t *testing.T) {
	engine := newLiveEngine(t)
	snapshot := emptyProjection(1, 1)
	snapshot.Player.CompletedLaps = projectedField(standings.CompletedLaps(1), telemetryprojection.FreshnessFresh)
	snapshot.Capabilities = []strategyprojection.Capability{strategyprojection.CapabilityProgress}
	if err := engine.ApplySnapshot(snapshot); err != nil {
		t.Fatal(err)
	}

	const readers = 32
	var wg sync.WaitGroup
	wg.Add(readers)
	for range readers {
		go func() {
			defer wg.Done()
			model := engine.Snapshot()
			model.ActivePlan.PreviousRevision = &contract.RevisionRef{RevisionID: "mutated"}
		}()
	}
	wg.Wait()
	if engine.Snapshot().ActivePlan.PreviousRevision != nil {
		t.Fatal("reader mutation reached engine state")
	}
}

func TestSnapshotOwnsNonNilPreviousRevision(t *testing.T) {
	active := validActivePlan(t)
	previous := active.Revision
	previous.RevisionID = "revision-previous"
	previous.ContentHash = strings.Repeat("b", 64)
	active.PreviousRevision = &previous
	plan, err := NewPlan(PlanInput{ActivePlan: active, Stints: []Stint{{ID: "race", Laps: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	engine, err := NewEngine(plan)
	if err != nil {
		t.Fatal(err)
	}

	first := engine.Snapshot()
	if first.ActivePlan.PreviousRevision == nil {
		t.Fatal("snapshot lost previous revision")
	}
	first.ActivePlan.PreviousRevision.RevisionID = "mutated-by-reader"
	second := engine.Snapshot()
	if second.ActivePlan.PreviousRevision == nil || second.ActivePlan.PreviousRevision.RevisionID != "revision-previous" {
		t.Fatalf("reader mutation reached engine state: %+v", second.ActivePlan.PreviousRevision)
	}
}

func TestSnapshotIsSafeDuringConcurrentProjectionWrites(t *testing.T) {
	engine := newLiveEngine(t)
	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(9)
	go func() {
		defer wg.Done()
		<-start
		for sequence := 1; sequence <= 100; sequence++ {
			if err := engine.ApplySnapshot(progressProjection(1, schema.Sequence(sequence), standings.CompletedLaps(sequence%4))); err != nil {
				t.Errorf("write %d: %v", sequence, err)
				return
			}
		}
	}()
	for range 8 {
		go func() {
			defer wg.Done()
			<-start
			for range 100 {
				_ = engine.Snapshot()
			}
		}()
	}
	close(start)
	wg.Wait()
	if got := engine.Snapshot().Cursor; got != (Cursor{Epoch: 1, Sequence: 100}) {
		t.Fatalf("final cursor = %+v", got)
	}
}
