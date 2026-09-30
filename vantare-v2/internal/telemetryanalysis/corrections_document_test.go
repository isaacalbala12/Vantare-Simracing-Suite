package telemetryanalysis

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func mixedClassificationDocument(t *testing.T) (SourceAnalysisRef, []byte) {
	t.Helper()
	ctx := context.Background()
	base, input, command := mixedClassificationStoreExample(t)
	store := NewCorrectionStore(t.TempDir())
	if _, err := store.SaveObservations(ctx, base, input, command); err != nil {
		t.Fatal(err)
	}
	digest, err := base.Digest()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(store.root, digest+".json"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeCorrectionDocument(data, base); err != nil {
		t.Fatal("stored v3 history rejected", err)
	}
	return base, data
}

func TestCorrectionDocumentRejectsTamperedClassification(t *testing.T) {
	base, data := mixedClassificationDocument(t)
	for _, tc := range []struct {
		name string
		edit func(*CorrectionRevision)
	}{
		{"corrected", func(r *CorrectionRevision) { r.Snapshot.Classifications[0].Corrected = "Storm" }},
		{"original", func(r *CorrectionRevision) { r.Snapshot.Classifications[1].Original = "Humid" }},
		{"reason", func(r *CorrectionRevision) { r.Snapshot.Classifications[0].Request.Reason = "" }},
		{"provenance", func(r *CorrectionRevision) { r.Snapshot.Classifications[0].Request.Provenance = "auto" }},
		{"foreign base", func(r *CorrectionRevision) { r.Snapshot.Classifications[0].Request.Base.SessionID = "other" }},
		{"dropped classifications", func(r *CorrectionRevision) { r.Snapshot.Classifications = nil }},
		{"downgraded tag", func(r *CorrectionRevision) { r.Snapshot.ContractVersion = "analysis.observation-snapshot.v2" }},
		{"overlap", func(r *CorrectionRevision) {
			r.Snapshot.Classifications = append(r.Snapshot.Classifications, r.Snapshot.Classifications[0])
		}},
		{"quota", func(r *CorrectionRevision) {
			r.Snapshot.Classifications = append(r.Snapshot.Classifications, make([]PreparedClassificationCorrection, MaxSampleCorrections)...)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			doc, err := decodeCorrectionDocument(data, base)
			if err != nil {
				t.Fatal(err)
			}
			tc.edit(&doc.Revisions[0])
			corrupt, err := encodeCorrectionDocument(doc)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = decodeCorrectionDocument(corrupt, base); !errors.Is(err, ErrCorruptCorrections) {
				t.Fatal("accepted altered classification history", err)
			}
		})
	}
}

func TestCorrectionDocumentRejectsResealedClassification(t *testing.T) {
	base, data := mixedClassificationDocument(t)
	for _, tc := range []struct {
		name string
		edit func(*CorrectionRevision)
	}{
		{"corrected", func(r *CorrectionRevision) { r.Snapshot.Classifications[0].Corrected = "Storm" }},
		{"reason", func(r *CorrectionRevision) { r.Snapshot.Classifications[1].Request.Reason = "forged review" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			doc, err := decodeCorrectionDocument(data, base)
			if err != nil {
				t.Fatal(err)
			}
			revision := &doc.Revisions[0]
			tc.edit(revision)
			resealMixedRevision(t, base, revision)
			doc.HeadID = revision.RevisionID
			corrupt, err := encodeCorrectionDocument(doc)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = decodeCorrectionDocument(corrupt, base); !errors.Is(err, ErrCorruptCorrections) {
				t.Fatal("accepted resealed classification history", err)
			}
		})
	}
}

// resealMixedRevision recomputes every outer ID over the altered groups,
// exactly as an attacker with code access would. The decoder must still
// reject on prepared inconsistency: these digests are consistency checks,
// not authenticity signatures, so a semantically valid decision with fully
// recomputed hashes is indistinguishable by design and is not tested here.
func resealMixedRevision(t *testing.T, base SourceAnalysisRef, revision *CorrectionRevision) {
	t.Helper()
	snapshot := revision.Snapshot
	scalarRequests := make([]SampleValueCorrection, len(snapshot.Corrections))
	for i, correction := range snapshot.Corrections {
		scalarRequests[i] = correction.Request
	}
	familyRequests := make([]LapFamilyUseCorrection, len(snapshot.FamilyUses))
	for i, correction := range snapshot.FamilyUses {
		familyRequests[i] = correction.Request
	}
	classRequests := make([]ClassificationCorrection, len(snapshot.Classifications))
	for i, correction := range snapshot.Classifications {
		classRequests[i] = correction.Request
	}
	recombined, err := combineMixedSnapshot(
		PreparedSampleCorrectionSnapshot{Base: snapshot.Base, Corrections: snapshot.Corrections},
		snapshot.FamilyUses, snapshot.Classifications)
	if err != nil {
		t.Fatal(err)
	}
	revision.Snapshot.SnapshotID = recombined.SnapshotID
	digest, err := correctionCommandDigestMixed(base, revision.Command, scalarRequests, familyRequests, classRequests)
	if err != nil {
		t.Fatal(err)
	}
	revision.CommandDigest = digest
	id, err := correctionRevisionDigest(*revision)
	if err != nil {
		t.Fatal(err)
	}
	revision.RevisionID = id
}
