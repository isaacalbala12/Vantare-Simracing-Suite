package overlay

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
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

func BenchmarkOverlayProjectionAndMarshal1(b *testing.B) { benchmarkOverlayProjectionAndMarshal(b, 1) }
func BenchmarkOverlayProjectionAndMarshal20(b *testing.B) {
	benchmarkOverlayProjectionAndMarshal(b, 20)
}
func BenchmarkOverlayProjectionAndMarshal44(b *testing.B) {
	benchmarkOverlayProjectionAndMarshal(b, 44)
}
func BenchmarkOverlayProjectionAndMarshal104(b *testing.B) {
	benchmarkOverlayProjectionAndMarshal(b, 104)
}

func benchmarkOverlayProjectionAndMarshal(b *testing.B, count int) {
	final := benchmarkFinalState(b, count)
	projected, err := ProjectV1(final)
	if err != nil {
		b.Fatal(err)
	}
	encoded, err := json.Marshal(projected.PayloadV1)
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		projected, err := ProjectV1(final)
		if err != nil {
			b.Fatal(err)
		}
		if _, err := json.Marshal(projected.PayloadV1); err != nil {
			b.Fatal(err)
		}
	}
	b.ReportMetric(float64(len(encoded)), "payload_bytes")
}

func benchmarkFinalState(tb testing.TB, count int) envelope.Snapshot[derive.FinalState] {
	tb.Helper()
	reducer := core.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	var final envelope.Snapshot[derive.FinalState]
	for sequence := uint64(1); sequence <= 4; sequence++ {
		observed, err := reducer.Apply(benchmarkBatch(count, sequence))
		if err != nil {
			tb.Fatal(err)
		}
		final, err = pipeline.Apply(context.Background(), observed)
		if err != nil {
			tb.Fatal(err)
		}
	}
	return final
}

func benchmarkBatch(count int, sequence uint64) core.Batch {
	source := benchmarkPresent(time.Duration(sequence) * time.Second / 60)
	run := identity.RunIdentity{Event: "benchmark-event", Session: "benchmark-session", Vehicle: "vehicle-000"}
	vehicles := make([]core.VehicleState, count)
	for index := range vehicles {
		id := identity.VehicleID(fmt.Sprintf("vehicle-%03d", index))
		vehicles[index] = core.VehicleState{
			Identity:     identity.RunIdentity{Event: run.Event, Session: run.Session, Vehicle: id},
			DriverName:   benchmarkPresent(identity.DriverName(fmt.Sprintf("Driver %03d", index))),
			Name:         benchmarkPresent(vehicle.VehicleName(fmt.Sprintf("Vantare GT3 #%03d", index))),
			VehicleClass: benchmarkPresent(standings.VehicleClass("HYPERCAR")), Player: benchmarkPresent(index == 0),
			Sector:           benchmarkPresent(standings.Sector(index%3 + 1)),
			LapDistance:      benchmarkPresent(standings.LapDistance(index*137) + 0.125),
			BestLapTime:      benchmarkPresent(standings.LapTime(203.4567 + float64(index))),
			LastLapTime:      benchmarkPresent(standings.LapTime(204.1234 + float64(index))),
			EstimatedLapTime: benchmarkPresent(standings.LapTime(203.9876 + float64(index))),
			LapNumber:        benchmarkPresent(session.LapNumber(12 + index%3)), Position: benchmarkPresent(standings.Position(index + 1)),
			CompletedLaps: benchmarkPresent(standings.CompletedLaps(11 + index%3)), InPit: benchmarkPresent(pit.InPit(index%17 == 0)),
			PitStopCount: benchmarkPresent(pit.StopCount(index % 4)), PenaltyCount: benchmarkPresent(standings.PenaltyCount(index % 2)),
			TimeBehindLeader: benchmarkPresent(standings.TimeGap(float64(index) * 1.7392)), LapsBehindLeader: benchmarkPresent(standings.LapGap(index / 30)),
			TimeBehindNext: benchmarkPresent(standings.TimeGap(1.2731)), LapsBehindNext: benchmarkPresent(standings.LapGap(0)),
			WorldPosition: benchmarkPresent(spatial.Position{X: float64(index) * 3, Y: 12.5, Z: float64(index) * -2}),
			LocalVelocity: benchmarkPresent(spatial.LocalVelocity{X: 0.1, Y: -0.2, Z: -62.5}),
			Orientation:   benchmarkPresent(spatial.Orientation{Row0: spatial.Vector3{X: 1}, Row1: spatial.Vector3{Y: 1}, Row2: spatial.Vector3{Z: 1}}),
		}
	}
	vehicles[0].Gear = benchmarkPresent(vehicle.Gear(4))
	vehicles[0].EngineRPM = benchmarkPresent(vehicle.EngineRPM(7250))
	vehicles[0].SpeedMPS = benchmarkPresent(62.5)
	vehicles[0].Throttle = benchmarkPresent(schema.Ratio(0.87))
	vehicles[0].Brake = benchmarkPresent(schema.Ratio(0))
	vehicles[0].Clutch = benchmarkPresent(schema.Ratio(0))
	vehicles[0].Fuel = benchmarkPresent(energy.Fuel{Amount: 44.5, Capacity: 105})
	vehicles[0].DeltaBest = benchmarkPresent(session.DeltaSeconds(-0.312))
	received := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC).Add(time.Duration(sequence) * time.Second / 60)
	return core.Batch{
		Header: envelope.Header{Source: "isa-373-benchmark", Cursor: schema.Cursor{Epoch: 1, Sequence: schema.Sequence(sequence)}, Clock: schema.NewClock(source, source, received), Identity: run},
		State: core.ObservedState{
			SourceTime: source, EndTime: benchmarkPresent(session.EndTime(21600)), MaximumLaps: benchmarkPresent(session.MaximumLaps(0)),
			TrackName: benchmarkPresent("Circuit de la Sarthe"), SessionType: benchmarkPresent(session.TypeEndurance),
			VehicleCount: benchmarkPresent(schema.Count(count)), PlayerPresent: benchmarkPresent(true), Vehicles: vehicles,
		},
	}
}

func benchmarkPresent[T comparable](value T) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		panic(err)
	}
	return field
}
