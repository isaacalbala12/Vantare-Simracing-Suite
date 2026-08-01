package ops

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

func fixedSourceStatus(status driver.SourceStatus) func() driver.SourceStatus {
	return func() driver.SourceStatus { return status }
}

func TestDefaultSamplerReturnsProcessMetrics(t *testing.T) {
	sampler := NewRuntimeSampler(fixedSourceStatus(driver.SourceStatus{
		Kind: "lmu", Name: "Le Mans Ultimate", Live: true, Available: true, State: "live",
	}))

	snapshot := sampler.Sample()

	if snapshot.Timestamp.IsZero() {
		t.Fatal("expected timestamp")
	}
	if snapshot.App.MemoryMB <= 0 {
		t.Fatalf("expected positive memory usage, got %.2f", snapshot.App.MemoryMB)
	}
	if snapshot.App.Goroutines <= 0 {
		t.Fatalf("expected positive goroutine count, got %d", snapshot.App.Goroutines)
	}
	if snapshot.Source.Kind != "lmu" {
		t.Fatalf("expected LMU source, got %q", snapshot.Source.Kind)
	}
}

func TestDefaultIntervalIsOneSecond(t *testing.T) {
	if DefaultInterval != time.Second {
		t.Fatalf("expected 1s interval, got %s", DefaultInterval)
	}
}

func TestMetricsSnapshotDoesNotExposeFakeSystemMetrics(t *testing.T) {
	sampler := NewRuntimeSampler(fixedSourceStatus(driver.SourceStatus{
		Kind: "lmu", Name: "Le Mans Ultimate", Live: true, Available: true, State: "live",
	}))

	raw, err := json.Marshal(sampler.Sample())
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	if _, ok := payload["system"]; ok {
		t.Fatal("did not expect system metrics until real system memory is measured")
	}
}
func TestSamplerCPUDisabledReturnsNil(t *testing.T) {
	s := NewRuntimeSampler(fixedSourceStatus(driver.SourceStatus{Kind: "lmu", Name: "Le Mans Ultimate"}))
	snapshot := s.Sample()
	if snapshot.App.CPUPercent != nil {
		t.Fatal("expected nil CPUPercent when CPU sampling disabled")
	}
}

func TestSamplerCPUEnabledDoesNotPanic(t *testing.T) {
	s := NewRuntimeSampler(fixedSourceStatus(driver.SourceStatus{Kind: "lmu", Name: "Le Mans Ultimate"}))
	// Enable — starts a background goroutine with a 2s ticker.
	// We can't guarantee the value in a short test, but we verify no panic
	// and that the goroutine starts cleanly.
	s.SetCPUEnabled(true)

	// Give goroutine time to start and establish baseline with Percent(0)
	time.Sleep(50 * time.Millisecond)

	snapshot := s.Sample()
	// CPUPercent may still be nil if the ticker hasn't fired yet — that's OK.
	// The test simply verifies no crash, no deadlock.
	if snapshot.App.MemoryMB <= 0 {
		t.Fatal("expected memory to still be reported")
	}

	// Clean up
	s.SetCPUEnabled(false)
}
