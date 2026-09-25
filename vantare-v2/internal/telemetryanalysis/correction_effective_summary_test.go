package telemetryanalysis

import (
	"context"
	"reflect"
	"testing"
)

func TestReadCorrectedLapValidityMatchesMaterializedView(t *testing.T) {
	for _, correctedChannel := range []string{"lap-time", "gps"} {
		t.Run(correctedChannel, func(t *testing.T) {
			model := correctionSourceExample(t)
			gpsSampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginUnknown}
			eventSampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 5, Origin: TimeOriginUnknown}
			unit := HistoricalUnit{Symbol: "s", Quality: QualityValid}
			model.Session.Channels = []HistoricalChannel{
				{ID: "gps", SourceName: "GPS Time", Sampling: gpsSampling, Unit: unit, Columns: []HistoricalColumn{{Name: "GPS Time", Type: ScalarNumber}}},
				{ID: "lap", SourceName: "Lap", Sampling: eventSampling, Columns: []HistoricalColumn{{Name: "Lap", Type: ScalarNumber}}},
				{ID: "lap-time", SourceName: "Lap Time", Sampling: eventSampling, Unit: unit, Columns: []HistoricalColumn{{Name: "Lap Time", Type: ScalarNumber}}},
			}
			pages := []HistoricalPage{{ChannelID: "gps", Sampling: gpsSampling}, {ChannelID: "lap", Sampling: eventSampling}, {ChannelID: "lap-time", Sampling: eventSampling}}
			for index := 0; index < 22; index++ {
				pages[0].Samples = append(pages[0].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("GPS Time", 100+float64(index)/10)}})
			}
			for index := 0; index < 11; index++ {
				lap, lapTime := 1.0, 0.0
				if index == 10 {
					lap, lapTime = 2, 2
				}
				pages[1].Samples = append(pages[1].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Lap", lap)}})
				pages[2].Samples = append(pages[2].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Lap Time", lapTime)}})
			}
			reader := &correctionInputReader{session: model.Session, pages: pages}
			limits := CorrectionReadLimits{PageRows: 3, MaxSamples: 1000, MaxValues: 1000, MaxTextBytes: 4096}
			input, err := ReadCorrectionInput(context.Background(), reader, model.Artifact, limits)
			if err != nil {
				t.Fatal(err)
			}
			original, err := ReadCorrectionSummary(context.Background(), reader, model.Artifact, limits)
			if err != nil || original.Base != input.Base {
				t.Fatal("original summaries differ", err)
			}
			var channel HistoricalChannel
			var sample HistoricalSample
			for _, candidate := range input.Session.Channels {
				if candidate.ID == correctedChannel {
					channel = candidate
				}
			}
			for _, page := range input.Pages {
				if page.ChannelID != correctedChannel {
					continue
				}
				for _, candidate := range page.Samples {
					if candidate.Index == 10 {
						sample = candidate
					}
				}
			}
			value := sample.Values[0]
			replacement := value.Scalar
			replacement.Number += 0.01
			request := SampleValueCorrection{Base: input.Base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: value.Column, SampleIndex: sample.Index}, Unit: channel.Unit, Expected: value, Replacement: replacement, Reason: "controlled parity test"}
			snapshot, err := PrepareSampleCorrectionSnapshot(input.Base, []SampleCorrectionInput{{Channel: channel, Sample: sample, Request: request}})
			if err != nil {
				t.Fatal(err)
			}
			view, err := ApplyMixedCorrectionSnapshot(input.Base, input.Pages, input.Validity, input.Session, snapshot)
			if err != nil {
				t.Fatal(err)
			}
			want, err := AnalyzeLapValidity(input.Session, view.Pages)
			if err != nil {
				t.Fatal(err)
			}
			got, err := ReadCorrectedLapValidity(context.Background(), reader, model.Artifact, limits, original, snapshot)
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("corrected validity differs from materialized view: %v", err)
			}
			oldPage, err := InspectCorrectionLaps(input, snapshot, 0, MaxCorrectionLapPage)
			if err != nil {
				t.Fatal(err)
			}
			newPage, err := BuildCorrectionLapPage(original.Base, original.Validity, got, snapshot.SnapshotID, 0, MaxCorrectionLapPage)
			if err != nil || !reflect.DeepEqual(newPage, oldPage) {
				t.Fatalf("public lap page differs from materialized view: %v", err)
			}
		})
	}
}
