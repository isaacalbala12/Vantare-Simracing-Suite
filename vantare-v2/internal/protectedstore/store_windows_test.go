//go:build windows

package protectedstore

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"
)

func TestStoreRoundTripAndDelete(t *testing.T) {
	target := fmt.Sprintf("Vantare/Test/BIL-08/%d/%d", os.Getpid(), time.Now().UnixNano())
	store := New(target)
	t.Cleanup(func() {
		if err := store.Delete(); err != nil {
			t.Errorf("cleanup protected value: %v", err)
		}
	})

	want := []byte(`{"version":1,"issued_at":"2026-08-02T12:00:00Z"}`)
	if err := store.Save(want); err != nil {
		t.Fatalf("save protected value: %v", err)
	}

	got, err := store.Load()
	if err != nil {
		t.Fatalf("load protected value: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("loaded protected value = %q, want %q", got, want)
	}

	if err := store.Delete(); err != nil {
		t.Fatalf("delete protected value: %v", err)
	}
	if _, err := store.Load(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("load deleted protected value error = %v, want ErrNotFound", err)
	}
}

func TestStoreRejectsInvalidBlobSizes(t *testing.T) {
	store := New("Vantare/Test/BIL-08/invalid")
	if err := store.Save(nil); err == nil {
		t.Fatal("Save(nil) succeeded, want validation error")
	}
	if err := store.Save(make([]byte, maxCredentialBlobBytes+1)); err == nil {
		t.Fatal("Save(oversized) succeeded, want validation error")
	}
}
