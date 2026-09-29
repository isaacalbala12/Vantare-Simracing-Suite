//go:build windows

package telemetryprocess

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"golang.org/x/sys/windows"
)

// TestRustHighRateCorpusPipeOptIn proves that all products from the audited
// LMU47 sequence cross the actual child process and Windows pipe. It replays
// without wall-clock pacing by default. An opt-in paced run is diagnostic;
// neither mode includes the production acquisition adapters or proves the CPU gate.
func TestRustHighRateCorpusPipeOptIn(t *testing.T) {
	if os.Getenv("VANTARE_TELEMETRY_REPLAY_TEST_HELPER") == "" || os.Getenv("LMU_HIGH_RATE_CORPUS") == "" {
		t.Skip("set the release replay helper and audited LMU47 corpus")
	}
	var jsonDigest, binaryDigest [sha256.Size]byte
	t.Run("json", func(t *testing.T) {
		jsonDigest = runRustHighRateCorpusPipe(t, false)
	})
	t.Run("engineer-binary", func(t *testing.T) {
		binaryDigest = runRustHighRateCorpusPipe(t, true)
	})
	if jsonDigest != binaryDigest {
		t.Fatal("Engineer observations differ between JSON and binary pipe routes")
	}
}

func runRustHighRateCorpusPipe(t *testing.T, engineerBinary bool) [sha256.Size]byte {
	t.Helper()
	executable := os.Getenv("VANTARE_TELEMETRY_REPLAY_TEST_HELPER")
	dir := os.Getenv("LMU_HIGH_RATE_CORPUS")
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Schema      string `json:"schema"`
		Vehicles    int    `json:"vehicles"`
		SHMTicks    int    `json:"shmTicks"`
		RESTReports int    `json:"restReports"`
		Events      []struct {
			Kind string `json:"kind"`
		} `json:"events"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil || manifest.Schema != "vantare.lmu-temporal-high-rate.v1" || manifest.Vehicles != 47 || manifest.SHMTicks != 3600 || manifest.RESTReports != 239 || len(manifest.Events) != 3839 {
		t.Fatalf("invalid high-rate manifest: %v", err)
	}
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	args := []string{"--pipe", pipe.name, "--nonce", hex.EncodeToString(pipe.nonce[:]), "--high-rate-corpus", dir}
	if engineerBinary {
		args = append(args, "--engineer-binary")
	}
	paced := os.Getenv("VANTARE_TELEMETRY_PACED_REPLAY") == "1"
	if paced {
		args = append(args, "--paced")
	}
	child, err := startInJob(executable, args...)
	if err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	defer func() {
		if err := child.close(); err != nil {
			t.Errorf("close high-rate replay child: %v", err)
		}
	}()
	if err := pipe.acceptChild(context.Background(), child.pid); err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	file := os.NewFile(uintptr(pipe.handle), "telemetry-high-rate-replay-pipe")
	defer func() {
		if err := file.Close(); err != nil {
			t.Errorf("close high-rate replay pipe: %v", err)
		}
	}()
	if err := file.SetDeadline(time.Now().Add(4 * time.Minute)); err != nil {
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
	engineerDigest := sha256.New()
	started := time.Now()
	hostCPUStart := replayProcessCPU(t, windows.CurrentProcess())
	childCPUStart := replayProcessCPU(t, child.process)
	var acks, overlays, engineers, strategies, facts int
	for frameCount := 0; frameCount < 1+3*len(manifest.Events)+10; frameCount++ {
		frame, err := ReadFrame(file)
		if err != nil {
			t.Fatalf("read high-rate frame %d: %v", frameCount, err)
		}
		event, err := receiver.Accept(frame)
		if err != nil {
			t.Fatalf("accept high-rate frame %d: %v", frameCount, err)
		}
		if event.Configuration != nil {
			acks++
		}
		if event.Overlay != nil {
			overlays++
			if event.Overlay.Frame == nil || event.Overlay.Frame.SourceSequence != uint64(overlays) || len(event.Overlay.Frame.Standings) != manifest.Vehicles {
				t.Fatalf("invalid Overlay event %d", overlays)
			}
			if err := publisher.PublishSnapshot(event.Overlay.DeliveryRevision, *event.Overlay); err != nil {
				t.Fatalf("publish Overlay event %d: %v", overlays, err)
			}
		}
		if event.Engineer != nil {
			engineers++
			if bytes.HasPrefix(frame.Payload, []byte("VTE1")) != engineerBinary {
				t.Fatalf("Engineer codec mismatch at event %d", engineers)
			}
			observation, err := event.EngineerObservation(engineerManifest)
			if err != nil || len(observation.Vehicles) != manifest.Vehicles || uint64(event.Engineer.Sequence) != uint64(engineers) {
				t.Fatalf("invalid Engineer event %d: %v", engineers, err)
			}
			encoded, err := json.Marshal(observation)
			if err != nil {
				t.Fatalf("encode Engineer observation %d: %v", engineers, err)
			}
			if _, err := engineerDigest.Write(encoded); err != nil {
				t.Fatalf("hash Engineer observation %d: %v", engineers, err)
			}
		}
		if event.Strategy != nil {
			strategies++
			if uint64(event.Strategy.Sequence) != uint64(strategies) || event.Strategy.Player.ID == "" {
				t.Fatalf("invalid Strategy event %d", strategies)
			}
		}
		if event.FactACK != nil {
			retained := receiver.DrainFacts()
			if len(retained) != 1 {
				t.Fatalf("invalid fact delivery count at frame %d: %d", frameCount, len(retained))
			}
			facts++
			if uint64(retained[0].Fact.Sequence) != uint64(facts) {
				t.Fatalf("fact cursor gap at %d", facts)
			}
			if err := WriteFrame(file, *event.FactACK); err != nil {
				t.Fatalf("ack fact: %v", err)
			}
		}
		if acks == 1 && overlays == len(manifest.Events) && engineers == len(manifest.Events) && strategies == len(manifest.Events) && facts == 1 {
			break
		}
	}
	if acks != 1 || overlays != len(manifest.Events) || engineers != len(manifest.Events) || strategies != len(manifest.Events) || facts != 1 {
		t.Fatalf("incomplete high-rate pipe replay: ack=%d products=%d/%d/%d facts=%d", acks, overlays, engineers, strategies, facts)
	}
	if err := WriteFrame(file, Frame{Kind: KindStop}); err != nil {
		t.Fatal(err)
	}
	stop, err := ReadFrame(file)
	if err != nil || stop.Kind != KindStop || len(stop.Payload) != 0 {
		t.Fatalf("invalid high-rate Stop: %v", err)
	}
	result, err := windows.WaitForSingleObject(child.process, uint32(childShutdownTimeout.Milliseconds()))
	if err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("high-rate child did not exit: %d %v", result, err)
	}
	hostCPU := replayProcessCPU(t, windows.CurrentProcess()) - hostCPUStart
	childCPU := replayProcessCPU(t, child.process) - childCPUStart
	t.Logf("LMU47 high-rate pipe PASS: paced=%t, %d products per consumer, %d fact, %d published bytes, wall=%s, hostCPU=%s, childCPU=%s", paced, overlays, facts, publisher.Metrics().SnapshotBytes, time.Since(started), hostCPU, childCPU)
	var digest [sha256.Size]byte
	copy(digest[:], engineerDigest.Sum(nil))
	return digest
}

func replayProcessCPU(t *testing.T, handle windows.Handle) time.Duration {
	t.Helper()
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
		t.Fatalf("read process CPU: %v", err)
	}
	return time.Duration(kernel.Nanoseconds() + user.Nanoseconds())
}
