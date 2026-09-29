package derive

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

type portDeltaRow struct {
	Freshness    int      `json:"freshness"`
	Seconds      *float64 `json:"seconds"`
	Reference    bool     `json:"reference"`
	HistoryLen   int      `json:"history_len"`
	SessionBest  *float64 `json:"session_best"`
	PreviousLap  *float64 `json:"previous_lap"`
	PersonalBest *float64 `json:"personal_best"`
}

func portDeltaValue(field schema.Field[session.DeltaSeconds]) *float64 {
	value, present := field.Value()
	if !present {
		return nil
	}
	converted := float64(value)
	return &converted
}

// The checked-in oracle is consumed by the Rust replay test. This Go test
// prevents the golden from silently drifting away from the current tracker.
// Regenerate only after intentional Go contract changes with
// VANTARE_DELTA_ORACLE_UPDATE=1 go test ./internal/telemetry/derive -run TestDeltaPortOracleMatchesGoOnRealTrace.
func TestDeltaPortOracleMatchesGoOnRealTrace(t *testing.T) {
	input, err := os.Open(filepath.Join("testdata", "lmu-1.4-self-delta-trace-v1.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	defer input.Close()
	scanner := bufio.NewScanner(input)
	tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
	rows := make([]portDeltaRow, 0, 1846)
	for scanner.Scan() {
		var sample realDeltaTraceSample
		if err := json.Unmarshal(scanner.Bytes(), &sample); err != nil {
			t.Fatal(err)
		}
		result := tracker.Apply(deltaHeader(schema.Sequence(sample.SampleIndex+1)), deltaObserved(
			session.LapNumber(sample.LapNumber), standings.LapDistance(sample.LapDistanceMeters),
			time.Duration(sample.SourceTimeNS), sample.InPit, schema.FreshnessFresh))
		_, reference := result.Reference.Value()
		rows = append(rows, portDeltaRow{
			Freshness: int(result.Freshness), Seconds: portDeltaValue(result.Seconds),
			Reference: reference, HistoryLen: len(result.History),
			SessionBest:  portDeltaValue(result.SessionBest),
			PreviousLap:  portDeltaValue(result.PreviousLap),
			PersonalBest: portDeltaValue(result.PersonalBest),
		})
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1846 {
		t.Fatalf("oracle rows = %d, want 1846", len(rows))
	}
	actual, err := json.Marshal(rows)
	if err != nil {
		t.Fatal(err)
	}
	oraclePath := filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "delta-go-oracle-v1.json")
	if os.Getenv("VANTARE_DELTA_ORACLE_UPDATE") == "1" {
		if err := os.WriteFile(oraclePath, append(actual, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	golden, err := os.ReadFile(oraclePath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual, bytes.TrimSpace(golden)) {
		t.Fatal("Go delta outputs differ from checked-in Rust port oracle")
	}
}
