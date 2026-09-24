package telemetryanalysis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var ErrPersistentCopyRejected = errors.New("verified historical copy rejected")

// PersistVerifiedHistoricalCopy writes a separately retained copy into a folder
// chosen by the user. The private staged file is still owned by its caller and
// may be cleaned up immediately after this returns.
func PersistVerifiedHistoricalCopy(ctx context.Context, staged StagedHistoricalArtifact, destinationDirectory string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if staged.path == "" || staged.evidence.ContentSHA256 == "" || !filepath.IsAbs(destinationDirectory) {
		return "", ErrPersistentCopyRejected
	}
	relative, err := filepath.Rel(staged.directory, destinationDirectory)
	if err != nil || relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))) {
		return "", ErrPersistentCopyRejected
	}
	destinationInfo, err := os.Lstat(destinationDirectory)
	if err != nil || !destinationInfo.IsDir() || destinationInfo.Mode()&os.ModeSymlink != 0 {
		return "", ErrPersistentCopyRejected
	}
	stagedInfo, err := os.Lstat(staged.path)
	if err != nil || !stagedInfo.Mode().IsRegular() || stagedInfo.Mode()&os.ModeSymlink != 0 || stagedInfo.Size() != staged.evidence.Metadata.Size {
		return "", ErrPersistentCopyRejected
	}
	source, err := os.Open(staged.path)
	if err != nil {
		return "", ErrPersistentCopyRejected
	}
	defer source.Close()
	destination, err := os.CreateTemp(destinationDirectory, "vantare-*.duckdb")
	if err != nil {
		return "", ErrPersistentCopyRejected
	}
	path := destination.Name()
	completed := false
	defer func() {
		_ = destination.Close()
		if !completed {
			_ = os.Remove(path)
		}
	}()
	hash := sha256.New()
	written, err := copyWithContext(ctx, io.MultiWriter(destination, hash), source, staged.evidence.Metadata.Size)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return "", ctxErr
		}
		return "", ErrPersistentCopyRejected
	}
	if written != staged.evidence.Metadata.Size || hex.EncodeToString(hash.Sum(nil)) != staged.evidence.ContentSHA256 {
		return "", ErrPersistentCopyRejected
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if err := destination.Sync(); err != nil {
		return "", ErrPersistentCopyRejected
	}
	if err := destination.Close(); err != nil {
		return "", ErrPersistentCopyRejected
	}
	copyInfo, err := os.Lstat(path)
	if err != nil || !copyInfo.Mode().IsRegular() || copyInfo.Mode()&os.ModeSymlink != 0 || copyInfo.Size() != written {
		return "", ErrPersistentCopyRejected
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	completed = true
	return path, nil
}
