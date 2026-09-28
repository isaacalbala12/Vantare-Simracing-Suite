//go:build windows

package telemetryprocess

import (
	"context"
	"encoding/hex"
	"errors"
	"os"
	"testing"
	"time"

	"golang.org/x/sys/windows"
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

func TestRustChildReadDeadlineWithoutStop(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" {
		t.Skip("set VANTARE_TELEMETRY_RUST_TEST_HELPER after cargo build")
	}
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	child, err := startInJob(executable, "--harness-pipe", pipe.name,
		"--harness-nonce", hex.EncodeToString(pipe.nonce[:]))
	if err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	defer child.close()
	if err := pipe.acceptChild(context.Background(), child.pid); err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	file := os.NewFile(uintptr(pipe.handle), "telemetry-timeout-pipe")
	defer file.Close()
	if err := file.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatal(err)
	}
	frame, err := ReadFrame(file)
	if err != nil {
		t.Fatalf("read handshake: %v", err)
	}
	if err := verifyHandshake(frame, pipe.nonce, "0.1.0"); err != nil {
		t.Fatal(err)
	}
	// With the server still open and no Stop, the Rust overlapped read must
	// cancel and exit itself; job teardown must not be what ends this child.
	result, err := windows.WaitForSingleObject(child.process, 4_000)
	if err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("child did not honor read deadline: wait=%d error=%v", result, err)
	}
	var exitCode uint32
	if err := windows.GetExitCodeProcess(child.process, &exitCode); err != nil || exitCode == 0 {
		t.Fatalf("child timeout exit code=%d error=%v", exitCode, err)
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
