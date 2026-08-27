package v1

import (
	"fmt"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/damage"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func representativeSnapshot(t testing.TB) envelope.Snapshot[derive.FinalState] {
	t.Helper()
	header := fixtureHeader(7, 42, "remote-session-1", "vehicle-001")
	player := core.VehicleState{
		Identity:         identity.RunIdentity{Event: "remote-event-1", Session: "remote-session-1", Vehicle: "vehicle-001"},
		DriverName:       fixtureObserved(identity.DriverName("Isaac Driver"), schema.FreshnessFresh),
		Name:             fixtureObserved(vehicle.VehicleName("Vantare Hypercar"), schema.FreshnessFresh),
		VehicleClass:     fixtureObserved(standings.VehicleClass("HYPERCAR"), schema.FreshnessFresh),
		Player:           fixtureObserved(true, schema.FreshnessFresh),
		Sector:           fixtureObserved(standings.SectorTwo, schema.FreshnessFresh),
		LapDistance:      fixtureObserved(standings.LapDistance(4321.25), schema.FreshnessFresh),
		LapNumber:        fixtureObserved(session.LapNumber(18), schema.FreshnessFresh),
		Gear:             fixtureObserved(vehicle.Gear(4), schema.FreshnessFresh),
		EngineRPM:        fixtureObserved(vehicle.EngineRPM(7450.5), schema.FreshnessFresh),
		SpeedMPS:         fixtureObserved(72.25, schema.FreshnessFresh),
		Throttle:         fixtureObserved(schema.Ratio(0.87), schema.FreshnessFresh),
		Brake:            fixtureObserved(schema.Ratio(0), schema.FreshnessFresh),
		Clutch:           fixtureObserved(schema.Ratio(0), schema.FreshnessFresh),
		Position:         fixtureObserved(standings.Position(2), schema.FreshnessFresh),
		CompletedLaps:    fixtureObserved(standings.CompletedLaps(17), schema.FreshnessFresh),
		InPit:            fixtureObserved(pit.InPit(false), schema.FreshnessFresh),
		PitStopCount:     fixtureObserved(pit.StopCount(1), schema.FreshnessFresh),
		PenaltyCount:     fixtureObserved(standings.PenaltyCount(0), schema.FreshnessFresh),
		TimeBehindLeader: fixtureObserved(standings.TimeGap(2.75), schema.FreshnessFresh),
		LapsBehindLeader: fixtureObserved(standings.LapGap(0), schema.FreshnessFresh),
		TimeBehindNext:   fixtureObserved(standings.TimeGap(1.1), schema.FreshnessFresh),
		LapsBehindNext:   fixtureObserved(standings.LapGap(0), schema.FreshnessFresh),
		Fuel:             fixtureObserved(energy.Fuel{Amount: 42.5, Capacity: 100}, schema.FreshnessFresh),
		WorldPosition:    fixtureObserved(spatial.Position{X: 123.456, Y: 5, Z: -78.901}, schema.FreshnessFresh),
		Damage: fixtureObserved(damage.State{
			Dents:              [8]damage.Severity{0, 1, 0, 2, 0, 0, 1, 0},
			WheelDetachedCount: 0,
		}, schema.FreshnessFresh),
	}
	rival := core.VehicleState{
		Identity:         identity.RunIdentity{Event: "remote-event-1", Session: "remote-session-1", Vehicle: "vehicle-002"},
		DriverName:       fixtureObserved(identity.DriverName("Rival Driver"), schema.FreshnessFresh),
		Name:             fixtureObserved(vehicle.VehicleName("Rival Hypercar"), schema.FreshnessFresh),
		VehicleClass:     fixtureObserved(standings.VehicleClass("HYPERCAR"), schema.FreshnessFresh),
		Player:           fixtureObserved(false, schema.FreshnessFresh),
		Sector:           fixtureObserved(standings.SectorThree, schema.FreshnessFresh),
		LapDistance:      fixtureObserved(standings.LapDistance(4290.5), schema.FreshnessStale),
		LapNumber:        fixtureObserved(session.LapNumber(18), schema.FreshnessFresh),
		Position:         fixtureObserved(standings.Position(3), schema.FreshnessFresh),
		CompletedLaps:    fixtureObserved(standings.CompletedLaps(17), schema.FreshnessFresh),
		InPit:            fixtureObserved(pit.InPit(false), schema.FreshnessFresh),
		PenaltyCount:     fixtureObserved(standings.PenaltyCount(1), schema.FreshnessFresh),
		TimeBehindLeader: fixtureObserved(standings.TimeGap(4.5), schema.FreshnessFresh),
		LapsBehindLeader: fixtureObserved(standings.LapGap(0), schema.FreshnessFresh),
		TimeBehindNext:   fixtureObserved(standings.TimeGap(1.75), schema.FreshnessFresh),
		LapsBehindNext:   fixtureObserved(standings.LapGap(0), schema.FreshnessFresh),
		WorldPosition:    fixtureObserved(spatial.Position{X: 120, Y: 5, Z: -75}, schema.FreshnessFresh),
	}
	final := derive.FinalState{
		Observed: core.ObservedState{
			TrackName:     fixtureObserved("Circuit de la Sarthe", schema.FreshnessFresh),
			SessionType:   fixtureObserved(session.TypeEndurance, schema.FreshnessFresh),
			MaximumLaps:   fixtureObserved(session.MaximumLaps(24), schema.FreshnessFresh),
			VehicleCount:  fixtureObserved(schema.Count(2), schema.FreshnessFresh),
			PlayerPresent: fixtureObserved(true, schema.FreshnessFresh),
			Vehicles:      []core.VehicleState{player, rival},
		},
		Derived: derive.DerivedState{
			SessionRemaining: fixtureDerived(session.RemainingTime(1834.5), schema.FreshnessFresh),
			Gaps: derive.GapSet{Freshness: schema.FreshnessFresh, Vehicles: []derive.VehicleGap{
				{Vehicle: "vehicle-001", Time: fixtureDerived(standings.RelativeTime(0), schema.FreshnessFresh), Laps: fixtureDerived(standings.RelativeLaps(0), schema.FreshnessFresh)},
				{Vehicle: "vehicle-002", Time: fixtureDerived(standings.RelativeTime(-1.75), schema.FreshnessFresh), Laps: fixtureDerived(standings.RelativeLaps(0), schema.FreshnessFresh)},
			}},
			Delta: derive.SelfDelta{
				Freshness: schema.FreshnessFresh,
				Seconds:   fixtureDerived(session.DeltaSeconds(-0.245), schema.FreshnessFresh),
				Reference: fixtureDerived(session.DeltaReferenceBestCompletedPlayerLap, schema.FreshnessFresh),
			},
			Fuel: derive.FuelUsage{
				Freshness: schema.FreshnessFresh,
				PerLap:    fixtureDerived(energy.FuelAmount(3.25), schema.FreshnessFresh),
			},
		},
	}
	return fixtureSnapshot(t, header, final)
}

func minimalSnapshot(t testing.TB) envelope.Snapshot[derive.FinalState] {
	t.Helper()
	final := derive.FinalState{Observed: core.ObservedState{Vehicles: []core.VehicleState{}}}
	return fixtureSnapshot(t, fixtureHeader(1, 1, "remote-session-minimal", ""), final)
}

func sizedSnapshot(t testing.TB, count int) envelope.Snapshot[derive.FinalState] {
	t.Helper()
	header := fixtureHeader(3, 99, "remote-session-size", "vehicle-000")
	vehicles := make([]core.VehicleState, count)
	gaps := make([]derive.VehicleGap, count)
	for index := range vehicles {
		id := identity.VehicleID(fmt.Sprintf("vehicle-%03d", index))
		vehicles[index] = core.VehicleState{
			Identity:         identity.RunIdentity{Event: "remote-event-size", Session: "remote-session-size", Vehicle: id},
			DriverName:       fixtureObserved(identity.DriverName(fmt.Sprintf("Driver %03d", index)), schema.FreshnessFresh),
			Name:             fixtureObserved(vehicle.VehicleName(fmt.Sprintf("Vantare Hypercar %03d", index)), schema.FreshnessFresh),
			VehicleClass:     fixtureObserved(standings.VehicleClass("HYPERCAR"), schema.FreshnessFresh),
			Player:           fixtureObserved(index == 0, schema.FreshnessFresh),
			Sector:           fixtureObserved(standings.Sector(index%3+1), schema.FreshnessFresh),
			LapDistance:      fixtureObserved(standings.LapDistance(index*137)+0.125, schema.FreshnessFresh),
			LapNumber:        fixtureObserved(session.LapNumber(12+index%3), schema.FreshnessFresh),
			Position:         fixtureObserved(standings.Position(index+1), schema.FreshnessFresh),
			CompletedLaps:    fixtureObserved(standings.CompletedLaps(11+index%3), schema.FreshnessFresh),
			InPit:            fixtureObserved(pit.InPit(index%17 == 0), schema.FreshnessFresh),
			PitStopCount:     fixtureObserved(pit.StopCount(index%4), schema.FreshnessFresh),
			PenaltyCount:     fixtureObserved(standings.PenaltyCount(index%2), schema.FreshnessFresh),
			TimeBehindLeader: fixtureObserved(standings.TimeGap(float64(index)*1.7392), schema.FreshnessFresh),
			LapsBehindLeader: fixtureObserved(standings.LapGap(index/30), schema.FreshnessFresh),
			TimeBehindNext:   fixtureObserved(standings.TimeGap(1.2731), schema.FreshnessFresh),
			LapsBehindNext:   fixtureObserved(standings.LapGap(0), schema.FreshnessFresh),
			WorldPosition:    fixtureObserved(spatial.Position{X: float64(index) * 3, Y: 12.5, Z: float64(index) * -2}, schema.FreshnessFresh),
		}
		gaps[index] = derive.VehicleGap{
			Vehicle: id,
			Time:    fixtureDerived(standings.RelativeTime(float64(index)*-1.7392), schema.FreshnessFresh),
			Laps:    fixtureDerived(standings.RelativeLaps(-index/30), schema.FreshnessFresh),
		}
	}
	if count > 0 {
		vehicles[0].Gear = fixtureObserved(vehicle.Gear(4), schema.FreshnessFresh)
		vehicles[0].EngineRPM = fixtureObserved(vehicle.EngineRPM(7250), schema.FreshnessFresh)
		vehicles[0].SpeedMPS = fixtureObserved(62.5, schema.FreshnessFresh)
		vehicles[0].Throttle = fixtureObserved(schema.Ratio(0.87), schema.FreshnessFresh)
		vehicles[0].Brake = fixtureObserved(schema.Ratio(0), schema.FreshnessFresh)
		vehicles[0].Clutch = fixtureObserved(schema.Ratio(0), schema.FreshnessFresh)
		vehicles[0].Fuel = fixtureObserved(energy.Fuel{Amount: 44.5, Capacity: 105}, schema.FreshnessFresh)
		vehicles[0].Damage = fixtureObserved(damage.State{}, schema.FreshnessFresh)
	}
	final := derive.FinalState{
		Observed: core.ObservedState{
			TrackName:     fixtureObserved("Circuit de la Sarthe", schema.FreshnessFresh),
			SessionType:   fixtureObserved(session.TypeEndurance, schema.FreshnessFresh),
			MaximumLaps:   fixtureObserved(session.MaximumLaps(0), schema.FreshnessFresh),
			VehicleCount:  fixtureObserved(schema.Count(count), schema.FreshnessFresh),
			PlayerPresent: fixtureObserved(count > 0, schema.FreshnessFresh),
			Vehicles:      vehicles,
		},
		Derived: derive.DerivedState{
			SessionRemaining: fixtureDerived(session.RemainingTime(7200), schema.FreshnessFresh),
			Gaps:             derive.GapSet{Freshness: schema.FreshnessFresh, Vehicles: gaps},
			Delta: derive.SelfDelta{Freshness: schema.FreshnessFresh,
				Seconds:   fixtureDerived(session.DeltaSeconds(-0.312), schema.FreshnessFresh),
				Reference: fixtureDerived(session.DeltaReferenceBestCompletedPlayerLap, schema.FreshnessFresh)},
			Fuel: derive.FuelUsage{Freshness: schema.FreshnessFresh,
				PerLap: fixtureDerived(energy.FuelAmount(3.4), schema.FreshnessFresh)},
		},
	}
	return fixtureSnapshot(t, header, final)
}

func fixtureHeader(epoch, sequence uint64, sessionID, playerID string) envelope.Header {
	return envelope.Header{
		Source: "isa-876-fixture",
		Cursor: schema.Cursor{Epoch: schema.Epoch(epoch), Sequence: schema.Sequence(sequence)},
		Clock: schema.NewClock(
			schema.MissingField[time.Duration](),
			schema.MissingField[time.Duration](),
			time.Date(2026, 8, 27, 2, 3, 4, 567_000_000, time.UTC),
		),
		Identity: identity.RunIdentity{Event: "remote-event-1", Session: identity.SessionID(sessionID), Vehicle: identity.VehicleID(playerID)},
	}
}

func fixtureSnapshot(t testing.TB, header envelope.Header, final derive.FinalState) envelope.Snapshot[derive.FinalState] {
	t.Helper()
	snapshot, err := envelope.NewSnapshot(header, final, cloneFixtureFinal)
	if err != nil {
		t.Fatalf("create fixture snapshot: %v", err)
	}
	return snapshot
}

func cloneFixtureFinal(value derive.FinalState) derive.FinalState {
	value.Observed.Vehicles = append([]core.VehicleState(nil), value.Observed.Vehicles...)
	value.Derived.Gaps.Vehicles = append([]derive.VehicleGap(nil), value.Derived.Gaps.Vehicles...)
	return value
}

func fixtureObserved[T comparable](value T, freshness schema.Freshness) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, freshness)
	if err != nil {
		panic(err)
	}
	return field
}

func fixtureDerived[T comparable](value T, freshness schema.Freshness) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceDerived, freshness)
	if err != nil {
		panic(err)
	}
	return field
}

func mustProject(t testing.TB, snapshot envelope.Snapshot[derive.FinalState]) RemoteCanonicalUpdateV1 {
	t.Helper()
	update, err := Project(snapshot)
	if err != nil {
		t.Fatalf("Project() error = %v", err)
	}
	return update
}
