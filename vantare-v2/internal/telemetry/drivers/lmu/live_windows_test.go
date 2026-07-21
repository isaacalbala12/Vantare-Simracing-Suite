//go:build windows

package lmu

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
)

type liveSink struct {
	cancel context.CancelFunc
	value  Observation
}

func (sink *liveSink) WriteObservation(_ context.Context, value Observation) error {
	sink.value = value
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
	sink := &liveSink{cancel: cancel}
	err = New().Run(ctx, sink)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Run: %v", err)
	}
	if !strings.Contains(sink.value.Fingerprint, "build="+supportedLMUVersion) {
		t.Fatalf("fingerprint = %q", sink.value.Fingerprint)
	}
	if sink.value.Compatibility != CompatibilityKnown {
		t.Fatalf("compatibility = %v fingerprint = %q", sink.value.Compatibility, sink.value.Fingerprint)
	}
}
