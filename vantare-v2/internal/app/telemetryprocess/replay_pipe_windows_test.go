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
	var initial ConfigurationV1
	if err := json.Unmarshal(configuration.Payload, &initial); err != nil {
		t.Fatal(err)
	}
	initial.EpochBase = 4
	receiver := NewReceiver()
	configured, err := receiver.Configure(initial)
	if err != nil {
		t.Fatal(err)
	}
	if err := WriteFrame(file, configured); err != nil {
		t.Fatal(err)
	}
	var acknowledgements, overlaySnapshots, engineerSnapshots, facts int
	var baseline FactAckV1
	var factACK Frame
	var newlyRetained int
	var deliveredFacts []uint64
	for index := range 5 {
		if index == 4 {
			request, err := EncodeFactReplayRequest(baseline)
			if err != nil {
				t.Fatal(err)
			}
			if err := WriteFrame(file, request); err != nil {
				t.Fatal(err)
			}
		}
		frame, err := ReadFrame(file)
		if err != nil {
			t.Fatal(err)
		}
		event, err := receiver.Accept(frame)
		if err != nil {
			t.Fatal(err)
		}
		switch frame.Kind {
		case KindConfigurationAck:
			ack := event.Configuration
			if ack == nil || ack.Revision != 7 || ack.Epoch != 5 || ack.Sequence != 1 || ack.FactStream == 0 || ack.FactSequence != 0 {
				t.Fatalf("configuration ACK = %+v", ack)
			}
			baseline = FactAckV1{Stream: ack.FactStream, Sequence: ack.FactSequence}
			acknowledgements++
		case KindSnapshot:
			switch {
			case event.Overlay != nil:
				if event.Overlay.Frame == nil || event.Overlay.Frame.StreamEpoch != 5 || len(event.Overlay.Frame.Standings) != 44 {
					t.Fatal("Overlay snapshot invalid")
				}
				overlaySnapshots++
			case event.Engineer != nil:
				if event.Engineer.Epoch != 5 || len(event.Engineer.Vehicles) != 44 {
					t.Fatal("Engineer snapshot invalid")
				}
				engineerSnapshots++
			default:
				t.Fatal("unrequested product")
			}
		case KindFact:
			if event.FactACK == nil {
				t.Fatal("fact preceded configuration ACK baseline")
			}
			factACK = *event.FactACK
			if event.FactAdded {
				newlyRetained++
				for _, fact := range event.Facts {
					deliveredFacts = append(deliveredFacts, uint64(fact.Fact.Sequence))
				}
			}
			facts++
		default:
			t.Fatalf("unexpected replay kind %v", frame.Kind)
		}
	}
	if acknowledgements != 1 || overlaySnapshots != 1 || engineerSnapshots != 1 || facts != 2 {
		t.Fatalf("first batch: ack=%d overlay=%d engineer=%d facts=%d", acknowledgements, overlaySnapshots, engineerSnapshots, facts)
	}
	if newlyRetained != 1 || len(deliveredFacts) != 1 || deliveredFacts[0] != 1 {
		t.Fatalf("accepted new=%d sequences=%v", newlyRetained, deliveredFacts)
	}
	if err := WriteFrame(file, factACK); err != nil {
		t.Fatal(err)
	}
	next := initial
	next.Revision = 8
	next.Consumers = ConsumersV1{Strategy: true}
	nextFrame, err := receiver.Configure(next)
	if err != nil {
		t.Fatal(err)
	}
	if err := WriteFrame(file, nextFrame); err != nil {
		t.Fatal(err)
	}
	secondAck, err := ReadFrame(file)
	if err != nil {
		t.Fatal(err)
	}
	secondEvent, err := receiver.Accept(secondAck)
	if err != nil || secondEvent.Configuration == nil || secondEvent.Configuration.Revision != 8 || secondEvent.Configuration.Epoch != 5 || secondEvent.Configuration.Sequence != 2 || secondEvent.Configuration.FactStream != 15 || secondEvent.Configuration.FactSequence != 1 {
		t.Fatalf("second configuration ACK = %+v, %v", secondEvent.Configuration, err)
	}
	strategyFrame, err := ReadFrame(file)
	if err != nil {
		t.Fatal(err)
	}
	strategyEvent, err := receiver.Accept(strategyFrame)
	if err != nil || strategyEvent.Strategy == nil || strategyEvent.Strategy.Metadata.Epoch != 5 || strategyEvent.Strategy.Metadata.Sequence != 2 {
		t.Fatalf("Strategy-only second batch invalid: %v", err)
	}
	staleRequest, err := EncodeFactReplayRequest(baseline)
	if err != nil {
		t.Fatal(err)
	}
	if err := WriteFrame(file, staleRequest); err != nil {
		t.Fatal(err)
	}
	resyncFrame, err := ReadFrame(file)
	if err != nil {
		t.Fatal(err)
	}
	resyncEvent, err := receiver.Accept(resyncFrame)
	if err != nil || resyncEvent.Resync == nil || resyncEvent.Resync.Stream != 15 || resyncEvent.Resync.First != 2 || resyncEvent.Resync.Next != 2 {
		t.Fatalf("stale replay boundary = (%+v, %v)", resyncEvent.Resync, err)
	}
	completion, err := ReadFrame(file)
	if err != nil || completion.Kind != KindStop || len(completion.Payload) != 0 {
		t.Fatalf("replay completion = %+v, %v", completion, err)
	}
	completedEvent, err := receiver.Accept(completion)
	if err != nil || !completedEvent.Stopped {
		t.Fatalf("receiver completion = %+v, %v", completedEvent, err)
	}
	if err := WriteFrame(file, Frame{Kind: KindStop}); err != nil {
		t.Fatal(err)
	}
	result, err := windows.WaitForSingleObject(child.process, uint32(childShutdownTimeout.Milliseconds()))
	if err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("replay child did not exit: result=%d error=%v", result, err)
	}
}
