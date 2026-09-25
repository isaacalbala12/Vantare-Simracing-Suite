package telemetryanalysis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

var ErrPersistentCopyRejected = errors.New("verified historical copy rejected")
var ErrPersistentCopyPermission = errors.New("verified historical copy destination permission denied")
var ErrPersistentCopyNoSpace = errors.New("verified historical copy destination has no space")
var ErrPersistentCopyCleanup = errors.New("incomplete verified historical copy could not be removed")

func persistentCopyIOError(err error) error {
	// Win32 returns ERROR_HANDLE_DISK_FULL (39) or ERROR_DISK_FULL (112),
	// rather than Go's application-defined syscall.ENOSPC value on Windows.
	switch {
	case errors.Is(err, os.ErrPermission):
		return errors.Join(ErrPersistentCopyRejected, ErrPersistentCopyPermission)
	case errors.Is(err, syscall.ENOSPC), runtime.GOOS == "windows" && (errors.Is(err, syscall.Errno(112)) || errors.Is(err, syscall.Errno(39))):
		return errors.Join(ErrPersistentCopyRejected, ErrPersistentCopyNoSpace)
	default:
		return ErrPersistentCopyRejected
	}
}

type persistentCopyWriter struct {
	io.Writer
	err error
}

func (writer *persistentCopyWriter) Write(data []byte) (int, error) {
	written, err := writer.Writer.Write(data)
	if err != nil {
		writer.err = err
	}
	return written, err
}

// PersistVerifiedHistoricalCopy writes a separately retained copy into a folder
// chosen by the user. The private staged file is still owned by its caller and
// may be cleaned up immediately after this returns.
func PersistVerifiedHistoricalCopy(ctx context.Context, staged StagedHistoricalArtifact, destinationDirectory string) (copyPath string, returnErr error) {
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
	if err != nil {
		return "", persistentCopyIOError(err)
	}
	if !destinationInfo.IsDir() || destinationInfo.Mode()&os.ModeSymlink != 0 {
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
	sourceOpen := true
	defer func() {
		if sourceOpen {
			if err := source.Close(); err != nil {
				returnErr = errors.Join(returnErr, ErrPersistentCopyRejected)
			}
		}
	}()
	destination, err := os.CreateTemp(destinationDirectory, "vantare-*.duckdb")
	if err != nil {
		return "", persistentCopyIOError(err)
	}
	path := destination.Name()
	completed := false
	destinationOpen := true
	defer func() {
		if destinationOpen {
			if err := destination.Close(); err != nil {
				returnErr = errors.Join(returnErr, persistentCopyIOError(err))
			}
		}
		if !completed {
			if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
				returnErr = errors.Join(returnErr, ErrPersistentCopyCleanup, persistentCopyIOError(err))
			}
		}
	}()
	hash := sha256.New()
	writer := &persistentCopyWriter{Writer: io.MultiWriter(destination, hash)}
	written, err := copyWithContext(ctx, writer, source, staged.evidence.Metadata.Size)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return "", ctxErr
		}
		return "", persistentCopyIOError(writer.err)
	}
	if written != staged.evidence.Metadata.Size || hex.EncodeToString(hash.Sum(nil)) != staged.evidence.ContentSHA256 {
		return "", ErrPersistentCopyRejected
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if err := destination.Sync(); err != nil {
		return "", persistentCopyIOError(err)
	}
	closeErr := destination.Close()
	destinationOpen = false
	if closeErr != nil {
		return "", persistentCopyIOError(closeErr)
	}
	copyInfo, err := os.Lstat(path)
	if err != nil {
		return "", persistentCopyIOError(err)
	}
	if !copyInfo.Mode().IsRegular() || copyInfo.Mode()&os.ModeSymlink != 0 || copyInfo.Size() != written {
		return "", ErrPersistentCopyRejected
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	closeErr = source.Close()
	sourceOpen = false
	if closeErr != nil {
		return "", ErrPersistentCopyRejected
	}
	completed = true
	return path, nil
}
