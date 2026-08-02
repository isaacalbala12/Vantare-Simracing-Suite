//go:build windows

package repository

import (
	"errors"
	"fmt"

	"golang.org/x/sys/windows"
)

type repositoryLease interface{ Close() error }

type windowsRepositoryLease struct{ handle windows.Handle }

func acquireRepositoryLease(path string) (repositoryLease, error) {
	encoded, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, fmt.Errorf("encode repository lease path: %w", err)
	}
	handle, err := windows.CreateFile(encoded, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil, windows.OPEN_ALWAYS, windows.FILE_ATTRIBUTE_HIDDEN, 0)
	if err != nil {
		if errors.Is(err, windows.ERROR_SHARING_VIOLATION) || errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
			return nil, ErrWriteInProgress
		}
		return nil, fmt.Errorf("acquire strategy repository lease: %w", err)
	}
	return &windowsRepositoryLease{handle: handle}, nil
}

func (lease *windowsRepositoryLease) Close() error {
	if lease.handle == 0 {
		return nil
	}
	err := windows.CloseHandle(lease.handle)
	lease.handle = 0
	if err != nil {
		return fmt.Errorf("release strategy repository lease: %w", err)
	}
	return nil
}
