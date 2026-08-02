package engineer

import (
	"errors"
	"testing"
)

func TestSourceStatusAvailabilityIsExplicit(t *testing.T) {
	tests := []struct {
		state     SourceState
		available bool
	}{
		{SourceStopped, false},
		{SourceDetecting, false},
		{SourceConnecting, false},
		{SourceLive, true},
		{SourceDegraded, true},
		{SourceStale, false},
		{SourceError, false},
		{SourceStopping, false},
	}
	for _, test := range tests {
		status, err := NewSourceStatusV1(test.state, 0)
		if err != nil {
			t.Fatalf("NewSourceStatusV1(%q): %v", test.state, err)
		}
		if status.State.Available() != test.available {
			t.Fatalf("state %q available = %v, want %v", test.state, status.State.Available(), test.available)
		}
	}
	if _, err := NewSourceStatusV1("unknown", 0); !errors.Is(err, ErrInvalidSourceStatus) {
		t.Fatalf("unknown state error = %v", err)
	}
	if _, err := NewSourceStatusV1(SourceLive, -1); !errors.Is(err, ErrInvalidSourceStatus) {
		t.Fatalf("negative reconnect attempt error = %v", err)
	}
}
