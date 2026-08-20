package applog

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// DefaultMaxBytes is the size one log file may reach before it is rotated.
const DefaultMaxBytes int64 = 5 << 20 // 5 MiB

// DefaultMaxBackups is how many rotated files are kept beside the live one, so
// the log costs a bounded amount of disk no matter how long the app runs.
const DefaultMaxBackups = 2

// FileName is the live log file inside the logs directory.
const FileName = "vantare.log"

// rotatingFile is a size-capped append-only file.
//
// This is a few dozen lines instead of a dependency because that is all the
// behaviour Diagnostics needs: no compression, no time-based rotation, no
// external log shipper. Adding a rotation library to go.mod would buy features
// nothing here asks for.
type rotatingFile struct {
	mu         sync.Mutex
	path       string
	maxBytes   int64
	maxBackups int
	file       *os.File
	size       int64
}

func newRotatingFile(path string, maxBytes int64, maxBackups int) (*rotatingFile, error) {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxBytes
	}
	if maxBackups < 0 {
		maxBackups = DefaultMaxBackups
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("applog: create log directory: %w", err)
	}
	rotator := &rotatingFile{path: path, maxBytes: maxBytes, maxBackups: maxBackups}
	if err := rotator.open(); err != nil {
		return nil, err
	}
	return rotator, nil
}

func (f *rotatingFile) open() error {
	file, err := os.OpenFile(f.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("applog: open log file: %w", err)
	}
	size := int64(0)
	if info, err := file.Stat(); err == nil {
		size = info.Size()
	}
	f.file = file
	f.size = size
	return nil
}

func (f *rotatingFile) Write(p []byte) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.file == nil {
		return len(p), nil
	}
	// Rotate before the write rather than after, so a single file never exceeds
	// the cap the user was promised.
	if f.size > 0 && f.size+int64(len(p)) > f.maxBytes {
		if err := f.rotate(); err != nil {
			return len(p), err
		}
	}
	written, err := f.file.Write(p)
	f.size += int64(written)
	return written, err
}

// rotate shifts vantare.log -> vantare.1.log -> vantare.2.log and drops the
// oldest. Caller holds the lock.
func (f *rotatingFile) rotate() error {
	if err := f.file.Close(); err != nil {
		return fmt.Errorf("applog: close log file: %w", err)
	}
	if f.maxBackups == 0 {
		if err := os.Remove(f.path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("applog: drop log file: %w", err)
		}
		return f.open()
	}
	// Walk down so each rename lands on a free (or droppable) name.
	for index := f.maxBackups; index >= 1; index-- {
		source := f.backupPath(index - 1)
		target := f.backupPath(index)
		if index == f.maxBackups {
			if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("applog: drop oldest log: %w", err)
			}
		}
		if _, err := os.Stat(source); os.IsNotExist(err) {
			continue
		}
		if err := os.Rename(source, target); err != nil {
			return fmt.Errorf("applog: rotate log: %w", err)
		}
	}
	return f.open()
}

// backupPath names the live file at index 0 and rotated files from 1 up.
func (f *rotatingFile) backupPath(index int) string {
	if index == 0 {
		return f.path
	}
	extension := filepath.Ext(f.path)
	base := f.path[:len(f.path)-len(extension)]
	return fmt.Sprintf("%s.%d%s", base, index, extension)
}

func (f *rotatingFile) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.file == nil {
		return nil
	}
	err := f.file.Close()
	f.file = nil
	return err
}
