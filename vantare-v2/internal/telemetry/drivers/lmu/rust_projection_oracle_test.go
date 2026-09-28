package lmu

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

// Pins the product projection of the real static 44-car capture to Go.
// It does not prove the temporal 44/104 or physical LMU gates.
func TestRustProjectionGoOracleStatic44(t *testing.T) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	fused := new(Fusion).Merge(parsed.ReceivedUTC, 0, parsed)
	mapper := NewBatchMapper()
	reducer := telemetrycore.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	var final envelope.Snapshot[derive.FinalState]
	sink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		observed, err := reducer.Apply(batch)
		if err != nil {
			return err
		}
		final, err = pipeline.Apply(context.Background(), observed)
		return err
	})
	if err := mapper.WriteObservation(context.Background(), fused, sink); err != nil {
		t.Fatal(err)
	}
	state, ok := final.Value()
	if !ok {
		t.Fatal("no final state")
	}
	want, err := json.Marshal(struct {
		Session overlayv2.SessionV2           `json:"session"`
		Player  overlayv2.PlayerInstrumentsV2 `json:"player"`
	}{overlayv2.BuildSession(state), overlayv2.BuildPlayerInstruments(state, overlayv2.DefaultPreferencesV2())})
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join("..", "..", "..", "..", "rust", "telemetry", "testdata", "overlay-session-player-go-v1.json")
	if os.Getenv("VANTARE_PROJECTION_ORACLE_UPDATE") == "1" {
		if err := os.WriteFile(path, append(want, '\n'), 0644); err != nil {
			t.Fatal(err)
		}
	}
	golden, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(bytes.TrimSpace(golden), want) {
		t.Fatal("Go projection differs from pinned Rust port oracle")
	}
}
