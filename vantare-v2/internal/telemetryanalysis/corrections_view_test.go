package telemetryanalysis

import (
	"errors"
	"reflect"
	"testing"
)

func TestCorrectionViewPreservesOriginalAndDetaches(t *testing.T) {
	base, ch, sample, request := correctionExample()
	timestamp := 12.5
	sample.TimestampSeconds = &timestamp
	pages := []HistoricalPage{{ChannelID: ch.ID, Start: 42, Samples: []HistoricalSample{sample}}}
	snapshot, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}})
	if err != nil {
		t.Fatal(err)
	}
	view, err := ApplySampleCorrectionSnapshot(base, []HistoricalChannel{ch}, pages, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if view.Pages[0].Samples[0].Values[0].Scalar.Number != 0 || view.Pages[0].Samples[0].Values[0].Quality != request.Expected.Quality {
		t.Fatal("correction or quality lost")
	}
	if pages[0].Samples[0].Values[0] != request.Expected || view.SnapshotID != snapshot.SnapshotID || len(view.Corrections) != 1 {
		t.Fatal("original or provenance lost")
	}
	view.Pages[0].Samples[0].Values[0].Scalar.Number = 999
	*view.Pages[0].Samples[0].TimestampSeconds = 999
	if sample.Values[0] != request.Expected || timestamp != 12.5 {
		t.Fatal("view aliases original")
	}
	view.Corrections[0].Request.Reason = "caller mutation"
	if snapshot.Corrections[0].Request.Reason == "caller mutation" {
		t.Fatal("view aliases snapshot")
	}
}
func TestCorrectionViewRejectsPartialOrAmbiguousInputs(t *testing.T) {
	base, ch, sample, request := correctionExample()
	snapshot, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}})
	if err != nil {
		t.Fatal(err)
	}
	page := HistoricalPage{ChannelID: ch.ID, Start: 42, Samples: []HistoricalSample{sample}}
	tests := []struct {
		name     string
		channels []HistoricalChannel
		pages    []HistoricalPage
	}{
		{"missing channel", nil, []HistoricalPage{page}},
		{"missing sample", []HistoricalChannel{ch}, nil},
		{"duplicate channel", []HistoricalChannel{ch, ch}, []HistoricalPage{page}},
		{"overlapping pages", []HistoricalChannel{ch}, []HistoricalPage{page, page}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			view, err := ApplySampleCorrectionSnapshot(base, tt.channels, tt.pages, snapshot)
			if !errors.Is(err, ErrCorrectionTarget) || !reflect.DeepEqual(view, EffectiveCorrectionView{}) {
				t.Fatal("partial/ambiguous accepted", err)
			}
		})
	}
	altered := snapshot
	altered.SnapshotID = "wrong"
	if _, err := ApplySampleCorrectionSnapshot(base, []HistoricalChannel{ch}, []HistoricalPage{page}, altered); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("altered snapshot", err)
	}
	changedSample := sample
	changedSample.Values = append([]HistoricalValue(nil), sample.Values...)
	changedSample.Values[0].Scalar.Number++
	page.Samples = []HistoricalSample{changedSample}
	if _, err := ApplySampleCorrectionSnapshot(base, []HistoricalChannel{ch}, []HistoricalPage{page}, snapshot); !errors.Is(err, ErrCorrectionPrecondition) {
		t.Fatal("stale original", err)
	}
}
func TestEmptyCorrectionViewRemainsDetached(t *testing.T) {
	base, ch, sample, _ := correctionExample()
	snapshot, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	pages := []HistoricalPage{{ChannelID: ch.ID, Samples: []HistoricalSample{sample}}}
	view, err := ApplySampleCorrectionSnapshot(base, []HistoricalChannel{ch}, pages, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(view.Pages, pages) {
		t.Fatal("empty changed values")
	}
	view.Pages[0].Samples[0].Index = 99
	if pages[0].Samples[0].Index == 99 {
		t.Fatal("empty view aliases original")
	}
}

func TestCorrectionViewAppliesEveryColumnWithoutChangingTime(t *testing.T) {
	base, ch, sample, request := correctionExample()
	otherValue := HistoricalValue{Column: "active", Present: true, Quality: QualityValid, Scalar: HistoricalScalar{Kind: ScalarBoolean, Boolean: true}}
	sample.Values = append(sample.Values, otherValue)
	sample.RelativeTimeSeconds = 17
	ch.Columns = append(ch.Columns, HistoricalColumn{Name: "active", Type: ScalarBoolean})
	other := request
	other.Target.Column = "active"
	other.Expected = otherValue
	other.Replacement = HistoricalScalar{Kind: ScalarBoolean, Boolean: false}
	snapshot, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}, {Channel: ch, Sample: sample, Request: other}})
	if err != nil {
		t.Fatal(err)
	}
	page := HistoricalPage{ChannelID: ch.ID, Start: 42, Samples: []HistoricalSample{sample}}
	view, err := ApplySampleCorrectionSnapshot(base, []HistoricalChannel{ch}, []HistoricalPage{page}, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	got := view.Pages[0].Samples[0]
	if got.Values[0].Scalar.Number != 0 || got.Values[1].Scalar.Boolean || got.RelativeTimeSeconds != 17 || len(view.Corrections) != 2 {
		t.Fatal("lost zero/false/time/provenance")
	}
	changed := base
	changed.AnalysisVersion = "new"
	if _, err := ApplySampleCorrectionSnapshot(changed, []HistoricalChannel{ch}, []HistoricalPage{page}, snapshot); !errors.Is(err, ErrCorrectionInterpretationChanged) {
		t.Fatal("stale analysis", err)
	}
}
