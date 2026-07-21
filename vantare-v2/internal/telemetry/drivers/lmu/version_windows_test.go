//go:build windows

package lmu

import (
	"errors"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"unicode/utf16"
)

func TestWindowsBuildProviderClosesHandlesAndKeepsPathPrivate(t *testing.T) {
	const privatePath = `C:\Users\private\Le Mans Ultimate.exe`
	var closes atomic.Int32
	api := buildWindowsAPI{
		snapshot: func() (uintptr, error) { return 10, nil },
		first: func(_ uintptr, entry *processEntry32) (bool, error) {
			setProcessName(entry, "Le Mans Ultimate.exe")
			entry.ProcessID = 42
			return true, nil
		},
		next:        func(uintptr, *processEntry32) (bool, error) { return false, nil },
		openProcess: func(uint32) (uintptr, error) { return 20, nil },
		queryPath:   func(uintptr) (string, error) { return privatePath, nil },
		versionInfo: func(path string) (BuildEvidence, error) {
			if path != privatePath {
				t.Fatalf("path = %q", path)
			}
			return BuildEvidence{FileVersion: supportedLMUVersion}, nil
		},
		close: func(uintptr) (uintptr, error) { closes.Add(1); return 1, syscall.Errno(0) },
	}
	evidence, err := findLMUBuildEvidence(api)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.FileVersion != supportedLMUVersion || closes.Load() != 2 {
		t.Fatalf("evidence=%#v closes=%d", evidence, closes.Load())
	}
}

func TestWindowsBuildProviderErrorsCloseHandlesWithoutPathLeak(t *testing.T) {
	const privatePath = `C:\Users\private\secret\Le Mans Ultimate.exe`
	closeFailure := errors.New("close process failed")
	var closes atomic.Int32
	api := buildWindowsAPI{
		snapshot: func() (uintptr, error) { return 10, nil },
		first: func(_ uintptr, entry *processEntry32) (bool, error) {
			setProcessName(entry, "Le Mans Ultimate.exe")
			return true, nil
		},
		next:        func(uintptr, *processEntry32) (bool, error) { return false, nil },
		openProcess: func(uint32) (uintptr, error) { return 20, nil },
		queryPath:   func(uintptr) (string, error) { return privatePath, nil },
		versionInfo: func(string) (BuildEvidence, error) { return BuildEvidence{}, errors.New("version lookup failed") },
		close: func(handle uintptr) (uintptr, error) {
			closes.Add(1)
			if handle == 20 {
				return 0, closeFailure
			}
			return 1, nil
		},
	}
	_, err := findLMUBuildEvidence(api)
	if !errors.Is(err, closeFailure) || closes.Load() != 2 {
		t.Fatalf("error=%v closes=%d", err, closes.Load())
	}
	if strings.Contains(err.Error(), privatePath) || strings.Contains(err.Error(), "Users\\private") {
		t.Fatalf("path leaked: %v", err)
	}
}

func TestWindowsBuildProviderAbsentStillClosesSnapshot(t *testing.T) {
	var closes atomic.Int32
	api := buildWindowsAPI{
		snapshot: func() (uintptr, error) { return 10, nil },
		first:    func(uintptr, *processEntry32) (bool, error) { return false, nil },
		close:    func(uintptr) (uintptr, error) { closes.Add(1); return 1, nil },
	}
	_, err := findLMUBuildEvidence(api)
	if !errors.Is(err, ErrBuildUnavailable) || closes.Load() != 1 {
		t.Fatalf("error=%v closes=%d", err, closes.Load())
	}
}

func TestFormatFixedVersion(t *testing.T) {
	if got := formatFixedVersion(1<<16|3, 0); got != supportedLMUVersion {
		t.Fatalf("version = %q", got)
	}
}

func setProcessName(entry *processEntry32, name string) {
	encoded := append(utf16.Encode([]rune(name)), 0)
	copy(entry.ExeFile[:], encoded)
}
