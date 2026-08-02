package telemetryanalysis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
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
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	if present, err := walPresent(ctx, source, candidate.walPath); err != nil || present {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	beforePath, err := source.Metadata(ctx, candidate.sourcePath)
	if err != nil || !historicalArtifactEvidenceMatches(artifact.evidence, HistoricalArtifactEvidence{ContentSHA256: artifact.evidence.ContentSHA256, Metadata: beforePath}) {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	handle, err := source.OpenRead(ctx, candidate.sourcePath)
	if err != nil {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	defer handle.Close()
	openedBefore, err := handle.Metadata()
	if err != nil || !sameMetadata(beforePath, openedBefore) {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	directory, err := os.MkdirTemp(stagingRoot, "vantare-telemetry-")
	if err != nil {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(directory)
		}
	}()
	if err := securePrivateDirectory(directory); err != nil {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	destinationPath := filepath.Join(directory, stagedFilename)
	destination, err := os.OpenFile(destinationPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	hash := sha256.New()
	written, copyErr := copyWithContext(ctx, io.MultiWriter(destination, hash), handle, artifact.evidence.Metadata.Size)
	closeErr := destination.Close()
	if copyErr != nil {
		return StagedHistoricalArtifact{}, copyErr
	}
	if closeErr != nil || written != artifact.evidence.Metadata.Size || hex.EncodeToString(hash.Sum(nil)) != artifact.evidence.ContentSHA256 {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	openedAfter, err := handle.Metadata()
	if err != nil || !sameMetadata(openedBefore, openedAfter) {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	afterPath, err := source.Metadata(ctx, candidate.sourcePath)
	if err != nil || !sameMetadata(beforePath, afterPath) {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	if present, err := walPresent(ctx, source, candidate.walPath); err != nil || present {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	destinationInfo, err := os.Lstat(destinationPath)
	if err != nil || !destinationInfo.Mode().IsRegular() || destinationInfo.Mode()&os.ModeSymlink != 0 || destinationInfo.Size() != written {
		return StagedHistoricalArtifact{}, ErrStagingRejected
	}
	cleanup = false
	return StagedHistoricalArtifact{
		path:      destinationPath,
		directory: directory,
		evidence:  HistoricalArtifactEvidence{ContentSHA256: artifact.evidence.ContentSHA256, Metadata: contentMetadata(destinationInfo)},
	}, nil
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
				return total, ErrStagingRejected
			}
			if _, err := destination.Write(buffer[:read]); err != nil {
				return total, ErrStagingRejected
			}
		}
		if readErr == io.EOF {
			return total, nil
		}
		if readErr != nil {
			return total, ErrStagingRejected
		}
	}
}
