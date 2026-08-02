//go:build !windows

package repository

import (
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/unix"
)

type repositoryLease interface{ Close() error }

type unixRepositoryLease struct{ file *os.File }

func acquireRepositoryLease(path string) (repositoryLease, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open strategy repository lease: %w", err)
	}
	if err := unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		_ = file.Close()
		if errors.Is(err, unix.EWOULDBLOCK) || errors.Is(err, unix.EAGAIN) {
			return nil, ErrWriteInProgress
		}
		return nil, fmt.Errorf("acquire strategy repository lease: %w", err)
	}
	return &unixRepositoryLease{file: file}, nil
}

func (lease *unixRepositoryLease) Close() error {
	unlockErr := unix.Flock(int(lease.file.Fd()), unix.LOCK_UN)
	closeErr := lease.file.Close()
	if unlockErr != nil {
		return fmt.Errorf("unlock strategy repository lease: %w", unlockErr)
	}
	if closeErr != nil {
		return fmt.Errorf("close strategy repository lease: %w", closeErr)
	}
	return nil
}
