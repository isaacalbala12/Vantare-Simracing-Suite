package license

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestCacheRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "license-cache.json")
	c := NewLicenseCache(path)

	expires := time.Now().Add(time.Hour).UTC().Truncate(time.Second)
	if err := c.Write(StateActive, []Entitlement{EntitlementBundle}, &expires); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	state, ents, exp, err := c.Read()
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if state != StateActive {
		t.Fatalf("expected active, got %s", state)
	}
	if len(ents) != 1 || ents[0] != EntitlementBundle {
		t.Fatalf("unexpected entitlements: %v", ents)
	}
	if exp == nil || !exp.Equal(expires) {
		t.Fatalf("unexpected expires: %v", exp)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat failed: %v", err)
	}
	// On Windows the mode bits may be different; on unix we expect 0600.
	if runtime := info.Mode().Perm(); runtime != 0600 {
		t.Logf("note: cache file perm is %o (expected 0600)", runtime)
	}
}

func TestCacheMissingReturnsError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "missing.json")
	c := NewLicenseCache(path)
	_, _, _, err := c.Read()
	if !os.IsNotExist(err) {
		t.Fatalf("expected not exist, got %v", err)
	}
}

func TestCacheUpdatedAt(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "license-cache.json")
	c := NewLicenseCache(path)

	expires := time.Now().Add(time.Hour).UTC()
	before := time.Now().UTC()
	if err := c.Write(StateActive, []Entitlement{EntitlementOverlays}, &expires); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	after := time.Now().UTC()

	updated := c.UpdatedAt()
	if updated.Before(before) || updated.After(after) {
		t.Fatalf("UpdatedAt %v not in [%v, %v]", updated, before, after)
	}
}

func TestCacheConcurrent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "license-cache-concurrent.json")
	c := NewLicenseCache(path)

	const goroutines = 10
	const iterations = 50
	var wg sync.WaitGroup

	// Write initially to prevent Read/UpdatedAt from failing on file not found
	expires := time.Now().Add(time.Hour).UTC().Truncate(time.Second)
	if err := c.Write(StateActive, []Entitlement{EntitlementOverlays}, &expires); err != nil {
		t.Fatalf("initial write failed: %v", err)
	}

	for i := 0; i < goroutines; i++ {
		wg.Add(3)

		// Writer goroutine
		go func(id int) {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				exp := time.Now().Add(time.Duration(id+j) * time.Hour).UTC()
				_ = c.Write(StateActive, []Entitlement{EntitlementOverlays}, &exp)
			}
		}(i)

		// Reader goroutine
		go func() {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				_, _, _, _ = c.Read()
			}
		}()

		// UpdatedAt reader goroutine
		go func() {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				_ = c.UpdatedAt()
			}
		}()
	}

	wg.Wait()
}

func TestCacheAtomicWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "atomic-cache.json")
	c := NewLicenseCache(path)

	expires := time.Now().Add(time.Hour).UTC().Truncate(time.Second)
	if err := c.Write(StateActive, []Entitlement{EntitlementBundle}, &expires); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	// 1. Verify JSON is valid
	state, ents, exp, err := c.Read()
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if state != StateActive {
		t.Fatalf("expected Active state, got %s", state)
	}
	if len(ents) != 1 || ents[0] != EntitlementBundle {
		t.Fatalf("unexpected entitlements: %v", ents)
	}
	if exp == nil || !exp.Equal(expires) {
		t.Fatalf("unexpected expires: %v", exp)
	}

	// 2. Verify writing overrides existing cache file
	expires2 := time.Now().Add(2 * time.Hour).UTC().Truncate(time.Second)
	if err := c.Write(StateGrace, []Entitlement{EntitlementOverlays}, &expires2); err != nil {
		t.Fatalf("second write failed: %v", err)
	}

	state2, ents2, exp2, err := c.Read()
	if err != nil {
		t.Fatalf("read 2 failed: %v", err)
	}
	if state2 != StateGrace || len(ents2) != 1 || ents2[0] != EntitlementOverlays || !exp2.Equal(expires2) {
		t.Fatalf("unexpected overrides state: %s, entitlements: %v, expires: %v", state2, ents2, exp2)
	}

	// 3. Verify that no temporary files are left over in the directory
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("failed to read dir: %v", err)
	}
	for _, entry := range entries {
		name := entry.Name()
		if filepath.Ext(name) == ".tmp" || (len(name) >= 4 && name[len(name)-4:] == ".tmp") {
			t.Fatalf("found leftover temporary file: %s", name)
		}
	}
}
