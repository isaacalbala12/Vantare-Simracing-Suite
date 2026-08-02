package replay

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	analysisprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/analysis"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	overlayprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
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
