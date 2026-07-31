package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestValidateDiagnosticCaptureOptionsRejectsUnsafeRequestsWithoutCreatingFiles(t *testing.T) {
	tests := []struct {
		name string
		once bool
		mock bool
		shm  func(string) string
		rest func(string) string
	}{
		{
			name: "once is required",
			shm:  func(directory string) string { return filepath.Join(directory, "shared.bin") },
		},
		{
			name: "mock is rejected",
			once: true,
			mock: true,
			shm:  func(directory string) string { return filepath.Join(directory, "shared.bin") },
		},
		{
			name: "REST-only is rejected",
			once: true,
			rest: func(directory string) string { return filepath.Join(directory, "rest.json") },
		},
		{
			name: "equal destinations are rejected",
			once: true,
			shm:  func(directory string) string { return filepath.Join(directory, "same.capture") },
			rest: func(directory string) string { return filepath.Join(directory, ".", "same.capture") },
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			directory := t.TempDir()
			var sharedPath, restPath string
			if test.shm != nil {
				sharedPath = test.shm(directory)
			}
			if test.rest != nil {
				restPath = test.rest(directory)
			}
			if err := validateDiagnosticCaptureOptions(test.once, test.mock, sharedPath, restPath); err == nil {
				t.Fatal("unsafe diagnostic capture request was accepted")
			}
			entries, err := os.ReadDir(directory)
			if err != nil {
				t.Fatal(err)
			}
			if len(entries) != 0 {
				t.Fatalf("validation created %d files", len(entries))
			}
		})
	}
}

func TestValidateDiagnosticCaptureOptionsNeverOverwritesExistingDestination(t *testing.T) {
	for _, existingTarget := range []string{"shared.bin", "rest.json"} {
		t.Run(existingTarget, func(t *testing.T) {
			directory := t.TempDir()
			sharedPath := filepath.Join(directory, "shared.bin")
			restPath := filepath.Join(directory, "rest.json")
			existingPath := filepath.Join(directory, existingTarget)
			const original = "existing evidence"
			if err := os.WriteFile(existingPath, []byte(original), 0o600); err != nil {
				t.Fatal(err)
			}

			if err := validateDiagnosticCaptureOptions(true, false, sharedPath, restPath); err == nil {
				t.Fatal("existing diagnostic destination was accepted")
			}
			contents, err := os.ReadFile(existingPath)
			if err != nil {
				t.Fatal(err)
			}
			if string(contents) != original {
				t.Fatal("validation modified the existing destination")
			}
			entries, err := os.ReadDir(directory)
			if err != nil {
				t.Fatal(err)
			}
			if len(entries) != 1 {
				t.Fatalf("validation created extra files: %d entries", len(entries))
			}
		})
	}
}

func TestValidateDiagnosticCaptureOptionsAcceptsFreshSharedMemoryDestination(t *testing.T) {
	directory := t.TempDir()
	sharedPath := filepath.Join(directory, "shared.bin")
	if err := validateDiagnosticCaptureOptions(true, false, sharedPath, ""); err != nil {
		t.Fatalf("valid diagnostic capture rejected: %v", err)
	}
	if _, err := os.Stat(sharedPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("validation created destination: %v", err)
	}
}

func TestRunDiagnosticProbeRejectsUnsafeOptionsWithoutCreatingFiles(t *testing.T) {
	tests := []struct {
		name string
		once bool
		mock bool
		shm  bool
		rest bool
	}{
		{name: "once required"},
		{name: "mock rejected", once: true, mock: true},
		{name: "Shared Memory target rejected", once: true, shm: true},
		{name: "REST target rejected", once: true, rest: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			directory := t.TempDir()
			var sharedPath, restPath string
			if test.shm {
				sharedPath = filepath.Join(directory, "shared.bin")
			}
			if test.rest {
				restPath = filepath.Join(directory, "rest.json")
			}
			if err := runDiagnosticProbe(test.once, test.mock, sharedPath, restPath); err == nil {
				t.Fatal("unsafe diagnostic probe request was accepted")
			}
			entries, err := os.ReadDir(directory)
			if err != nil {
				t.Fatal(err)
			}
			if len(entries) != 0 {
				t.Fatalf("probe guard created %d files", len(entries))
			}
		})
	}
}
