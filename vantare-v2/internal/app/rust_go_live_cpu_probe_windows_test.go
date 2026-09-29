//go:build windows

package app

import (
	"context"
	"os"
	"sync/atomic"
	"testing"
	"time"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"golang.org/x/sys/windows"
)

// This is a live diagnostic with equal product demand, not the G0/G1/R gate:
// it does not replay the immutable corpus or measure latency and RSS.
func TestRustGoLiveCPUProbeOptIn(t *testing.T) {
	arm := os.Getenv("VANTARE_TELEMETRY_CPU_PROBE_ARM")
	if arm != "go" && arm != "rust" && arm != "rust-binary" {
		t.Skip("set VANTARE_TELEMETRY_CPU_PROBE_ARM to go, rust or rust-binary with LMU on track")
	}
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if arm != "go" && executable == "" {
		t.Fatal("set VANTARE_TELEMETRY_RUST_TEST_HELPER")
	}
	probe := new(cpuProbeEngineer)
	policy := performancepolicy.Policy{Mode: performancepolicy.ModeLevel, Level: performancepolicy.LevelMaximum}
	var runtime interface {
		Start(context.Context) error
		Stop(context.Context) error
		SourceStatus() driver.SourceStatus
		OverlayV2Publishers() *telemetrytransport.PublisherRegistry
		StrategyHub() *telemetrytransport.Hub
	}
	var err error
	if arm == "go" {
		runtime, err = NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
			Enabled: true, Engineer: probe, StrategyPublicTransport: true, PerformancePolicy: policy,
		})
	} else {
		runtime, err = NewRustTelemetryCandidateRuntime(RustTelemetryCandidateConfig{
			Enabled: true, Executable: executable, Engineer: probe, StrategyPublicTransport: true, PerformancePolicy: policy,
			EngineerBinaryDiagnostic: arm == "rust-binary",
		})
	}
	if err != nil {
		t.Fatal(err)
	}
	publisher, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	ctx, cancel := context.WithTimeout(t.Context(), 40*time.Second)
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer stopCancel()
		if err := runtime.Stop(stopCtx); err != nil {
			t.Errorf("stop %s: %v", arm, err)
		}
	}()
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for publisher.Metrics().SnapshotPublications == 0 || probe.observations.Load() == 0 || runtime.StrategyHub().Metrics().SnapshotPublications == 0 {
		select {
		case <-ticker.C:
		case <-ctx.Done():
			t.Fatalf("%s did not deliver all three products: %v; source=%+v", arm, ctx.Err(), runtime.SourceStatus())
		}
	}
	childPID := uint32(0)
	if arm != "go" {
		childPID, err = ownedRustChildPID(executable)
		if err != nil {
			t.Fatal(err)
		}
	}
	initialCPU, err := processCPU(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	initialChildCPU := time.Duration(0)
	if childPID != 0 {
		initialChildCPU, err = processCPU(int(childPID))
		if err != nil {
			t.Fatal(err)
		}
	}
	overlays := publisher.Metrics().SnapshotPublications
	engineers := probe.observations.Load()
	strategies := runtime.StrategyHub().Metrics().SnapshotPublications
	timer := time.NewTimer(15 * time.Second)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-ctx.Done():
		t.Fatalf("%s measurement interrupted: %v", arm, ctx.Err())
	}
	finalCPU, err := processCPU(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	finalChildCPU := time.Duration(0)
	if childPID != 0 {
		finalChildCPU, err = processCPU(int(childPID))
		if err != nil {
			t.Fatal(err)
		}
	}
	overlays = publisher.Metrics().SnapshotPublications - overlays
	engineers = probe.observations.Load() - engineers
	strategies = runtime.StrategyHub().Metrics().SnapshotPublications - strategies
	if overlays == 0 || engineers == 0 || strategies == 0 || probe.vehicles.Load() < 46 || runtime.SourceStatus().ReconnectAttempt != 0 {
		t.Fatalf("%s incomplete product work: overlay=%d engineer=%d strategy=%d vehicles=%d source=%+v", arm, overlays, engineers, strategies, probe.vehicles.Load(), runtime.SourceStatus())
	}
	t.Logf("DIAGNOSTIC arm=%s hostCPU=%s childCPU=%s totalCPU=%s overlay=%d engineer=%d strategy=%d vehicles=%d facts=%d", arm,
		finalCPU-initialCPU, finalChildCPU-initialChildCPU, finalCPU-initialCPU+finalChildCPU-initialChildCPU,
		overlays, engineers, strategies, probe.vehicles.Load(), probe.facts.Load())
}

type cpuProbeEngineer struct {
	observations atomic.Uint64
	vehicles     atomic.Int64
	facts        atomic.Uint64
}

func (*cpuProbeEngineer) ConsumeSourceStatus(engineerprojection.SourceStatusV1) error { return nil }
func (probe *cpuProbeEngineer) ConsumeObservation(value engineerprojection.ObservationSnapshotV1) error {
	probe.vehicles.Store(int64(len(value.Vehicles)))
	probe.observations.Add(1)
	return nil
}
func (probe *cpuProbeEngineer) ConsumeFact(engineerprojection.FactEnvelopeV1) error {
	probe.facts.Add(1)
	return nil
}
func (*cpuProbeEngineer) ConsumeFactBoundary(*engineerprojection.FactResyncRequiredError) error {
	return nil
}

func processCPU(pid int) (time.Duration, error) {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return 0, err
	}
	defer windows.CloseHandle(handle)
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
		return 0, err
	}
	ticks := func(value windows.Filetime) uint64 {
		return uint64(value.HighDateTime)<<32 | uint64(value.LowDateTime)
	}
	return time.Duration((ticks(kernel) + ticks(user)) * 100), nil
}
