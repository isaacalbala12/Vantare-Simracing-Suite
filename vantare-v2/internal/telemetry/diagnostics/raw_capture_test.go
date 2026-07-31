package diagnostics

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRawCaptureDisabledByDefaultAndSingleActive(t *testing.T) {
	manager, _ := NewCaptureManager(t.TempDir())
	if _, err := manager.Start(context.Background(), CaptureConfig{}); !errors.Is(err, ErrCaptureDisabled) {
		t.Fatalf("Start(disabled) error = %v", err)
	}
	capture, err := manager.Start(context.Background(), CaptureConfig{
		Enabled: true, Duration: time.Minute, MaxBytes: 1024, RateHz: 5,
		Provenance: testCaptureProvenance(),
	})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if _, err := manager.Start(context.Background(), CaptureConfig{
		Enabled: true, Provenance: testCaptureProvenance(),
	}); !errors.Is(err, ErrCaptureActive) {
		t.Fatalf("second Start() error = %v", err)
	}
	capture.Cancel()
	capture.Cancel()
	metadata, err := capture.Wait(context.Background())
	if err != nil || metadata.State != CaptureCanceled {
		t.Fatalf("Wait() = %#v, %v", metadata, err)
	}
}

func TestRawCaptureCopiesInputAndCompletesAtomically(t *testing.T) {
	root := t.TempDir()
	manager, _ := NewCaptureManager(root)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	manager.now = func() time.Time { return now }
	capture, err := manager.Start(context.Background(), CaptureConfig{
		Enabled: true, Duration: time.Minute, MaxBytes: 1024, RateHz: 5,
		Provenance: testCaptureProvenance(),
	})
	if err != nil {
		t.Fatal(err)
	}
	frame := []byte("sanitized")
	if !capture.Offer(now, frame) {
		t.Fatal("Offer() = false")
	}
	copy(frame, []byte("modified!"))
	capture.Complete()
	metadata, err := capture.Wait(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if metadata.State != CaptureCompleted || metadata.FrameCount != 1 || metadata.Bytes == 0 {
		t.Fatalf("metadata = %#v", metadata)
	}
	if metadata.Provenance != testCaptureProvenance() ||
		metadata.FramesIntegrity != FrameIntegrityVerified ||
		!validSHA256(metadata.FramesSHA256) {
		t.Fatalf("metadata provenance/integrity = %#v", metadata)
	}
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 1 {
		t.Fatalf("ReadDir() = %v, %v", entries, err)
	}
	directory := filepath.Join(root, entries[0].Name())
	if _, err := os.Stat(filepath.Join(directory, "frames.bin")); err != nil {
		t.Fatalf("frames.bin: %v", err)
	}
	if _, err := os.Stat(filepath.Join(directory, "frames.part")); !os.IsNotExist(err) {
		t.Fatalf("frames.part remains: %v", err)
	}
	stored, err := os.ReadFile(filepath.Join(directory, "frames.bin"))
	if err != nil || string(stored[12:]) != "sanitized" {
		t.Fatalf("stored frame = %q, %v", stored, err)
	}
	digest := sha256.Sum256(stored)
	if metadata.FramesSHA256 != hex.EncodeToString(digest[:]) {
		t.Fatalf("frames hash = %q want %q", metadata.FramesSHA256, hex.EncodeToString(digest[:]))
	}
}

func TestRawCaptureRequiresClosedNonPIIProvenance(t *testing.T) {
	valid := testCaptureProvenance()
	tests := []struct {
		name   string
		mutate func(*CaptureProvenance)
	}{
		{name: "missing", mutate: func(value *CaptureProvenance) { *value = CaptureProvenance{} }},
		{name: "simulator", mutate: func(value *CaptureProvenance) { value.Simulator = "unknown" }},
		{name: "build path", mutate: func(value *CaptureProvenance) { value.SimulatorBuild = `C:\Users\SyntheticUser\1.3.0.0` }},
		{name: "fingerprint PII", mutate: func(value *CaptureProvenance) { value.Fingerprint = "synthetic-user@example.invalid" }},
		{name: "payload schema", mutate: func(value *CaptureProvenance) { value.PayloadSchema = "raw" }},
		{name: "payload version", mutate: func(value *CaptureProvenance) { value.PayloadVersion++ }},
		{name: "sanitizer version", mutate: func(value *CaptureProvenance) { value.SanitizerVersion++ }},
		{name: "framing version", mutate: func(value *CaptureProvenance) { value.FramingVersion++ }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provenance := valid
			tt.mutate(&provenance)
			manager, _ := NewCaptureManager(t.TempDir())
			_, err := manager.Start(context.Background(), CaptureConfig{
				Enabled: true, Provenance: provenance,
			})
			if !errors.Is(err, ErrInvalidCapture) {
				t.Fatalf("Start() error = %v", err)
			}
		})
	}
}

func TestWriteJSONAtomicFailurePreservesPreviousAndRemovesTemp(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "metadata.json")
	old := CaptureMetadata{
		SchemaVersion: 1, State: CaptureActive,
		StartedAtUTC:    time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC),
		FramesIntegrity: FrameIntegrityPending,
		Provenance:      testCaptureProvenance(),
	}
	if err := writeJSONAtomic(path, old); err != nil {
		t.Fatal(err)
	}
	originalReplace := diagnosticReplace
	diagnosticReplace = func(string, string) error { return errors.New("injected replace failure") }
	t.Cleanup(func() { diagnosticReplace = originalReplace })
	newer := old
	newer.State = CaptureCompleted
	if err := writeJSONAtomic(path, newer); err == nil {
		t.Fatal("writeJSONAtomic() unexpectedly succeeded")
	}
	got, err := readCaptureMetadata(path)
	if err != nil || got.State != CaptureActive {
		t.Fatalf("metadata after failed replace = %#v, %v", got, err)
	}
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 1 || entries[0].Name() != "metadata.json" {
		t.Fatalf("orphaned atomic files = %#v, %v", entries, err)
	}
}

func TestRawCaptureRateSizeAndSlowConsumerNeverBlock(t *testing.T) {
	manager, _ := NewCaptureManager(t.TempDir())
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	manager.now = func() time.Time { return now }
	capture, err := manager.Start(context.Background(), CaptureConfig{
		Enabled: true, Duration: time.Minute, MaxBytes: 13, RateHz: 5,
		Provenance: testCaptureProvenance(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !capture.Offer(now, []byte("a")) {
		t.Fatal("first Offer() = false")
	}
	if capture.Offer(now.Add(100*time.Millisecond), []byte("b")) {
		t.Fatal("rate-limited Offer() = true")
	}
	deadline := time.After(2 * time.Second)
	for {
		metadata := capture.Metadata()
		if metadata.FrameCount == 1 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("frame was not written")
		default:
			runtime.Gosched()
		}
	}
	if !capture.Offer(now.Add(time.Second), []byte("b")) {
		t.Fatal("second accepted Offer() = false")
	}
	metadata, err := capture.Wait(context.Background())
	if err != nil || metadata.State != CaptureSizeLimit || metadata.DroppedFrames == 0 {
		t.Fatalf("Wait() = %#v, %v", metadata, err)
	}
}

func TestRawCaptureConcurrentOfferIsBounded(t *testing.T) {
	manager, _ := NewCaptureManager(t.TempDir())
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	capture, err := manager.Start(context.Background(), CaptureConfig{
		Enabled: true, Duration: time.Minute, MaxBytes: 1 << 20, RateHz: 5,
		Provenance: testCaptureProvenance(),
	})
	if err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	for index := range 100 {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			capture.Offer(now.Add(time.Duration(index)*time.Second), []byte("frame"))
		}(index)
	}
	group.Wait()
	capture.Cancel()
	metadata, err := capture.Wait(context.Background())
	if err != nil || metadata.State != CaptureCanceled {
		t.Fatalf("Wait() = %#v, %v", metadata, err)
	}
	if metadata.FrameCount+metadata.DroppedFrames != 100 {
		t.Fatalf("accounted=%d want=100", metadata.FrameCount+metadata.DroppedFrames)
	}
}

func TestRawCaptureStopsAtDurationLimitWithoutFrames(t *testing.T) {
	manager, _ := NewCaptureManager(t.TempDir())
	capture, err := manager.Start(context.Background(), CaptureConfig{
		Enabled: true, Duration: time.Millisecond, MaxBytes: 1024, RateHz: 5,
		Provenance: testCaptureProvenance(),
	})
	if err != nil {
		t.Fatal(err)
	}
	metadata, err := capture.Wait(context.Background())
	if err != nil || metadata.State != CaptureTimeLimit {
		t.Fatalf("Wait() = %#v, %v", metadata, err)
	}
}

func TestRawCaptureDoesNotResumePartialCapture(t *testing.T) {
	root := t.TempDir()
	partial := filepath.Join(root, "capture-partial")
	if err := os.MkdirAll(partial, 0o700); err != nil {
		t.Fatal(err)
	}
	started := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	if err := writeJSONAtomic(filepath.Join(partial, "metadata.json"), CaptureMetadata{
		SchemaVersion: 1, State: CaptureActive, StartedAtUTC: started,
		FramesIntegrity: FrameIntegrityPending, Provenance: testCaptureProvenance(),
	}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(partial, "frames.part"), []byte("partial"), 0o600); err != nil {
		t.Fatal(err)
	}
	manager, _ := NewCaptureManager(root)
	capture, err := manager.Start(context.Background(), CaptureConfig{
		Enabled: true, Duration: time.Minute, MaxBytes: 1024, RateHz: 5,
		Provenance: testCaptureProvenance(),
	})
	if err != nil {
		t.Fatal(err)
	}
	capture.Cancel()
	if _, err := capture.Wait(context.Background()); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 2 {
		t.Fatalf("existing partial capture was resumed or removed: %v, %v", entries, err)
	}
	data, err := os.ReadFile(filepath.Join(partial, "frames.part"))
	if err != nil || string(data) != "partial" {
		t.Fatalf("partial capture changed: %q, %v", data, err)
	}
}

func TestRawCaptureCleanupOnlyRemovesExpiredCaptureDirectories(t *testing.T) {
	root := t.TempDir()
	manager, _ := NewCaptureManager(root)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	manager.now = func() time.Time { return now }
	oldDir := filepath.Join(root, "capture-old")
	newDir := filepath.Join(root, "capture-new")
	unrelated := filepath.Join(root, "other-old")
	for _, directory := range []string{oldDir, newDir, unrelated} {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	old := CaptureMetadata{
		SchemaVersion: 1, State: CaptureCanceled,
		StartedAtUTC:    now.Add(-8 * 24 * time.Hour),
		FramesIntegrity: FrameIntegrityVerified,
		FramesSHA256:    strings.Repeat("a", 64),
		Provenance:      testCaptureProvenance(),
	}
	current := CaptureMetadata{
		SchemaVersion: 1, State: CaptureCanceled,
		StartedAtUTC:    now.Add(-time.Hour),
		FramesIntegrity: FrameIntegrityVerified,
		FramesSHA256:    strings.Repeat("b", 64),
		Provenance:      testCaptureProvenance(),
	}
	if err := writeJSONAtomic(filepath.Join(oldDir, "metadata.json"), old); err != nil {
		t.Fatal(err)
	}
	if err := writeJSONAtomic(filepath.Join(newDir, "metadata.json"), current); err != nil {
		t.Fatal(err)
	}
	if err := writeJSONAtomic(filepath.Join(unrelated, "metadata.json"), old); err != nil {
		t.Fatal(err)
	}
	removed, err := manager.CleanExpired(context.Background(), 0)
	if err != nil || removed != 1 {
		t.Fatalf("CleanExpired() = %d, %v", removed, err)
	}
	if _, err := os.Stat(oldDir); !os.IsNotExist(err) {
		t.Fatalf("old capture remains: %v", err)
	}
	for _, directory := range []string{newDir, unrelated} {
		if _, err := os.Stat(directory); err != nil {
			t.Fatalf("preserved directory %q: %v", directory, err)
		}
	}
}

func TestRawCaptureCleanupEventuallyRemovesCrashOrphans(t *testing.T) {
	root := t.TempDir()
	manager, _ := NewCaptureManager(root)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	manager.now = func() time.Time { return now }
	oldTime := now.Add(-8 * 24 * time.Hour)

	crashed := filepath.Join(root, "capture-crashed")
	if err := os.MkdirAll(crashed, 0o700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"metadata.json.tmp-orphan", "metadata.json.previous", "frames.part"} {
		if err := os.WriteFile(filepath.Join(crashed, name), []byte("orphan"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Chtimes(crashed, oldTime, oldTime); err != nil {
		t.Fatal(err)
	}

	tombstone := filepath.Join(root, ".deleting-capture-crashed-orphan")
	if err := os.MkdirAll(tombstone, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tombstone, "frames.part"), []byte("orphan"), 0o600); err != nil {
		t.Fatal(err)
	}

	removed, err := manager.CleanExpired(context.Background(), 0)
	if err != nil || removed != 2 {
		t.Fatalf("CleanExpired() = %d, %v", removed, err)
	}
	for _, path := range []string{crashed, tombstone} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("orphan remains at %q: %v", path, err)
		}
	}
}

func TestRawCaptureCleanupNeverFollowsSymlink(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	protected := filepath.Join(outside, "protected.txt")
	if err := os.WriteFile(protected, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "capture-link")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	manager, _ := NewCaptureManager(root)
	removed, err := manager.CleanExpired(context.Background(), time.Hour)
	if err != nil || removed != 0 {
		t.Fatalf("CleanExpired() = %d, %v", removed, err)
	}
	if data, err := os.ReadFile(protected); err != nil || string(data) != "keep" {
		t.Fatalf("outside target changed: %q, %v", data, err)
	}
}

func TestNewCaptureManagerRejectsSymlinkedParentWithoutCreatingTarget(t *testing.T) {
	base := t.TempDir()
	target := t.TempDir()
	linkedParent := filepath.Join(base, "linked-parent")
	if err := os.Symlink(target, linkedParent); err != nil {
		t.Skipf("directory symlink unavailable: %v", err)
	}
	root := filepath.Join(linkedParent, "captures")
	if _, err := NewCaptureManager(root); !errors.Is(err, ErrInvalidCapture) {
		t.Fatalf("NewCaptureManager() error = %v, want ErrInvalidCapture", err)
	}
	if _, err := os.Lstat(filepath.Join(target, "captures")); !os.IsNotExist(err) {
		t.Fatalf("symlink target was modified: %v", err)
	}
}

func TestNewCaptureManagerCreatesMissingRootUnderStableParents(t *testing.T) {
	root := filepath.Join(t.TempDir(), "missing", "captures")
	manager, err := NewCaptureManager(root)
	if err != nil {
		t.Fatalf("NewCaptureManager() error = %v", err)
	}
	if manager.root != filepath.Clean(root) {
		t.Fatalf("manager root = %q, want %q", manager.root, filepath.Clean(root))
	}
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() {
		t.Fatalf("created root info = %#v, %v", info, err)
	}
}

func TestRawCaptureFilesArePrivate(t *testing.T) {
	root := t.TempDir()
	manager, _ := NewCaptureManager(root)
	capture, err := manager.Start(context.Background(), CaptureConfig{
		Enabled: true, Duration: time.Minute, MaxBytes: 1024, RateHz: 5,
		Provenance: testCaptureProvenance(),
	})
	if err != nil {
		t.Fatal(err)
	}
	capture.Cancel()
	if _, err := capture.Wait(context.Background()); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(root)
	directory := filepath.Join(root, entries[0].Name())
	for _, name := range []string{"metadata.json", "frames.bin"} {
		info, err := os.Stat(filepath.Join(directory, name))
		if err != nil {
			t.Fatal(err)
		}
		if runtime.GOOS == "windows" {
			// Windows reports synthesized POSIX bits. Privacy relies on the
			// user's inherited profile ACL; the product must not claim chmod.
			continue
		}
		if info.Mode().Perm()&0o077 != 0 {
			t.Fatalf("%s permissions = %o", name, info.Mode().Perm())
		}
	}
}

func testCaptureProvenance() CaptureProvenance {
	return CaptureProvenance{
		Simulator:        CaptureSimulatorLMU,
		SimulatorBuild:   "1.3.0.0",
		Fingerprint:      strings.Repeat("a", 64),
		PayloadSchema:    CapturePayloadLMUSharedMemory,
		PayloadVersion:   CapturePayloadVersionV1,
		SanitizerVersion: CaptureSanitizerVersionV1,
		FramingVersion:   CaptureFramingVersionV1,
	}
}
