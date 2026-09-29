//go:build windows

package app

import (
	"context"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/shirou/gopsutil/v4/process"
	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"golang.org/x/sys/windows"
)

// This is a live diagnostic with equal product demand, not the G0/G1/R gate:
// it does not replay the immutable corpus or hold cadence equal across arms.
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
	peakRSS, err := totalProcessRSS(os.Getpid(), int(childPID))
	if err != nil {
		t.Fatal(err)
	}
	overlays := publisher.Metrics().SnapshotPublications
	strategies := runtime.StrategyHub().Metrics().SnapshotPublications
	latencyBase := probe.latencyCount()
	timer := time.NewTimer(15 * time.Second)
	defer timer.Stop()
	usageTicker := time.NewTicker(250 * time.Millisecond)
	defer usageTicker.Stop()
measurement:
	for {
		select {
		case <-timer.C:
			break measurement
		case <-usageTicker.C:
			rss, usageErr := totalProcessRSS(os.Getpid(), int(childPID))
			if usageErr != nil {
				t.Fatalf("%s RSS sample: %v", arm, usageErr)
			}
			if rss > peakRSS {
				peakRSS = rss
			}
		case <-ctx.Done():
			t.Fatalf("%s measurement interrupted: %v", arm, ctx.Err())
		}
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
	strategies = runtime.StrategyHub().Metrics().SnapshotPublications - strategies
	p99, latencyCount := probe.p99Since(latencyBase)
	engineers := uint64(latencyCount)
	if overlays == 0 || engineers == 0 || strategies == 0 || probe.vehicles.Load() < 46 || runtime.SourceStatus().ReconnectAttempt != 0 {
		t.Fatalf("%s incomplete product work: overlay=%d engineer=%d strategy=%d vehicles=%d source=%+v", arm, overlays, engineers, strategies, probe.vehicles.Load(), runtime.SourceStatus())
	}
	if probe.invalidCapture.Load() != 0 {
		t.Fatalf("%s invalid Engineer capture timestamps: %d", arm, probe.invalidCapture.Load())
	}
	t.Logf("DIAGNOSTIC arm=%s hostCPU=%s childCPU=%s totalCPU=%s peakRSS=%d engineerP99=%s overlay=%d engineer=%d strategy=%d vehicles=%d facts=%d", arm,
		finalCPU-initialCPU, finalChildCPU-initialChildCPU, finalCPU-initialCPU+finalChildCPU-initialChildCPU,
		peakRSS, p99,
		overlays, engineers, strategies, probe.vehicles.Load(), probe.facts.Load())
}

type cpuProbeEngineer struct {
	observations   atomic.Uint64
	vehicles       atomic.Int64
	facts          atomic.Uint64
	invalidCapture atomic.Uint64
	latencyMu      sync.Mutex
	latencies      []time.Duration
}

func (*cpuProbeEngineer) ConsumeSourceStatus(engineerprojection.SourceStatusV1) error { return nil }
func (probe *cpuProbeEngineer) ConsumeObservation(value engineerprojection.ObservationSnapshotV1) error {
	captured, err := time.Parse(time.RFC3339Nano, value.CapturedAt)
	if err != nil {
		probe.invalidCapture.Add(1)
	} else if latency := time.Since(captured); latency < 0 {
		probe.invalidCapture.Add(1)
	} else {
		probe.latencyMu.Lock()
		probe.latencies = append(probe.latencies, latency)
		probe.latencyMu.Unlock()
	}
	probe.vehicles.Store(int64(len(value.Vehicles)))
	probe.observations.Add(1)
	return nil
}

func (probe *cpuProbeEngineer) latencyCount() int {
	probe.latencyMu.Lock()
	defer probe.latencyMu.Unlock()
	return len(probe.latencies)
}

func (probe *cpuProbeEngineer) p99Since(start int) (time.Duration, int) {
	probe.latencyMu.Lock()
	values := append([]time.Duration(nil), probe.latencies[start:]...)
	probe.latencyMu.Unlock()
	if len(values) == 0 {
		return 0, 0
	}
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	return values[(99*len(values)+99)/100-1], len(values)
}

func totalProcessRSS(hostPID, childPID int) (uint64, error) {
	read := func(pid int) (uint64, error) {
		owner, err := process.NewProcess(int32(pid))
		if err != nil {
			return 0, err
		}
		memory, err := owner.MemoryInfo()
		if err != nil {
			return 0, err
		}
		return memory.RSS, nil
	}
	host, err := read(hostPID)
	if err != nil || childPID == 0 {
		return host, err
	}
	child, err := read(childPID)
	return host + child, err
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
