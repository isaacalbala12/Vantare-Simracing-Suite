package coldstart

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

func TestEnrichCatalogableModelReportsLapAnalysisFailure(t *testing.T) {
	model := telemetryanalysis.AuthorizedSessionModel{Session: telemetryanalysis.HistoricalSession{ID: "session-with-laps", Laps: []telemetryanalysis.HistoricalLap{{Number: 1}}}}
	_, err := enrichCatalogableModel(model, nil)
	if !errors.Is(err, telemetryanalysis.ErrInvalidLapValidityInput) {
		t.Fatalf("error = %v", err)
	}
	if err.Error() != "analyze LMU lap validity: invalid lap validity input: no lap event or lap distance reset" {
		t.Fatalf("reason = %q", err)
	}
}

func TestEnrichCatalogableModelReportsClassificationFailure(t *testing.T) {
	timestamp := 90.0
	sampling := telemetryanalysis.HistoricalSampling{Kind: telemetryanalysis.SamplingEventTimestamped, Origin: telemetryanalysis.TimeOriginSourceTimestamp}
	session := telemetryanalysis.HistoricalSession{
		ID:         "session-without-type",
		Provenance: telemetryanalysis.HistoricalProvenance{Source: telemetryanalysis.ManifestSource{Kind: telemetryanalysis.SourceLMU}},
		Metadata: []telemetryanalysis.HistoricalMetadata{
			{Key: "TrackName", Present: true, Value: "Fuji", Quality: telemetryanalysis.QualityValid},
			{Key: "TrackLayout", Present: true, Value: "Classic", Quality: telemetryanalysis.QualityValid},
			{Key: "CarName", Present: true, Value: "499P", Quality: telemetryanalysis.QualityValid},
			{Key: "CarClass", Present: true, Value: "Hypercar", Quality: telemetryanalysis.QualityValid},
			{Key: "WeatherConditions", Present: true, Value: "Clear", Quality: telemetryanalysis.QualityValid},
		},
		Channels: []telemetryanalysis.HistoricalChannel{
			{ID: "lap", SourceName: "lap", Sampling: sampling},
			{ID: "lap-time", SourceName: "lap time", Sampling: sampling},
		},
	}
	pages := []telemetryanalysis.HistoricalPage{
		{ChannelID: "lap", Sampling: sampling, Samples: []telemetryanalysis.HistoricalSample{{Index: 0, TimestampSeconds: &timestamp, Values: []telemetryanalysis.HistoricalValue{{Present: true, Quality: telemetryanalysis.QualityValid, Scalar: telemetryanalysis.HistoricalScalar{Kind: telemetryanalysis.ScalarInteger, Integer: 1}}}}}},
		{ChannelID: "lap-time", Sampling: sampling, Samples: []telemetryanalysis.HistoricalSample{{Index: 0, TimestampSeconds: &timestamp, Values: []telemetryanalysis.HistoricalValue{{Present: true, Quality: telemetryanalysis.QualityValid, Scalar: telemetryanalysis.HistoricalScalar{Kind: telemetryanalysis.ScalarNumber, Number: 90}}}}}},
	}

	_, err := enrichCatalogableModel(telemetryanalysis.AuthorizedSessionModel{Session: session}, pages)
	if !errors.Is(err, telemetryanalysis.ErrInvalidSessionClassification) {
		t.Fatalf("error = %v", err)
	}
	if err.Error() != "classify LMU historical session: invalid historical session classification: missing SessionType" {
		t.Fatalf("reason = %q", err)
	}
}

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
