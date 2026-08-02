package engineer

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
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

func TestProjectObservationV1CarriesFullGridFuelGapsAndGeometry(t *testing.T) {
	t.Parallel()

	input := fullGridInput(t)
	manifest := mustManifest(t,
		Capability{ID: CapabilitySession, State: CapabilitySupported},
		Capability{ID: CapabilityStandings, State: CapabilitySupported},
		Capability{ID: CapabilityControls, State: CapabilitySupported},
		Capability{ID: CapabilityPit, State: CapabilitySupported},
		Capability{ID: CapabilityFuel, State: CapabilitySupported},
		Capability{ID: CapabilityGaps, State: CapabilitySupported},
		Capability{ID: CapabilitySpatial, State: CapabilitySupported},
	)

	projected, err := ProjectV1(input)
	if err != nil {
		t.Fatal(err)
	}
	wantGroups := []CapabilityGroup{GroupSession, GroupStandings, GroupControls, GroupPit, GroupFuel, GroupGaps, GroupSpatial}
	if !slices.Equal(projected.Capabilities, wantGroups) {
		t.Fatalf("capabilities = %v, want %v", projected.Capabilities, wantGroups)
	}

	got, err := ProjectObservationV1(input, manifest)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Vehicles) != 2 || got.Player.ID != "car-4" || got.Vehicles[1].ID != "car-9" {
		t.Fatalf("grid identity = player:%q vehicles:%+v", got.Player.ID, got.Vehicles)
	}
	assertFieldValue(t, got.Remaining, 1800.0)
	assertFieldValue(t, got.Player.FuelLiters, 41.5)
	assertFieldValue(t, got.Player.FuelCapacity, 100.0)
	assertFieldValue(t, got.Vehicles[1].RelativeTimeGap, 1.75)
	assertFieldValue(t, got.Player.Throttle, 0.0)
	assertFieldValue(t, got.Player.WorldPosition, Vector3{X: 101.25, Y: 4.5, Z: -30.75})
	assertFieldValue(t, got.Player.LocalVelocity, Vector3{X: -2.5, Y: 0.25, Z: -66.0})
	wantOrientation := Orientation{
		Row0: Vector3{X: 1, Y: 0, Z: 0},
		Row1: Vector3{X: 0, Y: 1, Z: 0},
		Row2: Vector3{X: 0, Y: 0, Z: 1},
	}
	assertFieldValue(t, got.Player.Orientation, wantOrientation)
}

func TestProjectObservationV1RejectsUnsupportedSpatialData(t *testing.T) {
	t.Parallel()

	manifest := mustManifest(t,
		Capability{ID: CapabilitySession, State: CapabilitySupported},
		Capability{ID: CapabilityStandings, State: CapabilitySupported},
		Capability{ID: CapabilityControls, State: CapabilitySupported},
		Capability{ID: CapabilityPit, State: CapabilitySupported},
		Capability{ID: CapabilityFuel, State: CapabilitySupported},
		Capability{ID: CapabilityGaps, State: CapabilitySupported},
		Capability{ID: CapabilitySpatial, State: CapabilityUnsupported},
	)
	_, err := ProjectObservationV1(fullGridInput(t), manifest)
	if !errors.Is(err, ErrProjectionCapabilityConflict) {
		t.Fatalf("ProjectObservationV1() error = %v, want capability conflict", err)
	}
}

func TestProjectorV1OwnsVehicleSlice(t *testing.T) {
	t.Parallel()

	projected, err := (ProjectorV1{}).Project(fullGridInput(t))
	if err != nil {
		t.Fatal(err)
	}
	first, ok := projected.Value()
	if !ok {
		t.Fatal("first payload unavailable")
	}
	first.Vehicles[0].ID = "mutated"
	first.Capabilities[0] = GroupSpatial
	second, ok := projected.Value()
	if !ok {
		t.Fatal("second payload unavailable")
	}
	if second.Vehicles[0].ID != "car-4" || second.Capabilities[0] != GroupSession {
		t.Fatalf("snapshot aliases caller mutations: vehicle=%q capabilities=%v", second.Vehicles[0].ID, second.Capabilities)
	}
}

func TestCapabilitiesKeepCanonicalOrderAcrossSparseVehicles(t *testing.T) {
	t.Parallel()

	payload := PayloadV1{Vehicles: []PlayerV1{
		{WorldPosition: projectionFresh(spatial.Position{X: 1})},
		{LapNumber: projectionFresh(session.LapNumber(1))},
	}}
	want := []CapabilityGroup{GroupStandings, GroupSpatial}
	if got := capabilities(payload); !slices.Equal(got, want) {
		t.Fatalf("capabilities = %v, want stable order %v", got, want)
	}
}

func assertFieldValue[T comparable](t *testing.T, field Field[T], want T) {
	t.Helper()
	got, present := field.Value()
	if !present || got != want || field.State() != ValueFresh || !field.Usable() {
		t.Fatalf("field = value:%v present:%t state:%v usable:%t, want fresh %v", got, present, field.State(), field.Usable(), want)
	}
}

func fullGridInput(t *testing.T) envelope.Snapshot[derive.FinalState] {
	t.Helper()
	fresh := schema.FreshnessFresh
	observed := schema.ProvenanceObserved

	header := engineerHeader()
	player := core.VehicleState{
		Identity:         header.Identity,
		DriverName:       mustField(t, identity.DriverName("Driver One"), observed, fresh),
		Name:             mustField(t, vehicle.VehicleName("Vantare Hypercar"), observed, fresh),
		VehicleClass:     mustField(t, standings.VehicleClass("HYPERCAR"), observed, fresh),
		Player:           mustField(t, true, observed, fresh),
		Sector:           mustField(t, standings.SectorTwo, observed, fresh),
		LapDistance:      mustField(t, standings.LapDistance(4321.5), observed, fresh),
		BestLapTime:      mustField(t, standings.LapTime(210.25), observed, fresh),
		LastLapTime:      mustField(t, standings.LapTime(211.5), observed, fresh),
		EstimatedLapTime: mustField(t, standings.LapTime(210.75), observed, fresh),
		LapNumber:        mustField(t, session.LapNumber(8), observed, fresh),
		Gear:             mustField(t, vehicle.Gear(4), observed, fresh),
		EngineRPM:        mustField(t, vehicle.EngineRPM(7200), observed, fresh),
		SpeedMPS:         mustField(t, 66.0, observed, fresh),
		Throttle:         mustField(t, schema.Ratio(0), observed, fresh),
		Brake:            mustField(t, schema.Ratio(0.35), observed, fresh),
		Clutch:           mustField(t, schema.Ratio(0), observed, fresh),
		Position:         mustField(t, standings.Position(2), observed, fresh),
		CompletedLaps:    mustField(t, standings.CompletedLaps(7), observed, fresh),
		InPit:            mustField(t, pit.InPit(false), observed, fresh),
		PitStopCount:     mustField(t, pit.StopCount(1), observed, fresh),
		PenaltyCount:     mustField(t, standings.PenaltyCount(0), observed, fresh),
		TimeBehindLeader: mustField(t, standings.TimeGap(3.5), observed, fresh),
		LapsBehindLeader: mustField(t, standings.LapGap(0), observed, fresh),
		TimeBehindNext:   mustField(t, standings.TimeGap(1.75), observed, fresh),
		LapsBehindNext:   mustField(t, standings.LapGap(0), observed, fresh),
		Fuel:             mustField(t, energy.Fuel{Amount: 41.5, Capacity: 100}, observed, fresh),
		WorldPosition:    mustField(t, spatial.Position{X: 101.25, Y: 4.5, Z: -30.75}, observed, fresh),
		LocalVelocity:    mustField(t, spatial.LocalVelocity{X: -2.5, Y: 0.25, Z: -66}, observed, fresh),
		Orientation: mustField(t, spatial.Orientation{
			Row0: spatial.Vector3{X: 1}, Row1: spatial.Vector3{Y: 1}, Row2: spatial.Vector3{Z: 1},
		}, observed, fresh),
	}
	rival := player
	rival.Identity.Vehicle = "car-9"
	rival.DriverName = mustField(t, identity.DriverName("Driver Two"), observed, fresh)
	rival.Player = mustField(t, false, observed, fresh)
	rival.Position = mustField(t, standings.Position(1), observed, fresh)
	rival.WorldPosition = mustField(t, spatial.Position{X: 104, Y: 4.5, Z: -28}, observed, fresh)

	state := core.ObservedState{
		SourceTime:    mustField(t, 1800*time.Second, observed, fresh),
		EndTime:       mustField(t, session.EndTime(3600), observed, fresh),
		MaximumLaps:   mustField(t, session.MaximumLaps(0), observed, fresh),
		TrackName:     mustField(t, "Le Mans", observed, fresh),
		SessionType:   mustField(t, session.TypeEndurance, observed, fresh),
		VehicleCount:  mustField(t, schema.Count(2), observed, fresh),
		PlayerPresent: mustField(t, true, observed, fresh),
		Vehicles:      []core.VehicleState{player, rival},
	}
	final := derive.FinalState{
		Observed: state,
		Derived: derive.DerivedState{
			SessionRemaining: mustField(t, session.RemainingTime(1800), schema.ProvenanceDerived, fresh),
			Gaps: derive.GapSet{Freshness: fresh, Vehicles: []derive.VehicleGap{
				{Vehicle: "car-4", Time: mustField(t, standings.RelativeTime(0), schema.ProvenanceDerived, fresh), Laps: mustField(t, standings.RelativeLaps(0), schema.ProvenanceDerived, fresh)},
				{Vehicle: "car-9", Time: mustField(t, standings.RelativeTime(1.75), schema.ProvenanceDerived, fresh), Laps: mustField(t, standings.RelativeLaps(0), schema.ProvenanceDerived, fresh)},
			}},
		},
	}
	result, err := envelope.NewSnapshot(header, final, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = slices.Clone(value.Observed.Vehicles)
		value.Derived.Gaps.Vehicles = slices.Clone(value.Derived.Gaps.Vehicles)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func mustField[T comparable](t *testing.T, value T, provenance schema.Provenance, freshness schema.Freshness) schema.Field[T] {
	t.Helper()
	result, err := schema.NewField(value, provenance, freshness)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func projectionFresh[T comparable](value T) projection.Field[T] {
	return projection.Field[T]{
		Present: true, Value: value,
		Provenance: projection.ProvenanceObserved,
		Freshness:  projection.FreshnessFresh,
	}
}
