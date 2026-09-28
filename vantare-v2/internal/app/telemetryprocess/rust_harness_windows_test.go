//go:build windows

package telemetryprocess

import (
	"context"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

// Opt-in physical gate: the installed LMU must be running on the exact pinned
// build. This reads the Rust candidate, without selecting it for Wails users.
func TestRustCandidateLiveLMUOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TEST") != "1" {
		t.Skip("requires release Rust child and running pinned LMU")
	}
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	child, err := startInJob(executable, "--candidate-pipe", pipe.name,
		"--candidate-nonce", hex.EncodeToString(pipe.nonce[:]))
	if err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	defer child.close()
	if err := pipe.acceptChild(context.Background(), child.pid); err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	file := os.NewFile(uintptr(pipe.handle), "telemetry-live-candidate-pipe")
	defer file.Close()
	if err := file.SetDeadline(time.Now().Add(8 * time.Second)); err != nil {
		t.Fatal(err)
	}
	handshake, err := ReadFrame(file)
	if err != nil {
		t.Fatal(err)
	}
	if err := verifyHandshake(handshake, pipe.nonce, "0.1.0"); err != nil {
		t.Fatal(err)
	}
	wire, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "configuration-frame-go-v1.bin"))
	if err != nil {
		t.Fatal(err)
	}
	oracle, err := DecodeFrame(wire)
	if err != nil {
		t.Fatal(err)
	}
	var configuration ConfigurationV1
	if err := json.Unmarshal(oracle.Payload, &configuration); err != nil {
		t.Fatal(err)
	}
	receiver := NewReceiver()
	configured, err := receiver.Configure(configuration)
	if err != nil {
		t.Fatal(err)
	}
	if err := WriteFrame(file, configured); err != nil {
		t.Fatal(err)
	}
	var ack, statuses, overlays, engineers int
	track := os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") == "1"
	for statuses < 2 || track && (ack == 0 || overlays == 0 || engineers == 0) {
		frame, err := ReadFrame(file)
		if err != nil {
			t.Fatalf("candidate frame after ack=%d status=%d overlay=%d engineer=%d: %v", ack, statuses, overlays, engineers, err)
		}
		event, err := receiver.Accept(frame)
		if err != nil {
			t.Fatalf("candidate frame kind=%d: %v", frame.Kind, err)
		}
		if event.Configuration != nil {
			ack++
		}
		if event.Status != nil {
			if !track && event.Status.State != "connecting" {
				t.Fatalf("menu status = %s", event.Status.State)
			}
			if track && event.Status.State != "live" {
				t.Fatalf("track status = %s", event.Status.State)
			}
			statuses++
		}
		if event.Overlay != nil {
			if track && event.Overlay.Frame == nil {
				t.Fatal("track overlay has no frame")
			}
			if track && len(event.Overlay.Frame.Standings) != 43 {
				t.Fatalf("track overlay standings = %d", len(event.Overlay.Frame.Standings))
			}
			overlays++
		}
		if event.Engineer != nil {
			if track && len(event.Engineer.Vehicles) != 43 {
				t.Fatalf("track engineer vehicles = %d", len(event.Engineer.Vehicles))
			}
			engineers++
		}
		if event.FactACK != nil {
			if err := WriteFrame(file, *event.FactACK); err != nil {
				t.Fatal(err)
			}
		}
	}
	if !track && (ack != 0 || overlays != 0 || engineers != 0) {
		t.Fatalf("menu published a session: ack=%d overlay=%d engineer=%d", ack, overlays, engineers)
	}
	if track {
		next := configuration
		next.Revision++
		next.Consumers = ConsumersV1{Strategy: true}
		nextFrame, err := receiver.Configure(next)
		if err != nil {
			t.Fatal(err)
		}
		if err := WriteFrame(file, nextFrame); err != nil {
			t.Fatal(err)
		}
		var nextACK, strategy int
		for nextACK == 0 || strategy == 0 {
			frame, err := ReadFrame(file)
			if err != nil {
				t.Fatalf("live Strategy reconfiguration: ack=%d strategy=%d: %v", nextACK, strategy, err)
			}
			event, err := receiver.Accept(frame)
			if err != nil {
				t.Fatalf("live Strategy frame kind=%d: %v", frame.Kind, err)
			}
			if event.Configuration != nil {
				if event.Configuration.Revision != next.Revision {
					t.Fatalf("reconfiguration revision=%d want=%d", event.Configuration.Revision, next.Revision)
				}
				nextACK++
			}
			if event.Strategy != nil {
				if nextACK == 0 || event.Strategy.Player.ID == "" || event.Strategy.TrackName.Value == "" {
					t.Fatal("Strategy published without ACK, player identity or track")
				}
				strategy++
			}
			if nextACK != 0 && (event.Overlay != nil || event.Engineer != nil) {
				t.Fatal("withdrawn product arrived after Strategy ACK")
			}
			if event.FactACK != nil {
				if err := WriteFrame(file, *event.FactACK); err != nil {
					t.Fatal(err)
				}
			}
		}
		t.Logf("physical Strategy-only reconfiguration: ACK=%d Strategy=%d", nextACK, strategy)
	}
	if err := WriteFrame(file, Frame{Kind: KindStop}); err != nil {
		t.Fatal(err)
	}
	for {
		frame, err := ReadFrame(file)
		if err != nil {
			t.Fatalf("candidate Stop: %v", err)
		}
		event, err := receiver.Accept(frame)
		if err != nil {
			t.Fatal(err)
		}
		if event.Stopped {
			break
		}
	}
	result, err := windows.WaitForSingleObject(child.process, 2_000)
	if err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("candidate did not exit cleanly: wait=%d error=%v", result, err)
	}
	var exitCode uint32
	if err := windows.GetExitCodeProcess(child.process, &exitCode); err != nil || exitCode != 0 {
		t.Fatalf("candidate exit=%d error=%v", exitCode, err)
	}
	t.Logf("physical Rust candidate: ACK=%d status=%d overlay=%d engineer=%d, clean Stop", ack, statuses, overlays, engineers)
}

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

func TestRustCandidateRejectsOversizedHeaderBeforePayload(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" {
		t.Skip("set VANTARE_TELEMETRY_RUST_TEST_HELPER after cargo build")
	}
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	child, err := startInJob(executable, "--candidate-pipe", pipe.name,
		"--candidate-nonce", hex.EncodeToString(pipe.nonce[:]))
	if err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	defer child.close()
	if err := pipe.acceptChild(context.Background(), child.pid); err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	file := os.NewFile(uintptr(pipe.handle), "telemetry-oversized-pipe")
	defer file.Close()
	if err := file.SetDeadline(time.Now().Add(4 * time.Second)); err != nil {
		t.Fatal(err)
	}
	frame, err := ReadFrame(file)
	if err != nil {
		t.Fatalf("read handshake: %v", err)
	}
	if err := verifyHandshake(frame, pipe.nonce, "0.1.0"); err != nil {
		t.Fatal(err)
	}
	var header [8]byte
	binary.LittleEndian.PutUint32(header[:4], 64<<10+1)
	binary.LittleEndian.PutUint16(header[4:6], 1)
	binary.LittleEndian.PutUint16(header[6:8], uint16(KindConfiguration))
	if _, err := file.Write(header[:]); err != nil {
		t.Fatalf("send header: %v", err)
	}
	result, err := windows.WaitForSingleObject(child.process, 2_000)
	if err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("oversized header did not terminate child before payload: wait=%d error=%v", result, err)
	}
	var exitCode uint32
	if err := windows.GetExitCodeProcess(child.process, &exitCode); err != nil || exitCode == 0 {
		t.Fatalf("oversized header exit code=%d error=%v", exitCode, err)
	}
}

// Run only while a locally observed LMU build is outside Rust's closed
// allowlist. It proves the candidate child refuses acquisition after config.
func TestRustCandidateRejectsUnknownBuildOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_UNKNOWN_BUILD_TEST") != "1" {
		t.Skip("requires release Rust child and an observed unsupported LMU build")
	}
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	child, err := startInJob(executable, "--candidate-pipe", pipe.name,
		"--candidate-nonce", hex.EncodeToString(pipe.nonce[:]))
	if err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	defer child.close()
	if err := pipe.acceptChild(context.Background(), child.pid); err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	file := os.NewFile(uintptr(pipe.handle), "telemetry-candidate-pipe")
	defer file.Close()
	if err := file.SetDeadline(time.Now().Add(4 * time.Second)); err != nil {
		t.Fatal(err)
	}
	frame, err := ReadFrame(file)
	if err != nil {
		t.Fatalf("read handshake: %v", err)
	}
	if err := verifyHandshake(frame, pipe.nonce, "0.1.0"); err != nil {
		t.Fatal(err)
	}
	configuration, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "configuration-frame-go-v1.bin"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(configuration); err != nil {
		t.Fatalf("send configuration: %v", err)
	}
	result, err := windows.WaitForSingleObject(child.process, 4_000)
	if err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("unknown-build child did not exit: wait=%d error=%v", result, err)
	}
	var exitCode uint32
	if err := windows.GetExitCodeProcess(child.process, &exitCode); err != nil || exitCode == 0 {
		t.Fatalf("unknown-build exit code=%d error=%v", exitCode, err)
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
