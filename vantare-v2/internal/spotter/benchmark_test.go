package spotter

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	engineeraudio "github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/radio"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

type benchmarkClock struct{ now int64 }

func (clock benchmarkClock) NowMS() int64 { return clock.now }

type benchmarkUI struct{}

func (benchmarkUI) PublishRadio(context.Context, radio.Presentation) error { return nil }

type benchmarkAudio struct{ path string }

func (audio benchmarkAudio) ResolveCached(context.Context, string, engineeraudio.Channel) (string, error) {
	return audio.path, nil
}

type benchmarkPlayer struct{ benchmark *testing.B }

func (player benchmarkPlayer) PlayContext(context.Context, string) error {
	// ENG-06 measures until the player entry boundary. ACK started has already
	// been recorded by DualPort at this point.
	player.benchmark.StopTimer()
	return nil
}

func BenchmarkObservationToRadioStarted(b *testing.B) {
	observation := benchmarkObservation(b, 2.8)
	wavPath := filepath.Join(b.TempDir(), "spotter.car_left.wav")
	if err := os.WriteFile(wavPath, []byte("RIFF\x24\x00\x00\x00WAVEfmt "), 0o600); err != nil {
		b.Fatal(err)
	}
	resolver := radio.NewResolver()
	if err := RegisterCatalog(resolver); err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.StopTimer()
	for index := 0; index < b.N; index++ {
		clock := &benchmarkClock{now: 1_000}
		producer, err := NewProducer(clock, radio.LocaleES)
		if err != nil {
			b.Fatal(err)
		}
		bus, err := radio.NewBus(radio.DefaultLimits(), clock)
		if err != nil {
			b.Fatal(err)
		}
		metrics := radio.NewMetrics(1)
		b.StartTimer()
		message, emit, err := producer.Evaluate(observation)
		if err != nil || !emit {
			b.Fatalf("Evaluate = %+v, %t, %v", message, emit, err)
		}
		if result, submitErr := bus.Submit(message); submitErr != nil || !result.Accepted {
			b.Fatalf("Submit = %+v, %v", result, submitErr)
		}
		item, ok := bus.Next(context.Background())
		if !ok {
			b.Fatal("Next returned no Spotter item")
		}
		request := radio.Request{Version: radio.VersionV1, DeliveryID: "benchmark", DecidedAtMS: clock.NowMS(), Message: item.Message}
		session, err := radio.NewSession(request, clock, metrics, func(ack radio.Acknowledgement) error {
			if ack.State == radio.StateStarted {
				if err := producer.AcknowledgeStarted(item.Message, ack.AtMS); err != nil {
					return err
				}
				item.Started()
			}
			return nil
		})
		if err != nil {
			b.Fatal(err)
		}
		port := radio.DualPort{Resolver: resolver, UI: benchmarkUI{}, Audio: benchmarkAudio{path: wavPath}, Player: benchmarkPlayer{benchmark: b}, Clock: clock}
		if err := port.Deliver(item.Context, request, session); err != nil {
			b.Fatal(err)
		}
		item.Done()
		if metrics.Snapshot().Samples != 1 {
			b.Fatal("missing started ACK")
		}
	}
}

func benchmarkObservation(tb testing.TB, rivalX ...float64) engineer.ObservationSnapshotV1 {
	tb.Helper()
	run := identity.RunIdentity{Event: "event", Session: "session", Vehicle: "player", Team: "team", Driver: "driver"}
	clock := schema.NewClock(benchmarkField(tb, time.Second), benchmarkField(tb, time.Second), time.Now().UTC())
	header := envelope.Header{Source: "spotter-benchmark", Cursor: schema.Cursor{Epoch: 1, Sequence: 1}, Clock: clock, Identity: run}
	orientation := spatial.Orientation{Row0: spatial.Vector3{X: 1}, Row1: spatial.Vector3{Y: 1}, Row2: spatial.Vector3{Z: 1}}
	player := telemetrycore.VehicleState{
		Identity: run, Player: benchmarkField(tb, true), LapNumber: benchmarkField(tb, session.LapNumber(1)),
		Gear: benchmarkField(tb, vehicle.Gear(4)), SpeedMPS: benchmarkField(tb, 40.0), InPit: benchmarkField(tb, pit.InPit(false)),
		WorldPosition: benchmarkField(tb, spatial.Position{X: 100, Z: 100}),
		LocalVelocity: benchmarkField(tb, spatial.LocalVelocity{Z: 40}), Orientation: benchmarkField(tb, orientation),
	}
	vehicles := []telemetrycore.VehicleState{player}
	for index, offset := range rivalX {
		rival := player
		rival.Identity.Vehicle = identity.VehicleID(fmt.Sprintf("rival-%d", index))
		rival.Player = benchmarkField(tb, false)
		rival.WorldPosition = benchmarkField(tb, spatial.Position{X: 100 + offset, Z: 100})
		vehicles = append(vehicles, rival)
	}
	state := derive.FinalState{Observed: telemetrycore.ObservedState{
		SourceTime: benchmarkField(tb, time.Second), PlayerPresent: benchmarkField(tb, true),
		VehicleCount: benchmarkField(tb, schema.Count(len(vehicles))), Vehicles: vehicles,
	}}
	snapshot, err := envelope.NewSnapshot(header, state, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = slices.Clone(value.Observed.Vehicles)
		return value
	})
	if err != nil {
		tb.Fatal(err)
	}
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
		tb.Fatal(err)
	}
	result, err := engineer.ProjectObservationV1(snapshot, manifest)
	if err != nil {
		tb.Fatal(err)
	}
	return result
}

func benchmarkField[T comparable](tb testing.TB, value T) schema.Field[T] {
	tb.Helper()
	result, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		tb.Fatal(err)
	}
	return result
}
