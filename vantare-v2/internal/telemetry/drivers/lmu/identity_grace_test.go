package lmu

import (
	"context"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestSlotMissingOneFrameKeepsVehicleIdentity(t *testing.T) {
	t.Skip("ISA-371 D-03: activar en F3; el epoch nuevo también borra ControlsHistory y delta")
	for _, test := range []struct {
		name       string
		first      Observation
		missing    Observation
		reappeared Observation
		slot       VehicleSourceID
	}{
		{name: "non-player", first: trackObservation(7, 8), missing: trackObservation(7), reappeared: trackObservation(7, 8), slot: 8},
		{name: "player", first: trackObservation(7, 8), missing: observationWithoutPlayer(8), reappeared: trackObservation(7, 8), slot: 7},
	} {
		t.Run(test.name, func(t *testing.T) {
			mapper, sink := NewBatchMapper(), new(batchCollector)
			writeMapped(t, mapper, test.first, sink)
			firstID := vehicleIDForSlot(t, sink.last(t), test.slot)
			test.missing.SourceTime = observed(2 * time.Second)
			writeMapped(t, mapper, test.missing, sink)
			test.reappeared.SourceTime = observed(3 * time.Second)
			writeMapped(t, mapper, test.reappeared, sink)
			if got := vehicleIDForSlot(t, sink.last(t), test.slot); got != firstID {
				t.Fatalf("identity after one missing frame = %q, want %q", got, firstID)
			}
		})
	}
}

func TestSlotReusedByAnotherCarGetsNewIdentity(t *testing.T) {
	t.Skip("ISA-371 escenario 17: activar en F3")
	mapper, sink := NewBatchMapper(), new(batchCollector)
	first := trackObservation(7, 8)
	first.Vehicles[1].DriverName = observed(identity.DriverName("Driver A"))
	first.Vehicles[1].VehicleName = observed(vehicle.VehicleName("Car A"))
	first.Vehicles[1].VehicleClass = observed(standings.VehicleClass("Class A"))
	writeMapped(t, mapper, first, sink)
	firstID := vehicleIDForSlot(t, sink.last(t), 8)

	omitted := trackObservation(7)
	omitted.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, omitted, sink)
	reused := trackObservation(7, 8)
	reused.SourceTime = observed(3 * time.Second)
	reused.Vehicles[1].DriverName = observed(identity.DriverName("Driver B"))
	reused.Vehicles[1].VehicleName = observed(vehicle.VehicleName("Car B"))
	reused.Vehicles[1].VehicleClass = observed(standings.VehicleClass("Class B"))
	writeMapped(t, mapper, reused, sink)
	if got := vehicleIDForSlot(t, sink.last(t), 8); got == firstID {
		t.Fatalf("reused slot retained identity %q", got)
	}
}

func TestSessionSignatureStaleDoesNotMergeSessions(t *testing.T) {
	t.Skip("ISA-371 06§13#11: activar en F3")
	mapper, sink := NewBatchMapper(), new(batchCollector)
	first := trackObservation(7)
	writeMapped(t, mapper, first, sink)
	firstSession := sink.last(t).Header.Identity.Session

	for sequence, track := range []string{"Track-Q", "Track-R"} {
		next := trackObservation(7)
		next.SourceTime = observed(time.Duration(sequence+2) * time.Second)
		next.TrackName = fieldWithFreshness(track, schema.FreshnessStale)
		next.SessionType = fieldWithFreshness(session.TypeRace, schema.FreshnessStale)
		writeMapped(t, mapper, next, sink)
	}
	if got := sink.last(t).Header.Identity.Session; got == firstSession {
		t.Fatalf("stale P→Q→R signature merged into session %q", got)
	}
}

func TestSlotMissingOneFrameKeepsControlsHistory(t *testing.T) {
	t.Skip("ISA-371 D-03: activar en F3; la misma transición borra la referencia de delta")
	mapper := NewBatchMapper()
	sink := &identityDeriveSink{reducer: telemetrycore.NewReducer(), pipeline: derive.NewPipeline(derive.Config{})}
	first := trackObservation(7)
	first.Vehicles[0].Throttle = observed(schema.Ratio(0.4))
	first.Vehicles[0].Brake = observed(schema.Ratio(0))
	first.Vehicles[0].Clutch = observed(schema.Ratio(0))
	writeMapped(t, mapper, first, sink)

	missing := trackObservation()
	missing.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, missing, sink)
	reappeared := trackObservation(7)
	reappeared.SourceTime = observed(3 * time.Second)
	reappeared.Vehicles[0].Throttle = observed(schema.Ratio(0.6))
	reappeared.Vehicles[0].Brake = observed(schema.Ratio(0))
	reappeared.Vehicles[0].Clutch = observed(schema.Ratio(0))
	writeMapped(t, mapper, reappeared, sink)
	final, ok := sink.final.Value()
	if !ok {
		t.Fatal("final snapshot has no value")
	}
	if len(final.Derived.ControlsHistory.Samples) < 2 {
		t.Fatalf("controls history samples = %d, want history from before and after one-frame gap", len(final.Derived.ControlsHistory.Samples))
	}
}

type identityDeriveSink struct {
	reducer  *telemetrycore.Reducer
	pipeline *derive.Pipeline
	final    envelope.Snapshot[derive.FinalState]
}

func (sink *identityDeriveSink) WriteBatch(ctx context.Context, batch telemetrycore.Batch) error {
	observed, err := sink.reducer.Apply(batch)
	if err != nil {
		return err
	}
	sink.final, err = sink.pipeline.Apply(ctx, observed)
	return err
}

func observationWithoutPlayer(slots ...VehicleSourceID) Observation {
	result := trackObservation(slots...)
	result.PlayerPresent = observed(false)
	for index := range result.Vehicles {
		result.Vehicles[index].Player = observed(false)
	}
	return result
}

func vehicleIDForSlot(t testing.TB, batch telemetrycore.Batch, slot VehicleSourceID) identity.VehicleID {
	t.Helper()
	want := int(slot)
	for _, current := range batch.State.Vehicles {
		if sourceSlotFromVehicleID(current.Identity.Vehicle) == want {
			return current.Identity.Vehicle
		}
	}
	t.Fatalf("slot %d not found", slot)
	return ""
}
