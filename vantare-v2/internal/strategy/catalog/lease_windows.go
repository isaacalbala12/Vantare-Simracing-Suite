//go:build windows

package catalog

import (
	"errors"
	"fmt"

	"golang.org/x/sys/windows"
)

type cacheLease interface{ Close() error }

type windowsCacheLease struct{ handle windows.Handle }

func acquireCacheLease(path string) (cacheLease, error) {
	encoded, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, fmt.Errorf("encode catalog cache lease path: %w", err)
	}
	handle, err := windows.CreateFile(encoded, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil, windows.OPEN_ALWAYS, windows.FILE_ATTRIBUTE_HIDDEN, 0)
	if err != nil {
		if errors.Is(err, windows.ERROR_SHARING_VIOLATION) || errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
			return nil, errLeaseBusy
		}
		return nil, fmt.Errorf("acquire catalog cache lease: %w", err)
	}
	return &windowsCacheLease{handle: handle}, nil
}

func (lease *windowsCacheLease) Close() error {
	if lease.handle == 0 {
		return nil
	}
	err := windows.CloseHandle(lease.handle)
	lease.handle = 0
	if err != nil {
		return fmt.Errorf("release catalog cache lease: %w", err)
	}
	return nil
}
