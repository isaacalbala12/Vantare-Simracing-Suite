//go:build windows

package telemetryanalysis

import (
	"errors"
	"fmt"

	"golang.org/x/sys/windows"
)

type correctionLease interface{ Close() error }

type windowsCorrectionLease struct{ handle windows.Handle }

func acquireCorrectionLease(path string) (correctionLease, error) {
	encoded, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, fmt.Errorf("encode repository lease path: %w", err)
	}
	handle, err := windows.CreateFile(encoded, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil, windows.OPEN_ALWAYS, windows.FILE_ATTRIBUTE_HIDDEN, 0)
	if err != nil {
		if errors.Is(err, windows.ERROR_SHARING_VIOLATION) || errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
			return nil, ErrCorrectionWriteInProgress
		}
		return nil, fmt.Errorf("acquire analysis correction lease: %w", err)
	}
	return &windowsCorrectionLease{handle: handle}, nil
}

func (lease *windowsCorrectionLease) Close() error {
	if lease.handle == 0 {
		return nil
	}
	err := windows.CloseHandle(lease.handle)
	lease.handle = 0
	if err != nil {
		return fmt.Errorf("release analysis correction lease: %w", err)
	}
	return nil
}
