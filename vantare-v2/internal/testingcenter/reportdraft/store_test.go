package reportdraft

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
)

func TestStoreSaveLoadKeepsBackendIdempotencyKey(t *testing.T) {
	store := testStore(t)
	first, err := store.Save(context.Background(), Fields{ActionText: "first"})
	if err != nil {
		t.Fatalf("Save(first): %v", err)
	}
	second, err := store.Save(context.Background(), Fields{ObservedText: "second"})
	if err != nil {
		t.Fatalf("Save(second): %v", err)
	}
	if first.IdempotencyKey == "" || second.IdempotencyKey != first.IdempotencyKey {
		t.Fatalf("idempotency keys = %q, %q", first.IdempotencyKey, second.IdempotencyKey)
	}
	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if loaded != second {
		t.Fatalf("Load() = %#v, want %#v", loaded, second)
	}

	raw, err := os.ReadFile(store.path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	for _, forbidden := range [][]byte{
		[]byte("diagnostic"), []byte("logs"), []byte("token"),
		[]byte("replay"), []byte("userId"),
	} {
		if bytes.Contains(bytes.ToLower(raw), bytes.ToLower(forbidden)) {
			t.Fatalf("stored draft contains forbidden key %q: %s", forbidden, raw)
		}
	}
	if runtime.GOOS != "windows" {
		fileInfo, err := os.Stat(store.path)
		if err != nil {
			t.Fatal(err)
		}
		directoryInfo, err := os.Stat(filepath.Dir(store.path))
		if err != nil {
			t.Fatal(err)
		}
		if fileInfo.Mode().Perm() != 0o600 || directoryInfo.Mode().Perm() != 0o700 {
			t.Fatalf("draft permissions = file %o, directory %o", fileInfo.Mode().Perm(), directoryInfo.Mode().Perm())
		}
	}
}

func TestStoreDiscardIsIdempotentAndRotatesKey(t *testing.T) {
	store := testStore(t)
	first, err := store.Save(context.Background(), Fields{ActionText: "first"})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Discard(context.Background()); err != nil {
		t.Fatalf("Discard(): %v", err)
	}
	if err := store.Discard(context.Background()); err != nil {
		t.Fatalf("Discard() again: %v", err)
	}
	if _, err := store.Load(context.Background()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Load() after discard = %v, want ErrNotFound", err)
	}
	second, err := store.Save(context.Background(), Fields{ActionText: "new"})
	if err != nil {
		t.Fatal(err)
	}
	if second.IdempotencyKey == first.IdempotencyKey {
		t.Fatal("discarded draft reused its idempotency key")
	}
}

func TestStoreRemovesCorruptUnknownOrOversizedDocuments(t *testing.T) {
	tests := []struct {
		name string
		raw  []byte
	}{
		{name: "malformed", raw: []byte(`{"schemaVersion":`)},
		{name: "unknown field", raw: []byte(`{"schemaVersion":1,"idempotencyKey":"draft_` + fmt.Sprintf("%064x", 1) + `","actionText":"","expectedText":"","observedText":"","privateToken":"x"}`)},
		{name: "oversized", raw: bytes.Repeat([]byte("x"), MaxEncodedBytes+1)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := testStore(t)
			if err := os.WriteFile(store.path, tt.raw, 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := store.Load(context.Background()); !errors.Is(err, ErrInvalidStoredDraftRemoved) {
				t.Fatalf("Load() = %v, want ErrInvalidStoredDraftRemoved", err)
			}
			if _, err := os.Lstat(store.path); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("invalid draft still exists: %v", err)
			}
		})
	}
}

func TestStoreRejectsInvalidFieldsWithoutOverwritingExistingDraft(t *testing.T) {
	store := testStore(t)
	original, err := store.Save(context.Background(), Fields{ActionText: "keep"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Save(context.Background(), Fields{Module: "private-module"}); !errors.Is(err, ErrInvalidDraft) {
		t.Fatalf("Save(invalid) = %v", err)
	}
	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if loaded != original {
		t.Fatalf("invalid save replaced original: %#v", loaded)
	}
}

func TestStoreConcurrentSavesRemainValidAndLeaveNoTemporaryFiles(t *testing.T) {
	store := testStore(t)
	const writers = 32
	var wait sync.WaitGroup
	errorsByWriter := make(chan error, writers)
	keys := make(chan string, writers)
	for index := 0; index < writers; index++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			draft, err := store.Save(context.Background(), Fields{
				ActionText: fmt.Sprintf("action-%02d", index),
			})
			if err != nil {
				errorsByWriter <- err
				return
			}
			keys <- draft.IdempotencyKey
		}(index)
	}
	wait.Wait()
	close(errorsByWriter)
	close(keys)
	for err := range errorsByWriter {
		t.Errorf("concurrent Save(): %v", err)
	}
	var key string
	for current := range keys {
		if key == "" {
			key = current
		}
		if current != key {
			t.Errorf("concurrent save rotated key: %q != %q", current, key)
		}
	}
	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if loaded.IdempotencyKey != key {
		t.Fatalf("loaded key = %q, want %q", loaded.IdempotencyKey, key)
	}
	entries, err := os.ReadDir(filepath.Dir(store.path))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() != FileName {
			t.Errorf("orphan file remains: %s", entry.Name())
		}
	}
}

func TestStoreHonorsCanceledContextAndRequiresAbsoluteCleanPath(t *testing.T) {
	if _, err := NewStore("relative.json"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("NewStore(relative) = %v", err)
	}
	if _, err := NewStore(filepath.Join(t.TempDir(), "other", FileName)); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("NewStore(outside dedicated directory) = %v", err)
	}
	store := testStore(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := store.Save(ctx, Fields{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("Save(canceled) = %v", err)
	}
	if _, err := store.Load(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("Load(canceled) = %v", err)
	}
	if err := store.Discard(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("Discard(canceled) = %v", err)
	}
}

func TestStoreRejectsLinkedDedicatedDirectory(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target")
	if err := os.MkdirAll(target, 0o700); err != nil {
		t.Fatal(err)
	}
	linked := filepath.Join(root, DirectoryName)
	if err := os.Symlink(target, linked); err != nil {
		t.Skipf("symlink unavailable on this host: %v", err)
	}
	store, err := NewStore(filepath.Join(linked, FileName))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Save(context.Background(), Fields{ActionText: "must not escape"}); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("Save(linked directory) = %v, want ErrInvalidPath", err)
	}
	if _, err := os.Lstat(filepath.Join(target, FileName)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("linked target was modified: %v", err)
	}
}

func testStore(t *testing.T) *Store {
	t.Helper()
	directory := filepath.Join(t.TempDir(), DirectoryName)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, FileName)
	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	store.random = bytes.NewReader(append(
		bytes.Repeat([]byte{0x42}, idempotencyEntropy),
		bytes.Repeat([]byte{0x43}, 4096)...,
	))
	return store
}
