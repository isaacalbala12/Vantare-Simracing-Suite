package license

import (
	"errors"
	"testing"
)

func TestTypedErrors(t *testing.T) {
	if !errors.Is(ErrNoCache, ErrNoCache) {
		t.Fatal("ErrNoCache must be itself")
	}
	if !errors.Is(ErrValidationFailed, ErrValidationFailed) {
		t.Fatal("ErrValidationFailed must be itself")
	}
	if !errors.Is(ErrDeviceLimit, ErrDeviceLimit) {
		t.Fatal("ErrDeviceLimit must be itself")
	}
	if !errors.Is(ErrMissingSession, ErrMissingSession) {
		t.Fatal("ErrMissingSession must be itself")
	}
	if errors.Is(ErrNoCache, ErrValidationFailed) {
		t.Fatal("ErrNoCache must not match ErrValidationFailed")
	}
}
