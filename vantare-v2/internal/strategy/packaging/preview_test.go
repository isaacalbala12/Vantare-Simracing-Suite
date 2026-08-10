package packaging

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

func emptyLocal() LocalState {
	return LocalState{
		DraftHashes:    map[contract.DraftID]string{},
		RevisionHashes: map[RevisionKey]string{},
	}
}

func localFrom(t *testing.T, pkg Package[testPayload]) LocalState {
	t.Helper()
	state := emptyLocal()
	for _, bundle := range pkg.Bundles {
		if bundle.Draft != nil {
			state.DraftHashes[bundle.Draft.DraftID] = DraftFingerprint(*bundle.Draft)
		}
		for _, revision := range bundle.Revisions {
			metadata := revision.Metadata()
			state.RevisionHashes[RevisionKey{
				PlanID:     metadata.PlanID,
				VariantID:  metadata.VariantID,
				RevisionID: metadata.RevisionID,
			}] = metadata.ContentHash
		}
	}
	return state
}

func TestAPackageAgainstAnEmptyLibraryIsAllNew(t *testing.T) {
	preview := Reconcile(buildOne(t), emptyLocal())
	if !preview.Importable {
		t.Fatal("nothing can conflict with an empty library")
	}
	if len(preview.Entries) != 1 || preview.Entries[0].Disposition != DispositionNew {
		t.Fatalf("expected one new plan, got %+v", preview.Entries)
	}
	if preview.Entries[0].NewRevisions != 1 || preview.Entries[0].RevisionCount != 1 {
		t.Fatalf("revision counts are wrong: %+v", preview.Entries[0])
	}
	if preview.Entries[0].Name != "Race plan" {
		t.Fatalf("the entry must be named from its documents: %q", preview.Entries[0].Name)
	}
}

func TestReimportingWhatIsAlreadyStoredChangesNothing(t *testing.T) {
	built := buildOne(t)
	preview := Reconcile(built, localFrom(t, built))
	if !preview.Importable {
		t.Fatal("re-importing an identical package is not a conflict")
	}
	if preview.Entries[0].Disposition != DispositionUnchanged {
		t.Fatalf("expected unchanged, got %q", preview.Entries[0].Disposition)
	}
	if preview.Entries[0].NewRevisions != 0 {
		t.Fatalf("nothing should be new: %+v", preview.Entries[0])
	}
}

func TestAPackageThatOnlyAddsRevisionsSaysSo(t *testing.T) {
	built := buildOne(t)
	local := localFrom(t, built)
	// Forget the revision, keep the draft: the package now only adds history.
	local.RevisionHashes = map[RevisionKey]string{}

	preview := Reconcile(built, local)
	if !preview.Importable {
		t.Fatal("adding revisions is not a conflict")
	}
	if preview.Entries[0].Disposition != DispositionAddsRevisions {
		t.Fatalf("expected adds_revisions, got %q", preview.Entries[0].Disposition)
	}
	if preview.Entries[0].NewRevisions != 1 {
		t.Fatalf("expected one new revision, got %d", preview.Entries[0].NewRevisions)
	}
}

func TestOverwritingOpenWorkIsAnnouncedBeforeItHappens(t *testing.T) {
	built := buildOne(t)
	local := localFrom(t, built)
	local.DraftHashes["draft-1"] = "a different fingerprint"

	preview := Reconcile(built, local)
	if !preview.Importable {
		t.Fatal("replacing a draft is allowed; it must not be silent")
	}
	if preview.Entries[0].Disposition != DispositionReplacesDraft {
		t.Fatalf("expected replaces_draft, got %q", preview.Entries[0].Disposition)
	}
}

func TestARevisionThatWouldRewriteHistoryBlocksTheImport(t *testing.T) {
	built := buildOne(t)
	local := localFrom(t, built)
	for key := range local.RevisionHashes {
		local.RevisionHashes[key] = "a different content hash"
	}

	preview := Reconcile(built, local)
	if preview.Importable {
		t.Fatal("a revision identity with different content must block the import")
	}
	entry := preview.Entries[0]
	if entry.Disposition != DispositionConflict {
		t.Fatalf("expected conflict, got %q", entry.Disposition)
	}
	if len(entry.ConflictingRevisions) != 1 || entry.ConflictingRevisions[0] != "revision-1" {
		t.Fatalf("the preview must name what collides: %+v", entry.ConflictingRevisions)
	}
}

func TestReconcileIsPureAndRepeatable(t *testing.T) {
	built := buildOne(t)
	local := localFrom(t, built)
	first := Reconcile(built, local)
	for attempt := 0; attempt < 5; attempt++ {
		again := Reconcile(built, local)
		if again.Importable != first.Importable || len(again.Entries) != len(first.Entries) {
			t.Fatal("the same package and library must always preview the same")
		}
		for index := range again.Entries {
			if again.Entries[index].Disposition != first.Entries[index].Disposition {
				t.Fatal("dispositions changed between identical previews")
			}
		}
	}
}

func TestDraftFingerprintIgnoresEncodingAndNotIdentity(t *testing.T) {
	first := draft("draft-1", "plan-1", 10)
	same := draft("draft-1", "plan-1", 10)
	different := draft("draft-1", "plan-1", 11)

	if DraftFingerprint(first) != DraftFingerprint(same) {
		t.Fatal("equal drafts must fingerprint equally")
	}
	if DraftFingerprint(first) == DraftFingerprint(different) {
		t.Fatal("a changed payload must change the fingerprint")
	}
}
