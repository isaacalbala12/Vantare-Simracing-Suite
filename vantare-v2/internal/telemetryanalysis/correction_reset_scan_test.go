package telemetryanalysis

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestScannedCorrectionResetsMatchMaterializedAlignment(t *testing.T) {
	for _, test := range []struct {
		name      string
		gpsValues []float64
	}{
		{name: "aligned", gpsValues: []float64{100, 100.1, 100.2, 100.3, 100.4, 100.5, 100.6, 100.7, 100.8, 100.9, 101, 101.1}},
		{name: "truncated coverage", gpsValues: []float64{100, 100.1, 100.2, 100.3, 100.4, 100.5, 100.6, 100.7, 100.8, 100.9}},
		{name: "invalid bridge", gpsValues: []float64{100, 100.1, 100.2, 100.3, 100.4, 100.5, 100.6, 100.7, 100.8, 100.9, 99, 101.1}},
	} {
		t.Run(test.name, func(t *testing.T) {
			model := correctionSourceExample(t)
			gpsSampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginUnknown}
			lapSampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 5, Origin: TimeOriginUnknown}
			gps := HistoricalChannel{ID: "gps", SourceName: "GPS Time", Sampling: gpsSampling, Columns: []HistoricalColumn{{Name: "GPS Time", Type: ScalarNumber}}}
			lap := HistoricalChannel{ID: "distance", SourceName: "Lap Dist", Sampling: lapSampling, Columns: []HistoricalColumn{{Name: "Lap Dist", Type: ScalarNumber}}}
			model.Session.Channels = []HistoricalChannel{gps, lap}
			gpsPage := HistoricalPage{ChannelID: gps.ID, Sampling: gpsSampling}
			for index, value := range test.gpsValues {
				gpsPage.Samples = append(gpsPage.Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("GPS Time", value)}})
			}
			lapPage := HistoricalPage{ChannelID: lap.ID, Sampling: lapSampling}
			for index, value := range []float64{900, 950, 10, 980, 990, 20} {
				lapPage.Samples = append(lapPage.Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Lap Dist", value)}})
			}
			pages := []HistoricalPage{gpsPage, lapPage}
			reader := &correctionInputReader{session: model.Session, pages: pages}
			limits := CorrectionReadLimits{PageRows: 3, MaxSamples: 100, MaxValues: 100, MaxTextBytes: 4096}
			got, frequency, bridge, channel, err := scanCorrectionLapDistResets(context.Background(), reader, model.Artifact, limits)
			if err != nil {
				t.Fatal(err)
			}
			aligned := BuildTemporalAlignment(model.Session, pages)
			want, wantFrequency := readLapDistResetObservations([]HistoricalPage{aligned.Pages[1]})
			if frequency != wantFrequency || !reflect.DeepEqual(got, want) || bridge != aligned.Bridge || channel != aligned.Channels[lap.ID] {
				t.Fatalf("streamed resets (%v, %d, %+v, %+v) differ from materialized (%v, %d, %+v, %+v)", got, frequency, bridge, channel, want, wantFrequency, aligned.Bridge, aligned.Channels[lap.ID])
			}
			if len(got) != 2 || (test.name == "aligned" && got[0].seconds == nil) || (test.name != "aligned" && got[0].seconds != nil) {
				t.Fatalf("wrong reset timestamp state: %+v", got)
			}
		})
	}
}

func TestScannedCorrectionResetsRespectCancellationAndBudget(t *testing.T) {
	model := correctionSourceExample(t)
	channel := HistoricalChannel{ID: "distance", SourceName: "Lap Dist", Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 5, Origin: TimeOriginUnknown}}
	model.Session.Channels = []HistoricalChannel{channel}
	reader := &correctionInputReader{session: model.Session, pages: []HistoricalPage{{ChannelID: channel.ID, Sampling: channel.Sampling, Samples: []HistoricalSample{{Index: 0, Values: []HistoricalValue{numberValue("Lap Dist", 900)}}}}}}
	limits := CorrectionReadLimits{PageRows: 2, MaxSamples: 1, MaxValues: 1, MaxTextBytes: 1024}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, _, _, err := scanCorrectionLapDistResets(ctx, reader, model.Artifact, limits); !errors.Is(err, context.Canceled) || reader.calls != 0 {
		t.Fatalf("cancelled scan read source: %v, calls=%d", err, reader.calls)
	}
	limits.MaxSamples = 0
	if _, _, _, _, err := scanCorrectionLapDistResets(context.Background(), reader, model.Artifact, limits); !errors.Is(err, ErrCorrectionReadLimit) {
		t.Fatalf("scan bypassed read budget: %v", err)
	}
}

func TestScannedCorrectionBridgeReasonsMatchMaterialized(t *testing.T) {
	base := correctionSourceExample(t)
	sampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginUnknown}
	gps := HistoricalChannel{ID: "gps", SourceName: "GPS Time", Sampling: sampling, Columns: []HistoricalColumn{{Name: "GPS Time", Type: ScalarNumber}}}
	page := HistoricalPage{ChannelID: gps.ID, Sampling: sampling, Samples: []HistoricalSample{{Index: 0, Values: []HistoricalValue{numberValue("GPS Time", 100)}}}}
	for _, test := range []struct {
		name     string
		channels []HistoricalChannel
		pages    []HistoricalPage
	}{
		{name: "absent"},
		{name: "duplicate bridge", channels: []HistoricalChannel{gps, {ID: "gps2", SourceName: "GPS Time", Sampling: sampling, Columns: gps.Columns}}, pages: []HistoricalPage{page, {ChannelID: "gps2", Sampling: sampling, Samples: page.Samples}}},
		{name: "invalid shape", channels: []HistoricalChannel{{ID: gps.ID, SourceName: gps.SourceName, Sampling: sampling}}, pages: []HistoricalPage{page}},
		{name: "invalid frequency", channels: []HistoricalChannel{{ID: gps.ID, SourceName: gps.SourceName, Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency}, Columns: gps.Columns}}, pages: []HistoricalPage{page}},
		{name: "empty bridge", channels: []HistoricalChannel{gps}},
	} {
		t.Run(test.name, func(t *testing.T) {
			model := base
			model.Session.Channels = test.channels
			reader := &correctionInputReader{session: model.Session, pages: test.pages}
			_, _, bridge, _, err := scanCorrectionLapDistResets(context.Background(), reader, model.Artifact, CorrectionReadLimits{PageRows: 2, MaxSamples: 20, MaxValues: 20, MaxTextBytes: 1024})
			if err != nil {
				t.Fatal(err)
			}
			want := BuildTemporalAlignment(model.Session, test.pages).Bridge
			if bridge != want {
				t.Fatalf("bridge = %+v, materialized = %+v", bridge, want)
			}
		})
	}
}
