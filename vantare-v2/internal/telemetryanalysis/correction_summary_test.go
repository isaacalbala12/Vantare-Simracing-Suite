package telemetryanalysis

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type driftingCorrectionReader struct {
	*correctionInputReader
	inspects int
}

func (reader *driftingCorrectionReader) Inspect(ctx context.Context) (HistoricalSession, error) {
	session, err := reader.correctionInputReader.Inspect(ctx)
	reader.inspects++
	if reader.inspects > 1 {
		session.ID += "-changed"
	}
	return session, err
}

func TestCorrectionSummaryAlignsContinuousLapEvents(t *testing.T) {
	model := correctionSourceExample(t)
	gpsSampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginUnknown}
	eventSampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 5, Origin: TimeOriginUnknown}
	model.Session.Channels = []HistoricalChannel{
		{ID: "gps", SourceName: "GPS Time", Sampling: gpsSampling, Columns: []HistoricalColumn{{Name: "GPS Time", Type: ScalarNumber}}},
		{ID: "lap", SourceName: "Lap", Sampling: eventSampling, Columns: []HistoricalColumn{{Name: "Lap", Type: ScalarNumber}}},
		{ID: "lap-time", SourceName: "Lap Time", Sampling: eventSampling, Columns: []HistoricalColumn{{Name: "Lap Time", Type: ScalarNumber}}},
	}
	pages := []HistoricalPage{{ChannelID: "gps", Sampling: gpsSampling}, {ChannelID: "lap", Sampling: eventSampling}, {ChannelID: "lap-time", Sampling: eventSampling}}
	for index := 0; index < 22; index++ {
		pages[0].Samples = append(pages[0].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("GPS Time", 100+float64(index)/10)}})
	}
	for index := 0; index < 11; index++ {
		lap := 1.0
		lapTime := 0.0
		if index == 10 {
			lap, lapTime = 2, 2
		}
		pages[1].Samples = append(pages[1].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Lap", lap)}})
		pages[2].Samples = append(pages[2].Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Lap Time", lapTime)}})
	}
	reader := &correctionInputReader{session: model.Session, pages: pages}
	limits := CorrectionReadLimits{PageRows: 3, MaxSamples: 100, MaxValues: 100, MaxTextBytes: 4096}
	materialized, err := ReadCorrectionInput(context.Background(), reader, model.Artifact, limits)
	if err != nil {
		t.Fatal(err)
	}
	summary, err := ReadCorrectionSummary(context.Background(), reader, model.Artifact, limits)
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.Validity.Laps) != 2 || summary.Validity.Diagnostics.UsableLapTimeRows != 1 ||
		summary.Base != materialized.Base || !reflect.DeepEqual(summary.Session, materialized.Session) || !reflect.DeepEqual(summary.Validity, materialized.Validity) {
		t.Fatal("continuous event alignment differs from materialized input")
	}
	if _, err := ReadCorrectionSummary(context.Background(), &driftingCorrectionReader{correctionInputReader: reader}, model.Artifact, limits); !errors.Is(err, ErrInvalidCorrectionSource) {
		t.Fatalf("accepted changed session between page visits: %v", err)
	}
}
