package telemetryanalysis

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type cancellingProjectionReader struct {
	CorrectionInputReader
	cancel context.CancelFunc
	reads  int
}

func (reader *cancellingProjectionReader) ReadPage(ctx context.Context, channelID string, start int64, limit int) (HistoricalPage, error) {
	page, err := reader.CorrectionInputReader.ReadPage(ctx, channelID, start, limit)
	reader.reads++
	if reader.reads == 3 {
		reader.cancel()
	}
	return page, err
}

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

func TestPagedCorrectedDerivationMatchesMaterializedFixture(t *testing.T) {
	model := correctionSourceExample(t)
	gpsSampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginUnknown}
	dataSampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 5, Origin: TimeOriginUnknown}
	unit := HistoricalUnit{Symbol: "L", Quality: QualityValid}
	model.Session.Channels = []HistoricalChannel{
		{ID: "gps", SourceName: "GPS Time", Sampling: gpsSampling, Unit: HistoricalUnit{Symbol: "s", Quality: QualityValid}, Columns: []HistoricalColumn{{Name: "GPS Time", Type: ScalarNumber}}},
		{ID: "lap", SourceName: "Lap", Sampling: dataSampling, Columns: []HistoricalColumn{{Name: "Lap", Type: ScalarNumber}}},
		{ID: "lap-time", SourceName: "Lap Time", Sampling: dataSampling, Columns: []HistoricalColumn{{Name: "Lap Time", Type: ScalarNumber}}},
		{ID: "fuel", SourceName: "Fuel Level", Sampling: dataSampling, Unit: unit, Columns: []HistoricalColumn{{Name: "Fuel Level", Type: ScalarNumber}}},
		{ID: "ve", SourceName: "Virtual Energy", Sampling: dataSampling, Columns: []HistoricalColumn{{Name: "Virtual Energy", Type: ScalarNumber}}},
		{ID: "wet", SourceName: "Minimum Path Wetness", Sampling: dataSampling, Columns: []HistoricalColumn{{Name: "Minimum Path Wetness", Type: ScalarNumber}}},
	}
	pages := make([]HistoricalPage, len(model.Session.Channels))
	for index, channel := range model.Session.Channels {
		pages[index] = HistoricalPage{ChannelID: channel.ID, Sampling: channel.Sampling}
	}
	for index := 0; index < 31; index++ {
		pages[0].Samples = append(pages[0].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("GPS Time", 100+float64(index)/10)}})
	}
	for index := 0; index < 16; index++ {
		lap, lapTime := 1.0, 0.0
		if index >= 10 {
			lap, lapTime = 2, 2
		}
		pages[1].Samples = append(pages[1].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Lap", lap)}})
		pages[2].Samples = append(pages[2].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Lap Time", lapTime)}})
		pages[3].Samples = append(pages[3].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Fuel Level", 50-float64(index)/5)}})
		pages[4].Samples = append(pages[4].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Virtual Energy", 80-float64(index)/10)}})
		pages[5].Samples = append(pages[5].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Minimum Path Wetness", 0)}})
	}
	reader := &correctionInputReader{session: model.Session, pages: pages}
	limits := CorrectionReadLimits{PageRows: 4, MaxSamples: 200, MaxValues: 200, MaxTextBytes: 8192}
	input, err := ReadCorrectionInput(context.Background(), reader, model.Artifact, limits)
	if err != nil {
		t.Fatal(err)
	}
	summary, err := ReadCorrectionSummary(context.Background(), reader, model.Artifact, limits)
	if err != nil || summary.Base != input.Base {
		t.Fatal("summary differs", err)
	}
	classified := ClassifiedSession{SessionID: input.Session.ID, Combination: CombinationIdentity{ID: "fixture-combination"}, Type: SessionTypeRace}
	baseSnapshot, err := PrepareSampleCorrectionSnapshot(input.Base, nil)
	if err != nil {
		t.Fatal(err)
	}
	var fuelChannel HistoricalChannel
	var fuelSample HistoricalSample
	for _, channel := range input.Session.Channels {
		if channel.ID == "fuel" {
			fuelChannel = channel
		}
	}
	for _, page := range input.Pages {
		if page.ChannelID == "fuel" {
			for _, sample := range page.Samples {
				if sample.Index == 8 {
					fuelSample = sample
				}
			}
		}
	}
	expected := fuelSample.Values[0]
	replacement := expected.Scalar
	replacement.Number += 0.2
	request := SampleValueCorrection{Base: input.Base, Target: SampleCorrectionTarget{ChannelID: "fuel", Column: expected.Column, SampleIndex: fuelSample.Index}, Unit: fuelChannel.Unit, Expected: expected, Replacement: replacement, Reason: "fixture parity"}
	correctedSnapshot, err := PrepareSampleCorrectionSnapshot(input.Base, []SampleCorrectionInput{{Channel: fuelChannel, Sample: fuelSample, Request: request}})
	if err != nil {
		t.Fatal(err)
	}
	var gpsChannel HistoricalChannel
	var gpsSample HistoricalSample
	for _, channel := range input.Session.Channels {
		if channel.ID == "gps" {
			gpsChannel = channel
		}
	}
	for _, page := range input.Pages {
		if page.ChannelID == "gps" {
			for _, sample := range page.Samples {
				if sample.Index == 20 {
					gpsSample = sample
				}
			}
		}
	}
	gpsExpected := gpsSample.Values[0]
	gpsReplacement := gpsExpected.Scalar
	gpsReplacement.Number += 0.01
	gpsRequest := SampleValueCorrection{Base: input.Base, Target: SampleCorrectionTarget{ChannelID: "gps", Column: gpsExpected.Column, SampleIndex: gpsSample.Index}, Unit: gpsChannel.Unit, Expected: gpsExpected, Replacement: gpsReplacement, Reason: "GPS boundary parity"}
	gpsSnapshot, err := PrepareSampleCorrectionSnapshot(input.Base, []SampleCorrectionInput{{Channel: gpsChannel, Sample: gpsSample, Request: gpsRequest}})
	if err != nil {
		t.Fatal(err)
	}
	for _, snapshot := range []PreparedSampleCorrectionSnapshot{baseSnapshot, correctedSnapshot, gpsSnapshot} {
		want, err := DeriveCorrectedSession(input.Base, input.Session, input.Pages, classified, snapshot)
		if err != nil {
			t.Fatal(err)
		}
		if len(want.Validity.Laps) != 2 || len(want.Consumption.Laps) != 2 || want.Observed == nil {
			t.Fatal("fixture did not exercise race derivation")
		}
		got, err := DerivePagedCorrectedSession(context.Background(), reader, model.Artifact, limits, summary, classified, snapshot)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Logf("diff: validity=%v consumption=%v curves=%v pit=%v observed=%v", !reflect.DeepEqual(got.Validity, want.Validity), !reflect.DeepEqual(got.Consumption, want.Consumption), !reflect.DeepEqual(got.Curves, want.Curves), !reflect.DeepEqual(got.Pit, want.Pit), !reflect.DeepEqual(got.Observed, want.Observed))
			t.Fatalf("paged corrected derivation differs for %s: %v", snapshot.SnapshotID, err)
		}
	}
	cancelled, cancel := context.WithCancel(context.Background())
	partialReader := &cancellingProjectionReader{CorrectionInputReader: reader, cancel: cancel}
	partial, err := DerivePagedCorrectedSession(cancelled, partialReader, model.Artifact, limits, summary, classified, baseSnapshot)
	if !errors.Is(err, context.Canceled) || !reflect.DeepEqual(partial, CorrectedSessionDerivations{}) {
		t.Fatalf("cancelled paged projection returned partial model: %v", err)
	}
}
