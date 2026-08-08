// Package packaging owns the transfer format for strategy plans: how a plan
// leaves this machine and how one arrives.
//
// It is deliberately pure. It never touches the filesystem and never sees the
// repository: it builds, encodes, decodes and verifies packages, and the
// application service — which already owns the repository — decides what to
// read and what to commit. Persistence is not duplicated here.
//
// Exporting is an explicit, local, user-initiated action. Nothing in this
// package sends anything anywhere.
package packaging

import (
	"bytes"
	"encoding/json"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

// PackageVersionV1 versions the envelope itself, independently of the
// contract version of the documents it carries. A future envelope change must
// not be mistaken for a document change, and vice versa.
const PackageVersionV1 = "strategy.package.v1"

// MaxPackageBytes bounds what will be decoded. Import reads a file the user
// chose; a hostile or corrupt file must fail fast rather than exhaust memory.
const MaxPackageBytes = 4 << 20

// Provenance records where a package came from. It is evidence for the person
// importing, never an authorisation: nothing here is trusted to grant access.
type Provenance struct {
	// Application names the producer, e.g. "vantare".
	Application string `json:"application"`
	// ApplicationVersion is the producing build, so an import that behaves
	// oddly can be traced to what wrote it.
	ApplicationVersion string `json:"applicationVersion"`
	// ExportedAt is when the package was built, in UTC.
	ExportedAt time.Time `json:"exportedAt"`
	// Note is a free-text label the user may attach. Never interpreted.
	Note string `json:"note,omitempty"`
}

func (provenance Provenance) validate() error {
	if trimmed(provenance.Application) == "" {
		return packagingError(ErrorInvalidProvenance, "provenance.application", "a package must name the application that produced it")
	}
	if trimmed(provenance.ApplicationVersion) == "" {
		return packagingError(ErrorInvalidProvenance, "provenance.applicationVersion", "a package must record the producing version")
	}
	if provenance.ExportedAt.IsZero() {
		return packagingError(ErrorInvalidProvenance, "provenance.exportedAt", "a package must record when it was exported")
	}
	if len(provenance.Note) > 512 {
		return packagingError(ErrorInvalidProvenance, "provenance.note", "package note is too long")
	}
	return nil
}

// Bundle is everything a package carries about one plan variant: the open
// draft, if any, and its saved revisions.
type Bundle[T any] struct {
	PlanID    contract.PlanID    `json:"planId"`
	VariantID contract.VariantID `json:"variantId"`
	Draft     *contract.PlanDraft[T]
	Revisions []contract.PlanRevision[T]
}

// Package is a verified transfer unit. Values of this type have passed
// validation and carry a checksum over their own content.
type Package[T any] struct {
	Provenance Provenance
	Bundles    []Bundle[T]
	// Checksum covers every field of the encoded package except itself.
	Checksum string
}

// wirePackage is the on-disk shape. Documents travel as raw JSON so that a
// revision is verified by its own decoder — which re-derives and checks its
// content hash — rather than by a re-encode here that could normalise away a
// discrepancy.
type wirePackage struct {
	PackageVersion    string                   `json:"packageVersion"`
	ContractVersion   contract.ContractVersion `json:"contractVersion"`
	ChecksumAlgorithm string                   `json:"checksumAlgorithm"`
	Provenance        Provenance               `json:"provenance"`
	Bundles           []wireBundle             `json:"bundles"`
	Checksum          string                   `json:"checksum"`
}

type wireBundle struct {
	PlanID    contract.PlanID    `json:"planId"`
	VariantID contract.VariantID `json:"variantId"`
	Draft     json.RawMessage    `json:"draft,omitempty"`
	Revisions []json.RawMessage  `json:"revisions"`
}

// Build assembles a package from documents and computes its checksum. It
// validates every document, so an export cannot produce a package that its own
// importer would reject.
func Build[T any](provenance Provenance, bundles []Bundle[T]) (Package[T], error) {
	if err := provenance.validate(); err != nil {
		return Package[T]{}, err
	}
	if len(bundles) == 0 {
		return Package[T]{}, packagingError(ErrorEmptyPackage, "bundles", "a package must contain at least one plan")
	}
	wire, err := toWire(provenance, bundles)
	if err != nil {
		return Package[T]{}, err
	}
	checksum, err := checksumOf(wire)
	if err != nil {
		return Package[T]{}, err
	}
	wire.Checksum = checksum
	// Re-decoding the package we just built is the cheapest proof that export
	// and import agree. A package that cannot be read back is not shippable.
	encoded, err := json.Marshal(wire)
	if err != nil {
		return Package[T]{}, wrapPackagingError(ErrorInvalidPackage, "", "encode package", err)
	}
	return Decode[T](encoded)
}

// Encode renders a package for writing to a file the user chose.
func Encode[T any](pkg Package[T]) ([]byte, error) {
	wire, err := toWire(pkg.Provenance, pkg.Bundles)
	if err != nil {
		return nil, err
	}
	checksum, err := checksumOf(wire)
	if err != nil {
		return nil, err
	}
	if pkg.Checksum != "" && pkg.Checksum != checksum {
		return nil, packagingError(ErrorChecksumMismatch, "checksum", "package content no longer matches its checksum")
	}
	wire.Checksum = checksum
	encoded, err := json.MarshalIndent(wire, "", "  ")
	if err != nil {
		return nil, wrapPackagingError(ErrorInvalidPackage, "", "encode package", err)
	}
	return encoded, nil
}

// Decode reads and fully verifies a package. It rejects the wrong envelope
// version, the wrong contract version, a broken checksum, and any document
// that does not validate. Nothing partial is returned: either the whole
// package is trustworthy or it is an error.
func Decode[T any](document []byte) (Package[T], error) {
	if len(document) == 0 {
		return Package[T]{}, packagingError(ErrorInvalidPackage, "", "package is empty")
	}
	if len(document) > MaxPackageBytes {
		return Package[T]{}, packagingError(ErrorInvalidPackage, "", "package exceeds the strategy transfer size limit")
	}
	var wire wirePackage
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return Package[T]{}, wrapPackagingError(ErrorInvalidPackage, "", "decode package", err)
	}
	if decoder.More() {
		return Package[T]{}, packagingError(ErrorInvalidPackage, "", "package contains trailing data")
	}
	if wire.PackageVersion != PackageVersionV1 {
		return Package[T]{}, packagingError(ErrorUnsupportedPackageVersion, "packageVersion", "unsupported strategy package version")
	}
	if wire.ContractVersion != contract.CurrentVersion {
		return Package[T]{}, packagingError(ErrorUnsupportedContractVersion, "contractVersion", "unsupported strategy contract version")
	}
	if wire.ChecksumAlgorithm != contract.HashAlgorithmV1 {
		return Package[T]{}, packagingError(ErrorInvalidPackage, "checksumAlgorithm", "unsupported package checksum algorithm")
	}
	if err := wire.Provenance.validate(); err != nil {
		return Package[T]{}, err
	}
	// The checksum is verified before any document is interpreted, so a
	// tampered package is refused on evidence rather than on shape.
	declared := wire.Checksum
	if declared == "" {
		return Package[T]{}, packagingError(ErrorInvalidPackage, "checksum", "package has no checksum")
	}
	wire.Checksum = ""
	computed, err := checksumOf(wire)
	if err != nil {
		return Package[T]{}, err
	}
	if computed != declared {
		return Package[T]{}, packagingError(ErrorChecksumMismatch, "checksum", "package content does not match its checksum")
	}
	bundles, err := fromWire[T](wire.Bundles)
	if err != nil {
		return Package[T]{}, err
	}
	return Package[T]{Provenance: wire.Provenance, Bundles: bundles, Checksum: declared}, nil
}

func toWire[T any](provenance Provenance, bundles []Bundle[T]) (wirePackage, error) {
	wire := wirePackage{
		PackageVersion:    PackageVersionV1,
		ContractVersion:   contract.CurrentVersion,
		ChecksumAlgorithm: contract.HashAlgorithmV1,
		Provenance:        provenance,
		Bundles:           make([]wireBundle, 0, len(bundles)),
	}
	for _, bundle := range bundles {
		encoded, err := encodeBundle(bundle)
		if err != nil {
			return wirePackage{}, err
		}
		wire.Bundles = append(wire.Bundles, encoded)
	}
	sortWireBundles(wire.Bundles)
	return wire, nil
}

func encodeBundle[T any](bundle Bundle[T]) (wireBundle, error) {
	if bundle.Draft == nil && len(bundle.Revisions) == 0 {
		return wireBundle{}, packagingError(ErrorEmptyBundle, "bundles", "a plan with neither draft nor revisions carries nothing")
	}
	encoded := wireBundle{
		PlanID:    bundle.PlanID,
		VariantID: bundle.VariantID,
		Revisions: make([]json.RawMessage, 0, len(bundle.Revisions)),
	}
	if bundle.Draft != nil {
		if err := bundle.Draft.Validate(); err != nil {
			return wireBundle{}, err
		}
		if bundle.Draft.PlanID != bundle.PlanID || bundle.Draft.VariantID != bundle.VariantID {
			return wireBundle{}, packagingError(ErrorMisplacedDocument, "draft", "draft belongs to another plan variant")
		}
		raw, err := json.Marshal(bundle.Draft)
		if err != nil {
			return wireBundle{}, wrapPackagingError(ErrorInvalidPackage, "draft", "encode draft", err)
		}
		encoded.Draft = raw
	}
	for _, revision := range bundle.Revisions {
		metadata := revision.Metadata()
		if metadata.PlanID != bundle.PlanID || metadata.VariantID != bundle.VariantID {
			return wireBundle{}, packagingError(ErrorMisplacedDocument, "revisions", "revision belongs to another plan variant")
		}
		raw, err := json.Marshal(revision)
		if err != nil {
			return wireBundle{}, wrapPackagingError(ErrorInvalidPackage, "revisions", "encode revision", err)
		}
		encoded.Revisions = append(encoded.Revisions, raw)
	}
	sortRawRevisions(encoded.Revisions)
	return encoded, nil
}

func fromWire[T any](bundles []wireBundle) ([]Bundle[T], error) {
	if len(bundles) == 0 {
		return nil, packagingError(ErrorEmptyPackage, "bundles", "a package must contain at least one plan")
	}
	seen := make(map[bundleKey]struct{}, len(bundles))
	decoded := make([]Bundle[T], 0, len(bundles))
	for _, wire := range bundles {
		key := bundleKey{planID: wire.PlanID, variantID: wire.VariantID}
		if _, duplicate := seen[key]; duplicate {
			return nil, packagingError(ErrorDuplicateDocument, "bundles", "package lists the same plan variant twice")
		}
		seen[key] = struct{}{}
		bundle, err := decodeBundle[T](wire)
		if err != nil {
			return nil, err
		}
		decoded = append(decoded, bundle)
	}
	sortBundles(decoded)
	return decoded, nil
}

func decodeBundle[T any](wire wireBundle) (Bundle[T], error) {
	if len(wire.Draft) == 0 && len(wire.Revisions) == 0 {
		return Bundle[T]{}, packagingError(ErrorEmptyBundle, "bundles", "a plan with neither draft nor revisions carries nothing")
	}
	bundle := Bundle[T]{PlanID: wire.PlanID, VariantID: wire.VariantID}
	if len(wire.Draft) > 0 {
		var draft contract.PlanDraft[T]
		decoder := json.NewDecoder(bytes.NewReader(wire.Draft))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&draft); err != nil {
			return Bundle[T]{}, wrapPackagingError(ErrorInvalidPackage, "draft", "decode draft", err)
		}
		if err := draft.Validate(); err != nil {
			return Bundle[T]{}, err
		}
		if draft.PlanID != wire.PlanID || draft.VariantID != wire.VariantID {
			return Bundle[T]{}, packagingError(ErrorMisplacedDocument, "draft", "draft belongs to another plan variant")
		}
		bundle.Draft = &draft
	}
	revisionIDs := make(map[contract.RevisionID]struct{}, len(wire.Revisions))
	for _, raw := range wire.Revisions {
		// DecodePlanRevision re-derives the content hash and refuses a
		// mismatch, so a revision whose body was edited cannot be imported
		// even if the package checksum was recomputed to cover the edit.
		revision, err := contract.DecodePlanRevision[T](raw)
		if err != nil {
			return Bundle[T]{}, err
		}
		metadata := revision.Metadata()
		if metadata.PlanID != wire.PlanID || metadata.VariantID != wire.VariantID {
			return Bundle[T]{}, packagingError(ErrorMisplacedDocument, "revisions", "revision belongs to another plan variant")
		}
		if _, duplicate := revisionIDs[metadata.RevisionID]; duplicate {
			return Bundle[T]{}, packagingError(ErrorDuplicateDocument, "revisions", "package lists the same revision twice")
		}
		revisionIDs[metadata.RevisionID] = struct{}{}
		bundle.Revisions = append(bundle.Revisions, revision)
	}
	sortRevisions(bundle.Revisions)
	return bundle, nil
}

// checksumOf hashes the package through the shared canonical form, so the
// value does not depend on key order, JSON escaping or number formatting. The
// checksum field must be empty when this is called.
func checksumOf(wire wirePackage) (string, error) {
	wire.Checksum = ""
	encoded, err := json.Marshal(wire)
	if err != nil {
		return "", wrapPackagingError(ErrorInvalidPackage, "", "encode package for checksum", err)
	}
	_, digest, err := contract.CanonicalizeAndHashJSONV1(encoded)
	if err != nil {
		return "", err
	}
	return digest, nil
}

func marshalDraft[T any](draft contract.PlanDraft[T]) ([]byte, error) {
	return json.Marshal(draft)
}

type bundleKey struct {
	planID    contract.PlanID
	variantID contract.VariantID
}
