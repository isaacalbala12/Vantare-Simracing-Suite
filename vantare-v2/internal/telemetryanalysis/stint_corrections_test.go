package telemetryanalysis

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func stintCorrectionExample(t *testing.T) (SourceAnalysisRef, LapValidityAnalysis) {
	t.Helper()
	at := func(seconds int64) time.Time { return time.Unix(seconds, 0).UTC() }
	provenance := strategyprojection.Provenance{Kind: strategyprojection.ProvenanceObserved, SourceID: "session-stints"}
	confidence := strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "lap-validity.v1"}
	observedAt, rangeValue := at(5), 1.0
	stintProvenance := provenance
	stintProvenance.ObservedAt = &observedAt
	stintConfidence := confidence
	stintConfidence.RangeLower, stintConfidence.RangeUpper = &rangeValue, &rangeValue
	laps := []AnalyzedLap{
		{Number: 0, End: at(10)},
		{Number: 1, Start: timePointer(at(10)), End: at(20), Complete: true},
		{Number: 2, Start: timePointer(at(20)), End: at(30), Complete: true},
		{Number: 3, Start: timePointer(at(30)), End: at(40), Complete: true},
		{Number: 4, Start: timePointer(at(40)), End: at(50), Complete: true},
	}
	lapBoundaries := make([]strategyprojection.LapBoundary, len(laps))
	for i, lap := range laps {
		lapBoundaries[i] = strategyprojection.LapBoundary{
			LapNumber: lap.Number, Timestamp: lap.End,
			Source:  strategyprojection.LapBoundarySourceLapEvent,
			Quality: strategyprojection.PresenceValid, Provenance: provenance,
			Confidence: confidence, Location: strategyprojection.TrackLocation{Presence: strategyprojection.PresenceMissing},
		}
	}
	temporal := strategyprojection.TemporalSegmentsV1{
		ContractVersion: strategyprojection.ContractVersionTemporalSegmentsV1,
		Segments: []strategyprojection.ContinuousSegment{{
			SegmentID: "covered", SessionStartTs: at(10), SessionEndTs: at(50),
			Reason: "recorded", Presence: strategyprojection.PresenceValid,
			Provenance: provenance, Confidence: confidence,
		}},
		Gaps:          []strategyprojection.CoverageGap{},
		LapBoundaries: lapBoundaries,
		StintBoundaries: []strategyprojection.StintBoundary{
			{StintNumber: 2, Timestamp: at(30), Cause: strategyprojection.StintCausePit, Presence: strategyprojection.PresenceValid, Provenance: stintProvenance, Confidence: stintConfidence},
			{StintNumber: 3, Timestamp: at(50), Cause: strategyprojection.StintCausePit, Presence: strategyprojection.PresenceValid, Provenance: stintProvenance, Confidence: stintConfidence},
		},
	}
	base := SourceAnalysisRef{
		SessionID: "session-stints", ContentSHA256: strings.Repeat("ab", 32), SizeBytes: 1024,
		ParserID: "lmu-duckdb", ParserVersion: "1", SchemaFingerprint: "schema-v1",
		AnalysisVersion: "lap-validity.v1",
	}
	var err error
	base.SegmentationDigest, err = correctionDigest("analysis.correction-segmentation.v1", temporal)
	if err != nil {
		t.Fatal(err)
	}
	return base, LapValidityAnalysis{SessionID: base.SessionID, ComputationVersion: base.AnalysisVersion, Temporal: temporal, Laps: laps}
}

func TestPrepareStintBoundaryCorrectionSetCanonicalSetAndRemove(t *testing.T) {
	base, validity := stintCorrectionExample(t)
	original := validity.Temporal.StintBoundaries[0]
	set := StintBoundaryCorrection{
		Operation: StintBoundarySet, Base: base,
		Target:   StintBoundaryTarget{StintNumber: original.StintNumber, Timestamp: original.Timestamp, Cause: original.Cause},
		Expected: original,
		Replacement: &StintBoundaryReplacement{
			Anchor: StintBoundaryAnchor{LapNumber: 1, Timestamp: validity.Laps[1].End},
			Cause:  strategyprojection.StintCauseDriverChange,
		},
		Reason: "driver change reviewed",
	}
	terminal := validity.Temporal.StintBoundaries[1]
	remove := StintBoundaryCorrection{
		Operation: StintBoundaryRemove, Base: base,
		Target:   StintBoundaryTarget{StintNumber: terminal.StintNumber, Timestamp: terminal.Timestamp, Cause: terminal.Cause},
		Expected: terminal, Reason: "terminal marker is not a new stint",
	}

	first, err := PrepareStintBoundaryCorrectionSet(base, validity, []StintBoundaryCorrection{remove, set})
	if err != nil {
		t.Fatal(err)
	}
	second, err := PrepareStintBoundaryCorrectionSet(base, validity, []StintBoundaryCorrection{set, remove})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("request order changed prepared set:\n%+v\n%+v", first, second)
	}
	if len(first) != 2 || first[0].Request.Operation != StintBoundarySet || first[1].Request.Operation != StintBoundaryRemove {
		t.Fatalf("prepared order = %+v", first)
	}
	if first[0].CorrectionID == "" || first[1].CorrectionID == "" || first[0].BaseID != first[1].BaseID {
		t.Fatalf("prepared identities = %+v", first)
	}
	if first[0].Request.Replacement == set.Replacement {
		t.Fatal("prepared request aliases caller replacement")
	}
}

func TestPrepareStintBoundaryCorrectionSetRejectsInvalidAnchor(t *testing.T) {
	base, validity := stintCorrectionExample(t)
	original := validity.Temporal.StintBoundaries[0]
	request := StintBoundaryCorrection{
		Operation: StintBoundarySet, Base: base,
		Target:      StintBoundaryTarget{StintNumber: original.StintNumber, Timestamp: original.Timestamp, Cause: original.Cause},
		Expected:    original,
		Replacement: &StintBoundaryReplacement{Anchor: StintBoundaryAnchor{LapNumber: 1, Timestamp: validity.Laps[1].End}, Cause: strategyprojection.StintCausePit},
		Reason:      "reviewed",
	}

	tests := []struct {
		name string
		edit func(*LapValidityAnalysis, *StintBoundaryCorrection)
		want error
	}{
		{"initial state row", func(_ *LapValidityAnalysis, r *StintBoundaryCorrection) {
			r.Replacement.Anchor = StintBoundaryAnchor{LapNumber: 0, Timestamp: validity.Laps[0].End}
		}, ErrCorrectionTarget},
		{"continuous clock", func(v *LapValidityAnalysis, _ *StintBoundaryCorrection) {
			v.Temporal.LapBoundaries[1].Source = strategyprojection.LapBoundarySourceLapDistReset
		}, ErrCorrectionValue},
		{"outside coverage", func(v *LapValidityAnalysis, _ *StintBoundaryCorrection) {
			v.Temporal.Segments[0].SessionStartTs = time.Unix(21, 0).UTC()
		}, ErrCorrectionValue},
		{"inside gap", func(v *LapValidityAnalysis, _ *StintBoundaryCorrection) {
			v.Temporal.Gaps = []strategyprojection.CoverageGap{{
				GapID: "gap", StartTs: time.Unix(19, 0).UTC(), EndTs: time.Unix(21, 0).UTC(),
				Presence:   strategyprojection.PresenceMissing,
				Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceUnknown},
			}}
		}, ErrCorrectionValue},
		{"zero length lap", func(v *LapValidityAnalysis, _ *StintBoundaryCorrection) {
			v.Laps[1].Start = timePointer(v.Laps[1].End)
		}, ErrCorrectionTarget},
		{"inert", func(_ *LapValidityAnalysis, r *StintBoundaryCorrection) {
			r.Replacement.Anchor = StintBoundaryAnchor{LapNumber: 2, Timestamp: original.Timestamp}
		}, ErrCorrectionValue},
		{"unknown operation", func(_ *LapValidityAnalysis, r *StintBoundaryCorrection) {
			r.Operation = StintBoundaryOperation("shift")
		}, ErrCorrectionValue},
		{"stale target", func(_ *LapValidityAnalysis, r *StintBoundaryCorrection) {
			r.Expected.Cause = strategyprojection.StintCauseFuelJump
		}, ErrCorrectionPrecondition},
		{"ambiguous target", func(v *LapValidityAnalysis, _ *StintBoundaryCorrection) {
			v.Temporal.StintBoundaries = append(v.Temporal.StintBoundaries, original)
		}, ErrCorrectionTarget},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			candidate := cloneValidityForStintTest(validity)
			candidateBase := base
			r := request
			r.Replacement = cloneStintReplacement(request.Replacement)
			tc.edit(&candidate, &r)
			var err error
			candidateBase.SegmentationDigest, err = correctionDigest("analysis.correction-segmentation.v1", candidate.Temporal)
			if err != nil {
				t.Fatal(err)
			}
			r.Base = candidateBase
			if _, err := PrepareStintBoundaryCorrectionSet(candidateBase, candidate, []StintBoundaryCorrection{r}); !errors.Is(err, tc.want) {
				t.Fatalf("error = %v, want %v", err, tc.want)
			}
		})
	}
	for _, gap := range []strategyprojection.CoverageGap{
		{GapID: "starts-at-anchor", StartTs: time.Unix(20, 0).UTC(), EndTs: time.Unix(21, 0).UTC(), Presence: strategyprojection.PresenceMissing, Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceUnknown}},
		{GapID: "ends-at-anchor", StartTs: time.Unix(19, 0).UTC(), EndTs: time.Unix(20, 0).UTC(), Presence: strategyprojection.PresenceMissing, Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceUnknown}},
	} {
		t.Run(gap.GapID, func(t *testing.T) {
			candidate := cloneValidityForStintTest(validity)
			candidate.Temporal.Gaps = []strategyprojection.CoverageGap{gap}
			candidateBase := base
			var err error
			candidateBase.SegmentationDigest, err = correctionDigest("analysis.correction-segmentation.v1", candidate.Temporal)
			if err != nil {
				t.Fatal(err)
			}
			r := request
			r.Base = candidateBase
			if _, err := PrepareStintBoundaryCorrectionSet(candidateBase, candidate, []StintBoundaryCorrection{r}); err != nil {
				t.Fatalf("gap endpoint rejected: %v", err)
			}
		})
	}
}

func TestPrepareStintBoundaryCorrectionSetRejectsOverlapsAtomically(t *testing.T) {
	base, validity := stintCorrectionExample(t)
	first := validity.Temporal.StintBoundaries[0]
	second := validity.Temporal.StintBoundaries[1]
	request := func(boundary strategyprojection.StintBoundary, lap int, cause strategyprojection.StintBoundaryCause) StintBoundaryCorrection {
		return StintBoundaryCorrection{
			Operation: StintBoundarySet, Base: base,
			Target:      StintBoundaryTarget{StintNumber: boundary.StintNumber, Timestamp: boundary.Timestamp, Cause: boundary.Cause},
			Expected:    boundary,
			Replacement: &StintBoundaryReplacement{Anchor: StintBoundaryAnchor{LapNumber: lap, Timestamp: validity.Laps[lap].End}, Cause: cause},
			Reason:      "reviewed",
		}
	}

	duplicate := request(first, 1, strategyprojection.StintCausePit)
	if got, err := PrepareStintBoundaryCorrectionSet(base, validity, []StintBoundaryCorrection{duplicate, duplicate}); !errors.Is(err, ErrOverlappingCorrections) || got != nil {
		t.Fatalf("duplicate result = %+v, error = %v", got, err)
	}
	colliding := request(second, 1, strategyprojection.StintCauseDriverChange)
	if got, err := PrepareStintBoundaryCorrectionSet(base, validity, []StintBoundaryCorrection{duplicate, colliding}); !errors.Is(err, ErrCorrectionValue) || got != nil {
		t.Fatalf("collision result = %+v, error = %v", got, err)
	}
	// Moving onto an unchanged boundary is also a collision.
	crossing := request(first, 4, strategyprojection.StintCauseDriverChange)
	if got, err := PrepareStintBoundaryCorrectionSet(base, validity, []StintBoundaryCorrection{crossing}); !errors.Is(err, ErrCorrectionValue) || got != nil {
		t.Fatalf("unchanged collision result = %+v, error = %v", got, err)
	}
	// Distinct timestamps can still invert the original boundary order.
	invertedFirst := request(first, 3, strategyprojection.StintCauseDriverChange)
	invertedSecond := request(second, 1, strategyprojection.StintCausePit)
	if got, err := PrepareStintBoundaryCorrectionSet(base, validity, []StintBoundaryCorrection{invertedFirst, invertedSecond}); !errors.Is(err, ErrCorrectionValue) || got != nil {
		t.Fatalf("inverted result = %+v, error = %v", got, err)
	}
}

func TestPrepareStintBoundaryCorrectionSetPreservesInputAndAllowsOneLapStint(t *testing.T) {
	base, validity := stintCorrectionExample(t)
	originalValidity := cloneValidityForStintTest(validity)
	boundary := validity.Temporal.StintBoundaries[0]
	request := StintBoundaryCorrection{
		Operation: StintBoundarySet, Base: base,
		Target:      StintBoundaryTarget{StintNumber: boundary.StintNumber, Timestamp: boundary.Timestamp, Cause: boundary.Cause},
		Expected:    boundary,
		Replacement: &StintBoundaryReplacement{Anchor: StintBoundaryAnchor{LapNumber: 3, Timestamp: validity.Laps[3].End}, Cause: strategyprojection.StintCausePit},
		Reason:      "one lap stint remains valid",
	}
	originalRequest := request
	originalRequest.Replacement = cloneStintReplacement(request.Replacement)
	prepared, err := PrepareStintBoundaryCorrectionSet(base, validity, []StintBoundaryCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(validity, originalValidity) {
		t.Fatalf("preparation mutated validity:\n%#v\n%#v", validity, originalValidity)
	}
	if !reflect.DeepEqual(request, originalRequest) {
		t.Fatalf("preparation mutated request:\n%#v\n%#v", request, originalRequest)
	}
	*prepared[0].Original.Confidence.RangeLower = 9
	*prepared[0].Original.Provenance.ObservedAt = time.Unix(9, 0).UTC()
	if *validity.Temporal.StintBoundaries[0].Confidence.RangeLower != 1 || !validity.Temporal.StintBoundaries[0].Provenance.ObservedAt.Equal(time.Unix(5, 0).UTC()) {
		t.Fatal("prepared original aliases caller pointers")
	}
	if empty, err := PrepareStintBoundaryCorrectionSet(base, validity, nil); err != nil || len(empty) != 0 {
		t.Fatalf("empty set = %+v, %v", empty, err)
	}
}

func timePointer(value time.Time) *time.Time { return &value }

func cloneStintReplacement(value *StintBoundaryReplacement) *StintBoundaryReplacement {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneValidityForStintTest(value LapValidityAnalysis) LapValidityAnalysis {
	copy := value
	copy.Laps = append([]AnalyzedLap(nil), value.Laps...)
	copy.Temporal.Segments = append([]strategyprojection.ContinuousSegment(nil), value.Temporal.Segments...)
	copy.Temporal.Gaps = append(make([]strategyprojection.CoverageGap, 0, len(value.Temporal.Gaps)), value.Temporal.Gaps...)
	copy.Temporal.LapBoundaries = append([]strategyprojection.LapBoundary(nil), value.Temporal.LapBoundaries...)
	copy.Temporal.StintBoundaries = append([]strategyprojection.StintBoundary(nil), value.Temporal.StintBoundaries...)
	return copy
}
