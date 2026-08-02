package projectioninput

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/fuel"
	"github.com/vantare/overlays/v2/internal/engineer/laps"
	"github.com/vantare/overlays/v2/internal/engineer/penalties"
	"github.com/vantare/overlays/v2/internal/engineer/pitstops"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/timings"
	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestMonitorContractsCoverEveryRuntimeFamilyWithoutPretendingUnsupportedSignals(t *testing.T) {
	t.Parallel()

	contracts := MonitorContracts()
	if len(contracts) != 21 {
		t.Fatalf("contracts = %d, want spotter plus 20 monitors", len(contracts))
	}
	seen := make(map[MonitorFamily]bool, len(contracts))
	for _, contract := range contracts {
		if seen[contract.Family] {
			t.Fatalf("duplicate family %q", contract.Family)
		}
		seen[contract.Family] = true
		if contract.State == ParityApproved && contract.Scenario == "" {
			t.Fatalf("approved family %q has no bounded replay scenario", contract.Family)
		}
		if contract.State != ParityApproved && contract.Limitation == "" {
			t.Fatalf("non-approved family %q has no explicit limitation", contract.Family)
		}
	}
	for _, disabled := range []MonitorFamily{FamilyEngine, FamilyTyre, FamilyFlags, FamilyDriverSwaps, FamilyDamage, FamilyConditions} {
		contract, ok := contractFor(disabled)
		if !ok || contract.State != ParityDisabled {
			t.Fatalf("family %q = %+v, want explicitly disabled", disabled, contract)
		}
	}
}

func TestGateRejectsPartialDisabledAndMissingFreshSignals(t *testing.T) {
	t.Parallel()

	snapshot := parityObservation(t, parityValues{})
	for _, family := range []MonitorFamily{FamilyOpponents, FamilyFlags, FamilyTyre, FamilyDamage, FamilyDriverSwaps} {
		result, err := Evaluate(snapshot, family)
		if !errors.Is(err, ErrParityNotApproved) || result.Ready || len(result.Missing) != 1 {
			t.Fatalf("Evaluate(%q) = %+v, %v", family, result, err)
		}
	}

	missingFuel := parityObservation(t, parityValues{missingFuel: true})
	result, err := Evaluate(missingFuel, FamilyFuel)
	if err != nil || result.Ready || !slices.Contains(result.Missing, "player.fuel_litres") {
		t.Fatalf("missing fuel gate = %+v, %v", result, err)
	}
	if _, err := NewAdapter().FrameFor(FamilyFuel, missingFuel); !errors.Is(err, ErrObservationNotReady) {
		t.Fatalf("FrameFor(missing fuel) error = %v", err)
	}
}

func TestReplayBridgePreservesSpotterGeometryAndStableIdentity(t *testing.T) {
	t.Parallel()

	adapter := NewAdapter()
	left := parityObservation(t, parityValues{epoch: 1, rivalX: 2.8})
	frame, err := adapter.FrameFor(FamilySpotter, left)
	if err != nil {
		t.Fatal(err)
	}
	zones := spotter.Classify(frame, spotter.SensitivityNormal)
	if len(zones) != 1 || zones[0].Side != spotter.SideLeft {
		t.Fatalf("zones = %+v, want one left opponent", zones)
	}
	firstOpponentID := zones[0].VehicleID

	right := parityObservation(t, parityValues{epoch: 1, rivalX: -2.8})
	frame, err = adapter.FrameFor(FamilySpotter, right)
	if err != nil {
		t.Fatal(err)
	}
	zones = spotter.Classify(frame, spotter.SensitivityNormal)
	if len(zones) != 1 || zones[0].Side != spotter.SideRight || zones[0].VehicleID != firstOpponentID {
		t.Fatalf("same-epoch zones = %+v, want stable rival id %d on right", zones, firstOpponentID)
	}

	newEpoch := parityObservation(t, parityValues{epoch: 2, rivalX: 2.8})
	frame, err = adapter.FrameFor(FamilySpotter, newEpoch)
	if err != nil {
		t.Fatal(err)
	}
	if len(frame.Vehicles) != 2 || frame.Vehicles[0].ID != 1 || frame.Vehicles[1].ID != 2 {
		t.Fatalf("new epoch did not reset replay-local IDs: %+v", frame.Vehicles)
	}
}

func TestReplayBridgePreservesSpotterCooldownAndClearStateMachine(t *testing.T) {
	t.Parallel()

	adapter := NewAdapter()
	machine := spotter.NewMachine()
	left, err := adapter.FrameFor(FamilySpotter, parityObservation(t, parityValues{rivalX: 2.8}))
	if err != nil {
		t.Fatal(err)
	}
	far, err := adapter.FrameFor(FamilySpotter, parityObservation(t, parityValues{rivalX: 25}))
	if err != nil {
		t.Fatal(err)
	}

	events := machine.Process(1_000, spotter.Classify(left, spotter.SensitivityNormal))
	if len(events) != 1 || events[0].Type != spotter.EventCarLeft {
		t.Fatalf("initial events = %+v", events)
	}
	if events = machine.Process(1_500, spotter.Classify(left, spotter.SensitivityNormal)); len(events) != 0 {
		t.Fatalf("cooldown emitted spam: %+v", events)
	}
	if events = machine.Process(4_000, spotter.Classify(left, spotter.SensitivityNormal)); len(events) != 1 || events[0].Type != spotter.EventStillThere {
		t.Fatalf("repeat boundary events = %+v", events)
	}
	if events = machine.Process(4_351, spotter.Classify(far, spotter.SensitivityNormal)); len(events) != 0 {
		t.Fatalf("clear debounce emitted early: %+v", events)
	}
	if events = machine.Process(4_501, spotter.Classify(far, spotter.SensitivityNormal)); len(events) != 1 || events[0].Type != spotter.EventClearLeft {
		t.Fatalf("clear events = %+v", events)
	}
}

func TestReplayBridgePreservesApprovedFuelAndPenaltyTransitions(t *testing.T) {
	t.Parallel()

	t.Run("fuel", func(t *testing.T) {
		adapter := NewAdapter()
		monitor := fuel.NewMonitor()
		before, err := adapter.FrameFor(FamilyFuel, parityObservation(t, parityValues{fuel: 55, lap: 3}))
		if err != nil {
			t.Fatal(err)
		}
		after, err := adapter.FrameFor(FamilyFuel, parityObservation(t, parityValues{fuel: 49, lap: 4}))
		if err != nil {
			t.Fatal(err)
		}
		monitor.Trigger(1_000, nil, before)
		events := monitor.Trigger(40_000, before, after)
		foundHalf := false
		for _, event := range events {
			if event.Type == fuel.EventLowFuelHalfTank {
				foundHalf = true
			}
		}
		if !foundHalf {
			t.Fatalf("fuel events = %+v, want half-tank transition", events)
		}
	})

	t.Run("penalty", func(t *testing.T) {
		adapter := NewAdapter()
		monitor := penalties.NewMonitor()
		before, err := adapter.FrameFor(FamilyPenalties, parityObservation(t, parityValues{penalties: 0}))
		if err != nil {
			t.Fatal(err)
		}
		after, err := adapter.FrameFor(FamilyPenalties, parityObservation(t, parityValues{penalties: 1}))
		if err != nil {
			t.Fatal(err)
		}
		events := monitor.Trigger(40_000, before, after)
		if len(events) != 1 || events[0].Type != penalties.EventNewDriveThrough {
			t.Fatalf("penalty events = %+v", events)
		}
	})
}

func TestReplayBridgePreservesApprovedLapPitAndTimingEvents(t *testing.T) {
	t.Parallel()

	t.Run("lap", func(t *testing.T) {
		adapter := NewAdapter()
		monitor := laps.NewMonitor()
		before, err := adapter.FrameFor(FamilyLaps, parityObservation(t, parityValues{lap: 3, sourceSeconds: 300}))
		if err != nil {
			t.Fatal(err)
		}
		after, err := adapter.FrameFor(FamilyLaps, parityObservation(t, parityValues{lap: 4, sourceSeconds: 511}))
		if err != nil {
			t.Fatal(err)
		}
		events := monitor.Trigger(1_000, before, after)
		if len(events) == 0 || events[0].Type != laps.EventLapCompleted {
			t.Fatalf("lap events = %+v", events)
		}
	})

	t.Run("pit", func(t *testing.T) {
		adapter := NewAdapter()
		monitor := pitstops.NewMonitor()
		before, err := adapter.FrameFor(FamilyPitStops, parityObservation(t, parityValues{inPit: false}))
		if err != nil {
			t.Fatal(err)
		}
		after, err := adapter.FrameFor(FamilyPitStops, parityObservation(t, parityValues{inPit: true}))
		if err != nil {
			t.Fatal(err)
		}
		events := monitor.Trigger(1_000, before, after)
		found := false
		for _, event := range events {
			if event.Type == pitstops.EventPitEntry {
				found = true
			}
		}
		if !found {
			t.Fatalf("pit events = %+v", events)
		}
		exitEvents := pitstops.NewMonitor().Trigger(2_000, after, before)
		found = false
		for _, event := range exitEvents {
			if event.Type == pitstops.EventPitExit {
				found = true
			}
		}
		if !found {
			t.Fatalf("pit exit events = %+v", exitEvents)
		}
	})

	t.Run("timings", func(t *testing.T) {
		adapter := NewAdapter()
		monitor := timings.NewMonitor()
		before, err := adapter.FrameFor(FamilyTimings, parityObservation(t, parityValues{gapLeader: 10, gapNext: 2}))
		if err != nil {
			t.Fatal(err)
		}
		after, err := adapter.FrameFor(FamilyTimings, parityObservation(t, parityValues{gapLeader: 11, gapNext: 2.5}))
		if err != nil {
			t.Fatal(err)
		}
		if events := monitor.Trigger(1_000, nil, before); len(events) != 0 {
			t.Fatalf("timing init = %+v", events)
		}
		events := monitor.Trigger(61_000, before, after)
		if len(events) != 1 || events[0].Type != timings.EventGapReport {
			t.Fatalf("timing events = %+v", events)
		}
	})
}

type parityValues struct {
	epoch         uint64
	rivalX        float64
	fuel          float64
	lap           int
	penalties     int
	missingFuel   bool
	inPit         bool
	sourceSeconds float64
	gapLeader     float64
	gapNext       float64
}

func parityObservation(t *testing.T, values parityValues) engineer.ObservationSnapshotV1 {
	t.Helper()
	if values.epoch == 0 {
		values.epoch = 1
	}
	if values.rivalX == 0 {
		values.rivalX = 2.8
	}
	if values.fuel == 0 && !values.missingFuel {
		values.fuel = 55
	}
	if values.lap == 0 {
		values.lap = 3
	}
	if values.sourceSeconds == 0 {
		values.sourceSeconds = 120
	}
	if values.gapLeader == 0 {
		values.gapLeader = 1.5
	}
	if values.gapNext == 0 {
		values.gapNext = 1.5
	}

	observed, fresh := schema.ProvenanceObserved, schema.FreshnessFresh
	run := identity.RunIdentity{Event: "event", Session: "session", Vehicle: "player", Team: "team", Driver: "driver"}
	header := envelope.Header{
		Source:   "parity-fixture",
		Cursor:   schema.Cursor{Epoch: schema.Epoch(values.epoch), Sequence: 1},
		Clock:    schema.NewClock(field(t, time.Duration(values.sourceSeconds*float64(time.Second))), field(t, time.Duration(values.sourceSeconds*float64(time.Second))), time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)),
		Identity: run,
	}
	orientation := spatial.Orientation{Row0: spatial.Vector3{X: 1}, Row1: spatial.Vector3{Y: 1}, Row2: spatial.Vector3{Z: 1}}
	player := core.VehicleState{
		Identity:   run,
		DriverName: field(t, identity.DriverName("Player")), Name: field(t, vehicle.VehicleName("LMU")), VehicleClass: field(t, standings.VehicleClass("HYPERCAR")), Player: field(t, true),
		LapNumber: field(t, session.LapNumber(values.lap)), Gear: field(t, vehicle.Gear(4)), EngineRPM: field(t, vehicle.EngineRPM(7000)), SpeedMPS: field(t, 20.0),
		Throttle: field(t, schema.Ratio(0.7)), Brake: field(t, schema.Ratio(0)), Clutch: field(t, schema.Ratio(0)), Position: field(t, standings.Position(1)),
		CompletedLaps: field(t, standings.CompletedLaps(values.lap-1)), InPit: field(t, pit.InPit(values.inPit)), PitStopCount: field(t, pit.StopCount(0)), Sector: field(t, standings.SectorOne),
		LapDistance: field(t, standings.LapDistance(2000)), BestLapTime: field(t, standings.LapTime(210)), LastLapTime: field(t, standings.LapTime(211)), EstimatedLapTime: field(t, standings.LapTime(210.5)),
		PenaltyCount: field(t, standings.PenaltyCount(values.penalties)), TimeBehindLeader: field(t, standings.TimeGap(values.gapLeader)), LapsBehindLeader: field(t, standings.LapGap(0)),
		TimeBehindNext: field(t, standings.TimeGap(values.gapNext)), LapsBehindNext: field(t, standings.LapGap(0)),
		WorldPosition: field(t, spatial.Position{X: 100, Z: 100}), LocalVelocity: field(t, spatial.LocalVelocity{Z: 20}), Orientation: field(t, orientation),
	}
	if values.missingFuel {
		player.Fuel = schema.MissingField[energy.Fuel]()
	} else {
		player.Fuel = field(t, energy.Fuel{Amount: energy.FuelAmount(values.fuel), Capacity: 100})
	}
	rival := player
	rival.Identity.Vehicle = "rival"
	rival.DriverName = field(t, identity.DriverName("Rival"))
	rival.Player = field(t, false)
	rival.Position = field(t, standings.Position(2))
	rival.WorldPosition = field(t, spatial.Position{X: 100 + values.rivalX, Z: 100})
	rival.TimeBehindLeader = field(t, standings.TimeGap(1.5))
	rival.TimeBehindNext = field(t, standings.TimeGap(1.5))

	state := core.ObservedState{
		SourceTime: field(t, time.Duration(values.sourceSeconds*float64(time.Second))), EndTime: field(t, session.EndTime(3600)), MaximumLaps: field(t, session.MaximumLaps(20)),
		TrackName: field(t, "Le Mans"), SessionType: field(t, session.TypeEndurance), VehicleCount: field(t, schema.Count(2)), PlayerPresent: field(t, true),
		Vehicles: []core.VehicleState{player, rival},
	}
	final := derive.FinalState{Observed: state, Derived: derive.DerivedState{
		SessionRemaining: fieldWith(t, session.RemainingTime(3480), schema.ProvenanceDerived, fresh),
		Gaps: derive.GapSet{Freshness: fresh, Vehicles: []derive.VehicleGap{
			{Vehicle: "player", Time: fieldWith(t, standings.RelativeTime(0), schema.ProvenanceDerived, fresh), Laps: fieldWith(t, standings.RelativeLaps(0), schema.ProvenanceDerived, fresh)},
			{Vehicle: "rival", Time: fieldWith(t, standings.RelativeTime(1.5), schema.ProvenanceDerived, fresh), Laps: fieldWith(t, standings.RelativeLaps(0), schema.ProvenanceDerived, fresh)},
		}},
	}}
	snapshot, err := envelope.NewSnapshot(header, final, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = slices.Clone(value.Observed.Vehicles)
		value.Derived.Gaps.Vehicles = slices.Clone(value.Derived.Gaps.Vehicles)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := engineer.NewManifest([]engineer.Capability{
		{ID: engineer.CapabilitySession, State: engineer.CapabilitySupported}, {ID: engineer.CapabilityStandings, State: engineer.CapabilitySupported},
		{ID: engineer.CapabilityControls, State: engineer.CapabilitySupported}, {ID: engineer.CapabilityPit, State: engineer.CapabilitySupported},
		{ID: engineer.CapabilityFuel, State: engineer.CapabilitySupported}, {ID: engineer.CapabilityGaps, State: engineer.CapabilitySupported},
		{ID: engineer.CapabilitySpatial, State: engineer.CapabilitySupported},
	})
	if err != nil {
		t.Fatal(err)
	}
	result, err := engineer.ProjectObservationV1(snapshot, manifest)
	if err != nil {
		t.Fatal(err)
	}
	_ = observed
	return result
}

func field[T comparable](t *testing.T, value T) schema.Field[T] {
	t.Helper()
	return fieldWith(t, value, schema.ProvenanceObserved, schema.FreshnessFresh)
}

func fieldWith[T comparable](t *testing.T, value T, provenance schema.Provenance, freshness schema.Freshness) schema.Field[T] {
	t.Helper()
	result, err := schema.NewField(value, provenance, freshness)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
