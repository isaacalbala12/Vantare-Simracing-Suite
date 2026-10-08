package telemetryanalysis

import (
	"errors"
	"math"
	"reflect"
	"strings"
	"testing"
)

func correctionExample() (SourceAnalysisRef, HistoricalChannel, HistoricalSample, SampleValueCorrection) {
	base := SourceAnalysisRef{SessionID: "session", ContentSHA256: strings.Repeat("a", 64), SizeBytes: 100, ParserID: "lmu-duckdb", ParserVersion: "1", SchemaFingerprint: "schema", AnalysisVersion: "analysis.v1", SegmentationDigest: strings.Repeat("b", 64)}
	value := HistoricalValue{Column: "value", Present: true, Quality: QualityUnknown, Scalar: HistoricalScalar{Kind: ScalarNumber, Number: 10}}
	channel := HistoricalChannel{ID: "fuel", Unit: HistoricalUnit{Symbol: "L", Quality: QualityValid}, Columns: []HistoricalColumn{{Name: "value", Type: ScalarNumber}}}
	sample := HistoricalSample{Index: 42, Values: []HistoricalValue{value}}
	request := SampleValueCorrection{Base: base, Target: SampleCorrectionTarget{ChannelID: "fuel", Column: "value", SampleIndex: 42}, Unit: channel.Unit, Expected: value, Replacement: HistoricalScalar{Kind: ScalarNumber, Number: 0}, Reason: "Reviewed source measurement"}
	return base, channel, sample, request
}

func TestSampleCorrectionPreservesOriginalAndQuality(t *testing.T) {
	base, ch, sample, request := correctionExample()
	before := sample.Values[0]
	got, err := PrepareSampleCorrection(base, ch, sample, request)
	if err != nil {
		t.Fatal(err)
	}
	if sample.Values[0] != before || got.Original != before {
		t.Fatal("original changed")
	}
	if got.Corrected.Scalar.Number != 0 || !got.Corrected.Present || got.Corrected.Quality != QualityUnknown {
		t.Fatal("zero or original quality lost", got)
	}
	again, err := PrepareSampleCorrection(base, ch, sample, request)
	if err != nil || !reflect.DeepEqual(got, again) {
		t.Fatal("non-deterministic correction", err)
	}
	request.Reason = "Different documented reason"
	changed, err := PrepareSampleCorrection(base, ch, sample, request)
	if err != nil || changed.CorrectionID == got.CorrectionID {
		t.Fatal("reason omitted from identity", err)
	}
}

func TestSourceAnalysisIdentityIncludesInterpretation(t *testing.T) {
	base, _, _, _ := correctionExample()
	original, err := base.Digest()
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*SourceAnalysisRef){
		func(b *SourceAnalysisRef) { b.SessionID = "another" }, func(b *SourceAnalysisRef) { b.ContentSHA256 = strings.Repeat("c", 64) }, func(b *SourceAnalysisRef) { b.SizeBytes++ },
		func(b *SourceAnalysisRef) { b.ParserID = "other" }, func(b *SourceAnalysisRef) { b.ParserVersion = "2" }, func(b *SourceAnalysisRef) { b.SchemaFingerprint = "new" },
		func(b *SourceAnalysisRef) { b.AnalysisVersion = "analysis.v2" }, func(b *SourceAnalysisRef) { b.SegmentationDigest = strings.Repeat("d", 64) },
	} {
		other := base
		change(&other)
		id, err := other.Digest()
		if err != nil || id == original {
			t.Fatal("base collision", err)
		}
	}
}

func TestSampleCorrectionRejectsInvalidRequests(t *testing.T) {
	tests := []struct {
		name   string
		change func(*SourceAnalysisRef, *HistoricalChannel, *HistoricalSample, *SampleValueCorrection)
		want   error
	}{
		{"changed source", func(b *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, _ *SampleValueCorrection) {
			b.ContentSHA256 = strings.Repeat("c", 64)
		}, ErrCorrectionSourceChanged},
		{"changed interpretation", func(b *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, _ *SampleValueCorrection) {
			b.ParserVersion = "2"
		}, ErrCorrectionInterpretationChanged},
		{"stale original", func(_ *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			r.Expected.Scalar.Number = 9
		}, ErrCorrectionPrecondition},
		{"missing sample", func(_ *SourceAnalysisRef, _ *HistoricalChannel, s *HistoricalSample, _ *SampleValueCorrection) {
			s.Values[0].Present = false
		}, ErrCorrectionTarget},
		{"wrong sample index", func(_ *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			r.Target.SampleIndex = 41
		}, ErrCorrectionTarget},
		{"wrong channel", func(_ *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			r.Target.ChannelID = "other"
		}, ErrCorrectionTarget},
		{"unit change", func(_ *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			r.Unit.Symbol = "gal"
		}, ErrCorrectionValue},
		{"unknown unit", func(_ *SourceAnalysisRef, ch *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			ch.Unit.Quality = QualityUnknown
			r.Unit = ch.Unit
		}, ErrCorrectionValue},
		{"wrong type", func(_ *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			r.Replacement = HistoricalScalar{Kind: ScalarBoolean}
		}, ErrCorrectionValue},
		{"nan", func(_ *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			r.Replacement.Number = math.NaN()
		}, ErrCorrectionValue},
		{"infinity", func(_ *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			r.Replacement.Number = math.Inf(1)
		}, ErrCorrectionValue},
		{"inactive fields", func(_ *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			r.Replacement.Boolean = true
		}, ErrCorrectionValue},
		{"missing reason", func(_ *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			r.Reason = " "
		}, ErrInvalidCorrection},
		{"oversized reason", func(_ *SourceAnalysisRef, _ *HistoricalChannel, _ *HistoricalSample, r *SampleValueCorrection) {
			r.Reason = strings.Repeat("x", 1025)
		}, ErrInvalidCorrection},
		{"duplicate column", func(_ *SourceAnalysisRef, _ *HistoricalChannel, s *HistoricalSample, _ *SampleValueCorrection) {
			s.Values = append(s.Values, s.Values[0])
		}, ErrCorrectionTarget},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b, ch, s, r := correctionExample()
			tt.change(&b, &ch, &s, &r)
			_, err := PrepareSampleCorrection(b, ch, s, r)
			if !errors.Is(err, tt.want) {
				t.Fatalf("got %v, want %v", err, tt.want)
			}
		})
	}
}

func TestSampleCorrectionFalseIsPresent(t *testing.T) {
	b, ch, s, r := correctionExample()
	ch.Columns[0].Type = ScalarBoolean
	s.Values[0].Scalar = HistoricalScalar{Kind: ScalarBoolean, Boolean: true}
	r.Expected = s.Values[0]
	r.Replacement = HistoricalScalar{Kind: ScalarBoolean}
	got, err := PrepareSampleCorrection(b, ch, s, r)
	if err != nil {
		t.Fatal(err)
	}
	if got.Corrected.Scalar.Boolean || !got.Corrected.Present {
		t.Fatal("false confused with absence")
	}
}

func TestSourceAnalysisIdentityGoldenAndInvalidBase(t *testing.T) {
	base, _, _, _ := correctionExample()
	id, err := base.Digest()
	// Independent Python hashlib vector over the documented v1 field order.
	if err != nil || id != "5bcef455fc1420402790237a9bc535f488d186650fb96a97834dbcb1a1e80c3a" {
		t.Fatal(id, err)
	}
	for _, mutate := range []func(*SourceAnalysisRef){
		func(b *SourceAnalysisRef) { b.SizeBytes = 0 }, func(b *SourceAnalysisRef) { b.ContentSHA256 = strings.Repeat("A", 64) },
		func(b *SourceAnalysisRef) { b.SegmentationDigest = "not-a-digest" }, func(b *SourceAnalysisRef) { b.AnalysisVersion = "" },
		func(b *SourceAnalysisRef) { b.ParserID = string([]byte{0xff}) },
	} {
		bad := base
		mutate(&bad)
		if _, err := bad.Digest(); !errors.Is(err, ErrInvalidCorrection) {
			t.Fatal("invalid base accepted", err)
		}
	}
}

func TestSampleCorrectionIntegerAndEmptyText(t *testing.T) {
	for _, scalar := range []HistoricalScalar{{Kind: ScalarInteger, Integer: math.MaxInt64}, {Kind: ScalarText, Text: ""}} {
		b, ch, s, r := correctionExample()
		ch.Columns[0].Type = scalar.Kind
		s.Values[0].Scalar = scalar
		r.Expected = s.Values[0]
		r.Replacement = scalar
		got, err := PrepareSampleCorrection(b, ch, s, r)
		if err != nil || got.Corrected.Scalar != scalar || !got.Corrected.Present {
			t.Fatal("typed value lost", got, err)
		}
	}
}
