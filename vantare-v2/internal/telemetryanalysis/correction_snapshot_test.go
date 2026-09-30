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

func mixedSnapshotSession(base SourceAnalysisRef) HistoricalSession {
	meta := func(key, value string) HistoricalMetadata {
		return HistoricalMetadata{Key: key, Present: true, Value: value, Quality: QualityValid}
	}
	return HistoricalSession{
		SchemaVersion: HistoricalSchemaVersion,
		ID:            base.SessionID,
		Provenance: HistoricalProvenance{
			Source:            ManifestSource{Kind: SourceLMU, Format: base.ParserID},
			Parser:            ParserRef{ID: base.ParserID, Version: base.ParserVersion},
			SchemaFingerprint: base.SchemaFingerprint,
		},
		Metadata: []HistoricalMetadata{
			meta("TrackName", "Imola"), meta("TrackLayout", "GP"), meta("CarName", "Oreca 07"), meta("CarClass", "LMP2"),
			meta("SessionType", "race"), meta("WeatherConditions", "Dry"),
		},
	}
}

func mixedSnapshotClassRequests(base SourceAnalysisRef) []ClassificationCorrection {
	request := func(field ClassificationField, expected, replacement string) ClassificationCorrection {
		return ClassificationCorrection{Base: base, Field: field, ExpectedOriginal: expected, Replacement: replacement, Reason: "Reviewed classification", Provenance: ClassificationProvenanceManual}
	}
	return []ClassificationCorrection{
		request(ClassificationFieldSessionType, "race", "qualify"),
		request(ClassificationFieldWeatherConditions, "Dry", "Wet"),
	}
}

func mixedSnapshotScalar(t *testing.T, base SourceAnalysisRef) []SampleCorrectionInput {
	t.Helper()
	_, channel, sample, scalar := correctionExample()
	scalar.Base = base
	return []SampleCorrectionInput{{Channel: channel, Sample: sample, Request: scalar}}
}

func TestMixedSnapshotWithoutClassificationKeepsV1V2Exact(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	inputs := mixedSnapshotScalar(t, base)
	session := mixedSnapshotSession(base)
	scalarLegacy, err := PrepareObservationCorrectionSnapshot(base, inputs, original, nil)
	if err != nil {
		t.Fatal(err)
	}
	scalarMixed, err := PrepareMixedCorrectionSnapshot(base, inputs, original, nil, session, nil)
	if err != nil || !reflect.DeepEqual(scalarLegacy, scalarMixed) {
		t.Fatal("scalar-only snapshot changed", err)
	}
	wire, err := json.Marshal(scalarMixed)
	if err != nil || bytes.Contains(wire, []byte("classifications")) || bytes.Contains(wire, []byte("familyUses")) {
		t.Fatal("changed v1 wire representation", err)
	}
	familyLegacy, err := PrepareObservationCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family})
	if err != nil {
		t.Fatal(err)
	}
	familyMixed, err := PrepareMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, nil)
	if err != nil || !reflect.DeepEqual(familyLegacy, familyMixed) {
		t.Fatal("family-only snapshot changed", err)
	}
	wire, err = json.Marshal(familyMixed)
	if err != nil || bytes.Contains(wire, []byte("classifications")) || !bytes.Contains(wire, []byte("familyUses")) {
		t.Fatal("changed v2 wire representation", err)
	}
}

func TestMixedSnapshotV2GoldenIdentity(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	inputs := mixedSnapshotScalar(t, base)
	session := mixedSnapshotSession(base)
	snapshot, err := PrepareMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, nil)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.ContractVersion != "analysis.observation-snapshot.v2" {
		t.Fatalf("expected v2, got %s", snapshot.ContractVersion)
	}
	const expected = "55938408263d47fe0df6280e515a858107dee33078f74af755e01a18a647e632"
	if snapshot.SnapshotID != expected {
		t.Fatalf("canonical identity: %s", snapshot.SnapshotID)
	}
}

func TestMixedSnapshotV3ClassificationAlone(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	requests := mixedSnapshotClassRequests(base)
	snapshot, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, requests)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v3" || len(snapshot.Corrections) != 0 || len(snapshot.FamilyUses) != 0 || len(snapshot.Classifications) != 2 {
		t.Fatalf("wrong v3 shape: %+v", snapshot)
	}
	wire, err := json.Marshal(snapshot)
	if err != nil || !bytes.Contains(wire, []byte("classifications")) || bytes.Contains(wire, []byte("familyUses")) {
		t.Fatal("wrong v3 wire representation", err)
	}
	changed := mixedSnapshotClassRequests(base)
	changed[0].Reason = "Another reviewed decision"
	renamed, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, changed)
	if err != nil || renamed.SnapshotID == snapshot.SnapshotID {
		t.Fatal("classification reason missing from identity", err)
	}
	changed[0] = mixedSnapshotClassRequests(base)[0]
	changed[0].Replacement = "practice"
	replaced, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, changed)
	if err != nil || replaced.SnapshotID == snapshot.SnapshotID {
		t.Fatal("classification replacement missing from identity", err)
	}
	tampered := mixedSnapshotClassRequests(base)
	tampered[0].ExpectedOriginal = "practice"
	failed, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, tampered)
	if !errors.Is(err, ErrCorrectionPrecondition) || !reflect.DeepEqual(failed, PreparedSampleCorrectionSnapshot{}) {
		t.Fatal("tampered classification escaped", err)
	}
	foreign := mixedSnapshotClassRequests(base)
	foreign[0].Base.SessionID = "other"
	escaped, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, foreign)
	if !errors.Is(err, ErrCorrectionSourceChanged) || !reflect.DeepEqual(escaped, PreparedSampleCorrectionSnapshot{}) {
		t.Fatal("foreign base escaped", err)
	}
}

func TestMixedSnapshotV3MixedAllGroupsAndDetached(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	inputs := mixedSnapshotScalar(t, base)
	session := mixedSnapshotSession(base)
	requests := mixedSnapshotClassRequests(base)
	snapshot, err := PrepareMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, requests)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v3" || len(snapshot.Corrections) != 1 || len(snapshot.FamilyUses) != 1 || len(snapshot.Classifications) != 2 {
		t.Fatalf("wrong mixed v3 shape: %+v", snapshot)
	}
	reversed := []ClassificationCorrection{requests[1], requests[0]}
	resorted, err := PrepareMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, reversed)
	if err != nil || !reflect.DeepEqual(snapshot, resorted) {
		t.Fatal("request order changed snapshot", err)
	}
	requests[0].Reason = "mutated caller"
	inputs[0].Request.Reason = "mutated caller"
	session.Metadata[4].Value = "mutated caller"
	if snapshot.Classifications[0].Request.Reason == "mutated caller" || snapshot.Corrections[0].Request.Reason == "mutated caller" {
		t.Fatal("snapshot aliases caller")
	}
}

func mixedSnapshotScalarRange(t *testing.T, base SourceAnalysisRef, channel HistoricalChannel, count int) []SampleCorrectionInput {
	t.Helper()
	inputs := make([]SampleCorrectionInput, 0, count)
	for i := 0; i < count; i++ {
		value := HistoricalValue{Column: "value", Present: true, Quality: QualityUnknown, Scalar: HistoricalScalar{Kind: ScalarNumber, Number: float64(i)}}
		sample := HistoricalSample{Index: int64(i), Values: []HistoricalValue{value}}
		request := SampleValueCorrection{
			Base: base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: "value", SampleIndex: int64(i)},
			Unit: channel.Unit, Expected: value,
			Replacement: HistoricalScalar{Kind: ScalarNumber, Number: float64(i) + 1000},
			Reason:      "Reviewed source measurement",
		}
		inputs = append(inputs, SampleCorrectionInput{Channel: channel, Sample: sample, Request: request})
	}
	return inputs
}

func TestMixedSnapshotQuotaCountsAllGroups(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	_, channel, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	classes := mixedSnapshotClassRequests(base)
	inputs := mixedSnapshotScalarRange(t, base, channel, MaxSampleCorrections-3)
	full, err := PrepareMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, classes)
	if err != nil {
		t.Fatal("valid 256-operation set rejected", err)
	}
	if full.ContractVersion != "analysis.mixed-snapshot.v3" || len(full.Corrections) != MaxSampleCorrections-3 || len(full.FamilyUses) != 1 || len(full.Classifications) != 2 {
		t.Fatalf("wrong full v3 shape: %d/%d/%d", len(full.Corrections), len(full.FamilyUses), len(full.Classifications))
	}
	inputs = mixedSnapshotScalarRange(t, base, channel, MaxSampleCorrections-2)
	over, err := PrepareMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, classes)
	if !errors.Is(err, ErrInvalidCorrection) || !reflect.DeepEqual(over, PreparedSampleCorrectionSnapshot{}) {
		t.Fatalf("257-operation set escaped quota: %v", err)
	}
}

func TestMixedSnapshotNoGlobalSuccessClaim(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	inputs := mixedSnapshotScalar(t, base)
	session := mixedSnapshotSession(base)
	kept := session.Metadata[:0]
	for _, entry := range session.Metadata {
		if entry.Key != "WeatherConditions" {
			kept = append(kept, entry)
		}
	}
	session.Metadata = kept
	requests := mixedSnapshotClassRequests(base)[:1]
	snapshot, err := PrepareMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, requests)
	if err != nil || len(snapshot.Classifications) != 1 {
		t.Fatal("valid field with missing weather rejected", err)
	}
	if _, err := ClassifyHistoricalSession(session); !errors.Is(err, ErrInvalidSessionClassification) {
		t.Fatalf("partial global classification succeeded: %v", err)
	}
}

func TestPrepareStoredClassificationRepresentation(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	requests := mixedSnapshotClassRequests(base)
	live, err := PrepareClassificationCorrectionSet(base, session, requests)
	if err != nil {
		t.Fatal(err)
	}
	stored, err := prepareStoredClassificationCorrections(base, requests)
	if err != nil || !reflect.DeepEqual(live, stored) {
		t.Fatal("stored representation differs from live preparation", err)
	}
	tampered := mixedSnapshotClassRequests(base)
	tampered[0].Base.ParserVersion = "other"
	if _, err := prepareStoredClassificationCorrections(base, tampered); !errors.Is(err, ErrCorrectionInterpretationChanged) {
		t.Fatalf("foreign base escaped stored validation: %v", err)
	}
	duplicated := append(mixedSnapshotClassRequests(base), mixedSnapshotClassRequests(base)[0])
	if got, err := prepareStoredClassificationCorrections(base, duplicated); !errors.Is(err, ErrOverlappingCorrections) || got != nil {
		t.Fatalf("duplicated field escaped stored validation: %v", err)
	}
	forbidden := mixedSnapshotClassRequests(base)
	forbidden[0].Field = "TrackName"
	if _, err := prepareStoredClassificationCorrections(base, forbidden); !errors.Is(err, ErrCorrectionTarget) {
		t.Fatalf("forbidden field escaped stored validation: %v", err)
	}
	empty, err := prepareStoredClassificationCorrections(base, nil)
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty stored set must be valid and empty: %v", err)
	}
	bad := base
	bad.SizeBytes = 0
	if _, err := prepareStoredClassificationCorrections(bad, nil); err == nil {
		t.Fatal("empty stored set with invalid base accepted")
	}
}

func TestMixedSnapshotV3EmptyGroupsLiveMatchesStored(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	requests := mixedSnapshotClassRequests(base)
	live, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, requests)
	if err != nil {
		t.Fatal(err)
	}
	if live.FamilyUses != nil || len(live.Corrections) != 0 || len(live.Classifications) != 2 {
		t.Fatalf("v3 empty groups not canonical: %+v", live)
	}
	scalar, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	families, err := prepareStoredLapFamilyCorrections(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	classes, err := prepareStoredClassificationCorrections(base, requests)
	if err != nil {
		t.Fatal(err)
	}
	rebuilt, err := combineMixedSnapshot(scalar, families, classes)
	if err != nil || !reflect.DeepEqual(live, rebuilt) {
		t.Fatal("stored reconstruction differs from live v3", err)
	}
	wire, err := json.Marshal(live)
	if err != nil {
		t.Fatal(err)
	}
	var read PreparedSampleCorrectionSnapshot
	if err := json.Unmarshal(wire, &read); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(live, read) {
		t.Fatal("JSON roundtrip differs from live v3")
	}
}
