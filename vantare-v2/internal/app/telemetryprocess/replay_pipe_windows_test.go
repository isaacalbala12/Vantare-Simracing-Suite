//go:build windows

package telemetryprocess

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

// Run with VANTARE_TELEMETRY_REPLAY_TEST_HELPER pointing to the release
// replay-harness binary. This is a real named-pipe/child test, not LMU live.
func TestRustReplayPipeDeliversDemandedProductsAndFact(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_REPLAY_TEST_HELPER")
	if executable == "" {
		t.Skip("build vantare-telemetry-replay with replay-harness and set VANTARE_TELEMETRY_REPLAY_TEST_HELPER")
	}
	fixture, err := filepath.Abs(filepath.Join("..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	child, err := startInJob(executable, "--pipe", pipe.name, "--nonce", hex.EncodeToString(pipe.nonce[:]), "--fixture", fixture)
	if err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	defer func() {
		if err := child.close(); err != nil {
			t.Errorf("close replay child: %v", err)
		}
	}()
	if err := pipe.acceptChild(context.Background(), child.pid); err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	file := os.NewFile(uintptr(pipe.handle), "telemetry-replay-pipe")
	defer file.Close()
	if err := file.SetDeadline(time.Now().Add(10 * time.Second)); err != nil {
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
	configuration, err := DecodeFrame(wire)
	if err != nil {
		t.Fatal(err)
	}
	if err := WriteFrame(file, configuration); err != nil {
		t.Fatal(err)
	}
	var acknowledgements, overlaySnapshots, engineerSnapshots, facts int
	complete := false
	for range 12 {
		frame, err := ReadFrame(file)
		if err != nil {
			t.Fatal(err)
		}
		if frame.Kind == KindStop {
			if len(frame.Payload) != 0 {
				t.Fatal("replay completion has payload")
			}
			complete = true
			break
		}
		switch frame.Kind {
		case KindConfigurationAck:
			ack, err := DecodeConfigurationAck(frame)
			if err != nil || ack.Revision != 7 || ack.Epoch != 1 || ack.Sequence != 1 {
				t.Fatalf("configuration ACK = %+v, %v", ack, err)
			}
			acknowledgements++
		case KindSnapshot:
			var product struct {
				Product string `json:"product"`
			}
			if err := json.Unmarshal(frame.Payload, &product); err != nil {
				t.Fatal(err)
			}
			switch product.Product {
			case ProductOverlayV2:
				update, err := DecodeOverlaySnapshot(frame)
				if err != nil || update.Frame == nil || len(update.Frame.Standings) != 44 {
					t.Fatalf("Overlay snapshot invalid: %v", err)
				}
				overlaySnapshots++
			case ProductEngineerV1:
				observation, err := DecodeEngineerSnapshot(frame)
				if err != nil || len(observation.Vehicles) != 44 {
					t.Fatalf("Engineer snapshot invalid: %v", err)
				}
				engineerSnapshots++
			default:
				t.Fatalf("unrequested product %q", product.Product)
			}
		case KindFact:
			if _, err := DecodeEngineerFact(frame); err != nil {
				t.Fatal(err)
			}
			facts++
		default:
			t.Fatalf("unexpected replay kind %v", frame.Kind)
		}
	}
	if !complete || acknowledgements != 1 || overlaySnapshots != 1 || engineerSnapshots != 1 || facts == 0 {
		t.Fatalf("replay outputs: complete=%v ack=%d overlay=%d engineer=%d facts=%d", complete, acknowledgements, overlaySnapshots, engineerSnapshots, facts)
	}
	if err := WriteFrame(file, Frame{Kind: KindStop}); err != nil {
		t.Fatal(err)
	}
	result, err := windows.WaitForSingleObject(child.process, uint32(childShutdownTimeout.Milliseconds()))
	if err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("replay child did not exit: result=%d error=%v", result, err)
	}
}
