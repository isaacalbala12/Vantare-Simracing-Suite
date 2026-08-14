package main

import (
	"context"
	"fmt"
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type fakeParserV1 struct {
	session telemetryanalysis.HistoricalSession
	pages   map[string][]telemetryanalysis.HistoricalSample
	calls   map[string]int
}

func (f *fakeParserV1) Inspect(context.Context) (telemetryanalysis.HistoricalSession, error) {
	return f.session, nil
}
func (f *fakeParserV1) ReadPage(_ context.Context, id string, start int64, limit int) (telemetryanalysis.HistoricalPage, error) {
	f.calls[id]++
	all := f.pages[id]
	if start >= int64(len(all)) {
		return telemetryanalysis.HistoricalPage{ChannelID: id, Start: start}, nil
	}
	end := int(start) + limit
	if end > len(all) {
		end = len(all)
	}
	return telemetryanalysis.HistoricalPage{ChannelID: id, Start: start, Samples: append([]telemetryanalysis.HistoricalSample(nil), all[start:end]...)}, nil
}

func TestMaterializeUsesExactFiveChannelsAndSecondStreamingCoordinatePass(t *testing.T) {
	p := syntheticHistoricalParserV1(t)
	var key [32]byte
	for i := range key {
		key[i] = byte(i)
	}
	r, algarve, sessionID, err := materializeRecordingV1(context.Background(), p, key)
	if err != nil || !algarve || sessionID != "opaque-session" {
		t.Fatalf("algarve=%v session=%q err=%v", algarve, sessionID, err)
	}
	if r.Coordinates.Count != 27 || len(r.GPSTime.Samples) != 53 || len(r.LapEvents.Events) != 14 {
		t.Fatalf("recording=%+v", r)
	}
	if p.calls["lat"] != 2 || p.calls["lon"] != 2 {
		t.Fatalf("coordinate passes=%v", p.calls)
	}
	if r.Coordinates.Digest != (CoordinateDigestV1{0x02, 0x2c, 0xb5, 0x59, 0xb6, 0x84, 0xbe, 0xa0, 0x22, 0xff, 0xf3, 0x31, 0x8b, 0x20, 0x87, 0x1d, 0x6d, 0xfb, 0x11, 0xa8, 0xbc, 0x23, 0x89, 0x6f, 0x69, 0xcc, 0x02, 0xf7, 0x39, 0x84, 0xcd, 0x81}) {
		t.Fatalf("coordinate digest mismatch: %x", r.Coordinates.Digest)
	}
}

func syntheticHistoricalParserV1(t *testing.T) *fakeParserV1 {
	t.Helper()
	metadata := []telemetryanalysis.HistoricalMetadata{
		{Key: "TrackName", Present: true, Value: "Algarve International Circuit", Quality: telemetryanalysis.QualityValid},
		{Key: "TrackLayout", Present: true, Value: "Layout", Quality: telemetryanalysis.QualityValid},
		{Key: "CarName", Present: true, Value: "Car", Quality: telemetryanalysis.QualityValid},
		{Key: "CarClass", Present: true, Value: "Class", Quality: telemetryanalysis.QualityValid},
	}
	channels := []telemetryanalysis.HistoricalChannel{
		{ID: "lat", SourceName: "GPS Latitude", Sampling: telemetryanalysis.HistoricalSampling{Kind: telemetryanalysis.SamplingContinuousImplicitFrequency, FrequencyHz: 1}, Columns: []telemetryanalysis.HistoricalColumn{{Name: "value", Type: telemetryanalysis.ScalarNumber}}, Capability: telemetryanalysis.QualityValid},
		{ID: "lon", SourceName: "GPS Longitude", Sampling: telemetryanalysis.HistoricalSampling{Kind: telemetryanalysis.SamplingContinuousImplicitFrequency, FrequencyHz: 1}, Columns: []telemetryanalysis.HistoricalColumn{{Name: "value", Type: telemetryanalysis.ScalarNumber}}, Capability: telemetryanalysis.QualityValid},
		{ID: "gps", SourceName: "GPS Time", Sampling: telemetryanalysis.HistoricalSampling{Kind: telemetryanalysis.SamplingContinuousImplicitFrequency, FrequencyHz: 2}, Columns: []telemetryanalysis.HistoricalColumn{{Name: "value", Type: telemetryanalysis.ScalarNumber}}, Capability: telemetryanalysis.QualityValid},
		{ID: "lapdist", SourceName: "Lap Dist", Sampling: telemetryanalysis.HistoricalSampling{Kind: telemetryanalysis.SamplingContinuousImplicitFrequency, FrequencyHz: 1}, Columns: []telemetryanalysis.HistoricalColumn{{Name: "value", Type: telemetryanalysis.ScalarNumber}}, Capability: telemetryanalysis.QualityValid},
		{ID: "total", SourceName: "Total Dist", Sampling: telemetryanalysis.HistoricalSampling{Kind: telemetryanalysis.SamplingContinuousImplicitFrequency, FrequencyHz: 1}, Columns: []telemetryanalysis.HistoricalColumn{{Name: "value", Type: telemetryanalysis.ScalarNumber}}, Capability: telemetryanalysis.QualityValid},
		{ID: "lap", SourceName: "Lap", Sampling: telemetryanalysis.HistoricalSampling{Kind: telemetryanalysis.SamplingEventTimestamped}, Columns: []telemetryanalysis.HistoricalColumn{{Name: "value", Type: telemetryanalysis.ScalarInteger}}, Capability: telemetryanalysis.QualityValid},
	}
	pages := map[string][]telemetryanalysis.HistoricalSample{}
	for i := 0; i < 27; i++ {
		pages["lat"] = append(pages["lat"], histNumberV1(i, 40+float64(i)/1000))
		pages["lon"] = append(pages["lon"], histNumberV1(i, -8-float64(i)/1000))
		v := 1.0
		if i > 0 && i%2 == 1 {
			v = 0
		}
		pages["lapdist"] = append(pages["lapdist"], histNumberV1(i, v))
		pages["total"] = append(pages["total"], histNumberV1(i, float64(i)))
	}
	for i := 0; i < 53; i++ {
		pages["gps"] = append(pages["gps"], histNumberV1(i, float64(i)/2+.25))
	}
	for i := 0; i < 14; i++ {
		ts := .25
		if i > 0 {
			ts = float64(1+2*(i-1)) + .25
		}
		s := histIntegerV1(i, int64(i))
		s.TimestampSeconds = &ts
		pages["lap"] = append(pages["lap"], s)
	}
	return &fakeParserV1{session: telemetryanalysis.HistoricalSession{ID: "opaque-session", Metadata: metadata, Channels: channels}, pages: pages, calls: map[string]int{}}
}
func histNumberV1(i int, v float64) telemetryanalysis.HistoricalSample {
	return telemetryanalysis.HistoricalSample{Index: int64(i), Values: []telemetryanalysis.HistoricalValue{{Column: "value", Present: true, Quality: telemetryanalysis.QualityValid, Scalar: telemetryanalysis.HistoricalScalar{Kind: telemetryanalysis.ScalarNumber, Number: v}}}}
}
func histIntegerV1(i int, v int64) telemetryanalysis.HistoricalSample {
	return telemetryanalysis.HistoricalSample{Index: int64(i), Values: []telemetryanalysis.HistoricalValue{{Column: "value", Present: true, Quality: telemetryanalysis.QualityValid, Scalar: telemetryanalysis.HistoricalScalar{Kind: telemetryanalysis.ScalarInteger, Integer: v}}}}
}

func TestMaterializeRealLapIntegerSchemaIsOracleEvaluable(t *testing.T) {
	p := syntheticHistoricalParserV1(t)
	recording, _, _, err := materializeRecordingV1(context.Background(), p, [32]byte{})
	if err != nil {
		t.Fatal(err)
	}
	result, err := ClassifyV1(recording)
	if err != nil || len(recording.LapEvents.Events) != 14 || result.Population != PopulationEvaluable {
		t.Fatalf("events=%d population=%s err=%v", len(recording.LapEvents.Events), result.Population, err)
	}
}

func TestLapIntegerConversionExactBoundaryAndOutsideInvalid(t *testing.T) {
	const exact = int64(1 << 53)
	for _, tt := range []struct {
		name    string
		value   int64
		quality string
	}{
		{"negative exact", -exact, "valid"},
		{"positive exact", exact, "valid"},
		{"negative outside", -exact - 1, "invalid"},
		{"positive outside", exact + 1, "invalid"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			sample := histIntegerV1(0, tt.value)
			ts := 1.0
			sample.TimestampSeconds = &ts
			p := &fakeParserV1{pages: map[string][]telemetryanalysis.HistoricalSample{"lap": {sample}}, calls: map[string]int{}}
			ch := telemetryanalysis.HistoricalChannel{ID: "lap", SourceName: "Lap", Sampling: telemetryanalysis.HistoricalSampling{Kind: telemetryanalysis.SamplingEventTimestamped}, Columns: []telemetryanalysis.HistoricalColumn{{Name: "value", Type: telemetryanalysis.ScalarInteger}}, Capability: telemetryanalysis.QualityValid}
			events, err := readEventsV1(context.Background(), p, ch)
			if err != nil || len(events.Events) != 1 {
				t.Fatalf("events=%d err=%v", len(events.Events), err)
			}
			got := events.Events[0]
			if got.Quality != tt.quality || (tt.quality == "valid" && got.Value != float64(tt.value)) || (tt.quality == "invalid" && !math.IsNaN(got.Value)) {
				t.Fatalf("event=%+v", got)
			}
		})
	}
}

func TestLapIntegerOutsideExactRangePreservesCountForOracleInvalid(t *testing.T) {
	p := syntheticHistoricalParserV1(t)
	p.pages["lap"][0].Values[0].Scalar.Integer = int64(1<<53) + 1
	recording, _, _, err := materializeRecordingV1(context.Background(), p, [32]byte{})
	if err != nil {
		t.Fatal(err)
	}
	result, err := ClassifyV1(recording)
	if err != nil || len(recording.LapEvents.Events) != 14 || result.Population != PopulationInvalid {
		t.Fatalf("events=%d population=%s err=%v", len(recording.LapEvents.Events), result.Population, err)
	}
}

func TestHistoricalPagingCrosses4096And8192WithoutLoss(t *testing.T) {
	continuous := make([]telemetryanalysis.HistoricalSample, 8195)
	events := make([]telemetryanalysis.HistoricalSample, 8195)
	for i := range continuous {
		continuous[i] = histNumberV1(i, float64(i))
		events[i] = histNumberV1(i, float64(i))
		ts := float64(i)
		events[i].TimestampSeconds = &ts
	}
	p := &fakeParserV1{pages: map[string][]telemetryanalysis.HistoricalSample{"numeric": continuous, "events": events}, calls: map[string]int{}}
	channel, err := readContinuousV1(context.Background(), p, telemetryanalysis.HistoricalChannel{ID: "numeric", SourceName: "GPS Time", Sampling: telemetryanalysis.HistoricalSampling{Kind: telemetryanalysis.SamplingContinuousImplicitFrequency, FrequencyHz: 100}, Columns: []telemetryanalysis.HistoricalColumn{{Name: "value", Type: telemetryanalysis.ScalarNumber}}, Capability: telemetryanalysis.QualityValid})
	if err != nil || len(channel.Samples) != 8195 || channel.Samples[4095].Index != 4095 || channel.Samples[4096].Index != 4096 || channel.Samples[8191].Index != 8191 || channel.Samples[8192].Index != 8192 || p.calls["numeric"] != 3 {
		t.Fatalf("numeric=%d calls=%d err=%v", len(channel.Samples), p.calls["numeric"], err)
	}
	laps, err := readEventsV1(context.Background(), p, telemetryanalysis.HistoricalChannel{ID: "events", SourceName: "Lap", Sampling: telemetryanalysis.HistoricalSampling{Kind: telemetryanalysis.SamplingEventTimestamped}, Columns: []telemetryanalysis.HistoricalColumn{{Name: "value", Type: telemetryanalysis.ScalarNumber}}, Capability: telemetryanalysis.QualityValid})
	if err != nil || len(laps.Events) != 8195 || laps.Events[4096].Index != 4096 || laps.Events[8192].Index != 8192 || p.calls["events"] != 3 {
		t.Fatalf("events=%d calls=%d err=%v", len(laps.Events), p.calls["events"], err)
	}
}

func TestCorruptEventRowsPreserveCountForOraclePopulation(t *testing.T) {
	for _, corruption := range []string{"value", "timestamp"} {
		for _, count := range []int{1, 2} {
			t.Run(corruption+fmt.Sprint(count), func(t *testing.T) {
				p := syntheticHistoricalParserV1(t)
				p.pages["lap"] = p.pages["lap"][:count]
				if corruption == "value" {
					p.pages["lap"][0].Values[0].Present = false
					p.pages["lap"][0].Values[0].Quality = telemetryanalysis.QualityInvalid
				} else {
					p.pages["lap"][0].TimestampSeconds = nil
				}
				var key [32]byte
				r, _, _, err := materializeRecordingV1(context.Background(), p, key)
				if err != nil {
					t.Fatal(err)
				}
				result, err := ClassifyV1(r)
				if err != nil {
					t.Fatal(err)
				}
				want := PopulationLowEvent
				if count >= 2 {
					want = PopulationInvalid
				}
				if result.Population != want {
					t.Fatalf("population=%s want=%s events=%d", result.Population, want, len(r.LapEvents.Events))
				}
			})
		}
	}
}

func TestMissingChannelsPreserveOraclePopulationPrecedence(t *testing.T) {
	tests := []struct {
		name, missing string
		want          PopulationV1
		guard         bool
	}{
		{"missing gps", "GPS Time", PopulationInvalid, false},
		{"missing latitude", "GPS Latitude", PopulationEvaluable, true},
		{"missing longitude", "GPS Longitude", PopulationEvaluable, true},
		{"missing lap distance", "Lap Dist", PopulationEvaluable, true},
		{"missing total distance", "Total Dist", PopulationEvaluable, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := syntheticHistoricalParserV1(t)
			filtered := p.session.Channels[:0]
			for _, ch := range p.session.Channels {
				if ch.SourceName != tt.missing {
					filtered = append(filtered, ch)
				}
			}
			p.session.Channels = filtered
			var key [32]byte
			r, algarve, _, err := materializeRecordingV1(context.Background(), p, key)
			if err != nil || !algarve {
				t.Fatalf("algarve=%v err=%v", algarve, err)
			}
			result, classErr := ClassifyV1(r)
			if result.Population != tt.want {
				t.Fatalf("population=%s want=%s err=%v", result.Population, tt.want, classErr)
			}
			if (classErr != nil) != tt.guard {
				t.Fatalf("guard=%v want=%v", classErr, tt.guard)
			}
		})
	}
}
