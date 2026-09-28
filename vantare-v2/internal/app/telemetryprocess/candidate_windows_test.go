//go:build windows

package telemetryprocess

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
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

func TestCandidateSupervisorLiveLMUOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TEST") != "1" {
		t.Skip("requires release Rust child and running pinned LMU")
	}
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
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var statuses, acknowledgements, overlays, engineers, disconnected int
	err = RunCandidate(ctx, executable, configuration, func(event ReceivedV1) error {
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
