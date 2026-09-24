//go:build windows

package launcher

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// FindRunningByExecutable returns only live processes whose observed full
// executable path matches the requested path. Names from Toolhelp are used
// only to avoid opening unrelated processes, never as proof of identity.
func FindRunningByExecutable(ctx context.Context, executable string) ([]ProcessInfo, error) {
	if executable == "" {
		return nil, fmt.Errorf("launcher: executable path required for process discovery")
	}
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, fmt.Errorf("launcher: enumerate processes: %w", err)
	}
	defer windows.CloseHandle(snapshot)
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	if err := windows.Process32First(snapshot, &entry); err != nil {
		return nil, fmt.Errorf("launcher: first process: %w", err)
	}
	wantedName := filepath.Base(executable)
	var matches []ProcessInfo
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if strings.EqualFold(windows.UTF16ToString(entry.ExeFile[:]), wantedName) {
			handle, info, inspectErr := processInfo(int(entry.ProcessID))
			if inspectErr == nil {
				windows.CloseHandle(handle)
				if ProcessIsReady(ProcessIdentity{ExecutablePath: executable}, info) && info.CreationTime != 0 {
					matches = append(matches, info)
				}
			} else if errors.Is(inspectErr, windows.ERROR_ACCESS_DENIED) {
				return nil, fmt.Errorf("launcher: cannot inspect running %s: %w", wantedName, inspectErr)
			}
		}
		err = windows.Process32Next(snapshot, &entry)
		if errors.Is(err, windows.ERROR_NO_MORE_FILES) {
			return matches, nil
		}
		if err != nil {
			return nil, fmt.Errorf("launcher: next process: %w", err)
		}
	}
}
