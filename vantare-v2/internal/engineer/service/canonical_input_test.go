package service_test

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/service"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestEngineerServiceConsumesCanonicalObservationWithoutOwningSource(t *testing.T) {
	svc := service.NewEngineerService(&mockEmitter{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}
	if status := svc.Status(); !status.Connected || status.Source != "telemetry-core" {
		t.Fatalf("status = %+v, want connected canonical source", status)
	}

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		for _, notification := range svc.RecentNotifications() {
			if notification.TextKey == "spotter.car_left" {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("canonical observation did not reach Spotter notification queue")
}

func TestEngineerServiceResetsAtEpochBoundaryAndFactsFailClosed(t *testing.T) {
	svc := service.NewEngineerService(&mockEmitter{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 2, -2.8)); err != nil {
		t.Fatal(err)
	}

	fact := engineerprojection.FactEnvelopeV1{
		Metadata: projection.Metadata{Epoch: 2},
		Fact: engineerprojection.FactV1{
			Sequence: 1,
			Kind:     engineerprojection.FactConnectionLost,
		},
	}
	if err := svc.ConsumeFact(fact); err != nil {
		t.Fatal(err)
	}
	if svc.Status().Connected {
		t.Fatal("connection-lost fact must disconnect Engineer")
	}
	if err := svc.ConsumeFact(fact); err == nil {
		t.Fatal("duplicate fact cursor must fail closed")
	}
}

func canonicalSpotterObservation(t *testing.T, epoch uint64, rivalX float64) engineerprojection.ObservationSnapshotV1 {
	t.Helper()
	run := identity.RunIdentity{Event: "event", Session: "session", Vehicle: "player", Team: "team", Driver: "driver"}
	clock := schema.NewClock(observedField(t, time.Second), observedField(t, time.Second), time.Now().UTC())
	header := envelope.Header{
		Source:   "canonical-service-test",
		Cursor:   schema.Cursor{Epoch: schema.Epoch(epoch), Sequence: 1},
		Clock:    clock,
		Identity: run,
	}
	orientation := spatial.Orientation{
		Row0: spatial.Vector3{X: 1},
		Row1: spatial.Vector3{Y: 1},
		Row2: spatial.Vector3{Z: 1},
	}
	player := telemetrycore.VehicleState{
		Identity:      run,
		Player:        observedField(t, true),
		LapNumber:     observedField(t, session.LapNumber(1)),
		Gear:          observedField(t, vehicle.Gear(4)),
		SpeedMPS:      observedField(t, 40.0),
		InPit:         observedField(t, pit.InPit(false)),
		WorldPosition: observedField(t, spatial.Position{X: 100, Z: 100}),
		LocalVelocity: observedField(t, spatial.LocalVelocity{Z: 40}),
		Orientation:   observedField(t, orientation),
	}
	rival := player
	rival.Identity.Vehicle = "rival"
	rival.Player = observedField(t, false)
	rival.WorldPosition = observedField(t, spatial.Position{X: 100 + rivalX, Z: 100})
	state := derive.FinalState{Observed: telemetrycore.ObservedState{
		SourceTime:    observedField(t, time.Second),
		PlayerPresent: observedField(t, true),
		VehicleCount:  observedField(t, schema.Count(2)),
		Vehicles:      []telemetrycore.VehicleState{player, rival},
	}}
	snapshot, err := envelope.NewSnapshot(header, state, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = slices.Clone(value.Observed.Vehicles)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := engineerprojection.NewManifest([]engineerprojection.Capability{
		{ID: engineerprojection.CapabilitySession, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityStandings, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityControls, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityPit, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityFuel, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityGaps, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilitySpatial, State: engineerprojection.CapabilitySupported},
	})
	if err != nil {
		t.Fatal(err)
	}
	result, err := engineerprojection.ProjectObservationV1(snapshot, manifest)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func observedField[T comparable](t *testing.T, value T) schema.Field[T] {
	t.Helper()
	result, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
