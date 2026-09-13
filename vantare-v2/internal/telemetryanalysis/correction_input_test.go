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
}

func (r *correctionInputReader) Inspect(context.Context) (HistoricalSession, error) {
	return r.session, r.err
}
func (r *correctionInputReader) ReadPage(_ context.Context, id string, start int64, limit int) (HistoricalPage, error) {
	r.calls++
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
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	before := reader.calls
	if _, err := ReadCorrectionInput(ctx, reader, model.Artifact, limits); !errors.Is(err, context.Canceled) || reader.calls != before {
		t.Fatal("read despite cancellation", err)
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
