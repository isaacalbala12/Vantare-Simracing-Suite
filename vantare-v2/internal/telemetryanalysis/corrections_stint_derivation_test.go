package telemetryanalysis

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestApplyStintBoundaryCorrectionsMovesAndRemovesWithoutMutation(t *testing.T) {
	base, original := stintCorrectionExample(t)
	before, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	moveOriginal := original.Temporal.StintBoundaries[0]
	move := StintBoundaryCorrection{
		Operation: StintBoundarySet, Base: base, Target: stintBoundaryTargetFor(moveOriginal), Expected: moveOriginal,
		Replacement: &StintBoundaryReplacement{Anchor: StintBoundaryAnchor{LapNumber: 1, Timestamp: original.Laps[1].End}, Cause: strategyprojection.StintCauseDriverChange},
		Reason:      "reviewed driver change",
	}
	remove := stintRemoveRequest(base, original)
	prepared, err := PrepareStintBoundaryCorrectionSet(base, original, []StintBoundaryCorrection{remove, move})
	if err != nil {
		t.Fatal(err)
	}
	boundaries, err := ApplyStintBoundaryCorrections(base, original, original, prepared)
	if err != nil {
		t.Fatal(err)
	}
	if len(boundaries) != 1 || boundaries[0].StintNumber != 2 || !boundaries[0].Timestamp.Equal(original.Laps[1].End) || boundaries[0].Cause != strategyprojection.StintCauseDriverChange {
		t.Fatalf("effective boundaries = %+v", boundaries)
	}
	if boundaries[0].Provenance.Kind != strategyprojection.ProvenanceCorrected || boundaries[0].Provenance.SourceID == "" || boundaries[0].Provenance.ObservedAt != nil || boundaries[0].Confidence.SampleSize != 0 || boundaries[0].Confidence.RangeLower != nil || boundaries[0].Confidence.RangeUpper != nil || boundaries[0].Confidence.Variance != nil || boundaries[0].Confidence.ComputationVersion != stintBoundaryCorrectionComputationVersion {
		t.Fatalf("corrected boundary retained observed evidence: %+v", boundaries[0])
	}
	after, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) || base.SegmentationDigest == "" {
		t.Fatal("effective application mutated original evidence")
	}
}

func TestApplyStintBoundaryCorrectionsRejectsChangedTargetAtomically(t *testing.T) {
	base, original := stintCorrectionExample(t)
	request := stintRemoveRequest(base, original)
	prepared, err := PrepareStintBoundaryCorrectionSet(base, original, []StintBoundaryCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	effective := cloneValidityForStintTest(original)
	effective.Temporal.StintBoundaries[1].Timestamp = effective.Temporal.StintBoundaries[1].Timestamp.AddDate(0, 0, 1)
	boundaries, err := ApplyStintBoundaryCorrections(base, original, effective, prepared)
	if !errors.Is(err, ErrCorrectionTarget) || boundaries != nil {
		t.Fatalf("changed target applied approximately: %+v, %v", boundaries, err)
	}
}

func TestApplyStintBoundaryCorrectionsRejectsChangedAnchorAtomically(t *testing.T) {
	base, original := stintCorrectionExample(t)
	boundary := original.Temporal.StintBoundaries[0]
	request := StintBoundaryCorrection{
		Operation: StintBoundarySet, Base: base, Target: stintBoundaryTargetFor(boundary), Expected: boundary,
		Replacement: &StintBoundaryReplacement{Anchor: StintBoundaryAnchor{LapNumber: 1, Timestamp: original.Laps[1].End}, Cause: strategyprojection.StintCauseDriverChange},
		Reason:      "reviewed driver change",
	}
	prepared, err := PrepareStintBoundaryCorrectionSet(base, original, []StintBoundaryCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	effective := cloneValidityForStintTest(original)
	effective.Temporal.LapBoundaries = append(effective.Temporal.LapBoundaries[:1], effective.Temporal.LapBoundaries[2:]...)
	boundaries, err := ApplyStintBoundaryCorrections(base, original, effective, prepared)
	if !errors.Is(err, ErrCorrectionTarget) || boundaries != nil {
		t.Fatalf("changed anchor applied approximately: %+v, %v", boundaries, err)
	}
}

func TestApplyStintBoundaryCorrectionsCompactsRemainingStints(t *testing.T) {
	base, original := stintCorrectionExample(t)
	prepared, err := PrepareStintBoundaryCorrectionSet(base, original, []StintBoundaryCorrection{stintRemoveRequest(base, original)})
	if err != nil {
		t.Fatal(err)
	}
	boundaries, err := ApplyStintBoundaryCorrections(base, original, original, prepared)
	if err != nil {
		t.Fatal(err)
	}
	if len(boundaries) != 1 || boundaries[0].StintNumber != 2 {
		t.Fatalf("remaining stints were not compacted: %+v", boundaries)
	}
}

func TestApplyMixedCorrectionSnapshotCarriesV5Boundaries(t *testing.T) {
	base, original := stintCorrectionExample(t)
	snapshot, err := PrepareStintMixedCorrectionSnapshot(base, nil, original, nil, HistoricalSession{}, nil, nil, []StintBoundaryCorrection{stintRemoveRequest(base, original)})
	if err != nil {
		t.Fatal(err)
	}
	view, err := ApplyMixedCorrectionSnapshot(base, nil, original, HistoricalSession{}, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if view.SnapshotID != snapshot.SnapshotID || !reflect.DeepEqual(view.StintBoundaries, snapshot.StintBoundaries) {
		t.Fatalf("v5 view lost boundary decisions: %+v", view)
	}
}

func TestDeriveCorrectedSessionRecomputesStintBoundaries(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	base, _, _, _ := correctionExample()
	base.SessionID = session.ID
	session.Provenance.Parser = ParserRef{ID: base.ParserID, Version: base.ParserVersion}
	session.Provenance.SchemaFingerprint = base.SchemaFingerprint
	original, err := AnalyzeLapValidity(session, pages)
	if err != nil || len(original.Temporal.StintBoundaries) != 1 {
		t.Fatal("fixture has no stable stint boundary", err)
	}
	base.AnalysisVersion = original.ComputationVersion
	base.SegmentationDigest, err = correctionDigest("analysis.correction-segmentation.v1", original.Temporal)
	if err != nil {
		t.Fatal(err)
	}
	boundary := original.Temporal.StintBoundaries[0]
	anchor := original.Temporal.LapBoundaries[len(original.Temporal.LapBoundaries)-2]
	request := StintBoundaryCorrection{
		Operation: StintBoundarySet, Base: base, Target: stintBoundaryTargetFor(boundary), Expected: boundary,
		Replacement: &StintBoundaryReplacement{Anchor: StintBoundaryAnchor{LapNumber: anchor.LapNumber, Timestamp: anchor.Timestamp}, Cause: strategyprojection.StintCauseDriverChange},
		Reason:      "reviewed driver change",
	}
	snapshot, err := PrepareStintMixedCorrectionSnapshot(base, nil, original, nil, HistoricalSession{}, nil, nil, []StintBoundaryCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	caller := ClassifiedSession{SessionID: session.ID, Type: SessionTypeRace, Combination: CombinationIdentity{ID: "fixture-combination"}}
	emptySnapshot, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	baseline, err := DeriveCorrectedSession(base, session, pages, caller, emptySnapshot)
	if err != nil {
		t.Fatal(err)
	}
	before, err := json.Marshal(struct {
		Session  HistoricalSession
		Pages    []HistoricalPage
		Original LapValidityAnalysis
		Snapshot PreparedSampleCorrectionSnapshot
	}{session, pages, original, snapshot})
	if err != nil {
		t.Fatal(err)
	}
	derived, err := DeriveCorrectedSession(base, session, pages, caller, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if derived.SnapshotID != snapshot.SnapshotID || len(derived.Validity.Temporal.StintBoundaries) != 1 || !derived.Validity.Temporal.StintBoundaries[0].Timestamp.Equal(anchor.Timestamp) {
		t.Fatalf("stint derivation not refreshed: %+v", derived.Validity.Temporal.StintBoundaries)
	}
	if baseline.Observed == nil || derived.Observed == nil || len(baseline.Observed.Stints) >= len(derived.Observed.Stints) {
		t.Fatalf("observed strategy was not recalculated: before=%+v after=%+v", baseline.Observed, derived.Observed)
	}
	for _, stint := range derived.Observed.Stints {
		if stint.Provenance.Kind != strategyprojection.ProvenanceCorrected || stint.Provenance.SourceID != snapshot.SnapshotID {
			t.Fatalf("corrected stint retained observed provenance: %+v", stint)
		}
	}
	restored, err := DeriveCorrectedSession(base, session, pages, caller, emptySnapshot)
	if err != nil || !reflect.DeepEqual(restored, baseline) {
		t.Fatal("restoring the previous snapshot changed its derivations", err)
	}
	after, err := json.Marshal(struct {
		Session  HistoricalSession
		Pages    []HistoricalPage
		Original LapValidityAnalysis
		Snapshot PreparedSampleCorrectionSnapshot
	}{session, pages, original, snapshot})
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("derivation mutated source or stored snapshot")
	}
}
