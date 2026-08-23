package coldstart

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

func TestDiscoverStandardLMUFindsOnlyStableDuckDBSessions(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "race.duckdb"), []byte("duckdb"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "notes.txt"), []byte("ignore"), 0o600); err != nil {
		t.Fatal(err)
	}

	candidates, err := DiscoverStandardLMU(context.Background(), root, time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	if len(candidates) != 1 || candidates[0].Format != "lmu-duckdb" {
		t.Fatalf("candidates=%+v", candidates)
	}
}

func TestDiscoverStandardLMUAcceptsMissingDefaultDirectoryAsEmpty(t *testing.T) {
	candidates, err := DiscoverStandardLMU(context.Background(), filepath.Join(t.TempDir(), "missing"), time.Millisecond)
	if err != nil || len(candidates) != 0 {
		t.Fatalf("candidates=%+v err=%v", candidates, err)
	}
}

func TestRequiredChannelsForSessionReadsEveryFamilyAndSkipsUnused(t *testing.T) {
	t.Parallel()

	required := telemetryanalysis.RequiredHistoricalPageChannels()
	channels := make([]telemetryanalysis.HistoricalChannel, 0, len(required)+1)
	for index, sourceName := range required {
		channels = append(channels, telemetryanalysis.HistoricalChannel{ID: sourceName, Order: index, SourceName: sourceName})
	}
	channels = append(channels, telemetryanalysis.HistoricalChannel{ID: "unused", Order: len(channels), SourceName: "speed"})

	got := requiredChannelsForSession(telemetryanalysis.HistoricalSession{Channels: channels})
	gotNames := make([]string, len(got))
	for index, channel := range got {
		gotNames[index] = channel.SourceName
	}
	if !slices.Equal(gotNames, required) {
		t.Fatalf("selected channels = %v, want %v", gotNames, required)
	}
}
