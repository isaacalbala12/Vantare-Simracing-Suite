//go:build windows

package telemetryprocess

import (
	"bufio"
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

// TestRustBenchSourceOptIn exercises the production acquisition and pipe loop
// against an isolated replay of real LMU47 bytes. It is a diagnostic R arm;
// the paired G0/G1 performance gate and physical application proof are separate.
func TestRustBenchSourceOptIn(t *testing.T) {
	rustBinary := os.Getenv("VANTARE_TELEMETRY_BENCH_RUST_EXE")
	producerBinary := os.Getenv("VANTARE_TELEMETRY_BENCH_SOURCE_EXE")
	corpus := os.Getenv("LMU_HIGH_RATE_CORPUS")
	if rustBinary == "" || producerBinary == "" || corpus == "" {
		t.Skip("requires benchmark Rust child, isolated source producer and audited LMU47 corpus")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	producer := exec.CommandContext(ctx, producerBinary, "-corpus", corpus)
	stdin, err := producer.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := producer.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	var stderr bytes.Buffer
	producer.Stderr = &stderr
	if err := producer.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cancel()
		_ = producer.Wait()
	}()
	reader := bufio.NewReader(stdout)
	line, err := reader.ReadBytes('\n')
	if err != nil {
		t.Fatalf("benchmark source readiness: %v: %s", err, stderr.String())
	}
	var ready struct {
		Mapping string `json:"mapping"`
		Port    int    `json:"port"`
		Events  int    `json:"events"`
	}
	if err := json.Unmarshal(line, &ready); err != nil || ready.Events != 3839 || ready.Port < 1 || ready.Port > 65535 {
		t.Fatalf("invalid benchmark source readiness: %s: %v", line, err)
	}
	pipe, err := newLocalPipe()
	if err != nil {
		t.Fatal(err)
	}
	child, err := startInJob(rustBinary, "--bench-pipe", pipe.name,
		"--bench-nonce", hex.EncodeToString(pipe.nonce[:]),
		"--bench-mapping", ready.Mapping, "--bench-rest-port", strconv.Itoa(ready.Port),
		"--candidate-engineer-binary")
	if err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	defer child.close()
	if err := pipe.acceptChild(ctx, child.pid); err != nil {
		_ = pipe.close()
		t.Fatal(err)
	}
	file := os.NewFile(uintptr(pipe.handle), "telemetry-bench-source-pipe")
	defer file.Close()
	if err := file.SetDeadline(time.Now().Add(85 * time.Second)); err != nil {
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
	if _, err := io.WriteString(stdin, "start\n"); err != nil {
		t.Fatal(err)
	}
	if err := stdin.Close(); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	hostCPUStart := replayProcessCPU(t, windows.CurrentProcess())
	childCPUStart := replayProcessCPU(t, child.process)
	var overlays, engineers, strategies, statuses, acks int
	stopSent := false
	for {
		if !stopSent && time.Since(started) >= 61*time.Second {
			if err := WriteFrame(file, Frame{Kind: KindStop}); err != nil {
				t.Fatal(err)
			}
			stopSent = true
		}
		frame, err := ReadFrame(file)
		if err != nil {
			t.Fatalf("benchmark pipe after %d/%d/%d deliveries: %v: %s", overlays, engineers, strategies, err, stderr.String())
		}
		if frame.Kind == KindStop {
			if !stopSent {
				t.Fatal("unsolicited child Stop")
			}
			break
		}
		event, err := receiver.Accept(frame)
		if err != nil {
			t.Fatalf("benchmark receiver: %v", err)
		}
		if event.Configuration != nil {
			acks++
		}
		if event.Status != nil {
			statuses++
		}
		if event.Overlay != nil {
			overlays++
			if event.Overlay.Frame == nil || len(event.Overlay.Frame.Standings) < 46 {
				t.Fatalf("Overlay %d lacks 46 cars", overlays)
			}
		}
		if event.Engineer != nil {
			engineers++
		}
		if event.Strategy != nil {
			strategies++
		}
		if event.FactACK != nil {
			if err := WriteFrame(file, *event.FactACK); err != nil {
				t.Fatal(err)
			}
		}
	}
	if acks != 1 || overlays < 3000 || engineers < 3000 || strategies < 3000 || statuses == 0 {
		t.Fatalf("incomplete diagnostic replay: ack=%d status=%d products=%d/%d/%d", acks, statuses, overlays, engineers, strategies)
	}
	completed, err := reader.ReadBytes('\n')
	if err != nil {
		t.Fatalf("benchmark source completion: %v: %s", err, stderr.String())
	}
	var counts struct {
		SHM  int   `json:"shm"`
		REST int   `json:"rest"`
		Wall int64 `json:"wallMs"`
	}
	if err := json.Unmarshal(completed, &counts); err != nil || counts.SHM != 3600 || counts.REST != 239 || counts.Wall < 59000 {
		t.Fatalf("incomplete benchmark source: %s: %v", completed, err)
	}
	if result, err := windows.WaitForSingleObject(child.process, uint32(childShutdownTimeout.Milliseconds())); err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("benchmark child exit: %d: %v", result, err)
	}
	hostCPU := replayProcessCPU(t, windows.CurrentProcess()) - hostCPUStart
	childCPU := replayProcessCPU(t, child.process) - childCPUStart
	t.Log(fmt.Sprintf("LMU47 isolated R diagnostic: %d/%d/%d deliveries, %d statuses, wall=%s, hostCPU=%s, childCPU=%s", overlays, engineers, strategies, statuses, time.Since(started), hostCPU, childCPU))
}
