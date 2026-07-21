//go:build windows

package lmu

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
)

type liveSink struct {
	cancel context.CancelFunc
	driver *Driver
	value  Observation
	state  drivercontract.State
}

func (sink *liveSink) WriteObservation(_ context.Context, value Observation) error {
	sink.value = value
	sink.state = sink.driver.RuntimeSnapshot().State
	sink.cancel()
	return nil
}

func TestLiveLMUSharedMemoryOptIn(t *testing.T) {
	if os.Getenv("LMU_LIVE_SHARED_MEMORY_TEST") != "1" {
		t.Skip("set LMU_LIVE_SHARED_MEMORY_TEST=1 with LMU open to verify the real mapping")
	}
	build, err := readLMUBuildEvidence()
	if err != nil {
		t.Fatalf("read normalized LMU build evidence: %v", err)
	}
	version, supported := build.supportedVersion()
	t.Logf("normalized LMU build=%q supported=%v", version, supported)
	ctx, cancel := context.WithCancel(t.Context())
	driver := New()
	sink := &liveSink{cancel: cancel, driver: driver}
	err = driver.Run(ctx, sink)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Run: %v", err)
	}
	if !strings.Contains(sink.value.Fingerprint, "build="+supportedLMUVersion) {
		t.Fatalf("fingerprint = %q", sink.value.Fingerprint)
	}
	if sink.value.Compatibility != CompatibilityKnown {
		t.Fatalf("compatibility = %v fingerprint = %q", sink.value.Compatibility, sink.value.Fingerprint)
	}
	if sink.state != drivercontract.StateLive {
		t.Fatalf("runtime state = %v fingerprint = %q", sink.state, sink.value.Fingerprint)
	}
	player, present := sink.value.PlayerPresent.Value()
	if !present {
		t.Fatal("known observation omitted player presence")
	}
	if !player {
		assertNoFastTelemetry(t, sink.value)
	}
	t.Logf("runtime state=%q player-present=%v fingerprint=%q", sink.state, player, sink.value.Fingerprint)
}
