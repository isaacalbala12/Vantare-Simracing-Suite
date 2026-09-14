package telemetryanalysis

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"
)

func stintRemoveRequest(base SourceAnalysisRef, validity LapValidityAnalysis) StintBoundaryCorrection {
	original := validity.Temporal.StintBoundaries[1]
	return StintBoundaryCorrection{
		Operation: StintBoundaryRemove,
		Base:      base,
		Target:    stintBoundaryTargetFor(original),
		Expected:  original,
		Reason:    "terminal marker reviewed",
	}
}

func TestPrepareStintMixedSnapshotPreservesOldVersionsAndBuildsV5(t *testing.T) {
	base, validity := stintCorrectionExample(t)
	command := CorrectionSaveCommand{ExpectedRevision: "parent", CommandID: "compatibility", Reason: "compatibility", LocalAuthorID: "local"}
	familyBase, familyValidity, family := lapFamilyCorrectionExample(t)
	identityTarget := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	identitySession := mixedSnapshotSession(base)
	identityClass := ClassificationCorrection{Base: base, Field: ClassificationFieldTrackName, ExpectedOriginal: "Imola", Replacement: "Monza", Reason: "reviewed identity", Provenance: ClassificationProvenanceManual, CanonicalCombinationID: identityTarget.ID}
	cases := []struct {
		name     string
		base     SourceAnalysisRef
		original LapValidityAnalysis
		families []LapFamilyUseCorrection
		session  HistoricalSession
		classes  []ClassificationCorrection
		target   *CombinationIdentity
		want     string
	}{
		{"v1", base, validity, nil, HistoricalSession{}, nil, nil, "analysis.sample-snapshot.v1"},
		{"v2", familyBase, familyValidity, []LapFamilyUseCorrection{family}, HistoricalSession{}, nil, nil, "analysis.observation-snapshot.v2"},
		{"v3", familyBase, LapValidityAnalysis{}, nil, mixedSnapshotSession(familyBase), mixedSnapshotClassRequests(familyBase), nil, "analysis.mixed-snapshot.v3"},
		{"v4", base, validity, nil, identitySession, []ClassificationCorrection{identityClass}, identityTarget, "analysis.mixed-snapshot.v4"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			previous, err := PrepareCanonicalMixedCorrectionSnapshot(tc.base, nil, tc.original, tc.families, tc.session, tc.classes, tc.target)
			if err != nil || previous.ContractVersion != tc.want {
				t.Fatal("cannot prepare legacy baseline", err)
			}
			previousJSON, err := json.Marshal(previous)
			if err != nil {
				t.Fatal(err)
			}
			previousCommand, err := correctionCommandDigestCanonicalMixed(tc.base, command, nil, tc.families, tc.classes)
			if err != nil {
				t.Fatal(err)
			}
			for _, requests := range [][]StintBoundaryCorrection{nil, {}} {
				got, err := PrepareStintMixedCorrectionSnapshot(tc.base, nil, tc.original, tc.families, tc.session, tc.classes, tc.target, requests)
				if err != nil {
					t.Fatal(err)
				}
				gotJSON, err := json.Marshal(got)
				if err != nil {
					t.Fatal(err)
				}
				gotCommand, err := correctionCommandDigestStintMixed(tc.base, command, nil, tc.families, tc.classes, requests)
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(got, previous) || !bytes.Equal(gotJSON, previousJSON) || gotCommand != previousCommand {
					t.Fatalf("empty stint set changed %s representation", tc.name)
				}
			}
		})
	}

	request := stintRemoveRequest(base, validity)
	first, err := PrepareStintMixedCorrectionSnapshot(base, nil, validity, nil, HistoricalSession{}, nil, nil, []StintBoundaryCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	second, err := PrepareStintMixedCorrectionSnapshot(base, nil, validity, nil, HistoricalSession{}, nil, nil, []StintBoundaryCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	if first.ContractVersion != "analysis.mixed-snapshot.v5" || len(first.StintBoundaries) != 1 || first.SnapshotID != second.SnapshotID {
		t.Fatalf("v5 snapshot is not stable: %+v", first)
	}
	observedAt := *first.StintBoundaries[0].Original.Provenance.ObservedAt
	*request.Expected.Provenance.ObservedAt = request.Expected.Provenance.ObservedAt.AddDate(1, 0, 0)
	if !first.StintBoundaries[0].Original.Provenance.ObservedAt.Equal(observedAt) {
		t.Fatal("snapshot aliases caller boundary")
	}
}

func TestPrepareStintMixedSnapshotUsesSharedQuota(t *testing.T) {
	base, validity := stintCorrectionExample(t)
	requests := make([]StintBoundaryCorrection, MaxSampleCorrections+1)
	for i := range requests {
		requests[i] = stintRemoveRequest(base, validity)
	}
	if _, err := PrepareStintMixedCorrectionSnapshot(base, nil, validity, nil, HistoricalSession{}, nil, nil, requests); err == nil {
		t.Fatal("accepted more than the shared operation budget")
	}
}

func TestPrepareStintMixedSnapshotCombinesCanonicalIdentity(t *testing.T) {
	base, validity := stintCorrectionExample(t)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	session := mixedSnapshotSession(base)
	track := ClassificationCorrection{
		Base: base, Field: ClassificationFieldTrackName, ExpectedOriginal: "Imola", Replacement: "Monza",
		Reason: "reviewed identity", Provenance: ClassificationProvenanceManual, CanonicalCombinationID: target.ID,
	}
	snapshot, err := PrepareStintMixedCorrectionSnapshot(base, nil, validity, nil, session, []ClassificationCorrection{track}, target, []StintBoundaryCorrection{stintRemoveRequest(base, validity)})
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v5" || snapshot.CanonicalCombination == nil || snapshot.CanonicalCombination.ID != target.ID || len(snapshot.StintBoundaries) != 1 {
		t.Fatalf("complete v5 snapshot = %+v", snapshot)
	}
}
