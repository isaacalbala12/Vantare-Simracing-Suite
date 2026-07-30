package sqlite

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording"
	"github.com/vantare/overlays/v2/internal/telemetry/recording/replay"
)

func TestHistoricalReplayDigestIsIndependentOfPageAndSpeed(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ref, manifest := testSession(t.TempDir())
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	for sequence := uint64(1); sequence <= 20; sequence++ {
		if _, err := writer.Append(ctx, batch(sequence, 4, sequence%10 == 0)); err != nil {
			t.Fatalf("Append(%d) error = %v", sequence, err)
		}
	}
	if _, err := writer.Complete(ctx); err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	step := historicalReplayDigest(t, store, ref, manifest, replay.ModeStep, replay.Rate{}, 1)
	fast := historicalReplayDigest(
		t,
		store,
		ref,
		manifest,
		replay.ModeTimed,
		replay.Rate{Numerator: 4, Denominator: 1},
		7,
	)
	if step != fast {
		t.Fatalf("historical digest changed: step=%s fast=%s", step, fast)
	}
}

func historicalReplayDigest(
	t testing.TB,
	store *Store,
	ref recording.SessionRef,
	manifest recording.SessionManifest,
	mode replay.Mode,
	rate replay.Rate,
	pageSize uint16,
) string {
	t.Helper()
	reader, err := store.OpenHistoricalReplay(context.Background(), ref)
	if err != nil {
		t.Fatalf("OpenHistoricalReplay() error = %v", err)
	}
	metadata := replay.FixtureMetadata{
		FixtureVersion: replay.FixtureVersionV1,
		SimulatorID:    manifest.SimulatorID,
		SimulatorBuild: "unknown",
		AppBuild:       manifest.AppBuild,
		SchemaID:       "historical-query",
		SchemaVersion:  uint16(manifest.RecordingSchemaVersion),
		StartedAtUTC:   manifest.StartedAtUTC,
		Origin:         replay.FixtureOriginSynthetic,
		Sanitized:      true,
	}
	source, err := replay.NewHistoricalSource(reader, metadata, pageSize)
	if err != nil {
		t.Fatalf("NewHistoricalSource() error = %v", err)
	}
	defer source.Close()
	player, err := replay.NewPlayer(source, replay.Options{
		Mode: mode,
		Rate: rate,
		Wait: func(context.Context, time.Duration) error {
			return nil
		},
	})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	digest := sha256.New()
	consume := func(_ context.Context, output replay.Output[recording.HistoricalRecord]) error {
		data, err := json.Marshal(output.Value)
		if err != nil {
			return err
		}
		_, _ = digest.Write(data)
		_, _ = digest.Write([]byte{'\n'})
		return nil
	}
	if mode == replay.ModeStep {
		for {
			err := player.Step(context.Background(), consume)
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				t.Fatalf("Step() error = %v", err)
			}
		}
	} else if err := player.Run(context.Background(), consume); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	return hex.EncodeToString(digest.Sum(nil))
}
