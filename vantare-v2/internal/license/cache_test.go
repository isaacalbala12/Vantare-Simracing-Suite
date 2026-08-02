package license

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestCacheRoundTripAndAtomicReplace(t *testing.T) {
	path := filepath.Join(t.TempDir(), "license-cache.json")
	cache := NewLicenseCache(path)
	first := &OfflineCredential{Version: 1, Algorithm: "Ed25519", KeyID: "key-1", Signature: "one"}
	if err := cache.Write(first); err != nil {
		t.Fatal(err)
	}
	got, err := cache.Read()
	if err != nil || got.Signature != "one" {
		t.Fatalf("read = %#v, %v", got, err)
	}
	second := *first
	second.Signature = "two"
	if err := cache.Write(&second); err != nil {
		t.Fatal(err)
	}
	got, err = cache.Read()
	if err != nil || got.Signature != "two" {
		t.Fatalf("replace = %#v, %v", got, err)
	}
	entries, _ := os.ReadDir(filepath.Dir(path))
	if len(entries) != 1 || entries[0].Name() != filepath.Base(path) {
		t.Fatalf("unexpected cache files: %v", entries)
	}
}

func TestCacheRejectsLegacyPremiumFormat(t *testing.T) {
	path := filepath.Join(t.TempDir(), "license-cache.json")
	if err := os.WriteFile(path, []byte(`{"state":"active","entitlements":["bundle"]}`), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := NewLicenseCache(path).Read()
	if !errors.Is(err, ErrLegacyCache) {
		t.Fatalf("expected ErrLegacyCache, got %v", err)
	}
}

func TestCacheRejectsUnknownFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "license-cache.json")
	if err := os.WriteFile(path, []byte(`{"version":1,"algorithm":"Ed25519","key_id":"k","claims":{},"signature":"x","premium":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewLicenseCache(path).Read(); err == nil {
		t.Fatal("expected unknown field rejection")
	}
}

func TestCacheMissingReturnsError(t *testing.T) {
	_, err := NewLicenseCache(filepath.Join(t.TempDir(), "missing.json")).Read()
	if !os.IsNotExist(err) {
		t.Fatalf("expected not exist, got %v", err)
	}
}

func TestCacheConcurrent(t *testing.T) {
	cache := NewLicenseCache(filepath.Join(t.TempDir(), "cache.json"))
	credential := &OfflineCredential{Version: 1, Algorithm: "Ed25519", KeyID: "key-1", Signature: "x"}
	if err := cache.Write(credential); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				_ = cache.Write(credential)
			}
		}()
		go func() {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				_, _ = cache.Read()
			}
		}()
	}
	wg.Wait()
}
