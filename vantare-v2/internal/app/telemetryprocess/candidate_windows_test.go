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

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
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

func TestCandidatePolicyBurstUsesLatestRevision(t *testing.T) {
	configuration := liveCandidateConfiguration(t)
	queue := make(chan ConfigurationV1, 2)
	var updates <-chan ConfigurationV1 = queue
	intermediate := configuration
	intermediate.Revision++
	intermediate.Consumers = ConsumersV1{Strategy: true}
	latest := intermediate
	latest.Revision++
	latest.Consumers = ConsumersV1{OverlayV2: true}
	queue <- intermediate
	queue <- latest
	if err := receiveCandidateUpdates(&configuration, &updates); err != nil {
		t.Fatal(err)
	}
	if configuration.Revision != latest.Revision || configuration.Consumers != latest.Consumers {
		t.Fatalf("queued policy = revision %d, consumers %+v; want latest %+v", configuration.Revision, configuration.Consumers, latest)
	}
}

func TestCandidatePolicyBurstRejectsInvalidRevision(t *testing.T) {
	configuration := liveCandidateConfiguration(t)
	queue := make(chan ConfigurationV1, 1)
	var updates <-chan ConfigurationV1 = queue
	queue <- configuration
	if err := receiveCandidateUpdates(&configuration, &updates); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("duplicate revision = %v", err)
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

func liveEngineerManifest(t *testing.T) engineer.Manifest {
	t.Helper()
	manifest, err := engineer.NewManifest([]engineer.Capability{
		{ID: engineer.CapabilitySession, State: engineer.CapabilitySupported},
		{ID: engineer.CapabilityStandings, State: engineer.CapabilitySupported},
		{ID: engineer.CapabilityControls, State: engineer.CapabilitySupported},
		{ID: engineer.CapabilityPit, State: engineer.CapabilitySupported},
		{ID: engineer.CapabilityFuel, State: engineer.CapabilitySupported},
		{ID: engineer.CapabilityGaps, State: engineer.CapabilitySupported},
		{ID: engineer.CapabilitySpatial, State: engineer.CapabilitySupported},
	})
	if err != nil {
		t.Fatal(err)
	}
	return manifest
}

// The real Publisher is the next product boundary after the IPC receiver.
// A decoded Rust snapshot must fit its existing Overlay V2 payload contract.
func TestCandidateOverlayReachesPublisherLiveLMUOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TEST") != "1" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") != "1" {
		t.Skip("requires release Rust child and pinned LMU on track")
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
	manifest := liveEngineerManifest(t)
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	var overlays, engineers, facts, disconnects int
	err = RunCandidate(ctx, executable, liveCandidateConfiguration(t), func(event ReceivedV1) error {
		if event.Overlay != nil {
			if len(event.Overlay.Frame.Standings) != 47 {
				return errors.New("Rust Overlay did not contain the real 47-car grid")
			}
			if err := publisher.PublishSnapshot(event.Overlay.DeliveryRevision, *event.Overlay); err != nil {
				return err
			}
			overlays++
		}
		if event.Engineer != nil {
			if event.EngineerIdentity == nil || !(engineer.Context{Epoch: uint64(event.Engineer.Epoch), Identity: *event.EngineerIdentity}).Complete() ||
				engineer.VehicleID(event.Engineer.Player.ID) != event.EngineerIdentity.Vehicle {
				return errors.New("Rust Engineer snapshot has no matching complete identity")
			}
			observation, err := event.EngineerObservation(manifest)
			if err != nil || len(observation.Vehicles) != 47 || !observation.Context.Complete() {
				return errors.New("Rust Engineer snapshot cannot enter the product observation contract")
			}
			engineers++
		}
		for _, fact := range event.Facts {
			if fact.Fact.Kind != engineer.FactSessionStarted || fact.Fact.Sequence != 1 {
				return errors.New("Rust delivered an unexpected or duplicate Engineer fact")
			}
			facts++
		}
		if overlays >= 2 && engineers >= 2 && facts >= 1 {
			cancel()
		}
		return nil
	}, func(error) { disconnects++ })
	if err != nil || disconnects != 0 || overlays < 2 || engineers < 2 || facts < 1 {
		t.Fatalf("real Rust publisher delivery: error=%v disconnects=%d overlay=%d engineer=%d facts=%d", err, disconnects, overlays, engineers, facts)
	}
	t.Logf("published %d real Rust Overlay snapshots to the product publisher, latest bytes=%d, facts=%d", overlays, publisher.Metrics().SnapshotBytes, facts)
}

func TestCandidateEngineerReachesProductServiceLiveLMUOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TEST") != "1" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") != "1" {
		t.Skip("requires release Rust child and pinned LMU on track")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	service := engineerservice.NewEngineerService(nil)
	if err := service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer service.Stop()
	manifest := liveEngineerManifest(t)
	var statuses, observations, facts, disconnects int
	err := RunCandidate(ctx, executable, liveCandidateConfiguration(t), func(event ReceivedV1) error {
		if event.Status != nil && event.Status.State == "live" {
			if err := service.ConsumeSourceStatus(engineer.SourceStatusV1{State: engineer.SourceLive}); err != nil {
				return err
			}
			statuses++
		}
		if event.Engineer != nil {
			observation, err := event.EngineerObservation(manifest)
			if err != nil {
				return err
			}
			if err := service.ConsumeObservation(observation); err != nil {
				return err
			}
			observations++
		}
		for _, fact := range event.Facts {
			if err := service.ConsumeFact(fact); err != nil {
				return err
			}
			facts++
		}
		if statuses > 0 && observations >= 2 && facts > 0 {
			cancel()
		}
		return nil
	}, func(error) { disconnects++ })
	if err != nil || disconnects != 0 || statuses == 0 || observations < 2 || facts == 0 {
		t.Fatalf("real Rust Engineer service delivery: error=%v disconnects=%d status=%d observations=%d facts=%d", err, disconnects, statuses, observations, facts)
	}
	if status := service.Status(); !status.Connected || status.Source != "telemetry-core" || status.LastError != "" {
		t.Fatalf("real Rust Engineer service status = %#v", status)
	}
	t.Logf("real Rust Engineer service accepted status=%d observations=%d facts=%d", statuses, observations, facts)
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

func TestCandidateSupervisorAppliesStrategyUpdateOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") != "1" {
		t.Skip("requires release Rust child and running pinned LMU on the 43-car track")
	}
	configuration := liveCandidateConfiguration(t)
	updates := make(chan ConfigurationV1, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var firstACK, secondACK, strategy, disconnected int
	err := RunCandidateWithUpdates(ctx, executable, configuration, updates, func(event ReceivedV1) error {
		if event.Configuration != nil {
			switch event.Configuration.Revision {
			case configuration.Revision:
				firstACK++
				next := configuration
				next.Revision++
				next.Consumers = ConsumersV1{Strategy: true}
				updates <- next
			case configuration.Revision + 1:
				secondACK++
			default:
				t.Fatalf("unexpected revision %d", event.Configuration.Revision)
			}
		}
		if event.Strategy != nil {
			if secondACK == 0 || event.Strategy.Player.ID == "" {
				t.Fatal("Strategy before ACK or player identity")
			}
			strategy++
			cancel()
		}
		if secondACK != 0 && (event.Overlay != nil || event.Engineer != nil) {
			t.Fatal("withdrawn product after Strategy ACK")
		}
		return nil
	}, func(error) { disconnected++ })
	if err != nil || firstACK != 1 || secondACK != 1 || strategy == 0 || disconnected != 0 {
		t.Fatalf("live update result=%v ack=%d/%d strategy=%d disconnect=%d", err, firstACK, secondACK, strategy, disconnected)
	}
}

func TestCandidateSupervisorCoalescesLivePolicyBurstOptIn(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" || os.Getenv("VANTARE_LMU_LIVE_CANDIDATE_TRACK_TEST") != "1" {
		t.Skip("requires release Rust child and running pinned LMU on track")
	}
	configuration := liveCandidateConfiguration(t)
	intermediate := configuration
	intermediate.Revision++
	intermediate.Consumers = ConsumersV1{OverlayV2: true}
	latest := intermediate
	latest.Revision++
	latest.Consumers = ConsumersV1{Strategy: true}
	updates := make(chan ConfigurationV1, 2)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var firstACK, latestACK, strategy int
	err := RunCandidateWithUpdates(ctx, executable, configuration, updates, func(event ReceivedV1) error {
		if event.Configuration != nil {
			switch event.Configuration.Revision {
			case configuration.Revision:
				firstACK++
				updates <- intermediate
				updates <- latest
			case latest.Revision:
				latestACK++
			default:
				t.Fatalf("superseded policy was ACKed: revision=%d", event.Configuration.Revision)
			}
		}
		if event.Strategy != nil {
			if latestACK != 1 || event.Strategy.Player.ID == "" {
				t.Fatal("Strategy arrived before latest ACK or without player")
			}
			strategy++
			cancel()
		}
		if latestACK != 0 && (event.Overlay != nil || event.Engineer != nil) {
			t.Fatal("withdrawn product arrived after latest ACK")
		}
		return nil
	}, func(err error) { t.Errorf("unexpected candidate restart: %v", err) })
	if err != nil || firstACK != 1 || latestACK != 1 || strategy == 0 {
		t.Fatalf("policy burst result=%v ack=%d/%d strategy=%d", err, firstACK, latestACK, strategy)
	}
}
