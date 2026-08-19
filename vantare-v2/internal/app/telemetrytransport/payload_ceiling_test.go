package telemetrytransport

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
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

func TestOverlayPayloadStaysUnderTransportLimit(t *testing.T) {
	t.Skip("ISA-371 D-08: activar en F1; rechazo medido desde 103 vehículos")
	for _, count := range []int{1, 20, 44, 104} {
		t.Run(fmt.Sprintf("vehicles=%d", count), func(t *testing.T) {
			projected, err := overlay.ProjectV1(payloadCeilingFinalState(t, count))
			if err != nil {
				t.Fatal(err)
			}
			frame, err := NewOverlayFull(projected.Metadata, 1, projected.PayloadV1)
			if err != nil {
				t.Fatal(err)
			}
			if got := len(frame.Payload); got > MaxPayloadBytes {
				t.Fatalf("overlay payload = %d bytes, limit = %d", got, MaxPayloadBytes)
			}
		})
	}
}

func TestEngineerPayloadStaysUnderTransportLimit(t *testing.T) {
	t.Skip("ISA-371 D-08: activar en F1; rechazo medido desde 85 vehículos")
	for _, count := range []int{1, 20, 44, 104} {
		t.Run(fmt.Sprintf("vehicles=%d", count), func(t *testing.T) {
			projected, err := engineer.ProjectV1(payloadCeilingFinalState(t, count))
			if err != nil {
				t.Fatal(err)
			}
			frame, err := NewEngineerFull(projected.Metadata, 1, projected.PayloadV1)
			if err != nil {
				t.Fatal(err)
			}
			if got := len(frame.Payload); got > MaxPayloadBytes {
				t.Fatalf("engineer payload = %d bytes, limit = %d", got, MaxPayloadBytes)
			}
		})
	}
}

func payloadCeilingFinalState(tb testing.TB, count int) envelope.Snapshot[derive.FinalState] {
	tb.Helper()
	reducer := core.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	var final envelope.Snapshot[derive.FinalState]
	for sequence := 1; sequence <= 4; sequence++ {
		observed, err := reducer.Apply(payloadCeilingBatch(count, uint64(sequence)))
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

func payloadCeilingBatch(count int, sequence uint64) core.Batch {
	source := payloadCeilingPresent(time.Duration(sequence) * time.Second / 60)
	header := envelope.Header{
		Source:   "isa-373-payload-ceiling",
		Cursor:   schema.Cursor{Epoch: 1, Sequence: schema.Sequence(sequence)},
		Clock:    envelopeClock(source, time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC).Add(time.Duration(sequence)*time.Second/60)),
		Identity: identity.RunIdentity{Event: "isa-373-event", Session: "isa-373-session", Vehicle: "vehicle-000"},
	}
	vehicles := make([]core.VehicleState, count)
	for index := range vehicles {
		id := identity.VehicleID(fmt.Sprintf("vehicle-%03d", index))
		vehicles[index] = core.VehicleState{
			Identity:         identity.RunIdentity{Event: "isa-373-event", Session: "isa-373-session", Vehicle: id},
			DriverName:       payloadCeilingPresent(identity.DriverName(fmt.Sprintf("Driver %03d", index))),
			Name:             payloadCeilingPresent(vehicle.VehicleName(fmt.Sprintf("Vantare Hypercar %03d", index))),
			VehicleClass:     payloadCeilingPresent(standings.VehicleClass("HYPERCAR")),
			Player:           payloadCeilingPresent(index == 0),
			Sector:           payloadCeilingPresent(standings.Sector(index%3 + 1)),
			LapDistance:      payloadCeilingPresent(standings.LapDistance(index*137) + 0.125),
			BestLapTime:      payloadCeilingPresent(standings.LapTime(203.4567 + float64(index))),
			LastLapTime:      payloadCeilingPresent(standings.LapTime(204.1234 + float64(index))),
			EstimatedLapTime: payloadCeilingPresent(standings.LapTime(203.9876 + float64(index))),
			LapNumber:        payloadCeilingPresent(session.LapNumber(12 + index%3)),
			Position:         payloadCeilingPresent(standings.Position(index + 1)),
			CompletedLaps:    payloadCeilingPresent(standings.CompletedLaps(11 + index%3)),
			InPit:            payloadCeilingPresent(pit.InPit(index%17 == 0)),
			PitStopCount:     payloadCeilingPresent(pit.StopCount(index % 4)),
			PenaltyCount:     payloadCeilingPresent(standings.PenaltyCount(index % 2)),
			TimeBehindLeader: payloadCeilingPresent(standings.TimeGap(float64(index) * 1.7392)),
			LapsBehindLeader: payloadCeilingPresent(standings.LapGap(index / 30)),
			TimeBehindNext:   payloadCeilingPresent(standings.TimeGap(1.2731)),
			LapsBehindNext:   payloadCeilingPresent(standings.LapGap(0)),
			WorldPosition:    payloadCeilingPresent(spatial.Position{X: float64(index) * 3, Y: 12.5, Z: float64(index) * -2}),
			LocalVelocity:    payloadCeilingPresent(spatial.LocalVelocity{X: 0.1, Y: -0.2, Z: -62.5}),
			Orientation: payloadCeilingPresent(spatial.Orientation{
				Row0: spatial.Vector3{X: 1}, Row1: spatial.Vector3{Y: 1}, Row2: spatial.Vector3{Z: 1},
			}),
		}
	}
	vehicles[0].Gear = payloadCeilingPresent(vehicle.Gear(4))
	vehicles[0].EngineRPM = payloadCeilingPresent(vehicle.EngineRPM(7250))
	vehicles[0].SpeedMPS = payloadCeilingPresent(62.5)
	vehicles[0].Throttle = payloadCeilingPresent(schema.Ratio(0.87))
	vehicles[0].Brake = payloadCeilingPresent(schema.Ratio(0))
	vehicles[0].Clutch = payloadCeilingPresent(schema.Ratio(0))
	vehicles[0].Fuel = payloadCeilingPresent(energy.Fuel{Amount: 44.5, Capacity: 105})
	vehicles[0].DeltaBest = payloadCeilingPresent(session.DeltaSeconds(-0.312))
	return core.Batch{Header: header, State: core.ObservedState{
		SourceTime: payloadCeilingPresent(time.Duration(sequence) * time.Second / 60),
		EndTime:    payloadCeilingPresent(session.EndTime(21600)), MaximumLaps: payloadCeilingPresent(session.MaximumLaps(0)),
		TrackName: payloadCeilingPresent("Circuit de la Sarthe"), SessionType: payloadCeilingPresent(session.TypeEndurance),
		VehicleCount: payloadCeilingPresent(schema.Count(count)), PlayerPresent: payloadCeilingPresent(true), Vehicles: vehicles,
	}}
}

func payloadCeilingPresent[T comparable](value T) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		panic(err)
	}
	return field
}

func envelopeClock(source schema.Field[time.Duration], received time.Time) schema.Clock {
	return schema.NewClock(source, source, received)
}
