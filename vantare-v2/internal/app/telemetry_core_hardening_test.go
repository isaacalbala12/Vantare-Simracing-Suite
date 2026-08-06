package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/recording"
	recordingsqlite "github.com/vantare/overlays/v2/internal/telemetry/recording/sqlite"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

const (
	hardeningSoakVehicles    = 64
	hardeningSoakSubscribers = 6
	hardeningSoakSamples     = 121 // one-minute samples cover exactly two logical hours
	hardeningSampleInterval  = time.Minute
)

func TestTelemetryCoreTwoHourLogicalSoakIsBoundedAndPayloadFree(t *testing.T) {
	consumer := &countingEngineerConsumer{}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}

	subscriptions := make([]*telemetrytransport.Subscription, 0, hardeningSoakSubscribers)
	for range hardeningSoakSubscribers {
		subscription, subscribeErr := runtime.Hub().Subscribe(context.Background())
		if subscribeErr != nil {
			t.Fatal(subscribeErr)
		}
		subscriptions = append(subscriptions, subscription)
	}

	root := t.TempDir()
	const sessionID = "session-local-hardening"
	ref := recording.SessionRef{Root: root, SessionID: sessionID}
	manifest := recording.NewSessionManifest(sessionID, "lmu", "hardening-test", hardeningSoakStart)
	recorder, err := recording.NewCoordinator(
		recordingsqlite.New(recordingsqlite.Options{}),
		ref,
		manifest,
		recording.CoordinatorConfig{QueueCapacity: 1024},
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := recorder.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	mapper := recording.NewMapper()

	for sequence := uint64(1); sequence <= hardeningSoakSamples; sequence++ {
		batch := hardeningBatch(sequence, hardeningSoakVehicles)
		if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), batch); err != nil {
			t.Fatalf("pipeline sequence %d: %v", sequence, err)
		}
		observed, ok := runtime.reducer.Current()
		if !ok {
			t.Fatalf("observed sequence %d unavailable", sequence)
		}
		payload, mapErr := mapper.Payload(observed)
		if mapErr != nil {
			t.Fatalf("recording map sequence %d: %v", sequence, mapErr)
		}
		if err := recorder.TryAccept(recording.RecordingBatch{
			Observed: []recording.RecordingPayloadV1{payload},
			Accepted: payload.Cursor(),
		}); err != nil {
			t.Fatalf("recording sequence %d: %v", sequence, err)
		}

		for _, subscription := range subscriptions {
			if sequence == 1 {
				assertHardeningEvent(t, subscription, telemetrytransport.EventStatus)
			}
			assertHardeningEvent(t, subscription, telemetrytransport.EventSnapshot)
		}
	}

	stopContext, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := recorder.Stop(stopContext); err != nil {
		t.Fatal(err)
	}
	status := recorder.Status()
	if status.State != recording.StateComplete || status.AcceptedBatches != hardeningSoakSamples ||
		status.CommittedBatches != hardeningSoakSamples || status.QueueDepth != 0 ||
		status.RejectedBatches != 0 || status.QueueCapacity != 1024 {
		t.Fatalf("recorder status = %#v", status)
	}

	metrics := runtime.Metrics()
	if metrics.BatchesApplied != hardeningSoakSamples ||
		metrics.ProjectionsPublished != hardeningSoakSamples ||
		metrics.EngineerObservations != hardeningSoakSamples ||
		metrics.EngineerDeliveryFailures != 0 ||
		metrics.Transport.CurrentSubscribers != hardeningSoakSubscribers ||
		metrics.Transport.SnapshotPublications != hardeningSoakSamples ||
		metrics.Transport.SnapshotReplacements != hardeningSoakSamples-1 {
		t.Fatalf("runtime metrics = %#v", metrics)
	}
	if consumer.observations != hardeningSoakSamples || consumer.failures != 0 {
		t.Fatalf("Engineer counts = observations %d failures %d", consumer.observations, consumer.failures)
	}
	assertMetricsContainNoPersonalPayload(t, metrics)

	for _, subscription := range subscriptions {
		if err := subscription.Close(); err != nil {
			t.Fatal(err)
		}
	}
	if current := runtime.Metrics().Transport.CurrentSubscribers; current != 0 {
		t.Fatalf("subscribers after teardown = %d", current)
	}
}

func TestTelemetryCoreMetricsCountRejectedObservationWithoutPayload(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	// El frame se cuenta como rechazado pero no se propaga: llegar hasta
	// DriverManager lo convertia en un error terminal y apagaba la telemetria
	// hasta reiniciar la aplicacion. Rechazado no es fatal.
	err = (runtimeObservationSink{runtime: runtime}).WriteObservation(
		context.Background(),
		structuralInvalidObservation(),
	)
	if err != nil {
		t.Fatalf("unmappable observation must not be fatal, got %v", err)
	}
	metrics := runtime.Metrics()
	if metrics.ObservationsReceived != 1 || metrics.ObservationsRejected != 1 {
		t.Fatalf("metrics = %#v", metrics)
	}
	assertMetricsContainNoPersonalPayload(t, metrics)
}

func BenchmarkTelemetryCoreCombined64Vehicles(b *testing.B) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: &countingEngineerConsumer{}})
	if err != nil {
		b.Fatal(err)
	}
	batch := hardeningBatch(1, hardeningSoakVehicles)
	var sequence uint64
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		sequence++
		batch.Header.Cursor.Sequence = schema.Sequence(sequence)
		batch.Header.Clock = hardeningClock(sequence)
		batch.State.SourceTime = runtimePresent(time.Duration(sequence-1) * hardeningSampleInterval)
		if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), batch); err != nil {
			b.Fatal(err)
		}
	}
}

var hardeningSoakStart = time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)

func hardeningBatch(sequence uint64, vehicles int) telemetrycore.Batch {
	base := engineerRuntimeBatch()
	result := base
	result.Header.Cursor = schema.Cursor{Epoch: 1, Sequence: schema.Sequence(sequence)}
	result.Header.Clock = hardeningClock(sequence)
	result.State.SourceTime = runtimePresent(time.Duration(sequence-1) * hardeningSampleInterval)
	result.State.VehicleCount = runtimePresent(schema.Count(vehicles))
	result.State.Vehicles = make([]telemetrycore.VehicleState, vehicles)

	completed := standings.CompletedLaps((sequence - 1) / 90)
	for index := range vehicles {
		vehicle := base.State.Vehicles[0]
		run := identity.RunIdentity{
			Event:   base.Header.Identity.Event,
			Session: base.Header.Identity.Session,
			Vehicle: identity.VehicleID(fmt.Sprintf("private-vehicle-%02d", index)),
			Team:    identity.TeamID(fmt.Sprintf("private-team-%02d", index)),
			Driver:  identity.DriverID(fmt.Sprintf("private-driver-%02d", index)),
		}
		vehicle.Identity = run
		vehicle.DriverName = runtimePresent(identity.DriverName(fmt.Sprintf("Private Driver %02d", index)))
		vehicle.Player = runtimePresent(index == 0)
		vehicle.Position = runtimePresent(standings.Position(index + 1))
		vehicle.CompletedLaps = runtimePresent(completed)
		vehicle.LapNumber = runtimePresent(session.LapNumber(completed + 1))
		vehicle.TimeBehindNext = runtimePresent(standings.TimeGap(float64(index) * 0.25))
		vehicle.WorldPosition = runtimePresent(spatial.Position{X: float64(index) * 3, Y: 0, Z: float64(sequence)})
		result.State.Vehicles[index] = vehicle
		if index == 0 {
			result.Header.Identity = run
		}
	}
	result.State.TrackName = runtimePresent("private-track")
	return result
}

func hardeningClock(sequence uint64) schema.Clock {
	elapsed := time.Duration(sequence-1) * hardeningSampleInterval
	return schema.NewClock(runtimePresent(elapsed), runtimePresent(elapsed), hardeningSoakStart.Add(elapsed))
}

func assertHardeningEvent(t *testing.T, subscription *telemetrytransport.Subscription, kind telemetrytransport.EventKind) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	event, err := subscription.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if event.Kind != kind {
		t.Fatalf("event kind = %q, want %q", event.Kind, kind)
	}
}

func assertMetricsContainNoPersonalPayload(t *testing.T, metrics TelemetryCoreMetrics) {
	t.Helper()
	encoded, err := json.Marshal(metrics)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range [][]byte{
		[]byte("Private Driver"),
		[]byte("private-driver"),
		[]byte("private-vehicle"),
		[]byte("private-track"),
	} {
		if bytes.Contains(encoded, forbidden) {
			t.Fatalf("metrics leaked personal payload %q: %s", forbidden, encoded)
		}
	}
}

type countingEngineerConsumer struct {
	statuses     uint64
	observations uint64
	facts        uint64
	failures     uint64
}

func (consumer *countingEngineerConsumer) ConsumeSourceStatus(engineerprojection.SourceStatusV1) error {
	consumer.statuses++
	return nil
}

func (consumer *countingEngineerConsumer) ConsumeObservation(engineerprojection.ObservationSnapshotV1) error {
	consumer.observations++
	return nil
}

func (consumer *countingEngineerConsumer) ConsumeFact(engineerprojection.FactEnvelopeV1) error {
	consumer.facts++
	return nil
}

func structuralInvalidObservation() lmu.Observation {
	return lmu.Observation{
		Source:        lmu.SourceCanonical,
		ReceivedUTC:   hardeningSoakStart,
		Compatibility: lmu.CompatibilityKnown,
		TrackName:     runtimePresent("private-track"),
		SessionType:   runtimePresent(session.TypeRace),
		VehicleCount:  runtimePresent(schema.Count(1)),
		PlayerPresent: runtimePresent(false),
	}
}
