//go:build !windows

package telemetryanalysis

import (
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/unix"
)

type correctionLease interface{ Close() error }

type unixCorrectionLease struct{ file *os.File }

func acquireCorrectionLease(path string) (correctionLease, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open analysis correction lease: %w", err)
	}
	if err := unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		closeErr := file.Close()
		if errors.Is(err, unix.EWOULDBLOCK) || errors.Is(err, unix.EAGAIN) {
			return nil, errors.Join(ErrCorrectionWriteInProgress, closeErr)
		}
		return nil, fmt.Errorf("acquire analysis correction lease: %w", errors.Join(err, closeErr))
	}
	return &unixCorrectionLease{file: file}, nil
}

func (lease *unixCorrectionLease) Close() error {
	unlockErr := unix.Flock(int(lease.file.Fd()), unix.LOCK_UN)
	closeErr := lease.file.Close()
	if unlockErr != nil {
		return fmt.Errorf("unlock analysis correction lease: %w", unlockErr)
	}
	if closeErr != nil {
		return fmt.Errorf("close analysis correction lease: %w", closeErr)
	}
	return nil
}
