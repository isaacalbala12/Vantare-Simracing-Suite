//go:build !windows

package catalog

import (
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/unix"
)

type cacheLease interface{ Close() error }

type unixCacheLease struct{ file *os.File }

func acquireCacheLease(path string) (cacheLease, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open catalog cache lease: %w", err)
	}
	if err := unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		_ = file.Close()
		if errors.Is(err, unix.EWOULDBLOCK) || errors.Is(err, unix.EAGAIN) {
			return nil, errLeaseBusy
		}
		return nil, fmt.Errorf("acquire catalog cache lease: %w", err)
	}
	return &unixCacheLease{file: file}, nil
}

func (lease *unixCacheLease) Close() error {
	if lease.file == nil {
		return nil
	}
	file := lease.file
	lease.file = nil
	unlockErr := unix.Flock(int(file.Fd()), unix.LOCK_UN)
	closeErr := file.Close()
	if unlockErr != nil {
		return fmt.Errorf("unlock catalog cache lease: %w", unlockErr)
	}
	if closeErr != nil {
		return fmt.Errorf("close catalog cache lease: %w", closeErr)
	}
	return nil
}
