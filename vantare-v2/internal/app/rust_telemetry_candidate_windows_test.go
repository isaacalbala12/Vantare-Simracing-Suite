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
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

type rustCandidateEngineerProbe struct {
	observations chan engineerprojection.ObservationSnapshotV1
	facts        chan engineerprojection.FactEnvelopeV1
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
	select {
	case probe.facts <- value:
	default:
	}
	return nil
}
func (*rustCandidateEngineerProbe) ConsumeFactBoundary(*engineerprojection.FactResyncRequiredError) error {
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
