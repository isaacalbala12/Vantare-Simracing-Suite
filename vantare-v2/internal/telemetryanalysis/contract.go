// Package telemetryanalysis owns post-session telemetry product contracts.
// It deliberately does not depend on the live Telemetry Core.
package telemetryanalysis

import (
	"errors"
	"os"
	"time"
)

const ManifestVersion = 1

var (
	ErrByteLimit       = errors.New("telemetry analysis byte limit exceeded")
	ErrCandidateLimit  = errors.New("telemetry analysis candidate limit exceeded")
	ErrNotReady        = errors.New("telemetry source is not ready")
	ErrSourceChanged   = errors.New("telemetry source changed after stability gate")
	ErrInvalidOptions  = errors.New("invalid telemetry analysis import options")
	ErrInvalidWindow   = errors.New("invalid telemetry analysis stability window")
	ErrInvalidManifest = errors.New("invalid telemetry analysis manifest")
)

type State string

const (
	StateActive       State = "active"
	StateStabilizing  State = "stabilizing"
	StateReady        State = "ready"
	StateIncompatible State = "incompatible"
	StateMoved        State = "moved"
	StateMissing      State = "missing"
	StateError        State = "error"
)

type SourceKind string

const (
	SourceLMU      SourceKind = "lmu"
	SourceVantare  SourceKind = "vantare"
	SourceExternal SourceKind = "external"
)

type StorageMode string

const (
	StorageReference   StorageMode = "reference"
	StorageManagedCopy StorageMode = "managed_copy"
)

type ContentAccess string

const (
	AccessUserApproved ContentAccess = "user_approved"
)

type ProvenanceKind string

const (
	ProvenanceSynthetic ProvenanceKind = "synthetic"
	ProvenanceUser      ProvenanceKind = "user_supplied"
	ProvenanceVantare   ProvenanceKind = "vantare_recording"
)

type Provenance struct {
	Kind       ProvenanceKind `json:"kind"`
	EvidenceID string         `json:"evidence_id"`
}

type Candidate struct {
	Kind       SourceKind `json:"kind"`
	Format     string     `json:"format"`
	Locator    string     `json:"locator"`
	Size       int64      `json:"size"`
	ModTime    time.Time  `json:"modified_at"`
	WALPresent bool       `json:"wal_present"`
	State      State      `json:"state"`

	sourcePath    string
	walPath       string
	stabilityGate bool
}

type ContentMetadata struct {
	Size      int64
	ModTime   time.Time
	IsRegular bool
	IsSymlink bool
	Identity  string

	fileInfo os.FileInfo
}

type Manifest struct {
	Version       int            `json:"version"`
	DedupeKey     string         `json:"dedupe_key"`
	ContentSHA256 string         `json:"content_sha256"`
	Size          int64          `json:"size"`
	Source        ManifestSource `json:"source"`
	Parser        ParserRef      `json:"parser"`
	Provenance    Provenance     `json:"provenance"`
}

// HistoricalArtifactEvidence identifies the exact stable bytes authorized by
// the import gate without exposing their filesystem path.
type HistoricalArtifactEvidence struct {
	ContentSHA256 string
	Metadata      ContentMetadata
}

// AuthorizedHistoricalArtifact is issued only after BuildManifest has proven
// user approval, stability, file identity and content hash. Its private fields
// prevent a raw Manifest from being used as authority to read historical data.
type AuthorizedHistoricalArtifact struct {
	manifest Manifest
	evidence HistoricalArtifactEvidence
}

func (a AuthorizedHistoricalArtifact) Manifest() Manifest {
	return a.manifest
}

// Evidence returns pathless, immutable evidence for a concrete reader adapter.
// The source locator remains private to the import boundary.
func (a AuthorizedHistoricalArtifact) Evidence() HistoricalArtifactEvidence {
	return a.evidence
}

type ManifestSource struct {
	Kind    SourceKind  `json:"kind"`
	Format  string      `json:"format"`
	Locator string      `json:"locator"`
	Storage StorageMode `json:"storage"`
}

type ParserRef struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}

type ImportOptions struct {
	Storage       StorageMode
	Access        ContentAccess
	MaxBytes      int64
	ParserID      string
	ParserVersion string
	Provenance    Provenance
}
