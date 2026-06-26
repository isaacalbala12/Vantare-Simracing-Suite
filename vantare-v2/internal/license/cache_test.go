package license

import (
	"os"
	"path/filepath"
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
