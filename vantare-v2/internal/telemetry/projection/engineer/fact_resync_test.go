package engineer

import (
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
)

func TestFactResyncRequiredErrorPortedToEngineerPort(t *testing.T) {
	t.Parallel()

	retention := newBoundedFactRetention(2)
	for sequence := core.FactSequence(1); sequence <= 3; sequence++ {
		retention.append(FactEnvelopeV1{Fact: FactV1{Sequence: sequence}})
	}

	err := retention.requireResyncAfter(0)
	if !errors.Is(err, ErrFactResyncRequired) {
		t.Fatalf("requireResyncAfter() error = %v, want %v", err, ErrFactResyncRequired)
	}
	var gap *FactResyncRequiredError
	if !errors.As(err, &gap) || gap.Previous != 0 || gap.Next != 2 {
		t.Fatalf("typed gap = %#v, want previous 0 and next 2", gap)
	}
	if err := retention.requireResyncAfter(1); err != nil {
		t.Fatalf("requireResyncAfter(retained predecessor) error = %v", err)
	}
}
