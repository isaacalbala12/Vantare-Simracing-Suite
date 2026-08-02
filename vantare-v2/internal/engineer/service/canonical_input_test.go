package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/presentation"
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

func TestCanonicalPresentationIsIdenticalForWailsAndSSEFanout(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)
	if err := svc.SetLocale("it"); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	sse, unsubscribe := svc.Subscribe()
	defer unsubscribe()
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}

	var streamed service.EngineerNotification
	select {
	case streamed = <-sse:
	case <-time.After(time.Second):
		t.Fatal("SSE subscription did not receive canonical presentation")
	}
	if streamed.Version != presentation.ContractVersionV1 || streamed.Locale != "it" ||
		streamed.Role != "spotter" || streamed.Channel != "spotter" || streamed.VoiceText == "" ||
		streamed.Text == streamed.TextKey || streamed.VoiceText == streamed.TextKey {
		t.Fatalf("streamed presentation = %+v", streamed)
	}

	deadline := time.Now().Add(time.Second)
	var emitted service.EngineerNotification
	for time.Now().Before(deadline) {
		for _, event := range emitter.Events() {
			if event["name"] != "engineer:notification" {
				continue
			}
			candidate, ok := event["data"].(service.EngineerNotification)
			if ok && candidate.ID == streamed.ID {
				emitted = candidate
				break
			}
		}
		if emitted.ID != "" {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if !reflect.DeepEqual(emitted, streamed) {
		t.Fatalf("Wails = %+v, SSE = %+v", emitted, streamed)
	}
	wailsJSON, err := json.Marshal(emitted)
	if err != nil {
		t.Fatal(err)
	}
	sseJSON, err := json.Marshal(streamed)
	if err != nil {
		t.Fatal(err)
	}
	if string(wailsJSON) != string(sseJSON) {
		t.Fatalf("Wails JSON %s != SSE JSON %s", wailsJSON, sseJSON)
	}
}

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
	beforeBoundary := svc.Status().PresentationLifecycle

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
	if got := svc.Status().PresentationLifecycle; got != beforeBoundary+1 {
		t.Fatalf("presentation lifecycle = %d, want %d after connection boundary", got, beforeBoundary+1)
	}
	if err := svc.ConsumeFact(fact); err == nil {
		t.Fatal("duplicate fact cursor must fail closed")
	}
}

func TestEngineerServiceSourceStatusDisconnectsAndRequiresFreshLiveObservation(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive}); err != nil {
		t.Fatal(err)
	}
	eventsAfterFirstLive := len(emitter.Events())
	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive, ReconnectAttempt: 1}); err != nil {
		t.Fatal(err)
	}
	if got := len(emitter.Events()); got != eventsAfterFirstLive {
		t.Fatalf("unchanged source state emitted duplicate status: got %d events, want %d", got, eventsAfterFirstLive)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 2, 2.8)); err != nil {
		t.Fatal(err)
	}
	if !svc.Status().Connected {
		t.Fatal("fresh live observation did not connect Engineer")
	}
	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceStale, ReconnectAttempt: 1}); err != nil {
		t.Fatal(err)
	}
	if svc.Status().Connected {
		t.Fatal("stale canonical source left Engineer connected")
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 1, -2.8)); !errors.Is(err, service.ErrCanonicalSourceUnavailable) {
		t.Fatalf("observation while stale error = %v", err)
	}
	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive, ReconnectAttempt: 1}); err != nil {
		t.Fatal(err)
	}
	if svc.Status().Connected {
		t.Fatal("live status alone must not reconnect Engineer")
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 2, 2.8)); !errors.Is(err, service.ErrCanonicalObservationNotFresh) {
		t.Fatalf("same reconnect observation error = %v, want not-fresh", err)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 1, -2.8)); !errors.Is(err, service.ErrCanonicalObservationNotFresh) {
		t.Fatalf("stale reconnect observation error = %v, want not-fresh", err)
	}
	if svc.Status().Connected {
		t.Fatal("stale or same observation reconnected Engineer")
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 3, -2.8)); err != nil {
		t.Fatal(err)
	}
	if !svc.Status().Connected {
		t.Fatal("fresh observation after recovery did not reconnect Engineer")
	}
	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceStale, ReconnectAttempt: 2}); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive, ReconnectAttempt: 2}); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 2, 1, 2.8)); err != nil {
		t.Fatalf("new epoch after recovery error = %v", err)
	}
	if !svc.Status().Connected {
		t.Fatal("new epoch after recovery did not reconnect Engineer")
	}
}

func TestEngineerServiceReconnectAttemptAdvanceRequiresObservationAfterBoundary(t *testing.T) {
	svc := service.NewEngineerService(&mockEmitter{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive, ReconnectAttempt: 7}); err != nil {
		t.Fatal(err)
	}
	snapshot := canonicalSpotterObservationAt(t, 1, 2, 2.8)
	if err := svc.ConsumeObservation(snapshot); err != nil {
		t.Fatal(err)
	}
	if !svc.Status().Connected {
		t.Fatal("initial live snapshot did not connect Engineer")
	}

	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive, ReconnectAttempt: 8}); err != nil {
		t.Fatal(err)
	}
	if svc.Status().Connected {
		t.Fatal("advanced reconnect attempt with live state did not create a boundary")
	}
	if err := svc.ConsumeObservation(snapshot); !errors.Is(err, service.ErrCanonicalObservationNotFresh) {
		t.Fatalf("same snapshot after reconnect attempt error = %v, want not-fresh", err)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 3, -2.8)); err != nil {
		t.Fatalf("newer snapshot after reconnect attempt error = %v", err)
	}
	if !svc.Status().Connected {
		t.Fatal("newer snapshot after reconnect attempt did not reconnect Engineer")
	}
}

func canonicalSpotterObservation(t *testing.T, epoch uint64, rivalX float64) engineerprojection.ObservationSnapshotV1 {
	return canonicalSpotterObservationAt(t, epoch, 1, rivalX)
}

func canonicalSpotterObservationAt(t *testing.T, epoch, sequence uint64, rivalX float64) engineerprojection.ObservationSnapshotV1 {
	t.Helper()
	run := identity.RunIdentity{Event: "event", Session: "session", Vehicle: "player", Team: "team", Driver: "driver"}
	clock := schema.NewClock(observedField(t, time.Second), observedField(t, time.Second), time.Now().UTC())
	header := envelope.Header{
		Source:   "canonical-service-test",
		Cursor:   schema.Cursor{Epoch: schema.Epoch(epoch), Sequence: schema.Sequence(sequence)},
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
