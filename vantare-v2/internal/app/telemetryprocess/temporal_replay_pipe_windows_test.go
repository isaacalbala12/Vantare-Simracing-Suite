//go:build windows

package telemetryprocess

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"golang.org/x/sys/windows"
)

// TestRustTemporalCorpusPipeOptIn replays a real, externally stored corpus
// through the actual Windows child/pipe/Receiver and product boundaries.
func TestRustTemporalCorpusPipeOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_REPLAY_TEST_HELPER")
	dir := os.Getenv("LMU_TEMPORAL_CORPUS")
	if executable == "" || dir == "" {
		t.Skip("set release replay helper and external real LMU corpus")
	}
	want, err := strconv.Atoi(os.Getenv("LMU_TEMPORAL_EXPECTED_VEHICLES"))
	if err != nil || want < 46 || want > 104 {
		t.Fatal("LMU_TEMPORAL_EXPECTED_VEHICLES must be 46..104")
	}
	var manifest struct {
		Samples []struct {
			Index      int    `json:"index"`
			Vehicles   int    `json:"vehicles"`
			SharedFile string `json:"sharedFile"`
			SharedSHA  string `json:"sharedSha256"`
			RESTFile   string `json:"restFile"`
			RESTSHA    string `json:"restSha256"`
		} `json:"samples"`
	}
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &manifest); err != nil || len(manifest.Samples) < 8 || len(manifest.Samples) > 240 {
		t.Fatalf("invalid corpus manifest: %v", err)
	}
	for i, sample := range manifest.Samples {
		if sample.Index != i || sample.Vehicles != want || sample.SharedFile != fmt.Sprintf("%03d-shm.bin", i) || sample.RESTFile != fmt.Sprintf("%03d-rest.json", i) {
			t.Fatalf("invalid sample %d", i)
		}
		for _, item := range []struct{ name, digest string }{{sample.SharedFile, sample.SharedSHA}, {sample.RESTFile, sample.RESTSHA}} {
			payload, err := os.ReadFile(filepath.Join(dir, item.name))
			if err != nil {
				t.Fatal(err)
			}
			actual := sha256.Sum256(payload)
			if hex.EncodeToString(actual[:]) != item.digest {
				t.Fatalf("corpus hash mismatch at sample %d", i)
			}
		}
	}
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	args := []string{"--pipe", pipe.name, "--nonce", hex.EncodeToString(pipe.nonce[:]), "--corpus", dir}
	codec := os.Getenv("VANTARE_TELEMETRY_REPLAY_CODEC")
	if codec == "binary" {
		args = append(args, "--engineer-binary")
	} else if codec != "" {
		t.Fatalf("unknown replay codec %q", codec)
	}
	child, err := startInJob(executable, args...)
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
	file := os.NewFile(uintptr(pipe.handle), "telemetry-temporal-replay-pipe")
	defer file.Close()
	if err := file.SetDeadline(time.Now().Add(45 * time.Second)); err != nil {
		t.Fatal(err)
	}
	handshake, err := ReadFrame(file)
	if err != nil {
		t.Fatal(err)
	}
	if err := verifyHandshake(handshake, pipe.nonce, "0.1.0"); err != nil {
		t.Fatal(err)
	}
	configuration := liveCandidateConfiguration(t)
	configuration.Consumers.Strategy = true
	receiver := NewReceiver()
	wire, err := receiver.Configure(configuration)
	if err != nil {
		t.Fatal(err)
	}
	if err := WriteFrame(file, wire); err != nil {
		t.Fatal(err)
	}
	registry, err := telemetrytransport.NewPublisherRegistry(telemetrytransport.PublisherConfig{Product: telemetrytransport.ProductOverlayV2})
	if err != nil {
		t.Fatal(err)
	}
	publisher, release, err := registry.RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	engineerManifest := liveEngineerManifest(t)
	var acks, overlays, engineers, strategies, facts int
	for frameCount := 0; frameCount < 1+3*len(manifest.Samples)+10; frameCount++ {
		frame, err := ReadFrame(file)
		if err != nil {
			t.Fatal(err)
		}
		event, err := receiver.Accept(frame)
		if err != nil {
			t.Fatalf("receive frame %d: %v", frameCount, err)
		}
		if event.Configuration != nil {
			acks++
		}
		if event.Overlay != nil {
			overlays++
			if event.Overlay.Frame == nil || event.Overlay.Frame.SourceSequence != uint64(overlays) || len(event.Overlay.Frame.Standings) != want {
				t.Fatalf("Overlay sample %d invalid", overlays)
			}
			if err := publisher.PublishSnapshot(event.Overlay.DeliveryRevision, *event.Overlay); err != nil {
				t.Fatal(err)
			}
		}
		if event.Engineer != nil {
			if bytes.HasPrefix(frame.Payload, []byte("VTE1")) != (codec == "binary") {
				t.Fatalf("Engineer codec mismatch at sample %d", engineers+1)
			}
			engineers++
			observation, err := event.EngineerObservation(engineerManifest)
			if err != nil || len(observation.Vehicles) != want || uint64(event.Engineer.Sequence) != uint64(engineers) {
				t.Fatalf("Engineer sample %d invalid: %v", engineers, err)
			}
		}
		if event.Strategy != nil {
			strategies++
			if uint64(event.Strategy.Sequence) != uint64(strategies) || event.Strategy.Player.ID == "" {
				t.Fatalf("Strategy sample %d invalid", strategies)
			}
		}
		if event.FactACK != nil {
			retained := event.Facts
			for _, item := range retained {
				facts++
				if uint64(item.Fact.Sequence) != uint64(facts) {
					t.Fatalf("temporal fact cursor gap at %d", facts)
				}
			}
			if len(retained) == 0 {
				t.Fatal("temporal fact ACK without a retained fact")
			}
			if err := WriteFrame(file, *event.FactACK); err != nil {
				t.Fatal(err)
			}
		}
		if acks == 1 && overlays == len(manifest.Samples) && engineers == len(manifest.Samples) && strategies == len(manifest.Samples) && facts > 0 {
			break
		}
	}
	if acks != 1 || overlays != len(manifest.Samples) || engineers != len(manifest.Samples) || strategies != len(manifest.Samples) || facts == 0 {
		t.Fatalf("incomplete replay: ack=%d overlay=%d engineer=%d strategy=%d facts=%d", acks, overlays, engineers, strategies, facts)
	}
	if err := WriteFrame(file, Frame{Kind: KindStop}); err != nil {
		t.Fatal(err)
	}
	stop, err := ReadFrame(file)
	if err != nil || stop.Kind != KindStop || len(stop.Payload) != 0 {
		t.Fatalf("replay Stop invalid: %v", err)
	}
	result, err := windows.WaitForSingleObject(child.process, uint32(childShutdownTimeout.Milliseconds()))
	if err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("replay child did not exit: %d %v", result, err)
	}
	t.Logf("real %d-car temporal replay crossed pipe: samples=%d per product, facts=%d, publisher snapshot bytes=%d", want, overlays, facts, publisher.Metrics().SnapshotBytes)
}
