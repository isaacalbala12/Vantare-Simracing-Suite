//go:build windows

package authsession

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"testing"
)

func TestWindowsCredentialStoreRoundTripAndDelete(t *testing.T) {
	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	store := NewStore("Vantare/Test/" + hex.EncodeToString(random))
	t.Cleanup(func() { _ = store.Delete() })

	want := Session{AccessToken: "test-access-token", RefreshToken: "test-refresh-token"}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	got, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("session = %+v, want %+v", got, want)
	}
	if err := store.Delete(); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Load(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Load after Delete error = %v, want ErrNotFound", err)
	}
}
