//go:build windows

package lmu

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"testing"
	"time"
	"unsafe"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	telemetryengine "github.com/vantare/overlays/v2/internal/telemetry/engine"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"golang.org/x/sys/windows"
)

// TestGoBenchSourceOptIn proves that the Go driver can consume the same
// private LMU47 source as the Rust diagnostic. This is G0 route coverage,
// not the paired G0/G1/R performance gate.
func TestGoBenchSourceOptIn(t *testing.T) {
	producerBinary := os.Getenv("VANTARE_TELEMETRY_BENCH_SOURCE_EXE")
	corpus := os.Getenv("LMU_HIGH_RATE_CORPUS")
	if producerBinary == "" || corpus == "" {
		t.Skip("requires isolated source producer and audited LMU47 corpus")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Second)
	defer cancel()
	producer := exec.CommandContext(ctx, producerBinary, "-corpus", corpus)
	stdin, err := producer.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := producer.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	var stderr bytes.Buffer
	producer.Stderr = &stderr
	if err := producer.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cancel()
		if producer.ProcessState == nil {
			_ = producer.Wait()
		}
	}()
	reader := bufio.NewReader(stdout)
	readyLine, err := reader.ReadBytes('\n')
	if err != nil {
		t.Fatalf("source readiness: %v: %s", err, stderr.String())
	}
	var ready struct {
		Mapping string `json:"mapping"`
		Port    int    `json:"port"`
		Events  int    `json:"events"`
	}
	if err := json.Unmarshal(readyLine, &ready); err != nil || ready.Events != 3839 ||
		ready.Port < 1 || ready.Port > 65535 || !strings.HasPrefix(ready.Mapping, "vantare-telemetry-bench-") {
		t.Fatalf("invalid source readiness: %s: %v", readyLine, err)
	}

	goDriver := newDriver(config{
		open: func() (memoryReader, error) { return openBenchMapping(ready.Mapping) },
		build: func() (BuildEvidence, error) {
			return BuildEvidence{FileVersion: "1.4.2.0", ProductVersion: "1.4.2.0"}, nil
		},
		rest: &restConfig{baseURL: fmt.Sprintf("http://127.0.0.1:%d", ready.Port), client: newRESTHTTPClient()},
		logf: func(string, ...any) {},
	})
	engine := telemetryengine.New(telemetrycore.NewReducer(),
		telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{Now: time.Now}),
		derive.NewPipeline(derive.Config{}))
	projector := overlayv2.NewCachedProjector(overlayv2.DefaultSectionCadence())
	rafCap := 40
	overlaySource := overlayv2.SourceContextV2{
		State: "live", DescriptorCapabilities: []string{"shared-memory", "rest"},
		Modes:       overlayv2.CapabilityModesV2{Spatial: []string{"xyz"}, Delta: []string{"personal-best"}, Standings: overlayv2.ModeOfficial, Gaps: overlayv2.ModeReconstructed},
		Performance: overlayv2.PerformanceV2{Level: 3, Mode: overlayv2.PerformanceModeManual, Effects: overlayv2.PerformanceEffectsNoBlur, RafCap: &rafCap, WidgetHz: map[string]json.RawMessage{"pedals": []byte("40")}, SourceHz: 60},
	}
	preferences := overlayv2.DefaultPreferencesV2()
	preferences.Speed = overlayv2.SpeedUnitKPH
	var batches, overlays, engineers, strategies, facts int
	batchSink := telemetrycore.BatchSinkFunc(func(ctx context.Context, batch telemetrycore.Batch) error {
		result, err := engine.Apply(ctx, batch)
		if err != nil {
			return err
		}
		state, ok := result.State.Value()
		if !ok {
			return errors.New("Go benchmark state missing")
		}
		overlaySource.Modes = corpusCapabilityModes(state)
		update, err := projector.Project(result.State, overlaySource, preferences, 1, time.Now())
		if err != nil {
			return fmt.Errorf("Go benchmark Overlay projection: %w", err)
		}
		if update.Frame == nil || len(update.Frame.Standings) < 46 {
			return errors.New("Go benchmark Overlay missing cars")
		}
		engineerSnapshot, err := engineer.ProjectV1(result.State)
		if err != nil {
			return fmt.Errorf("Go benchmark Engineer projection: %w", err)
		}
		if len(engineerSnapshot.Vehicles) < 46 {
			return errors.New("Go benchmark Engineer missing cars")
		}
		strategySnapshot, err := strategy.ProjectV1(result.State)
		if err != nil {
			return fmt.Errorf("Go benchmark Strategy projection: %w", err)
		}
		if strategySnapshot.Player.ID == "" {
			return errors.New("Go benchmark Strategy missing player")
		}
		batches++
		overlays++
		engineers++
		strategies++
		facts += len(result.Facts)
		return nil
	})
	sink, err := NewObservationBatchSink(NewBatchMapper(), batchSink)
	if err != nil {
		t.Fatal(err)
	}
	runCtx, stopDriver := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { done <- goDriver.Run(runCtx, sink) }()
	if _, err := io.WriteString(stdin, "start\n"); err != nil {
		stopDriver()
		t.Fatal(err)
	}
	started := time.Now()
	cpuStart := benchGoProcessCPU(t)
	timer := time.NewTimer(61 * time.Second)
	defer timer.Stop()
	select {
	case err := <-done:
		t.Fatalf("Go driver stopped during LMU47 replay: %v", err)
	case <-timer.C:
	}
	stopDriver()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Go driver shutdown: %v", err)
	}
	cpu := benchGoProcessCPU(t) - cpuStart
	completed, err := reader.ReadBytes('\n')
	if err != nil {
		t.Fatalf("source completion: %v: %s", err, stderr.String())
	}
	var counts struct {
		SHM  int   `json:"shm"`
		REST int   `json:"rest"`
		Wall int64 `json:"wallMs"`
	}
	if err := json.Unmarshal(completed, &counts); err != nil || counts.SHM != 3600 || counts.REST != 239 || counts.Wall < 59000 {
		t.Fatalf("incomplete source: %s: %v", completed, err)
	}
	if _, err := io.WriteString(stdin, "stop\n"); err != nil {
		t.Fatal(err)
	}
	if err := stdin.Close(); err != nil {
		t.Fatal(err)
	}
	if err := producer.Wait(); err != nil {
		t.Fatalf("source exit: %v: %s", err, stderr.String())
	}
	if batches < 3000 || overlays != batches || engineers != batches || strategies != batches || facts == 0 {
		t.Fatalf("incomplete Go pipeline: batches=%d products=%d/%d/%d facts=%d", batches, overlays, engineers, strategies, facts)
	}
	t.Logf("LMU47 isolated Go route: batches=%d products=%d/%d/%d facts=%d wall=%s CPU=%s", batches, overlays, engineers, strategies, facts, time.Since(started), cpu)
}

func openBenchMapping(name string) (memoryReader, error) {
	wide, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return nil, err
	}
	api := systemWindowsAPI()
	api.open = func(*uint16) (uintptr, error) {
		result, _, callErr := openFileMappingW.Call(fileMapRead, 0, uintptr(unsafe.Pointer(wide)))
		return result, callErr
	}
	return openSharedMemoryWithAPI(api, mappedBytes)
}

func benchGoProcessCPU(t *testing.T) time.Duration {
	t.Helper()
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(windows.CurrentProcess(), &created, &exited, &kernel, &user); err != nil {
		t.Fatal(err)
	}
	return time.Duration(kernel.Nanoseconds() + user.Nanoseconds())
}
