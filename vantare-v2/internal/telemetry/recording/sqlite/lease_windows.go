//go:build windows

package sqlite

import (
	"errors"
	"fmt"

	"golang.org/x/sys/windows"
)

type windowsLease struct {
	handle windows.Handle
}

func acquireSessionLease(sessionDir string) (sessionLease, error) {
	path, err := windows.UTF16PtrFromString(leasePath(sessionDir))
	if err != nil {
		return nil, fmt.Errorf("encode recording lease path: %w", err)
	}
	handle, err := windows.CreateFile(
		path,
		windows.GENERIC_READ|windows.GENERIC_WRITE,
		0,
		nil,
		windows.OPEN_ALWAYS,
		windows.FILE_ATTRIBUTE_NORMAL,
		0,
	)
	if err != nil {
		if errors.Is(err, windows.ERROR_SHARING_VIOLATION) ||
			errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
			return nil, ErrSessionActive
		}
		return nil, fmt.Errorf("acquire recording lease: %w", err)
	}
	return &windowsLease{handle: handle}, nil
}

func (l *windowsLease) Close() error {
	if l.handle == 0 {
		return nil
	}
	err := windows.CloseHandle(l.handle)
	l.handle = 0
	if err != nil {
		return fmt.Errorf("release recording lease: %w", err)
	}
	return nil
}
