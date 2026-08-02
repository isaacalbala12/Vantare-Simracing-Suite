//go:build !windows

package sqlite

import (
	"errors"
	"fmt"
	"os"
)

// Non-Windows builds use an exclusive-create fail-safe lease. A process crash
// leaves a stale file and therefore blocks recording/recovery rather than
// allowing concurrent writers. Supported product builds are Windows, where
// the kernel-held handle is released automatically on process exit.
type exclusiveFileLease struct {
	file *os.File
	path string
}

func acquireSessionLease(sessionDir string) (sessionLease, error) {
	path := leasePath(sessionDir)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0o600)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			return nil, ErrSessionActive
		}
		return nil, fmt.Errorf("acquire recording lease: %w", err)
	}
	return &exclusiveFileLease{file: file, path: path}, nil
}

func (l *exclusiveFileLease) Close() error {
	closeErr := l.file.Close()
	removeErr := os.Remove(l.path)
	if closeErr != nil {
		return fmt.Errorf("release recording lease: %w", closeErr)
	}
	if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		return fmt.Errorf("remove recording lease: %w", removeErr)
	}
	return nil
}
