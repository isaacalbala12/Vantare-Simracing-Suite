//go:build windows

package app

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"sync/atomic"
	"testing"
	"time"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/telemetryprocess"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

type rustCandidateEngineerProbe struct {
	observations chan engineerprojection.ObservationSnapshotV1
	facts        chan engineerprojection.FactEnvelopeV1
	boundaries   chan engineerprojection.FactResyncRequiredError
	rejectFact   atomic.Bool
	rejected     chan struct{}
	available    atomic.Bool
	rejections   atomic.Int64
}

func (probe *rustCandidateEngineerProbe) ConsumeSourceStatus(status engineerprojection.SourceStatusV1) error {
	probe.available.Store(status.State.Available())
	return nil
}
func (probe *rustCandidateEngineerProbe) ConsumeObservation(value engineerprojection.ObservationSnapshotV1) error {
	if !probe.available.Load() {
		probe.rejections.Add(1)
		return errors.New("Engineer source unavailable before observation")
	}
	select {
	case probe.observations <- value:
	default:
	}
	return nil
}
func (probe *rustCandidateEngineerProbe) ConsumeFact(value engineerprojection.FactEnvelopeV1) error {
	if !probe.available.Load() {
		probe.rejections.Add(1)
		return errors.New("Engineer source unavailable before fact")
	}
	if probe.rejectFact.Swap(false) {
		if probe.rejected != nil {
			close(probe.rejected)
		}
		return errors.New("test Engineer rejected one fact")
	}
	select {
	case probe.facts <- value:
	default:
	}
	return nil
}
func (probe *rustCandidateEngineerProbe) ConsumeFactBoundary(boundary *engineerprojection.FactResyncRequiredError) error {
	if probe.boundaries != nil {
		probe.boundaries <- *boundary
	}
	return nil
}

func TestRustCandidateDisabledLifecycleIsTerminal(t *testing.T) {
	runtime, err := NewRustTelemetryCandidateRuntime(RustTelemetryCandidateConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := runtime.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := runtime.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(t.Context()); !errors.Is(err, ErrRustCandidateLifecycle) {
		t.Fatalf("restart after Stop = %v", err)
	}
}

func TestRustCandidateRestartAdvancesAllProductEpochs(t *testing.T) {
	runtime := &RustTelemetryCandidateRuntime{lastEpoch: 4, lastFact: telemetrycore.FactSequence(9), newChild: true}
	if err := runtime.translateEpoch(&telemetryprocess.ReceivedV1{
		Configuration: &telemetryprocess.ConfigurationAckV1{Epoch: 1},
	}); err != nil {
		t.Fatal(err)
	}
	if runtime.lastFact != 0 {
		t.Fatal("old child fact cursor survived restart")
	}
	event := telemetryprocess.ReceivedV1{
		Overlay:  &overlayv2.UpdateV2{Frame: &overlayv2.FrameV2{StreamEpoch: 1}},
		Engineer: &engineerprojection.SnapshotV1{Metadata: projection.Metadata{Epoch: schema.Epoch(1)}},
		Strategy: &strategyprojection.SnapshotV1{Metadata: projection.Metadata{Epoch: schema.Epoch(1)}},
		Facts:    []engineerprojection.FactEnvelopeV1{{Metadata: projection.Metadata{Epoch: schema.Epoch(1)}}},
	}
	if err := runtime.translateEpoch(&event); err != nil {
		t.Fatal(err)
	}
	if event.Overlay.Frame.StreamEpoch != 5 || event.Engineer.Epoch != 5 || event.Strategy.Epoch != 5 || event.Facts[0].Epoch != 5 {
		t.Fatalf("product cursors did not advance together: %+v", event)
	}
	if runtime.lastEpoch != 5 {
		t.Fatalf("last epoch = %d", runtime.lastEpoch)
	}
	if err := runtime.translateEpoch(&telemetryprocess.ReceivedV1{
		Strategy: &strategyprojection.SnapshotV1{Metadata: projection.Metadata{Epoch: schema.Epoch(2)}},
	}); err != nil || runtime.lastEpoch != 6 {
		t.Fatalf("session epoch after restart = %d, %v", runtime.lastEpoch, err)
	}
}

func TestRustCandidateRestartBeforeFirstProductKeepsChildEpoch(t *testing.T) {
	runtime := &RustTelemetryCandidateRuntime{newChild: true}
	if err := runtime.translateEpoch(&telemetryprocess.ReceivedV1{
		Configuration: &telemetryprocess.ConfigurationAckV1{Epoch: 2},
	}); err != nil {
		t.Fatal(err)
	}
	event := telemetryprocess.ReceivedV1{
		Strategy: &strategyprojection.SnapshotV1{Metadata: projection.Metadata{Epoch: schema.Epoch(2)}},
	}
	if err := runtime.translateEpoch(&event); err != nil || event.Strategy.Epoch != 2 {
		t.Fatalf("first product epoch = %d, %v", event.Strategy.Epoch, err)
	}
}

func TestRustCandidateDisconnectDeclaresFactLossBeforeRestart(t *testing.T) {
	probe := &rustCandidateEngineerProbe{boundaries: make(chan engineerprojection.FactResyncRequiredError, 1)}
	runtime, err := NewRustTelemetryCandidateRuntime(RustTelemetryCandidateConfig{Engineer: probe})
	if err != nil {
		t.Fatal(err)
	}
	runtime.lastEpoch = 3
	runtime.lastFact = 8
	runtime.handleDisconnected(errors.New("test child crash"))
	select {
	case boundary := <-probe.boundaries:
		if boundary.Previous != 8 || boundary.Next != 0 {
			t.Fatalf("fact loss boundary = %+v", boundary)
		}
	default:
		t.Fatal("missing Engineer fact loss boundary")
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if !runtime.newChild || runtime.attempt != 1 || runtime.status != driver.StateError {
		t.Fatalf("disconnect state: newChild=%v attempt=%d state=%v", runtime.newChild, runtime.attempt, runtime.status)
	}
}

func TestRustCandidateStrategyResumesAfterChildEpochReset(t *testing.T) {
	runtime, err := NewRustTelemetryCandidateRuntime(RustTelemetryCandidateConfig{StrategyPublicTransport: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.setStatus(driver.StateDetecting, 0, 0); err != nil {
		t.Fatal(err)
	}
	metadata := projection.Metadata{
		CanonicalVersion:  schema.CanonicalVersionV1,
		ProjectionVersion: strategyprojection.CurrentVersion,
		Epoch:             1, Sequence: 1, CapturedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := runtime.deliver(telemetryprocess.ReceivedV1{
		Strategy: &strategyprojection.SnapshotV1{Metadata: metadata},
	}); err != nil {
		t.Fatalf("first Strategy snapshot: %v", err)
	}
	runtime.handleDisconnected(errors.New("test child restart"))
	if err := runtime.deliver(telemetryprocess.ReceivedV1{
		Configuration: &telemetryprocess.ConfigurationAckV1{Epoch: 1},
	}); err != nil {
		t.Fatalf("new child configuration: %v", err)
	}
	if err := runtime.deliver(telemetryprocess.ReceivedV1{
		Strategy: &strategyprojection.SnapshotV1{Metadata: metadata},
	}); err != nil {
		t.Fatalf("Strategy snapshot after restart: %v", err)
	}
	if got := runtime.StrategyHub().Metrics().SnapshotPublications; got != 2 {
		t.Fatalf("Strategy snapshots after restart = %d", got)
	}
}

// A late Overlay consumer must reconfigure the already running Rust child;
// Wails opens Studio/Desktop/OBS after the source owner has started.
func TestRustCandidateLateOverlayConsumerLiveLMUOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TEST") != "1" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") != "1" {
		t.Skip("requires release Rust child and LMU on track")
	}
	runtime, err := NewRustTelemetryCandidateRuntime(RustTelemetryCandidateConfig{Enabled: true, Executable: executable})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 12*time.Second)
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer stopCancel()
		if err := runtime.Stop(stopCtx); err != nil {
			t.Errorf("Rust candidate Stop: %v", err)
		}
	}()
	// Join after Start to exercise the product's real demand transition.
	publisher, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	subscription, err := publisher.Subscribe(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()
	for {
		event, err := subscription.Next(ctx)
		if err != nil {
			t.Fatalf("wait for Rust Overlay snapshot: %v; source=%+v", err, runtime.SourceStatus())
		}
		if event.Kind != telemetrytransport.PublisherEventSnapshot {
			continue
		}
		var update overlayv2.UpdateV2
		if err := json.Unmarshal(event.Data, &update); err != nil {
			t.Fatal(err)
		}
		if update.Frame == nil || len(update.Frame.Standings) < 46 {
			t.Fatalf("Rust Overlay grid has fewer than 46 cars: %+v", update.Frame)
		}
		if status := runtime.SourceStatus(); !status.Available {
			t.Fatalf("Rust candidate published grid without available source: %+v", status)
		}
		break
	}
	runtime.SetPerformancePolicy(performancepolicy.Policy{Level: performancepolicy.LevelMaximum})
	for {
		event, err := subscription.Next(ctx)
		if err != nil {
			t.Fatalf("wait for Rust policy ACK and new Overlay frame: %v", err)
		}
		if event.Kind != telemetrytransport.PublisherEventSnapshot {
			continue
		}
		var update overlayv2.UpdateV2
		if err := json.Unmarshal(event.Data, &update); err != nil {
			t.Fatal(err)
		}
		if update.Frame != nil && update.Frame.Capabilities.Performance != nil && update.Frame.Capabilities.Performance.Level == 1 {
			break
		}
	}
}

func TestRustCandidateEngineerAndStrategyLiveLMUOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TEST") != "1" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") != "1" {
		t.Skip("requires release Rust child and LMU on track")
	}
	probe := &rustCandidateEngineerProbe{
		observations: make(chan engineerprojection.ObservationSnapshotV1, 1),
		facts:        make(chan engineerprojection.FactEnvelopeV1, 1),
	}
	runtime, err := NewRustTelemetryCandidateRuntime(RustTelemetryCandidateConfig{
		Enabled: true, Executable: executable, Engineer: probe, StrategyPublicTransport: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 12*time.Second)
	defer cancel()
	subscription, err := runtime.StrategyHub().Subscribe(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer stopCancel()
		if err := runtime.Stop(stopCtx); err != nil {
			t.Errorf("Rust candidate Stop: %v", err)
		}
	}()
	select {
	case observation := <-probe.observations:
		if len(observation.Vehicles) < 46 || !observation.Context.Complete() {
			t.Fatalf("Engineer observation incomplete: vehicles=%d context=%+v", len(observation.Vehicles), observation.Context)
		}
	case <-ctx.Done():
		t.Fatalf("no Engineer observation: %v; source=%+v", ctx.Err(), runtime.SourceStatus())
	}
	select {
	case fact := <-probe.facts:
		if fact.Fact.Sequence == 0 {
			t.Fatal("Rust Engineer fact lost sequence")
		}
	case <-ctx.Done():
		t.Fatalf("no Engineer fact: %v", ctx.Err())
	}
	for {
		event, err := subscription.Next(ctx)
		if err != nil {
			t.Fatalf("no Strategy snapshot: %v", err)
		}
		if event.Kind == telemetrytransport.EventSnapshot {
			break
		}
	}
	if got := probe.rejections.Load(); got != 0 {
		t.Fatalf("Rust Engineer rejected %d observations/facts before source became available", got)
	}
}

func TestRustCandidateRecoversAfterFactRejectionLiveLMUOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TEST") != "1" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") != "1" {
		t.Skip("requires release Rust child and LMU on track")
	}
	probe := &rustCandidateEngineerProbe{
		observations: make(chan engineerprojection.ObservationSnapshotV1, 1),
		facts:        make(chan engineerprojection.FactEnvelopeV1, 1),
		rejected:     make(chan struct{}),
	}
	probe.rejectFact.Store(true)
	runtime, err := NewRustTelemetryCandidateRuntime(RustTelemetryCandidateConfig{
		Enabled: true, Executable: executable, Engineer: probe, StrategyPublicTransport: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
	defer cancel()
	subscription, err := runtime.StrategyHub().Subscribe(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer stopCancel()
		if err := runtime.Stop(stopCtx); err != nil {
			t.Errorf("Rust candidate Stop: %v", err)
		}
	}()
	select {
	case <-probe.rejected:
	case <-ctx.Done():
		t.Fatalf("first Engineer fact was not rejected: %v", ctx.Err())
	}
	for {
		event, err := subscription.Next(ctx)
		if err != nil {
			t.Fatalf("Strategy after forced fact rejection: %v; source=%+v", err, runtime.SourceStatus())
		}
		if event.Kind != telemetrytransport.EventSnapshot {
			continue
		}
		var snapshot telemetrytransport.Envelope
		if err := json.Unmarshal(event.Data, &snapshot); err != nil {
			t.Fatal(err)
		}
		if snapshot.Epoch > 0 && runtime.SourceStatus().ReconnectAttempt > 0 {
			break
		}
	}
	if runtime.SourceStatus().ReconnectAttempt == 0 {
		t.Fatal("Rust child restarted without an observable reconnect attempt")
	}
}
