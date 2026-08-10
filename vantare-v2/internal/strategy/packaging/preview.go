package packaging

import (
	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

// Preview answers the only question that matters before importing: what would
// this do to what I already have? It is computed without writing anything, and
// the same inputs always produce the same answer.

// Disposition is what importing one plan variant would do.
type Disposition string

const (
	// DispositionNew: nothing with this identity exists locally.
	DispositionNew Disposition = "new"
	// DispositionUnchanged: everything the package carries is already stored.
	DispositionUnchanged Disposition = "unchanged"
	// DispositionAddsRevisions: the plan exists and the package brings saved
	// revisions that are not stored yet. Nothing is overwritten.
	DispositionAddsRevisions Disposition = "adds_revisions"
	// DispositionReplacesDraft: a draft with this identity exists locally with
	// different content. Importing would overwrite work in progress.
	DispositionReplacesDraft Disposition = "replaces_draft"
	// DispositionConflict: a revision identity exists locally with different
	// content. Revisions are immutable, so the import is refused.
	DispositionConflict Disposition = "conflict"
)

// RevisionKey identifies a stored revision for reconciliation.
type RevisionKey struct {
	PlanID     contract.PlanID
	VariantID  contract.VariantID
	RevisionID contract.RevisionID
}

// LocalState is the minimum the reconciler needs to know about what is already
// stored. The caller builds it from the repository; this package never reads
// one, which is why it can stay pure and exhaustively testable.
type LocalState struct {
	// DraftHashes maps a draft identity to a fingerprint of its content.
	DraftHashes map[contract.DraftID]string
	// RevisionHashes maps a revision identity to its content hash.
	RevisionHashes map[RevisionKey]string
}

// PreviewEntry describes one plan variant in the package.
type PreviewEntry struct {
	PlanID      contract.PlanID    `json:"planId"`
	VariantID   contract.VariantID `json:"variantId"`
	Name        string             `json:"name"`
	Mode        contract.PlanMode  `json:"mode"`
	Disposition Disposition        `json:"disposition"`
	HasDraft    bool               `json:"hasDraft"`
	// RevisionCount is what the package carries; NewRevisions is how many of
	// those are not already stored.
	RevisionCount int `json:"revisionCount"`
	NewRevisions  int `json:"newRevisions"`
	// ConflictingRevisions names the revisions that block the import.
	ConflictingRevisions []contract.RevisionID `json:"conflictingRevisions,omitempty"`
}

// Preview is the whole answer, package-wide.
type Preview struct {
	PackageVersion  string                   `json:"packageVersion"`
	ContractVersion contract.ContractVersion `json:"contractVersion"`
	Provenance      Provenance               `json:"provenance"`
	Checksum        string                   `json:"checksum"`
	Entries         []PreviewEntry           `json:"entries"`
	// Importable is false when any entry conflicts. A preview that cannot be
	// applied says so once, rather than making the caller scan the entries.
	Importable bool `json:"importable"`
}

// Reconcile compares a decoded package against what is stored locally. It is a
// pure function: it reads nothing, writes nothing, and decides nothing about
// whether to proceed.
func Reconcile[T any](pkg Package[T], local LocalState) Preview {
	preview := Preview{
		PackageVersion:  PackageVersionV1,
		ContractVersion: contract.CurrentVersion,
		Provenance:      pkg.Provenance,
		Checksum:        pkg.Checksum,
		Entries:         make([]PreviewEntry, 0, len(pkg.Bundles)),
		Importable:      true,
	}
	for _, bundle := range pkg.Bundles {
		entry := reconcileBundle(bundle, local)
		if entry.Disposition == DispositionConflict {
			preview.Importable = false
		}
		preview.Entries = append(preview.Entries, entry)
	}
	return preview
}

func reconcileBundle[T any](bundle Bundle[T], local LocalState) PreviewEntry {
	entry := PreviewEntry{
		PlanID:        bundle.PlanID,
		VariantID:     bundle.VariantID,
		HasDraft:      bundle.Draft != nil,
		RevisionCount: len(bundle.Revisions),
	}
	entry.Name, entry.Mode = titleOf(bundle)

	// "Nothing of this plan is here yet" is a different answer from "this plan
	// is here and the package adds to it", so presence is tracked separately
	// from difference.
	existsLocally, draftDiffers := false, false
	if bundle.Draft != nil {
		stored, exists := local.DraftHashes[bundle.Draft.DraftID]
		if exists {
			existsLocally = true
			draftDiffers = stored != DraftFingerprint(*bundle.Draft)
		}
	}

	for _, revision := range bundle.Revisions {
		metadata := revision.Metadata()
		key := RevisionKey{PlanID: metadata.PlanID, VariantID: metadata.VariantID, RevisionID: metadata.RevisionID}
		stored, exists := local.RevisionHashes[key]
		switch {
		case !exists:
			entry.NewRevisions++
		case stored != metadata.ContentHash:
			entry.ConflictingRevisions = append(entry.ConflictingRevisions, metadata.RevisionID)
		default:
			existsLocally = true
		}
	}

	switch {
	case len(entry.ConflictingRevisions) > 0:
		entry.Disposition = DispositionConflict
	case !existsLocally:
		entry.Disposition = DispositionNew
	case draftDiffers:
		entry.Disposition = DispositionReplacesDraft
	case entry.NewRevisions > 0:
		entry.Disposition = DispositionAddsRevisions
	default:
		entry.Disposition = DispositionUnchanged
	}
	return entry
}

// DraftFingerprint is how a draft's content is compared for equality. Drafts
// are mutable and carry no hash of their own, so the comparison goes through
// the shared canonical form rather than through raw JSON bytes, which would
// differ on key order alone.
func DraftFingerprint[T any](draft contract.PlanDraft[T]) string {
	encoded, err := marshalDraft(draft)
	if err != nil {
		// An unencodable draft cannot equal anything; a sentinel keeps this
		// total rather than forcing every caller to handle an impossible error.
		return "unencodable"
	}
	_, digest, err := contract.CanonicalizeAndHashJSONV1(encoded)
	if err != nil {
		return "unencodable"
	}
	return digest
}

// titleOf names a bundle from the draft if there is one, otherwise from its
// newest revision. It never invents a name.
func titleOf[T any](bundle Bundle[T]) (string, contract.PlanMode) {
	if bundle.Draft != nil {
		return bundle.Draft.Name, bundle.Draft.Mode
	}
	if len(bundle.Revisions) == 0 {
		return "", ""
	}
	newest := bundle.Revisions[len(bundle.Revisions)-1].Metadata()
	return newest.Name, newest.Mode
}
