//go:build researchbench

// Package bench contains research-only benchmarks for the 2026 telemetry
// architecture study. Every file carries the `researchbench` build tag so
// `go build ./...` and `go test ./...` never pick them up. Nothing here is
// product code and nothing here is imported by product code.
package bench

import (
	"fmt"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
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

// VehicleCounts are the grid sizes studied: solo hotlap, a typical
// club/GT field, and a full Le Mans Ultimate grid (LMU caps at 104 rows).
var VehicleCounts = []int{1, 20, 104}

// Rates are the publication cadences studied, in Hz.
var Rates = []int{10, 20, 30, 60}

const (
	benchEvent   identity.EventID   = "research-event"
	benchSession identity.SessionID = "research-session"
	benchStart                      = 0
)

var fixedClockOrigin = time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)

func present[T comparable](value T) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		panic(err)
	}
	return field
}

func vehicleID(index int) identity.VehicleID {
	return identity.VehicleID(fmt.Sprintf("veh-%03d", index))
}

// Header builds a canonical header for sequence `seq` (1-based) of epoch 1.
func Header(seq uint64) envelope.Header {
	source := present(time.Duration(seq) * (time.Second / 60))
	return envelope.Header{
		Source: "research-bench",
		Cursor: schema.Cursor{Epoch: 1, Sequence: schema.Sequence(seq)},
		Clock: schema.NewClock(
			source,
			source,
			fixedClockOrigin.Add(time.Duration(seq)*(time.Second/60)),
		),
		Identity: identity.RunIdentity{
			Event:   benchEvent,
			Session: benchSession,
			Vehicle: vehicleID(0),
			Team:    "research-team",
			Driver:  "research-driver",
		},
	}
}

// VehicleStateAt builds a fully populated vehicle row. Index 0 is the player
// row and carries the fast-telemetry fields that LMU only publishes for the
// scoring-selected player; other rows leave them missing, exactly like the
// real driver does.
func VehicleStateAt(index int, seq uint64) core.VehicleState {
	phase := float64(seq)*0.05 + float64(index)
	state := core.VehicleState{
		Identity: identity.RunIdentity{
			Event:   benchEvent,
			Session: benchSession,
			Vehicle: vehicleID(index),
			Team:    "research-team",
			Driver:  "research-driver",
		},
		DriverName:       present(identity.DriverName(fmt.Sprintf("Driver %03d", index))),
		Name:             present(vehicle.VehicleName(fmt.Sprintf("Vantare GT3 #%03d", index))),
		VehicleClass:     present(standings.VehicleClass("HYPERCAR")),
		Player:           present(index == 0),
		Sector:           present(standings.Sector(1 + (index+int(seq))%3)),
		LapDistance:      present(standings.LapDistance(float64((int(seq)*17+index*137)%13629) + 0.125)),
		BestLapTime:      present(standings.LapTime(203.4567 + float64(index)*0.137)),
		LastLapTime:      present(standings.LapTime(204.1234 + float64(index)*0.211)),
		EstimatedLapTime: present(standings.LapTime(203.9876 + float64(index)*0.173)),
		LapNumber:        present(session.LapNumber(12 + index%3)),
		Position:         present(standings.Position(index + 1)),
		CompletedLaps:    present(standings.CompletedLaps(11 + index%3)),
		InPit:            present(pit.InPit(index%17 == 0)),
		PitStopCount:     present(pit.StopCount(index % 4)),
		PenaltyCount:     present(standings.PenaltyCount(index % 2)),
		TimeBehindLeader: present(standings.TimeGap(float64(index)*1.7392 + phase*0.001)),
		LapsBehindLeader: present(standings.LapGap(index / 30)),
		TimeBehindNext:   present(standings.TimeGap(1.2731 + phase*0.0007)),
		LapsBehindNext:   present(standings.LapGap(0)),
		WorldPosition:    present(spatial.Position{X: phase * 3, Y: 12.5, Z: phase * -2}),
		LocalVelocity:    present(spatial.LocalVelocity{X: 0.1, Y: -0.2, Z: -62.5}),
		Orientation: present(spatial.Orientation{
			Row0: spatial.Vector3{X: 1, Y: 0, Z: 0},
			Row1: spatial.Vector3{X: 0, Y: 1, Z: 0},
			Row2: spatial.Vector3{X: 0, Y: 0, Z: 1},
		}),
	}
	if index == 0 {
		state.Gear = present(vehicle.Gear(4))
		state.EngineRPM = present(vehicle.EngineRPM(7250 + float64(seq%400)))
		state.SpeedMPS = present(62.5 + float64(seq%50)*0.1)
		state.Throttle = present(schema.Ratio(0.87))
		state.Brake = present(schema.Ratio(0.0))
		state.Clutch = present(schema.Ratio(0.0))
		state.Fuel = present(energy.Fuel{Amount: 44.5, Capacity: 105})
		state.DeltaBest = present(session.DeltaSeconds(-0.312 + float64(seq%10)*0.01))
	}
	return state
}

// ObservedStateAt builds a complete observed state for `count` vehicles.
func ObservedStateAt(count int, seq uint64) core.ObservedState {
	vehicles := make([]core.VehicleState, count)
	for index := range vehicles {
		vehicles[index] = VehicleStateAt(index, seq)
	}
	return core.ObservedState{
		SourceTime:    present(time.Duration(seq) * (time.Second / 60)),
		EndTime:       present(session.EndTime(21600)),
		MaximumLaps:   present(session.MaximumLaps(0)),
		TrackName:     present("Circuit de la Sarthe"),
		SessionType:   present(session.TypeEndurance),
		VehicleCount:  present(schema.Count(count)),
		PlayerPresent: present(true),
		Vehicles:      vehicles,
	}
}

// BatchAt builds a canonical reducer batch.
func BatchAt(count int, seq uint64) core.Batch {
	return core.Batch{Header: Header(seq), State: ObservedStateAt(count, seq)}
}

// ObservedSnapshotAt builds an owned observed snapshot without running the
// reducer, for stages measured in isolation.
func ObservedSnapshotAt(count int, seq uint64) envelope.Snapshot[core.ObservedState] {
	snapshot, err := envelope.NewSnapshot(Header(seq), ObservedStateAt(count, seq), cloneObserved)
	if err != nil {
		panic(err)
	}
	return snapshot
}

func cloneObserved(state core.ObservedState) core.ObservedState {
	result := state
	result.Vehicles = append([]core.VehicleState(nil), state.Vehicles...)
	return result
}
