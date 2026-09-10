package telemetryanalysis

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"testing"
)

func TestObservationSnapshotPreservesScalarRepresentation(t *testing.T) {
	base, channel, sample, request := correctionExample()
	inputs := []SampleCorrectionInput{{Channel: channel, Sample: sample, Request: request}}
	scalar, err := PrepareSampleCorrectionSnapshot(base, inputs)
	if err != nil {
		t.Fatal(err)
	}
	combined, err := PrepareObservationCorrectionSnapshot(base, inputs, LapValidityAnalysis{}, []LapFamilyUseCorrection{})
	if err != nil || !reflect.DeepEqual(scalar, combined) {
		t.Fatal("scalar-only snapshot changed", err)
	}
	wire, err := json.Marshal(combined)
	if err != nil || bytes.Contains(wire, []byte("familyUses")) {
		t.Fatal("changed v1 wire representation", err)
	}
}

func TestObservationSnapshotBindsBothKindsAndRejectsPartialSets(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	_, channel, sample, scalar := correctionExample()
	scalar.Base = base
	inputs := []SampleCorrectionInput{{Channel: channel, Sample: sample, Request: scalar}}
	snapshot, err := PrepareObservationCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family})
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.ContractVersion != "analysis.observation-snapshot.v2" || len(snapshot.Corrections) != 1 || len(snapshot.FamilyUses) != 1 {
		t.Fatal("missing operation in mixed snapshot", snapshot)
	}
	family.Reason = "Another reviewed decision"
	changed, err := PrepareObservationCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family})
	if err != nil || changed.SnapshotID == snapshot.SnapshotID {
		t.Fatal("family decision missing from identity", err)
	}
	family.Target.Number++
	failed, err := PrepareObservationCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family})
	if !errors.Is(err, ErrCorrectionTarget) || !reflect.DeepEqual(failed, PreparedSampleCorrectionSnapshot{}) {
		t.Fatal("partial scalar snapshot escaped", err)
	}
	if _, err := PrepareObservationCorrectionSnapshot(base, make([]SampleCorrectionInput, MaxSampleCorrections), original, []LapFamilyUseCorrection{family}); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("mixed set exceeded shared quota", err)
	}
}

func mixedCorrectionDocumentExample(t *testing.T) (SourceAnalysisRef, correctionDocument) {
	t.Helper()
	base, original, family := lapFamilyCorrectionExample(t)
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, channel, sample, scalar := correctionExample()
	scalar.Base = base
	inputs := []SampleCorrectionInput{{Channel: channel, Sample: sample, Request: scalar}}
	scalarSnapshot, err := PrepareSampleCorrectionSnapshot(base, inputs)
	if err != nil {
		t.Fatal(err)
	}
	mixed, err := PrepareObservationCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family})
	if err != nil {
		t.Fatal(err)
	}
	doc := correctionDocument{Version: 1, Base: base, HeadID: initial.SnapshotID, Revisions: []CorrectionRevision{}}
	for i, snapshot := range []PreparedSampleCorrectionSnapshot{scalarSnapshot, mixed, scalarSnapshot} {
		command := CorrectionSaveCommand{ExpectedRevision: doc.HeadID, CommandID: fmt.Sprintf("command-%d", i), Reason: "Reviewed change", LocalAuthorID: "local"}
		families := []LapFamilyUseCorrection{}
		for _, prepared := range snapshot.FamilyUses {
			families = append(families, prepared.Request)
		}
		digest, err := correctionCommandDigestWithFamilies(base, command, []SampleValueCorrection{scalar}, families)
		if err != nil {
			t.Fatal(err)
		}
		revision := CorrectionRevision{ParentRevisionID: doc.HeadID, Command: command, CommandDigest: digest, CreatedAt: "2026-09-10T12:00:00Z", Snapshot: snapshot}
		id, err := correctionRevisionDigest(revision)
		if err != nil {
			t.Fatal(err)
		}
		revision.RevisionID, doc.HeadID = id, id
		doc.Revisions = append(doc.Revisions, revision)
	}
	return base, doc
}

func TestCorrectionDocumentRetainsScalarMixedAndRestoredHistory(t *testing.T) {
	base, doc := mixedCorrectionDocumentExample(t)
	data, err := encodeCorrectionDocument(doc)
	if err != nil {
		t.Fatal(err)
	}
	read, err := decodeCorrectionDocument(data, base)
	if err != nil || !reflect.DeepEqual(read, doc) {
		t.Fatal("mixed history did not roundtrip unchanged", err)
	}
	mixed := doc.Revisions[1]
	legacyDigest, err := correctionCommandDigest(base, mixed.Command, []SampleValueCorrection{mixed.Snapshot.Corrections[0].Request})
	if err != nil || legacyDigest == mixed.CommandDigest {
		t.Fatal("command resolution can ignore family payload", err)
	}
}

func TestCorrectionDocumentRejectsMixedSnapshotTampering(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(*CorrectionRevision)
	}{
		{"corrected", func(r *CorrectionRevision) { r.Snapshot.FamilyUses[0].Corrected.Included = true }},
		{"original", func(r *CorrectionRevision) { r.Snapshot.FamilyUses[0].Original.Included = false }},
		{"reason", func(r *CorrectionRevision) { r.Snapshot.FamilyUses[0].Request.Reason = "" }},
		{"foreign base", func(r *CorrectionRevision) { r.Snapshot.FamilyUses[0].Request.Base.SessionID = "other" }},
		{"v1 with families", func(r *CorrectionRevision) { r.Snapshot.ContractVersion = "analysis.sample-snapshot.v1" }},
		{"dropped families", func(r *CorrectionRevision) { r.Snapshot.FamilyUses = nil }},
		{"overlap", func(r *CorrectionRevision) {
			r.Snapshot.FamilyUses = append(r.Snapshot.FamilyUses, r.Snapshot.FamilyUses[0])
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base, doc := mixedCorrectionDocumentExample(t)
			tc.edit(&doc.Revisions[1])
			data, err := encodeCorrectionDocument(doc)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := decodeCorrectionDocument(data, base); !errors.Is(err, ErrCorruptCorrections) {
				t.Fatal("accepted altered family history", err)
			}
		})
	}
}

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
