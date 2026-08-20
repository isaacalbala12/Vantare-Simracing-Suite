// Package applog gives Vantare a log the user can actually reach.
//
// Before this package the backend logged with log.Printf, which in a windowed
// build writes to a stderr nobody ever sees: a support request could only ever
// be "it did not work". applog keeps the same call sites and puts what they
// write in two places the Diagnostics page can offer — a rotated file on disk,
// and a small in-memory ring the hub can show without touching the filesystem.
package applog

import (
	"strings"
	"sync"
	"time"
)

// Level is the severity the Diagnostics list groups and filters by. Three
// levels, because that is as much as the reader of a support log can act on.
type Level string

const (
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

// Entry is one line of the log as the hub receives it.
type Entry struct {
	// Seq orders entries across a reconnect: the hub keeps the highest sequence
	// it has seen, so a push that arrives before its snapshot cannot duplicate.
	Seq     uint64    `json:"seq"`
	Time    time.Time `json:"time"`
	Level   Level     `json:"level"`
	Message string    `json:"message"`
}

// Ring holds the last N entries. It is the whole event history the hub gets:
// deliberately bounded, so a long session cannot grow the process.
type Ring struct {
	mu      sync.Mutex
	entries []Entry
	next    int
	filled  bool
	seq     uint64
}

// DefaultCapacity is how many entries the ring keeps. Enough to cover the
// startup sequence plus a session's worth of warnings, small enough that
// shipping the whole snapshot to the hub in one event stays cheap.
const DefaultCapacity = 200

// NewRing builds a ring of the given capacity. A non-positive capacity falls
// back to DefaultCapacity rather than producing a ring that drops everything.
func NewRing(capacity int) *Ring {
	if capacity <= 0 {
		capacity = DefaultCapacity
	}
	return &Ring{entries: make([]Entry, capacity)}
}

// Append records one entry and returns it with its assigned sequence, so the
// caller can push exactly what the snapshot would have shown.
func (r *Ring) Append(level Level, message string, at time.Time) Entry {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seq++
	entry := Entry{Seq: r.seq, Time: at.UTC(), Level: level, Message: message}
	r.entries[r.next] = entry
	r.next = (r.next + 1) % len(r.entries)
	if r.next == 0 {
		r.filled = true
	}
	return entry
}

// Snapshot returns the entries oldest first. The slice is a copy: the caller
// serialises it while the app keeps logging.
func (r *Ring) Snapshot() []Entry {
	r.mu.Lock()
	defer r.mu.Unlock()
	size := r.next
	if r.filled {
		size = len(r.entries)
	}
	out := make([]Entry, 0, size)
	if r.filled {
		out = append(out, r.entries[r.next:]...)
	}
	out = append(out, r.entries[:r.next]...)
	return out
}

// classify reads the severity out of a log line written by log.Printf.
//
// The 150-odd existing call sites already say "warning: ..." or "... error: ..."
// in their text; rewriting them all to carry a level would be a much larger
// change for the same result. This reads the convention they already follow,
// and anything that follows no convention is info.
func classify(message string) Level {
	lower := strings.ToLower(message)
	switch {
	case strings.Contains(lower, "error") ||
		strings.Contains(lower, "failed") ||
		strings.Contains(lower, "fatal") ||
		strings.Contains(lower, "panic"):
		return LevelError
	case strings.Contains(lower, "warning") || strings.Contains(lower, "warn:"):
		return LevelWarn
	default:
		return LevelInfo
	}
}

// ValidLevel reports whether a level came from the closed set above. The hub
// sends a filter level back; this keeps an unknown string from silently
// matching nothing.
func ValidLevel(level Level) bool {
	switch level {
	case LevelInfo, LevelWarn, LevelError:
		return true
	default:
		return false
	}
}
