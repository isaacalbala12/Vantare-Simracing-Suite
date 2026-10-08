package telemetryanalysis

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type correctionInputReader struct {
	session   HistoricalSession
	pages     []HistoricalPage
	err       error
	malformed bool
	calls     int
	reads     map[string]int
}

func (r *correctionInputReader) Inspect(context.Context) (HistoricalSession, error) {
	return r.session, r.err
}
func (r *correctionInputReader) ReadPage(_ context.Context, id string, start int64, limit int) (HistoricalPage, error) {
	r.calls++
	if r.reads != nil {
		r.reads[id]++
	}
	if r.err != nil {
		return HistoricalPage{}, r.err
	}
	result := HistoricalPage{ChannelID: id, Start: start}
	if r.malformed {
		result.Start++
	}
	for _, p := range r.pages {
		if p.ChannelID != id {
			continue
		}
		result.Sampling = p.Sampling
		for _, s := range p.Samples {
			if s.Index >= start && len(result.Samples) < limit {
				result.Samples = append(result.Samples, s)
			}
		}
	}
	return result, nil
}

func TestCorrectionInputReadsBoundedRecordedSource(t *testing.T) {
	model := correctionSourceExample(t)
	_, pages := fixtureHistoricalInput(t, loadLapValidityFixture(t, "lap-validity-s266-v1.json"))
	// This sanitized fixture contains sparse continuous endpoints. Only its
	// complete event tables can represent a paginated reader; do not fabricate
	// the omitted continuous rows to make the test pass.
	var completePages []HistoricalPage
	var completeChannels []HistoricalChannel
	for _, channel := range model.Session.Channels {
		for _, page := range pages {
			if page.ChannelID == channel.ID && len(page.Samples) > 0 && page.Samples[0].Index == 0 && page.Samples[len(page.Samples)-1].Index == int64(len(page.Samples)-1) {
				completePages = append(completePages, page)
				completeChannels = append(completeChannels, channel)
			}
		}
	}
	pages = completePages
	model.Session.Channels = completeChannels
	gpsChannel := HistoricalChannel{ID: "gps-time", SourceName: "GPS Time", Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 1, Origin: TimeOriginUnknown}, Columns: []HistoricalColumn{{Name: "GPS Time", Type: ScalarNumber}}}
	model.Session.Channels = append(model.Session.Channels, gpsChannel)
	pages = append(pages, HistoricalPage{ChannelID: gpsChannel.ID, Sampling: gpsChannel.Sampling, Samples: []HistoricalSample{{Index: 0, Values: []HistoricalValue{numberValue("GPS Time", 1000)}}}})
	validity, err := AnalyzeLapValidity(model.Session, pages)
	if err != nil {
		t.Fatal(err)
	}
	model.Validity = &validity
	reader := &correctionInputReader{session: model.Session, pages: pages}
	limits := CorrectionReadLimits{PageRows: 3, MaxSamples: 100000, MaxValues: 100000, MaxTextBytes: 1 << 20}
	got, err := ReadCorrectionInput(context.Background(), reader, model.Artifact, limits)
	if err != nil {
		t.Fatal(err)
	}
	summary, err := ReadCorrectionSummary(context.Background(), reader, model.Artifact, limits)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Base != got.Base || !reflect.DeepEqual(summary.Session, got.Session) || !reflect.DeepEqual(summary.Validity, got.Validity) {
		t.Fatal("paged correction summary differs from materialized input")
	}
	want, err := CorrectionSourceFromModel(model)
	if err != nil {
		t.Fatal(err)
	}
	if got.Base != want || reader.calls < 2 {
		t.Fatal("lost base or did not page")
	}
	if got.Session.Channels[len(got.Session.Channels)-1].Sampling.Origin != TimeOriginSourceTimestamp || reader.session.Channels[len(reader.session.Channels)-1].Sampling.Origin != TimeOriginUnknown {
		t.Fatal("correction input did not return an isolated aligned view")
	}
	visitedSamples := 0
	visitedSession, err := VisitCorrectionPages(context.Background(), reader, model.Artifact, limits, func(channel HistoricalChannel, page HistoricalPage) error {
		if channel.ID != page.ChannelID {
			t.Fatal("visitor received a page from another channel")
		}
		visitedSamples += len(page.Samples)
		return nil
	})
	if err != nil || !reflect.DeepEqual(visitedSession, reader.session) {
		t.Fatal("visitor changed the inspected session", err)
	}
	retainedSamples := 0
	for _, page := range got.Pages {
		retainedSamples += len(page.Samples)
	}
	if visitedSamples != retainedSamples {
		t.Fatalf("visited %d samples, retained %d", visitedSamples, retainedSamples)
	}
	var gpsScan orderedGPSClockScan
	if _, err := VisitCorrectionPages(context.Background(), reader, model.Artifact, limits, func(channel HistoricalChannel, page HistoricalPage) error {
		if channel.ID != gpsChannel.ID {
			return nil
		}
		if status, ordered := gpsScan.accept(channel, page); !ordered || !status.Aligned {
			t.Fatalf("streamed GPS page rejected: ordered=%t status=%+v", ordered, status)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if streamed := gpsScan.finish(); streamed != got.Validity.Diagnostics.TemporalBridge {
		t.Fatalf("streamed GPS status = %+v, materialized = %+v", streamed, got.Validity.Diagnostics.TemporalBridge)
	}
	visitorErr := errors.New("visitor stopped")
	before := reader.calls
	if _, err := VisitCorrectionPages(context.Background(), reader, model.Artifact, limits, func(HistoricalChannel, HistoricalPage) error { return visitorErr }); !errors.Is(err, visitorErr) || reader.calls != before+1 {
		t.Fatal("visitor error did not stop reading immediately", err)
	}
	visitCtx, stopVisit := context.WithCancel(context.Background())
	before = reader.calls
	if _, err := VisitCorrectionPages(visitCtx, reader, model.Artifact, limits, func(HistoricalChannel, HistoricalPage) error {
		stopVisit()
		return nil
	}); !errors.Is(err, context.Canceled) || reader.calls != before+1 {
		t.Fatal("visitor cancellation did not stop after the current page", err)
	}
	for _, name := range []string{"samples", "values", "text"} {
		t.Run(name, func(t *testing.T) {
			small := limits
			switch name {
			case "samples":
				small.MaxSamples = 1
			case "values":
				small.MaxValues = 1
			case "text":
				small.MaxTextBytes = 1
			}
			result, err := ReadCorrectionInput(context.Background(), reader, model.Artifact, small)
			if !errors.Is(err, ErrCorrectionReadLimit) || !reflect.DeepEqual(result, CorrectionInput{}) {
				t.Fatal("accepted truncated input", err)
			}
			if _, err := ReadCorrectionSummary(context.Background(), reader, model.Artifact, small); !errors.Is(err, ErrCorrectionReadLimit) {
				t.Fatal("paged summary accepted truncated input", err)
			}
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	before = reader.calls
	if _, err := ReadCorrectionInput(ctx, reader, model.Artifact, limits); !errors.Is(err, context.Canceled) || reader.calls != before {
		t.Fatal("read despite cancellation", err)
	}
	if _, err := ReadCorrectionSummary(ctx, reader, model.Artifact, limits); !errors.Is(err, context.Canceled) || reader.calls != before {
		t.Fatal("paged summary read despite cancellation", err)
	}
	reader.err = ErrHistoricalSource
	if _, err := ReadCorrectionInput(context.Background(), reader, model.Artifact, limits); !errors.Is(err, ErrHistoricalSource) {
		t.Fatal(err)
	}
	reader.err = nil
	reader.malformed = true
	if _, err := ReadCorrectionInput(context.Background(), reader, model.Artifact, limits); !errors.Is(err, ErrInvalidHistoricalPage) {
		t.Fatal("accepted malformed page", err)
	}
	reader.malformed = false
	before = reader.calls
	if _, err := ReadCorrectionInput(context.Background(), reader, AuthorizedHistoricalArtifact{}, limits); !errors.Is(err, ErrInvalidCorrectionSource) || reader.calls != before {
		t.Fatal("read without artifact", err)
	}
}

func TestCorrectionPageVisitorFeedsUnalignedLapDistResetsWithoutRetainingPages(t *testing.T) {
	model := correctionSourceExample(t)
	sampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginUnknown}
	channel := HistoricalChannel{ID: "lap-dist", SourceName: "Lap Dist", Sampling: sampling}
	model.Session.Channels = []HistoricalChannel{channel}
	values := []float64{900, 950, 10, 980, 990, 20}
	page := HistoricalPage{ChannelID: channel.ID, Sampling: sampling}
	for index, value := range values {
		page.Samples = append(page.Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Lap Dist", value)}})
	}
	reader := &correctionInputReader{session: model.Session, pages: []HistoricalPage{page}}
	var scan orderedLapDistResetScan
	limits := CorrectionReadLimits{PageRows: 2, MaxSamples: 10, MaxValues: 10, MaxTextBytes: 1024}
	_, err := VisitCorrectionPages(context.Background(), reader, model.Artifact, limits, func(_ HistoricalChannel, current HistoricalPage) error {
		if !scan.accept(current) {
			t.Fatal("authorized reader returned unordered Lap Dist")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	got, frequency := scan.finish()
	want, wantFrequency := readLapDistResetObservations([]HistoricalPage{page})
	if frequency != wantFrequency || !reflect.DeepEqual(got, want) || reader.calls < 3 || len(got) != 2 || got[0].seconds != nil {
		t.Fatalf("visited resets (%v, %d) differ from materialized (%v, %d), reads=%d", got, frequency, want, wantFrequency, reader.calls)
	}
}

func TestOrderedGPSPageLookupReadsOnlyRequestedWindows(t *testing.T) {
	sampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginUnknown}
	channel := HistoricalChannel{ID: "gps", SourceName: "GPS Time", Sampling: sampling, Columns: []HistoricalColumn{{Name: "GPS Time", Type: ScalarNumber}}}
	page := HistoricalPage{ChannelID: channel.ID, Sampling: sampling}
	for index := 0; index < 12; index++ {
		page.Samples = append(page.Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("GPS Time", 100+float64(index)/10)}})
	}
	reader := &correctionInputReader{pages: []HistoricalPage{page}}
	lookup := orderedGPSPageLookup{reader: reader, channel: channel, pageRows: 3}
	for _, test := range []struct {
		index int64
		want  float64
		found bool
	}{{0, 100, true}, {2, 100.2, true}, {5, 100.5, true}, {11, 101.1, true}, {12, 0, false}} {
		got, found, err := lookup.timeAt(context.Background(), test.index)
		if err != nil || got != test.want || found != test.found {
			t.Fatalf("GPS[%d] = (%v, %t, %v), want (%v, %t)", test.index, got, found, err, test.want, test.found)
		}
	}
	if reader.calls != 4 {
		t.Fatalf("expected one bounded read per uncached window, got %d", reader.calls)
	}
	reader.malformed = true
	if _, _, err := lookup.timeAt(context.Background(), 1); !errors.Is(err, ErrInvalidHistoricalPage) {
		t.Fatalf("malformed GPS page accepted: %v", err)
	}
	canceled, stop := context.WithCancel(context.Background())
	stop()
	if _, _, err := lookup.timeAt(canceled, 1); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled GPS lookup read: %v", err)
	}
	reader.malformed = false
	lapSampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 5, Origin: TimeOriginUnknown}
	lapChannel := HistoricalChannel{ID: "distance", SourceName: "Lap Dist", Sampling: lapSampling, Columns: []HistoricalColumn{{Name: "Lap Dist", Type: ScalarNumber}}}
	lapPage := HistoricalPage{ChannelID: lapChannel.ID, Sampling: lapSampling}
	for index := 0; index < 6; index++ {
		lapPage.Samples = append(lapPage.Samples, HistoricalSample{Index: int64(index), Values: []HistoricalValue{numberValue("Lap Dist", float64(index))}})
	}
	materialized := BuildTemporalAlignment(HistoricalSession{Channels: []HistoricalChannel{channel, lapChannel}}, []HistoricalPage{page, lapPage})
	if !materialized.Bridge.Aligned || !materialized.Channels[lapChannel.ID].Aligned {
		t.Fatalf("materialized bridge rejected: %+v", materialized)
	}
	windowed := orderedGPSPageLookup{reader: reader, channel: channel, pageRows: 3}
	for _, sample := range materialized.Pages[1].Samples {
		got, found, err := windowed.timeAt(context.Background(), sample.Index*2)
		if err != nil || !found || sample.TimestampSeconds == nil || got != *sample.TimestampSeconds {
			t.Fatalf("GPS window for sample %d = (%v, %t, %v), aligned=%v", sample.Index, got, found, err, sample.TimestampSeconds)
		}
	}
}
