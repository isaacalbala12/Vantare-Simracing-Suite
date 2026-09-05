package app

import (
	"context"
	"errors"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
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

func TestTelemetryCoreRuntimePublishesEngineerProjectionAndOrderedFacts(t *testing.T) {
	consumer := &recordingEngineerConsumer{}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatal(err)
	}
	if len(consumer.observations) != 1 {
		t.Fatalf("Engineer observations = %d, want 1", len(consumer.observations))
	}
	if len(consumer.facts) != 1 || consumer.facts[0].Fact.Kind != engineerprojection.FactSessionStarted {
		t.Fatalf("Engineer facts = %#v, want one session.started", consumer.facts)
	}
	if got := consumer.observations[0].Manifest.State(engineerprojection.CapabilitySpatial); got != engineerprojection.CapabilitySupported {
		t.Fatalf("spatial capability = %v, want supported", got)
	}
	if consumer.calls[0] != "status:stopped" || consumer.calls[1] != "observation" || consumer.calls[2] != "fact:session.started" {
		t.Fatalf("Engineer delivery order = %v", consumer.calls)
	}
}

func TestTelemetryCoreRuntimeIsolatesEngineerFailureWithoutOverlayV1(t *testing.T) {
	// R6b: el fallo de Engineer queda aislado en su frontera; no existe Hub
	// Overlay.
	consumer := &recordingEngineerConsumer{observationErr: errors.New("engineer unavailable")}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatalf("Engineer failure escaped product boundary: %v", err)
	}
	if runtime.EngineerError() == nil {
		t.Fatal("EngineerError() = nil, want isolated diagnostic")
	}
	metrics := runtime.Metrics()
	if metrics.EngineerObservations != 0 || metrics.EngineerDeliveryFailures != 1 {
		t.Fatalf("isolated Engineer metrics = %#v", metrics)
	}
}

func TestTelemetryCoreRuntimeReplacesRecoveredEngineerStatusError(t *testing.T) {
	consumer := &recordingEngineerConsumer{statusErr: errors.New("status unavailable")}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}

	runtime.deliverEngineerStatus(driver.StateLive, 0)
	if runtime.EngineerError() == nil {
		t.Fatal("EngineerError() = nil, want isolated status diagnostic")
	}
	consumer.statusErr = nil
	runtime.deliverEngineerStatus(driver.StateLive, 0)
	if err := runtime.EngineerError(); err != nil {
		t.Fatalf("EngineerError() after status recovery = %v", err)
	}
	metrics := runtime.Metrics()
	if metrics.EngineerStatusesDelivered != 1 || metrics.EngineerDeliveryFailures != 1 {
		t.Fatalf("recovered Engineer metrics = %#v", metrics)
	}
}

type recordingEngineerConsumer struct {
	observations   []engineerprojection.ObservationSnapshotV1
	facts          []engineerprojection.FactEnvelopeV1
	calls          []string
	statusErr      error
	observationErr error
	factErr        error
}

func (consumer *recordingEngineerConsumer) ConsumeSourceStatus(value engineerprojection.SourceStatusV1) error {
	consumer.calls = append(consumer.calls, "status:"+string(value.State))
	return consumer.statusErr
}

func (consumer *recordingEngineerConsumer) ConsumeObservation(value engineerprojection.ObservationSnapshotV1) error {
	consumer.calls = append(consumer.calls, "observation")
	consumer.observations = append(consumer.observations, value)
	return consumer.observationErr
}

func (consumer *recordingEngineerConsumer) ConsumeFact(value engineerprojection.FactEnvelopeV1) error {
	consumer.calls = append(consumer.calls, "fact:"+string(value.Fact.Kind))
	consumer.facts = append(consumer.facts, value)
	return consumer.factErr
}

func engineerRuntimeBatch() telemetrycore.Batch {
	received := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	run := identity.RunIdentity{Event: "event", Session: "session", Vehicle: "player", Team: "team", Driver: "driver"}
	player := telemetrycore.VehicleState{
		Identity:       run,
		DriverName:     runtimePresent(identity.DriverName("Player")),
		Name:           runtimePresent(vehicle.VehicleName("Car")),
		VehicleClass:   runtimePresent(standings.VehicleClass("Hypercar")),
		Player:         runtimePresent(true),
		LapNumber:      runtimePresent(session.LapNumber(2)),
		Gear:           runtimePresent(vehicle.Gear(4)),
		EngineRPM:      runtimePresent(vehicle.EngineRPM(8000)),
		SpeedMPS:       runtimePresent(55.0),
		Throttle:       runtimePresent(schema.Ratio(0.5)),
		Brake:          runtimePresent(schema.Ratio(0)),
		Clutch:         runtimePresent(schema.Ratio(0)),
		Position:       runtimePresent(standings.Position(1)),
		CompletedLaps:  runtimePresent(standings.CompletedLaps(1)),
		InPit:          runtimePresent(pit.InPit(false)),
		PitStopCount:   runtimePresent(pit.StopCount(0)),
		PenaltyCount:   runtimePresent(standings.PenaltyCount(0)),
		LastLapTime:    runtimePresent(standings.LapTime(90)),
		TimeBehindNext: runtimePresent(standings.TimeGap(0)),
		Fuel:           runtimePresent(energy.Fuel{Amount: 60, Capacity: 100}),
		WorldPosition:  runtimePresent(spatial.Position{X: 0, Y: 0, Z: 0}),
		LocalVelocity:  runtimePresent(spatial.LocalVelocity{X: 0, Y: 0, Z: 55}),
		Orientation:    runtimePresent(spatial.Orientation{Row0: spatial.Vector3{X: 1}, Row1: spatial.Vector3{Y: 1}, Row2: spatial.Vector3{Z: 1}}),
	}
	rivalRun := run
	rivalRun.Vehicle, rivalRun.Team, rivalRun.Driver = "rival", "rival-team", "rival-driver"
	rival := player
	rival.Identity = rivalRun
	rival.DriverName = runtimePresent(identity.DriverName("Rival"))
	rival.Player = runtimePresent(false)
	rival.Position = runtimePresent(standings.Position(2))
	rival.TimeBehindNext = runtimePresent(standings.TimeGap(1.2))
	rival.WorldPosition = runtimePresent(spatial.Position{X: 2.5, Y: 0, Z: 0})

	return telemetrycore.Batch{
		Header: envelope.Header{
			Source:   "lmu",
			Cursor:   schema.Cursor{Epoch: 1, Sequence: 1},
			Clock:    schema.NewClock(runtimePresent(time.Second), runtimePresent(time.Second), received),
			Identity: run,
		},
		State: telemetrycore.ObservedState{
			SourceTime:    runtimePresent(time.Second),
			TrackName:     runtimePresent("spa"),
			SessionType:   runtimePresent(session.TypeRace),
			MaximumLaps:   runtimePresent(session.MaximumLaps(10)),
			VehicleCount:  runtimePresent(schema.Count(2)),
			PlayerPresent: runtimePresent(true),
			Vehicles:      []telemetrycore.VehicleState{player, rival},
		},
	}
}

func runtimePresent[T comparable](value T) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		panic(err)
	}
	return field
}
