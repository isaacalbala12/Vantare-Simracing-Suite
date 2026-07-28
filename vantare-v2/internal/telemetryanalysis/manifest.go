package telemetryanalysis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"regexp"
	"strconv"
	"strings"
)

var safeToken = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)
var redactedLocatorID = regexp.MustCompile(`^[0-9a-f]{16}$`)
var sha256Hex = regexp.MustCompile(`^[0-9a-f]{64}$`)

// ReadHandle exposes metadata for the already-opened file. This lets the
// importer prove that the handle it reads is the same regular file that passed
// the path checks.
type ReadHandle interface {
	io.ReadCloser
	Metadata() (ContentMetadata, error)
}

type ContentSource interface {
	Metadata(context.Context, string) (ContentMetadata, error)
	Exists(context.Context, string) (bool, error)
	OpenRead(context.Context, string) (ReadHandle, error)
}

type OSContentSource struct{}

func (OSContentSource) Metadata(ctx context.Context, sourcePath string) (ContentMetadata, error) {
	if err := ctx.Err(); err != nil {
		return ContentMetadata{}, err
	}
	info, err := os.Lstat(sourcePath)
	if err != nil {
		return ContentMetadata{}, sanitizedError("read_source_metadata")
	}
	return contentMetadata(info), nil
}

func (OSContentSource) Exists(ctx context.Context, sourcePath string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	_, err := os.Lstat(sourcePath)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, sanitizedError("read_source_metadata")
}

func (OSContentSource) OpenRead(ctx context.Context, sourcePath string) (ReadHandle, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	file, err := os.Open(sourcePath)
	if err != nil {
		return nil, sanitizedError("open_source")
	}
	return osReadHandle{File: file}, nil
}

type osReadHandle struct {
	*os.File
}

func (h osReadHandle) Metadata() (ContentMetadata, error) {
	info, err := h.Stat()
	if err != nil {
		return ContentMetadata{}, sanitizedError("read_source_metadata")
	}
	return contentMetadata(info), nil
}

func contentMetadata(info os.FileInfo) ContentMetadata {
	return ContentMetadata{
		Size:      info.Size(),
		ModTime:   info.ModTime().UTC(),
		IsRegular: info.Mode().IsRegular(),
		IsSymlink: info.Mode()&os.ModeSymlink != 0,
		fileInfo:  info,
	}
}

func BuildManifest(ctx context.Context, source ContentSource, candidate Candidate, options ImportOptions) (Manifest, error) {
	if err := ctx.Err(); err != nil {
		return Manifest{}, err
	}
	if candidate.State != StateReady || !candidate.stabilityGate || candidate.WALPresent {
		return Manifest{}, ErrNotReady
	}
	if !validImportContract(candidate, options) {
		return Manifest{}, ErrInvalidOptions
	}
	if options.MaxBytes <= 0 || candidate.Size > options.MaxBytes {
		return Manifest{}, ErrByteLimit
	}
	if present, err := walPresent(ctx, source, candidate.walPath); err != nil {
		return Manifest{}, err
	} else if present {
		return Manifest{}, ErrNotReady
	}

	beforePath, err := source.Metadata(ctx, candidate.sourcePath)
	if err != nil {
		return Manifest{}, err
	}
	if !metadataMatchesCandidate(beforePath, candidate) || !hasIdentity(beforePath) {
		return Manifest{}, ErrSourceChanged
	}

	reader, err := source.OpenRead(ctx, candidate.sourcePath)
	if err != nil {
		return Manifest{}, err
	}
	defer reader.Close()

	openedBefore, err := reader.Metadata()
	if err != nil {
		return Manifest{}, err
	}
	if !metadataMatchesCandidate(openedBefore, candidate) || !sameIdentity(beforePath, openedBefore) {
		return Manifest{}, ErrSourceChanged
	}

	hash := sha256.New()
	buffer := make([]byte, 32*1024)
	var size int64
	for {
		if err := ctx.Err(); err != nil {
			return Manifest{}, err
		}
		read, readErr := reader.Read(buffer)
		if read > 0 {
			size += int64(read)
			if size > options.MaxBytes {
				return Manifest{}, ErrByteLimit
			}
			if _, err := hash.Write(buffer[:read]); err != nil {
				return Manifest{}, err
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return Manifest{}, sanitizedError("read_source")
		}
	}
	if candidate.Size != size {
		return Manifest{}, ErrSourceChanged
	}

	openedAfter, err := reader.Metadata()
	if err != nil {
		return Manifest{}, err
	}
	if !sameMetadata(openedBefore, openedAfter) {
		return Manifest{}, ErrSourceChanged
	}
	afterPath, err := source.Metadata(ctx, candidate.sourcePath)
	if err != nil {
		return Manifest{}, err
	}
	if !metadataMatchesCandidate(afterPath, candidate) ||
		!sameMetadata(beforePath, afterPath) ||
		!sameIdentity(afterPath, openedAfter) {
		return Manifest{}, ErrSourceChanged
	}
	if present, err := walPresent(ctx, source, candidate.walPath); err != nil {
		return Manifest{}, err
	} else if present {
		return Manifest{}, ErrNotReady
	}

	contentHash := hex.EncodeToString(hash.Sum(nil))
	manifest := Manifest{
		Version:       ManifestVersion,
		DedupeKey:     dedupeKey(contentHash, size),
		ContentSHA256: contentHash,
		Size:          size,
		Source: ManifestSource{
			Kind: candidate.Kind, Format: candidate.Format,
			Locator: candidate.Locator, Storage: options.Storage,
		},
		Parser:     ParserRef{ID: options.ParserID, Version: options.ParserVersion},
		Provenance: options.Provenance,
	}
	if err := ValidateManifest(manifest); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func walPresent(ctx context.Context, source ContentSource, walPath string) (bool, error) {
	if walPath == "" {
		return false, nil
	}
	present, err := source.Exists(ctx, walPath)
	if err != nil {
		return false, err
	}
	return present, nil
}

func validImportContract(candidate Candidate, options ImportOptions) bool {
	return options.Access == AccessUserApproved &&
		validStorage(options.Storage) &&
		validSource(candidate.Kind, candidate.Format, candidate.Locator) &&
		validParser(options.ParserID, options.ParserVersion) &&
		validProvenance(options.Provenance)
}

// ValidateManifest applies the same production policy to generated manifests,
// checked-in fixtures and future managed copies.
func ValidateManifest(manifest Manifest) error {
	if manifest.Version != ManifestVersion ||
		manifest.Size < 0 ||
		!sha256Hex.MatchString(manifest.DedupeKey) ||
		!sha256Hex.MatchString(manifest.ContentSHA256) ||
		manifest.DedupeKey != dedupeKey(manifest.ContentSHA256, manifest.Size) ||
		!validSource(manifest.Source.Kind, manifest.Source.Format, manifest.Source.Locator) ||
		!validStorage(manifest.Source.Storage) ||
		!validParser(manifest.Parser.ID, manifest.Parser.Version) ||
		!validProvenance(manifest.Provenance) {
		return ErrInvalidManifest
	}
	return nil
}

func dedupeKey(contentHash string, size int64) string {
	input := contentHash + ":" + strconv.FormatInt(size, 10)
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:])
}

func validSource(kind SourceKind, format, locator string) bool {
	if !validSourceKind(kind) || !safeToken.MatchString(format) {
		return false
	}
	prefix := string(kind) + "://"
	return strings.HasPrefix(locator, prefix) &&
		redactedLocatorID.MatchString(strings.TrimPrefix(locator, prefix))
}

func validStorage(storage StorageMode) bool {
	return storage == StorageReference || storage == StorageManagedCopy
}

func validParser(id, version string) bool {
	return safeToken.MatchString(id) && safeToken.MatchString(version)
}

func validProvenance(provenance Provenance) bool {
	return validProvenanceKind(provenance.Kind) && safeToken.MatchString(provenance.EvidenceID)
}

func validSourceKind(kind SourceKind) bool {
	return kind == SourceLMU || kind == SourceVantare || kind == SourceExternal
}

func validProvenanceKind(kind ProvenanceKind) bool {
	return kind == ProvenanceSynthetic || kind == ProvenanceUser || kind == ProvenanceVantare
}

func metadataMatchesCandidate(metadata ContentMetadata, candidate Candidate) bool {
	return metadata.IsRegular &&
		!metadata.IsSymlink &&
		metadata.Size == candidate.Size &&
		metadata.ModTime.Equal(candidate.ModTime)
}

func hasIdentity(metadata ContentMetadata) bool {
	return metadata.fileInfo != nil || metadata.Identity != ""
}

func sameIdentity(first, second ContentMetadata) bool {
	if first.fileInfo != nil && second.fileInfo != nil {
		return os.SameFile(first.fileInfo, second.fileInfo)
	}
	return first.Identity != "" && first.Identity == second.Identity
}

func sameMetadata(first, second ContentMetadata) bool {
	return first.Size == second.Size &&
		first.ModTime.Equal(second.ModTime) &&
		first.IsRegular == second.IsRegular &&
		first.IsSymlink == second.IsSymlink &&
		sameIdentity(first, second)
}
