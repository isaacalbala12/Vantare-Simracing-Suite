//go:build windows

package telemetryprocess

import (
	"context"
	"errors"
	"os"
	"testing"
)

// Run with VANTARE_TELEMETRY_RUST_TEST_HELPER pointing to the release binary.
// This is a separate cross-language gate after cargo build, not part of Go's
// normal unit suite, which must also run when Rust is unavailable.
func TestRustChildPipeHandshakeAndStop(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" {
		t.Skip("set VANTARE_TELEMETRY_RUST_TEST_HELPER after cargo build for the cross-language gate")
	}
	session, err := startHarness(context.Background(), executable, "0.1.0")
	if err != nil {
		t.Fatal(err)
	}
	if err := session.close(); err != nil {
		t.Fatal(err)
	}
	if err := session.close(); err != nil {
		t.Fatalf("second close: %v", err)
	}
}

func TestRustChildRejectsWrongBuildVersion(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" {
		t.Skip("set VANTARE_TELEMETRY_RUST_TEST_HELPER after cargo build for the cross-language gate")
	}
	session, err := startHarness(context.Background(), executable, "invalid-build")
	if session != nil || !errors.Is(err, ErrInvalidHandshake) {
		t.Fatalf("wrong build accepted: session=%v error=%v", session, err)
	}
}

func TestHarnessCanceledBeforeLaunch(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if session, err := startHarness(ctx, "", ""); session != nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled launch = (%v, %v)", session, err)
	}
}
