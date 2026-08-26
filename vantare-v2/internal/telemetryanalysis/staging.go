package telemetryanalysis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const stagedFilename = "session.duckdb"

var ErrStagingRejected = errors.New("historical telemetry staging rejected")

type StagedHistoricalArtifact struct {
	path      string
	directory string
	evidence  HistoricalArtifactEvidence
}

func (artifact StagedHistoricalArtifact) Path() string { return artifact.path }

func (artifact StagedHistoricalArtifact) Directory() string { return artifact.directory }

func (artifact StagedHistoricalArtifact) Evidence() HistoricalArtifactEvidence {
	return artifact.evidence
}

func (artifact *StagedHistoricalArtifact) Cleanup() error {
	if artifact == nil || artifact.directory == "" {
		return nil
	}
	if err := os.RemoveAll(artifact.directory); err != nil {
		return err
	}
	artifact.path = ""
	artifact.directory = ""
	artifact.evidence = HistoricalArtifactEvidence{}
	return nil
}

func StageAuthorizedHistoricalArtifact(
	ctx context.Context,
	source ContentSource,
	candidate Candidate,
	artifact AuthorizedHistoricalArtifact,
	stagingRoot string,
) (StagedHistoricalArtifact, error) {
	if err := ctx.Err(); err != nil {
		return StagedHistoricalArtifact{}, err
	}
	if source == nil || !filepath.IsAbs(stagingRoot) || !validStagingAuthority(candidate, artifact) {
		return StagedHistoricalArtifact{}, stagingRejected("invalid staging authority")
	}
	if present, err := walPresent(ctx, source, candidate.walPath); err != nil || present {
		return StagedHistoricalArtifact{}, stagingRejected("source WAL present before staging")
	}
	beforePath, err := source.Metadata(ctx, candidate.sourcePath)
	if err != nil || !historicalArtifactEvidenceMatches(artifact.evidence, HistoricalArtifactEvidence{ContentSHA256: artifact.evidence.ContentSHA256, Metadata: beforePath}) {
		return StagedHistoricalArtifact{}, stagingRejected("source metadata changed before staging")
	}
	handle, err := source.OpenRead(ctx, candidate.sourcePath)
	if err != nil {
		return StagedHistoricalArtifact{}, stagingRejected("source could not be opened for staging")
	}
	defer handle.Close()
	openedBefore, err := handle.Metadata()
	if err != nil || !sameMetadata(beforePath, openedBefore) {
		return StagedHistoricalArtifact{}, stagingRejected("opened source metadata changed before staging")
	}
	if err := os.MkdirAll(stagingRoot, 0o700); err != nil {
		return StagedHistoricalArtifact{}, stagingRejected("staging root could not be created")
	}
	if err := securePrivateDirectory(stagingRoot); err != nil {
		return StagedHistoricalArtifact{}, stagingRejected("staging root could not be secured")
	}
	directory, err := os.MkdirTemp(stagingRoot, "vantare-telemetry-")
	if err != nil {
		return StagedHistoricalArtifact{}, stagingRejected("private staging directory could not be created")
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(directory)
		}
	}()
	if err := securePrivateDirectory(directory); err != nil {
		return StagedHistoricalArtifact{}, stagingRejected("private staging directory could not be secured")
	}
	destinationPath := filepath.Join(directory, stagedFilename)
	destination, err := os.OpenFile(destinationPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return StagedHistoricalArtifact{}, stagingRejected("staged copy could not be created")
	}
	hash := sha256.New()
	written, copyErr := copyWithContext(ctx, io.MultiWriter(destination, hash), handle, artifact.evidence.Metadata.Size)
	closeErr := destination.Close()
	if copyErr != nil {
		return StagedHistoricalArtifact{}, copyErr
	}
	if closeErr != nil || written != artifact.evidence.Metadata.Size || hex.EncodeToString(hash.Sum(nil)) != artifact.evidence.ContentSHA256 {
		return StagedHistoricalArtifact{}, stagingRejected("staged content did not match authorized evidence")
	}
	openedAfter, err := handle.Metadata()
	if err != nil || !sameMetadata(openedBefore, openedAfter) {
		return StagedHistoricalArtifact{}, stagingRejected("opened source metadata changed during staging")
	}
	afterPath, err := source.Metadata(ctx, candidate.sourcePath)
	if err != nil || !sameMetadata(beforePath, afterPath) {
		return StagedHistoricalArtifact{}, stagingRejected("source metadata changed during staging")
	}
	if present, err := walPresent(ctx, source, candidate.walPath); err != nil || present {
		return StagedHistoricalArtifact{}, stagingRejected("source WAL appeared during staging")
	}
	destinationInfo, err := os.Lstat(destinationPath)
	if err != nil || !destinationInfo.Mode().IsRegular() || destinationInfo.Mode()&os.ModeSymlink != 0 || destinationInfo.Size() != written {
		return StagedHistoricalArtifact{}, stagingRejected("staged copy metadata was invalid")
	}
	cleanup = false
	return StagedHistoricalArtifact{
		path:      destinationPath,
		directory: directory,
		evidence:  HistoricalArtifactEvidence{ContentSHA256: artifact.evidence.ContentSHA256, Metadata: contentMetadata(destinationInfo)},
	}, nil
}

func stagingRejected(reason string) error {
	return fmt.Errorf("%s: %w", reason, ErrStagingRejected)
}

func validStagingAuthority(candidate Candidate, artifact AuthorizedHistoricalArtifact) bool {
	return candidate.Kind == SourceLMU && candidate.Format == LMUDuckDBParserID &&
		candidate.State == StateReady && candidate.stabilityGate && !candidate.WALPresent &&
		artifact.manifest.Source.Kind == SourceLMU && artifact.manifest.Source.Format == LMUDuckDBParserID &&
		artifact.manifest.Parser == (ParserRef{ID: LMUDuckDBParserID, Version: LMUDuckDBParserVersion}) &&
		validAuthorizedHistoricalArtifact(artifact) && metadataMatchesCandidate(artifact.evidence.Metadata, candidate)
}

func copyWithContext(ctx context.Context, destination io.Writer, source io.Reader, maxBytes int64) (int64, error) {
	buffer := make([]byte, 32*1024)
	var total int64
	for {
		if err := ctx.Err(); err != nil {
			return total, err
		}
		read, readErr := source.Read(buffer)
		if read > 0 {
			total += int64(read)
			if total > maxBytes {
				return total, stagingRejected("source exceeded authorized size during staging")
			}
			if _, err := destination.Write(buffer[:read]); err != nil {
				return total, stagingRejected("staged copy could not be written")
			}
		}
		if readErr == io.EOF {
			return total, nil
		}
		if readErr != nil {
			return total, stagingRejected("source could not be read during staging")
		}
	}
}
