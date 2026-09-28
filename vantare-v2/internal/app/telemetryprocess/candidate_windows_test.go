//go:build windows

package telemetryprocess

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCandidateRestartBudgetExhaustsAfterThreeFailedStarts(t *testing.T) {
	executable := filepath.Join(t.TempDir(), "missing-candidate.exe")
	var disconnected int
	err := RunCandidate(context.Background(), executable, ConfigurationV1{},
		func(ReceivedV1) error { t.Fatal("unexpected candidate event"); return nil },
		func(error) { disconnected++ })
	if !errors.Is(err, ErrCandidateRestartLimit) || disconnected != candidateRestartLimit {
		t.Fatalf("restart result = %v, disconnected=%d", err, disconnected)
	}
}

func liveCandidateConfiguration(t *testing.T) ConfigurationV1 {
	t.Helper()
	wire, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "configuration-frame-go-v1.bin"))
	if err != nil {
		t.Fatal(err)
	}
	frame, err := DecodeFrame(wire)
	if err != nil {
		t.Fatal(err)
	}
	var configuration ConfigurationV1
	if err := json.Unmarshal(frame.Payload, &configuration); err != nil {
		t.Fatal(err)
	}
	return configuration
}

func TestCandidateSupervisorLiveLMUOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TEST") != "1" {
		t.Skip("requires release Rust child and running pinned LMU")
	}
	configuration := liveCandidateConfiguration(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var statuses, acknowledgements, overlays, engineers, disconnected int
	err := RunCandidate(ctx, executable, configuration, func(event ReceivedV1) error {
		if event.Status != nil {
			statuses++
			if statuses == 2 {
				cancel()
			}
		}
		if event.Configuration != nil {
			acknowledgements++
		}
		if event.Overlay != nil {
			overlays++
		}
		if event.Engineer != nil {
			engineers++
		}
		return nil
	}, func(error) { disconnected++ })
	if err != nil || statuses != 2 || disconnected != 0 {
		t.Fatalf("supervisor result=%v status=%d disconnect=%d", err, statuses, disconnected)
	}
	if os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") == "1" &&
		(acknowledgements != 1 || overlays == 0 || engineers == 0) {
		t.Fatalf("track output ack=%d overlay=%d engineer=%d", acknowledgements, overlays, engineers)
	}
	t.Logf("supervised candidate: status=%d ack=%d overlay=%d engineer=%d clean Stop", statuses, acknowledgements, overlays, engineers)
}

func TestCandidateSupervisorRestartsAfterConsumerFailureOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") != "1" {
		t.Skip("requires release Rust child and running pinned LMU on the 43-car track")
	}
	failure := errors.New("test consumer rejected product")
	streams := make(map[uint64]struct{})
	var acknowledgements, disconnected int
	err := RunCandidate(context.Background(), executable, liveCandidateConfiguration(t),
		func(event ReceivedV1) error {
			if event.Configuration != nil {
				acknowledgements++
				if disconnected != acknowledgements-1 {
					t.Fatalf("new child started before disconnection callback: ack=%d disconnect=%d", acknowledgements, disconnected)
				}
				if _, reused := streams[event.Configuration.FactStream]; reused {
					t.Fatal("restarted child reused Fact stream identity")
				}
				streams[event.Configuration.FactStream] = struct{}{}
			}
			if event.Overlay != nil {
				return failure
			}
			return nil
		}, func(err error) {
			if !errors.Is(err, failure) {
				t.Errorf("disconnection cause = %v", err)
			}
			disconnected++
		})
	if !errors.Is(err, ErrCandidateRestartLimit) || !errors.Is(err, failure) ||
		acknowledgements != candidateRestartLimit || disconnected != candidateRestartLimit || len(streams) != candidateRestartLimit {
		t.Fatalf("restart result=%v ack=%d disconnect=%d streams=%d", err, acknowledgements, disconnected, len(streams))
	}
}

func TestCandidateWatchdogRejectsSlowConsumerOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") != "1" {
		t.Skip("requires release Rust child and running pinned LMU on the 43-car track")
	}
	var delayed bool
	err := runCandidateOnce(context.Background(), executable, liveCandidateConfiguration(t), func(event ReceivedV1) error {
		if event.Status != nil && !delayed {
			delayed = true
			// Deliberately hold the real consumer beyond the heartbeat budget.
			timer := time.NewTimer(candidateHeartbeatTimeout + 250*time.Millisecond)
			<-timer.C
		}
		return nil
	})
	if !delayed || !errors.Is(err, ErrCandidateHeartbeatTimeout) {
		t.Fatalf("slow consumer watchdog = %v, delayed=%v", err, delayed)
	}
}
