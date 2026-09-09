package lmu

import (
	"context"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

// ISA-1072 RED: the batch mapper carries the fused car number into the core
// vehicle state, preserving the "007" string form.
func TestBatchMapperCarriesCarNumberToCore(t *testing.T) {
	wall := time.Unix(920, 0).UTC()
	shared := sharedObservation(wall, "Track A")
	shared.PlayerPresent = observed(true)
	shared.VehicleCount = observed(schema.Count(2))
	shared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
		{SourceID: 6, Player: observed(false), VehicleName: observed(vehicle.VehicleName("Team B"))},
	}
	rest := restObservation(wall, 0, "Track A")
	rest.REST.CarNumbers = []restCarNumber{
		{Slot: 5, Number: "007", Vehicle: "Team A"},
		{Slot: 6, Number: "91", Vehicle: "Team B"},
	}
	rest.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}
	fused := new(Fusion).Merge(wall, 0, shared, rest)

	var got telemetrycore.Batch
	sink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		got = batch
		return nil
	})
	if err := NewBatchMapper().WriteObservation(context.Background(), fused, sink); err != nil {
		t.Fatal(err)
	}
	if len(got.State.Vehicles) != 2 {
		t.Fatalf("vehicles = %d, want 2", len(got.State.Vehicles))
	}
	assertFieldValue(t, got.State.Vehicles[0].CarNumber, standings.CarNumber("007"))
	assertFieldValue(t, got.State.Vehicles[1].CarNumber, standings.CarNumber("91"))
}

// ISA-1072 RED: a session boundary issues new vehicle identities, and the
// current REST grid re-attaches numbers to the new session instead of leaking
// the previous session's identities.
func TestBatchMapperCarNumberSurvivesSessionBoundary(t *testing.T) {
	wall := time.Unix(921, 0).UTC()
	firstShared := sharedObservation(wall, "Track A")
	firstShared.PlayerPresent = observed(true)
	firstShared.VehicleCount = observed(schema.Count(1))
	firstShared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	firstRest := restObservation(wall, 0, "Track A")
	firstRest.REST.CarNumbers = []restCarNumber{{Slot: 5, Number: "007", Vehicle: "Team A"}}
	firstRest.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}

	mapper := NewBatchMapper()
	var first telemetrycore.Batch
	firstSink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		first = batch
		return nil
	})
	if err := mapper.WriteObservation(context.Background(), new(Fusion).Merge(wall, 0, firstShared, firstRest), firstSink); err != nil {
		t.Fatal(err)
	}

	secondWall := wall.Add(time.Second)
	secondShared := sharedObservation(secondWall, "Track B")
	secondShared.PlayerPresent = observed(true)
	secondShared.VehicleCount = observed(schema.Count(1))
	secondShared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	secondRest := restObservation(secondWall, time.Second, "Track B")
	secondRest.REST.CarNumbers = []restCarNumber{{Slot: 5, Number: "007", Vehicle: "Team A"}}
	secondRest.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: time.Second, set: true}
	var second telemetrycore.Batch
	secondSink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		second = batch
		return nil
	})
	if err := mapper.WriteObservation(context.Background(), new(Fusion).Merge(secondWall, time.Second, secondShared, secondRest), secondSink); err != nil {
		t.Fatal(err)
	}
	if first.Header.Identity.Session == second.Header.Identity.Session {
		t.Fatalf("session did not turn over: %q", second.Header.Identity.Session)
	}
	if len(second.State.Vehicles) != 1 {
		t.Fatalf("vehicles = %d, want 1", len(second.State.Vehicles))
	}
	assertFieldValue(t, second.State.Vehicles[0].CarNumber, standings.CarNumber("007"))
}
