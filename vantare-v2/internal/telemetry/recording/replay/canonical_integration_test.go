package replay

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	analysisprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/analysis"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	overlayprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

type collectingFactSink struct {
	facts []envelope.Fact[core.SessionFact]
}

func (sink *collectingFactSink) WriteFacts(
	_ context.Context,
	facts []envelope.Fact[core.SessionFact],
) error {
	sink.facts = append(sink.facts, facts...)
	return nil
}

func TestCanonicalReplayRunsCoreDeriveAndAllProductProjections(t *testing.T) {
	t.Parallel()
	stepDigest, stepWaits := canonicalIntegrationDigest(t, ModeStep, Rate{})
	timedDigest, timedWaits := canonicalIntegrationDigest(
		t,
		ModeTimed,
		Rate{Numerator: 4, Denominator: 1},
	)
	if stepDigest != timedDigest {
		t.Fatalf("digest differs by pacing: step=%s timed=%s", stepDigest, timedDigest)
	}
	if len(stepWaits) != 0 || !reflect.DeepEqual(timedWaits, []time.Duration{0}) {
		t.Fatalf("waits step=%v timed=%v", stepWaits, timedWaits)
	}
	data, err := os.ReadFile(filepath.Join("testdata", "canonical-integration-v1.golden.json"))
	if err != nil {
		t.Fatalf("ReadFile(golden) error = %v", err)
	}
	var golden struct {
		FixtureVersion uint16 `json:"fixtureVersion"`
		SHA256         string `json:"sha256"`
	}
	if err := json.Unmarshal(data, &golden); err != nil {
		t.Fatalf("Unmarshal(golden) error = %v", err)
	}
	if golden.FixtureVersion != FixtureVersionV1 || golden.SHA256 != stepDigest {
		t.Fatalf("golden = %#v, got digest %s", golden, stepDigest)
	}
}

func canonicalIntegrationDigest(
	t testing.TB,
	mode Mode,
	rate Rate,
) (string, []time.Duration) {
	t.Helper()
	metadata := testMetadata()
	metadata.SchemaID = "canonical-observation"
	frame := canonicalFrame(t, metadata.StartedAtUTC, 1, 1, 1)
	frame.Batch.State.SourceTime = replayField(t, 12500*time.Millisecond, schema.ProvenanceObserved, schema.FreshnessFresh)
	frame.Batch.State.EndTime = replayField(t, session.EndTime(7200), schema.ProvenanceObserved, schema.FreshnessFresh)
	frame.Batch.State.MaximumLaps = replayField(t, session.MaximumLaps(42), schema.ProvenanceObserved, schema.FreshnessFresh)
	frame.Batch.State.TrackName = replayField(t, "sanitized-track", schema.ProvenanceObserved, schema.FreshnessFresh)
	frame.Batch.State.SessionType = replayField(t, session.TypeRace, schema.ProvenanceObserved, schema.FreshnessFresh)
	frame.Batch.State.VehicleCount = replayField(t, schema.Count(1), schema.ProvenanceObserved, schema.FreshnessFresh)
	frame.Batch.State.PlayerPresent = replayField(t, true, schema.ProvenanceObserved, schema.FreshnessFresh)
	vehicle := &frame.Batch.State.Vehicles[0]
	vehicle.LapNumber = replayField(t, session.LapNumber(8), schema.ProvenanceObserved, schema.FreshnessFresh)
	vehicle.CompletedLaps = replayField(t, standings.CompletedLaps(7), schema.ProvenanceObserved, schema.FreshnessFresh)
	vehicle.Sector = replayField(t, standings.SectorTwo, schema.ProvenanceObserved, schema.FreshnessFresh)
	vehicle.LapDistance = replayField(t, standings.LapDistance(1234.5), schema.ProvenanceObserved, schema.FreshnessFresh)
	vehicle.InPit = replayField(t, pit.InPit(false), schema.ProvenanceObserved, schema.FreshnessFresh)
	vehicle.PitStopCount = replayField(t, pit.StopCount(1), schema.ProvenanceObserved, schema.FreshnessFresh)
	vehicle.Fuel = replayField(t, energy.Fuel{Amount: 25.5, Capacity: 100}, schema.ProvenanceObserved, schema.FreshnessFresh)
	source, err := NewCanonicalSource(metadata, []CanonicalFrame{frame})
	if err != nil {
		t.Fatalf("NewCanonicalSource() error = %v", err)
	}
	var waits []time.Duration
	player, err := NewPlayer(source, Options{
		Mode: mode,
		Rate: rate,
		Wait: func(_ context.Context, duration time.Duration) error {
			waits = append(waits, duration)
			return nil
		},
	})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	reducer := core.NewReducer()
	coordinator := core.NewSessionCoordinator(core.SessionCoordinatorConfig{
		Now: func() time.Time { return metadata.StartedAtUTC },
	})
	pipeline := derive.NewPipeline(derive.Config{})
	var encoded []byte
	deliver := func(_ context.Context, output Output[CanonicalFrame]) error {
		if output.Value.Batch == nil {
			return ErrInvalidCanonicalReplay
		}
		observed, err := reducer.Apply(*output.Value.Batch)
		if err != nil {
			return err
		}
		facts := &collectingFactSink{}
		if err := coordinator.Apply(context.Background(), observed, facts); err != nil {
			return err
		}
		if !reflect.DeepEqual(facts.facts, output.Value.Facts) {
			t.Fatalf("coordinator facts = %#v, fixture = %#v", facts.facts, output.Value.Facts)
		}
		final, err := pipeline.Apply(context.Background(), observed)
		if err != nil {
			return err
		}
		overlay, err := overlayprojection.ProjectV1(final)
		if err != nil {
			return err
		}
		analysis, err := analysisprojection.ProjectV1(final)
		if err != nil {
			return err
		}
		strategy, err := strategyprojection.ProjectV1(final)
		if err != nil {
			return err
		}
		assertCanonicalReplayStrategy(t, strategy, metadata.StartedAtUTC)
		engineer, err := engineerprojection.ProjectV1(final)
		if err != nil {
			return err
		}
		engineerFact, err := engineerprojection.ProjectFactV1(output.Value.Facts[0])
		if err != nil {
			return err
		}
		encoded, err = json.Marshal(struct {
			Overlay      overlayprojection.SnapshotV1      `json:"overlay"`
			Analysis     analysisprojection.SnapshotV1     `json:"analysis"`
			Strategy     strategyprojection.SnapshotV1     `json:"strategy"`
			Engineer     engineerprojection.SnapshotV1     `json:"engineer"`
			EngineerFact engineerprojection.FactEnvelopeV1 `json:"engineerFact"`
		}{
			Overlay: overlay, Analysis: analysis, Strategy: strategy,
			Engineer: engineer, EngineerFact: engineerFact,
		})
		return err
	}
	if mode == ModeStep {
		if err := player.Step(context.Background(), deliver); err != nil {
			t.Fatalf("Step() error = %v", err)
		}
	} else if err := player.Run(context.Background(), deliver); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), waits
}

func replayField[T comparable](
	t testing.TB,
	value T,
	provenance schema.Provenance,
	freshness schema.Freshness,
) schema.Field[T] {
	t.Helper()
	field, err := schema.NewField(value, provenance, freshness)
	if err != nil {
		t.Fatalf("NewField(%v) error = %v", value, err)
	}
	return field
}

func assertCanonicalReplayStrategy(
	t testing.TB,
	got strategyprojection.SnapshotV1,
	capturedAt time.Time,
) {
	t.Helper()
	if got.CanonicalVersion != schema.CanonicalVersionV1 ||
		got.ProjectionVersion != strategyprojection.VersionV1 ||
		got.Epoch != 1 || got.Sequence != 1 ||
		got.CapturedAt != capturedAt.UTC().Format(time.RFC3339Nano) {
		t.Fatalf("Strategy replay metadata = %#v", got.Metadata)
	}
	wantCapabilities := []strategyprojection.Capability{
		strategyprojection.CapabilitySession,
		strategyprojection.CapabilityProgress,
		strategyprojection.CapabilityPit,
		strategyprojection.CapabilityFuel,
	}
	if !reflect.DeepEqual(got.Capabilities, wantCapabilities) {
		t.Fatalf("Strategy replay capabilities = %v, want %v", got.Capabilities, wantCapabilities)
	}
	assertReplayProjectionField(t, "track", got.TrackName, "sanitized-track", projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "session type", got.SessionType, "race", projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "source time", got.SourceTime, 12.5, projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "end time", got.EndTime, session.EndTime(7200), projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "remaining", got.Remaining, session.RemainingTime(7187.5), projection.ProvenanceDerived, projection.FreshnessFresh)
	assertReplayProjectionField(t, "maximum laps", got.MaximumLaps, session.MaximumLaps(42), projection.ProvenanceObserved, projection.FreshnessFresh)
	if got.Player.ID != "vehicle-local" {
		t.Fatalf("Strategy replay player ID = %q", got.Player.ID)
	}
	assertReplayProjectionField(t, "lap number", got.Player.LapNumber, session.LapNumber(8), projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "completed laps", got.Player.CompletedLaps, standings.CompletedLaps(7), projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "sector", got.Player.Sector, standings.SectorTwo, projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "lap distance", got.Player.LapDistance, standings.LapDistance(1234.5), projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "in pit", got.Player.InPit, pit.InPit(false), projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "pit stops", got.Player.PitStopCount, pit.StopCount(1), projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "fuel", got.Player.FuelLiters, energy.FuelAmount(25.5), projection.ProvenanceObserved, projection.FreshnessFresh)
	assertReplayProjectionField(t, "fuel capacity", got.Player.FuelCapacity, energy.FuelCapacity(100), projection.ProvenanceObserved, projection.FreshnessFresh)

	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	for _, unsupported := range []string{"virtualEnergy", "tyres", "compound", "wear", "weather"} {
		if strings.Contains(string(encoded), unsupported) {
			t.Fatalf("Strategy replay leaked unsupported family %q: %s", unsupported, encoded)
		}
	}
}

func assertReplayProjectionField[T comparable](
	t testing.TB,
	name string,
	got projection.Field[T],
	want T,
	provenance projection.Provenance,
	freshness projection.Freshness,
) {
	t.Helper()
	if !got.Present || got.Value != want || got.Provenance != provenance || got.Freshness != freshness {
		t.Fatalf("Strategy replay %s = %#v, want value %v provenance %q freshness %q", name, got, want, provenance, freshness)
	}
}
