package applog

import (
	"bytes"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestService(t *testing.T, options Options) (*Service, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "logs", FileName)
	options.Path = path
	service, err := New(options)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { _ = service.Close() })
	return service, path
}

func TestServiceCapturesStandardLogCallSites(t *testing.T) {
	service, _ := newTestService(t, Options{})
	logger := log.New(service, "", 0)

	logger.Printf("warning: diagnostics session storage is unavailable")
	logger.Printf("storage error: %v", os.ErrPermission)
	logger.Printf("HTTP server: listening on 127.0.0.1")

	snapshot := service.Snapshot()
	if len(snapshot) != 3 {
		t.Fatalf("snapshot = %d entries, want 3", len(snapshot))
	}
	want := []Level{LevelWarn, LevelError, LevelInfo}
	for index, level := range want {
		if snapshot[index].Level != level {
			t.Errorf("entry %d level = %q, want %q (%q)", index, snapshot[index].Level, level, snapshot[index].Message)
		}
	}
	// The trailing newline the log package adds must not reach the hub.
	if strings.HasSuffix(snapshot[0].Message, "\n") {
		t.Errorf("message keeps the log package newline: %q", snapshot[0].Message)
	}
}

func TestServiceWritesTheFileAndTheConsole(t *testing.T) {
	console := &bytes.Buffer{}
	service, path := newTestService(t, Options{Console: console})

	service.Append(LevelError, "boom")

	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	if !strings.Contains(string(contents), "ERROR boom") {
		t.Fatalf("log file = %q, want it to carry the level and message", contents)
	}
	if !strings.Contains(console.String(), "ERROR boom") {
		t.Fatalf("console = %q, want the same line", console.String())
	}
}

func TestServicePushesEveryNewEntryToTheObserver(t *testing.T) {
	service, _ := newTestService(t, Options{})
	var seen []Entry
	service.Observe(func(entry Entry) { seen = append(seen, entry) })

	service.Append(LevelInfo, "first")
	service.Append(LevelWarn, "second")

	if len(seen) != 2 {
		t.Fatalf("observer saw %d entries, want 2", len(seen))
	}
	if seen[1].Message != "second" || seen[1].Level != LevelWarn {
		t.Fatalf("second push = %+v, want the warn entry", seen[1])
	}
	// The pushed entry must be the same one a later snapshot reports, or the hub
	// would show a different sequence than it reconciles against.
	if snapshot := service.Snapshot(); snapshot[1].Seq != seen[1].Seq {
		t.Fatalf("pushed seq %d != snapshot seq %d", seen[1].Seq, snapshot[1].Seq)
	}
}

func TestServiceWithoutAPathStaysInMemory(t *testing.T) {
	service, err := New(Options{})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	service.Append(LevelInfo, "held")

	if service.Path() != "" {
		t.Fatalf("Path() = %q, want empty so Diagnostics reports no file", service.Path())
	}
	if got := service.Snapshot(); len(got) != 1 {
		t.Fatalf("snapshot = %d entries, want the ring to work anyway", len(got))
	}
}

func TestAppendCoercesAnUnknownLevelToInfo(t *testing.T) {
	service, _ := newTestService(t, Options{})

	entry := service.Append(Level("catastrophic"), "unclassified")

	if entry.Level != LevelInfo {
		t.Fatalf("level = %q, want info", entry.Level)
	}
}

func TestInstallRoutesThePackageLevelLogger(t *testing.T) {
	service, _ := newTestService(t, Options{})
	previousFlags := log.Flags()
	previousOutput := log.Writer()
	t.Cleanup(func() {
		log.SetFlags(previousFlags)
		log.SetOutput(previousOutput)
	})

	service.Install()
	log.Printf("routed through applog")

	snapshot := service.Snapshot()
	if len(snapshot) != 1 || snapshot[0].Message != "routed through applog" {
		t.Fatalf("snapshot = %+v, want the standard logger line", snapshot)
	}
	// Flags must be cleared or formatLine's timestamp would sit next to the log
	// package's own.
	if log.Flags() != 0 {
		t.Fatalf("log flags = %d, want 0", log.Flags())
	}
}

func TestFormatLineIsSortableAndPlain(t *testing.T) {
	entry := Entry{
		Time:    time.Date(2026, 8, 20, 10, 30, 0, 0, time.UTC),
		Level:   LevelWarn,
		Message: "held together",
	}

	if got, want := formatLine(entry), "2026-08-20T10:30:00Z WARN  held together\n"; got != want {
		t.Fatalf("formatLine = %q, want %q", got, want)
	}
}
