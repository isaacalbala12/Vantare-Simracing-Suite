package applog

import (
	"fmt"
	"io"
	"log"
	"strings"
	"sync"
	"time"
)

// Options configures a Service. The zero value is usable: every field falls
// back to the package default.
type Options struct {
	// Path is the live log file. Empty keeps the service in memory only, which
	// is what a build with no writable data directory gets.
	Path string
	// Capacity is the ring size. Zero means DefaultCapacity.
	Capacity int
	// MaxBytes caps one file. Zero means DefaultMaxBytes.
	MaxBytes int64
	// MaxBackups is how many rotated files to keep. Negative means the default.
	MaxBackups int
	// Console receives every line as well, so a terminal build keeps the output
	// it had before this package existed. Nil drops it.
	Console io.Writer
	// Now is injectable for tests.
	Now func() time.Time
}

// Service captures the process log into a bounded ring and a rotated file, and
// hands each new entry to a subscriber so the hub can be pushed to live.
type Service struct {
	ring    *Ring
	file    *rotatingFile
	console io.Writer
	path    string
	now     func() time.Time

	mu       sync.RWMutex
	observer func(Entry)
}

// New builds a service. A file that cannot be opened is not fatal: the ring and
// the console still work, and Diagnostics reports the location as absent rather
// than the app refusing to start over a log file.
func New(options Options) (*Service, error) {
	now := options.Now
	if now == nil {
		now = time.Now
	}
	service := &Service{
		ring:    NewRing(options.Capacity),
		console: options.Console,
		now:     now,
	}
	if options.Path == "" {
		return service, nil
	}
	file, err := newRotatingFile(options.Path, options.MaxBytes, options.MaxBackups)
	if err != nil {
		return service, err
	}
	service.file = file
	service.path = options.Path
	return service, nil
}

// Path is where the live log file is, or "" when the service is memory-only.
// Diagnostics shows this so a support request can name a real file.
func (s *Service) Path() string { return s.path }

// Observe registers the callback that receives every entry appended from now
// on. Passing nil detaches.
func (s *Service) Observe(observer func(Entry)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.observer = observer
}

// Snapshot is the ring, oldest first.
func (s *Service) Snapshot() []Entry { return s.ring.Snapshot() }

// Write makes the Service an io.Writer so it can be installed with
// log.SetOutput: every existing log.Printf call site is captured without being
// edited. One Write is one log line.
func (s *Service) Write(p []byte) (int, error) {
	message := strings.TrimRight(string(p), "\r\n")
	if message != "" {
		s.Append(classify(message), message)
	}
	return len(p), nil
}

// Append records one entry at a known level. Callers that already know the
// severity use this instead of relying on the text heuristic.
func (s *Service) Append(level Level, message string) Entry {
	if !ValidLevel(level) {
		level = LevelInfo
	}
	entry := s.ring.Append(level, message, s.now())
	line := formatLine(entry)
	if s.file != nil {
		// A failing log file must never break the thing being logged, so the
		// write error is deliberately dropped: the ring and console still have
		// the entry, and Diagnostics still shows it.
		_, _ = io.WriteString(s.file, line)
	}
	if s.console != nil {
		_, _ = io.WriteString(s.console, line)
	}
	s.mu.RLock()
	observer := s.observer
	s.mu.RUnlock()
	if observer != nil {
		observer(entry)
	}
	return entry
}

// formatLine is the on-disk format: sortable timestamp, padded level, message.
// Plain text, because the person reading it is likely doing so in Notepad.
func formatLine(entry Entry) string {
	return fmt.Sprintf(
		"%s %-5s %s\n",
		entry.Time.Format(time.RFC3339),
		strings.ToUpper(string(entry.Level)),
		entry.Message,
	)
}

// Install routes the standard logger into this service. The log package's own
// timestamp prefix is turned off because formatLine writes a better one, and
// leaving both on would put two dates on every line.
func (s *Service) Install() {
	log.SetFlags(0)
	log.SetOutput(s)
}

// Close flushes and releases the log file.
func (s *Service) Close() error {
	if s.file == nil {
		return nil
	}
	return s.file.Close()
}
