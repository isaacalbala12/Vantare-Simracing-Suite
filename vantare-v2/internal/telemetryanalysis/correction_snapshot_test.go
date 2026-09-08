package telemetryanalysis

import (
	"errors"
	"reflect"
	"testing"
)

func TestSampleSnapshotCanonicalAndDetached(t *testing.T) {
	base, ch, sample, request := correctionExample()
	second := request
	second.Target.SampleIndex++
	other := sample
	other.Index++
	a := SampleCorrectionInput{Channel: ch, Sample: sample, Request: request}
	b := SampleCorrectionInput{Channel: ch, Sample: other, Request: second}
	input := []SampleCorrectionInput{b, a}
	got, err := PrepareSampleCorrectionSnapshot(base, input)
	if err != nil {
		t.Fatal(err)
	}
	reversed, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{a, b})
	if err != nil || !reflect.DeepEqual(got, reversed) {
		t.Fatal("order changed snapshot", err)
	}
	if input[0].Request != second || sample.Values[0] != request.Expected {
		t.Fatal("input changed")
	}
	input[0].Request.Reason = "mutated caller"
	if got.Corrections[1].Request.Reason == "mutated caller" {
		t.Fatal("snapshot aliases caller")
	}
	if len(got.Corrections) != 2 || got.Corrections[0].Request.Target.SampleIndex != 42 {
		t.Fatal("wrong canonical order")
	}
	changed := a
	changed.Request.Reason = "different reason"
	newer, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{changed, b})
	if err != nil || newer.SnapshotID == got.SnapshotID {
		t.Fatal("snapshot ignores content", err)
	}
}

func TestSampleSnapshotAtomicRejection(t *testing.T) {
	base, ch, sample, request := correctionExample()
	a := SampleCorrectionInput{Channel: ch, Sample: sample, Request: request}
	duplicate := a
	duplicate.Request.Replacement.Number = 5
	stale := a
	stale.Request.Target.SampleIndex++
	stale.Sample.Index++
	stale.Request.Expected.Scalar.Number = 99
	changed := a
	changed.Request.Base.ParserVersion = "other"
	tests := []struct {
		name   string
		inputs []SampleCorrectionInput
		want   error
	}{
		{"duplicate target", []SampleCorrectionInput{a, duplicate}, ErrOverlappingCorrections},
		{"changed original", []SampleCorrectionInput{a, stale}, ErrCorrectionPrecondition},
		{"different base", []SampleCorrectionInput{changed}, ErrCorrectionInterpretationChanged},
		{"limit", make([]SampleCorrectionInput, MaxSampleCorrections+1), ErrInvalidCorrection},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := PrepareSampleCorrectionSnapshot(base, tt.inputs)
			if !errors.Is(err, tt.want) {
				t.Fatalf("got %v, want %v", err, tt.want)
			}
			if !reflect.DeepEqual(got, PreparedSampleCorrectionSnapshot{}) {
				t.Fatal("partial snapshot escaped")
			}
		})
	}
}

func TestEmptySampleSnapshotIsExplicitAndBaseBound(t *testing.T) {
	base, _, _, _ := correctionExample()
	a, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	b, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{})
	if err != nil || !reflect.DeepEqual(a, b) {
		t.Fatal("nil differs from empty", err)
	}
	if a.Corrections == nil || a.SnapshotID == "" || a.Base != base {
		t.Fatal("implicit empty base")
	}
	base.AnalysisVersion = "other"
	c, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil || a.SnapshotID == c.SnapshotID {
		t.Fatal("empty snapshot not bound to analysis", err)
	}
}

func TestSampleSnapshotGoldenIdentity(t *testing.T) {
	base, ch, sample, request := correctionExample()
	snapshot, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}})
	if err != nil {
		t.Fatal(err)
	}
	const expected = "5f8a78bf7cc64b45cdbc9f4b70eafd62d8361bcfc93ea6f17dc1ebf81a7ec01f"
	if snapshot.SnapshotID != expected {
		t.Fatalf("canonical identity: %s", snapshot.SnapshotID)
	}
}
