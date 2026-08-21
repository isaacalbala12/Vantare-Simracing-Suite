package voiceinput

import (
	"bufio"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"testing"
	"time"
)

func TestProcessHostOwnsNoncePIDAndJoinsChild(t *testing.T) {
	host := NewProcessHost(func(nonce string) (*exec.Cmd, error) {
		cmd := exec.Command(os.Args[0], "-test.run=TestProcessHostHelper", "--", nonce)
		cmd.Env = append(os.Environ(), "VANTARE_VOICE_HOST_HELPER=1")
		return cmd, nil
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := host.Start(ctx); err != nil {
		t.Fatal(err)
	}
	capture := Capture{ID: "capture-1", MaxWindow: time.Second}
	if err := host.Begin(ctx, capture); err != nil {
		t.Fatal(err)
	}
	text, err := host.Finish(ctx, capture)
	if err != nil || string(text) != "dime el combustible" {
		t.Fatalf("Finish() = %q, %v", text, err)
	}
	if err := host.Stop(ctx); err != nil {
		t.Fatal(err)
	}
	if host.cmd != nil || host.nonce != "" {
		t.Fatal("child ownership remained after Stop")
	}
}

func TestProcessHostFailsClosedWhenShippedBackendIsUnavailable(t *testing.T) {
	host := NewProcessHost(func(nonce string) (*exec.Cmd, error) {
		cmd := exec.Command(os.Args[0], "-test.run=TestUnavailableHostHelper", "--", nonce)
		cmd.Env = append(os.Environ(), "VANTARE_VOICE_HOST_UNAVAILABLE_HELPER=1")
		return cmd, nil
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := host.Start(ctx); err != ErrHostUnavailable {
		t.Fatalf("Start() error = %v", err)
	}
	if host.cmd != nil {
		t.Fatal("unavailable child was not joined")
	}
}

func TestProcessHostReadinessHasOwnDeadline(t *testing.T) {
	host := NewProcessHost(func(nonce string) (*exec.Cmd, error) {
		cmd := exec.Command(os.Args[0], "-test.run=TestHangingHostHelper", "--", nonce)
		cmd.Env = append(os.Environ(), "VANTARE_VOICE_HOST_HANG_HELPER=1")
		return cmd, nil
	})
	host.readinessTimeout = 25 * time.Millisecond
	started := time.Now()
	if err := host.Start(context.Background()); err == nil {
		t.Fatal("Start() accepted a child that never sent readiness")
	}
	if elapsed := time.Since(started); elapsed > time.Second {
		t.Fatalf("readiness timeout took %v", elapsed)
	}
	if host.cmd != nil || host.nonce != "" {
		t.Fatal("timed-out child ownership remained")
	}
}

func TestProcessHostHelper(t *testing.T) {
	if os.Getenv("VANTARE_VOICE_HOST_HELPER") != "1" {
		return
	}
	nonce := os.Args[len(os.Args)-1]
	encoder := json.NewEncoder(os.Stdout)
	_ = encoder.Encode(hostReady{Protocol: ProtocolV1, PID: os.Getpid(), Nonce: nonce, Available: true})
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var request hostRequest
		if json.Unmarshal(scanner.Bytes(), &request) != nil || request.Protocol != ProtocolV1 || request.Nonce != nonce {
			os.Exit(3)
		}
		if request.Operation == "shutdown" {
			return
		}
		response := hostResponse{Protocol: ProtocolV1, Nonce: nonce, OK: true}
		if request.Operation == "finish" {
			response.Text = "dime el combustible"
		}
		_ = encoder.Encode(response)
	}
	os.Exit(4)
}

func TestUnavailableHostHelper(t *testing.T) {
	if os.Getenv("VANTARE_VOICE_HOST_UNAVAILABLE_HELPER") != "1" {
		return
	}
	if err := RunUnavailableChild(os.Args[len(os.Args)-1], os.Stdout); err != nil {
		os.Exit(3)
	}
}

func TestHangingHostHelper(t *testing.T) {
	if os.Getenv("VANTARE_VOICE_HOST_HANG_HELPER") != "1" {
		return
	}
	select {}
}
