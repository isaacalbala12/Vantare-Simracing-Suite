// Package storage reports what Vantare keeps on this machine and lets the user
// reclaim the part of it that is disposable.
//
// The settings page tells the user their data stays local. This is what makes
// that checkable rather than a claim.
package storage

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// ErrUnknownLocation is returned for a key that is not one of the locations
// this service owns.
var ErrUnknownLocation = errors.New("storage: unknown location")

// ErrNotClearable is returned when asked to empty a location that must never
// be emptied.
var ErrNotClearable = errors.New("storage: location cannot be cleared")

// Location keys. The frontend sends a key, never a path: nothing outside these
// two directories is reachable through this service.
const (
	ConfigsKey   = "configs"
	TelemetryKey = "telemetry"
)

// Location is one directory Vantare owns.
type Location struct {
	Key   string `json:"key"`
	Path  string `json:"path"`
	Bytes int64  `json:"bytes"`
	Files int    `json:"files"`
	// Exists is false before anything has been written there. The UI shows the
	// path anyway, because "where will it go" is as useful as "what is there".
	Exists bool `json:"exists"`
	// Clearable is what the UI keys the button off, rather than deciding for
	// itself which directory is safe to empty.
	Clearable bool `json:"clearable"`
}

// Summary is everything Vantare keeps on disk.
type Summary struct {
	Locations  []Location `json:"locations"`
	TotalBytes int64      `json:"totalBytes"`
}

// Service answers for the directories it was handed at startup. It never
// derives a path from anything the frontend sends.
type Service struct {
	configsDir   string
	telemetryDir string
}

// New builds a service over the two directories the app resolved at startup.
func New(configsDir, telemetryDir string) *Service {
	return &Service{configsDir: configsDir, telemetryDir: telemetryDir}
}

func (s *Service) path(key string) (string, error) {
	switch key {
	case ConfigsKey:
		return s.configsDir, nil
	case TelemetryKey:
		return s.telemetryDir, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrUnknownLocation, key)
	}
}

// Summary measures both locations. A directory that cannot be read is reported
// as empty rather than failing the whole summary: one unreadable folder should
// not blank the page.
func (s *Service) Summary() Summary {
	summary := Summary{Locations: make([]Location, 0, 2)}
	for _, key := range []string{ConfigsKey, TelemetryKey} {
		path, err := s.path(key)
		if err != nil || path == "" {
			continue
		}
		location := Location{
			Key:  key,
			Path: path,
			// Configs hold the user's profiles and settings. Losing them is
			// not a cache miss, so this service refuses to empty that one.
			Clearable: key == TelemetryKey,
		}
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			location.Exists = true
			location.Bytes, location.Files = measure(path)
		}
		summary.TotalBytes += location.Bytes
		summary.Locations = append(summary.Locations, location)
	}
	return summary
}

// Clear empties a clearable location, leaving the directory itself in place so
// the app can keep writing to it.
func (s *Service) Clear(key string) (Summary, error) {
	path, err := s.path(key)
	if err != nil {
		return s.Summary(), err
	}
	if key != TelemetryKey {
		return s.Summary(), fmt.Errorf("%w: %q", ErrNotClearable, key)
	}
	if path == "" {
		return s.Summary(), fmt.Errorf("%w: %q", ErrUnknownLocation, key)
	}
	entries, err := os.ReadDir(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return s.Summary(), nil
		}
		return s.Summary(), fmt.Errorf("storage: read %s: %w", key, err)
	}
	for _, entry := range entries {
		if err := os.RemoveAll(filepath.Join(path, entry.Name())); err != nil {
			return s.Summary(), fmt.Errorf("storage: remove %s: %w", entry.Name(), err)
		}
	}
	return s.Summary(), nil
}

// Reveal opens a location in the system file manager.
func (s *Service) Reveal(key string) error {
	path, err := s.path(key)
	if err != nil {
		return err
	}
	if path == "" {
		return fmt.Errorf("%w: %q", ErrUnknownLocation, key)
	}
	if err := os.MkdirAll(path, 0o755); err != nil {
		return fmt.Errorf("storage: create %s: %w", key, err)
	}
	return reveal(path)
}

// measure walks a directory and adds up what is really on disk. Walk errors are
// skipped rather than aborting: a single locked file should not turn the size
// into an error message.
func measure(root string) (int64, int) {
	var total int64
	var files int
	_ = filepath.WalkDir(root, func(_ string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		total += info.Size()
		files++
		return nil
	})
	return total, files
}
