package telemetryanalysis

import (
	"context"
	"errors"
	"testing"
)

func TestReadCorrectionTargetPagesFeedsExistingSnapshotValidator(t *testing.T) {
	base, channel, sample, request := correctionExample()
	channel.SourceName = "Fuel Level"
	prepared, err := PrepareSampleCorrection(base, channel, sample, request)
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{{Channel: channel, Sample: sample, Request: request}})
	if err != nil {
		t.Fatal(err)
	}
	session := HistoricalSession{ID: base.SessionID, Channels: []HistoricalChannel{channel}}
	reader := &correctionInputReader{session: session, pages: []HistoricalPage{{ChannelID: channel.ID, Samples: []HistoricalSample{sample}}}}
	pages, err := ReadCorrectionTargetPages(context.Background(), reader, session, []PreparedSampleCorrection{prepared, prepared})
	if err != nil || len(pages) != 1 || reader.calls != 1 {
		t.Fatalf("target read = %d pages, %d calls, %v", len(pages), reader.calls, err)
	}
	view, err := ApplyMixedCorrectionSnapshot(base, pages, LapValidityAnalysis{}, session, snapshot)
	if err != nil || view.SnapshotID != snapshot.SnapshotID || view.Pages[0].Samples[0].Values[0].Scalar.Number != 0 {
		t.Fatal("existing snapshot validator rejected targeted original", err)
	}
	if sample.Values[0].Scalar.Number != 10 {
		t.Fatal("target read mutated original")
	}

	reader.malformed = true
	if _, err := ReadCorrectionTargetPages(context.Background(), reader, session, snapshot.Corrections); !errors.Is(err, ErrInvalidHistoricalPage) {
		t.Fatalf("accepted malformed target page: %v", err)
	}
	reader.malformed = false
	reader.pages = nil
	if _, err := ReadCorrectionTargetPages(context.Background(), reader, session, snapshot.Corrections); !errors.Is(err, ErrCorrectionTarget) {
		t.Fatalf("accepted absent target: %v", err)
	}
	reader.pages = []HistoricalPage{{ChannelID: channel.ID, Samples: []HistoricalSample{sample}}}
	foreign := session
	foreign.Channels = append([]HistoricalChannel(nil), session.Channels...)
	foreign.Channels[0].SourceName = "Unrelated Signal"
	if _, err := ReadCorrectionTargetPages(context.Background(), reader, foreign, snapshot.Corrections); !errors.Is(err, ErrCorrectionTarget) {
		t.Fatalf("accepted channel outside full analysis: %v", err)
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := ReadCorrectionTargetPages(canceled, reader, session, snapshot.Corrections); !errors.Is(err, context.Canceled) {
		t.Fatalf("read after cancellation: %v", err)
	}
}
