package lmu

import (
	"context"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	telemetryengine "github.com/vantare/overlays/v2/internal/telemetry/engine"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestSlotMissingOneFrameKeepsVehicleIdentity(t *testing.T) {
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

func TestDriverChangeEmitsFactAndOpensNewStint(t *testing.T) {
	mapper := NewBatchMapper()
	engine := telemetryengine.New(
		telemetrycore.NewReducer(),
		telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{}),
		derive.NewPipeline(derive.Config{}),
	)
	var results []telemetryengine.EngineResult
	sink := telemetrycore.BatchSinkFunc(func(ctx context.Context, batch telemetrycore.Batch) error {
		result, err := engine.Apply(ctx, batch)
		if err == nil {
			results = append(results, result)
		}
		return err
	})

	first := trackObservation(7)
	first.Vehicles[0].DriverName = observed(identity.DriverName("Driver A"))
	first.Vehicles[0].VehicleClass = observed(standings.VehicleClass("Hypercar"))
	writeMapped(t, mapper, first, sink)
	second := trackObservation(7)
	second.SourceTime = observed(2 * time.Second)
	second.Vehicles[0].DriverName = observed(identity.DriverName("Driver B"))
	second.Vehicles[0].VehicleClass = observed(standings.VehicleClass("Hypercar"))
	writeMapped(t, mapper, second, sink)

	if len(results) != 2 || len(results[1].Facts) != 1 {
		t.Fatalf("engine results/facts = %d/%d", len(results), len(results[1].Facts))
	}
	fact := results[1].Facts[0].Value()
	if fact.Kind != telemetrycore.FactDriverChanged || fact.StintID == "" || fact.StintID == results[0].Facts[0].Value().StintID {
		t.Fatalf("driver change fact = %+v, initial = %+v", fact, results[0].Facts[0].Value())
	}
	if results[1].Cursor.Epoch != results[0].Cursor.Epoch {
		t.Fatalf("driver change epoch = %d, want %d", results[1].Cursor.Epoch, results[0].Cursor.Epoch)
	}
	state, _ := results[1].State.Value()
	if state.Observed.Vehicles[0].Identity.Stint != fact.StintID {
		t.Fatalf("final stint = %q, fact = %q", state.Observed.Vehicles[0].Identity.Stint, fact.StintID)
	}
}

func TestPlayerReappearanceKeepsControlsHistoryAndDeltaReference(t *testing.T) {
	mapper := NewBatchMapper()
	sink := &identityDeriveSink{reducer: telemetrycore.NewReducer(), pipeline: derive.NewPipeline(derive.Config{})}
	first := trackObservation(7)
	first.Vehicles[0].Throttle = observed(schema.Ratio(0.4))
	first.Vehicles[0].Brake = observed(schema.Ratio(0))
	first.Vehicles[0].Clutch = observed(schema.Ratio(0))
	first.Vehicles[0].DeltaBest = observed(session.DeltaSeconds(0.2))
	first.Vehicles[0].LapDistance = observed(standings.LapDistance(100))
	writeMapped(t, mapper, first, sink)

	missing := trackObservation()
	missing.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, missing, sink)
	reappeared := trackObservation(7)
	reappeared.SourceTime = observed(3 * time.Second)
	reappeared.Vehicles[0].Throttle = observed(schema.Ratio(0.6))
	reappeared.Vehicles[0].Brake = observed(schema.Ratio(0))
	reappeared.Vehicles[0].Clutch = observed(schema.Ratio(0))
	reappeared.Vehicles[0].DeltaBest = observed(session.DeltaSeconds(0.1))
	reappeared.Vehicles[0].LapDistance = observed(standings.LapDistance(120))
	writeMapped(t, mapper, reappeared, sink)
	final, ok := sink.final.Value()
	if !ok {
		t.Fatal("final snapshot has no value")
	}
	if len(final.Derived.ControlsHistory.Samples) < 2 {
		t.Fatalf("controls history samples = %d, want history from before and after one-frame gap", len(final.Derived.ControlsHistory.Samples))
	}
	if len(final.Derived.Delta.History) < 2 {
		t.Fatalf("delta history samples = %d, want reference history from before and after one-frame gap", len(final.Derived.Delta.History))
	}
}

func TestGraceWindowExpiryReleasesSlot(t *testing.T) {
	mapper, sink := NewBatchMapper(BatchMapperConfig{SlotGraceFrames: 1}), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7), sink)
	firstID := vehicleIDForSlot(t, sink.last(t), 7)
	for sequence := 2; sequence <= 3; sequence++ {
		missing := trackObservation()
		missing.SourceTime = observed(time.Duration(sequence) * time.Second)
		writeMapped(t, mapper, missing, sink)
	}
	reappeared := trackObservation(7)
	reappeared.SourceTime = observed(4 * time.Second)
	writeMapped(t, mapper, reappeared, sink)
	if got := vehicleIDForSlot(t, sink.last(t), 7); got == firstID {
		t.Fatalf("expired slot retained identity %q", got)
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
